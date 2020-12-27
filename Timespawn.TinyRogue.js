/**
d
 * @license
 * Copyright 2010 The Emscripten Authors
 * SPDX-License-Identifier: MIT
 */

var Module = Module;










// Redefine these in a --pre-js to override behavior. If you would like to
// remove out() or err() altogether, you can no-op it out to function() {},
// and build with --closure 1 to get Closure optimize out all the uses
// altogether.

function out(text) {
  console.log(text);
}

function err(text) {
  console.error(text);
}

// Override this function in a --pre-js file to get a signal for when
// compilation is ready. In that callback, call the function run() to start
// the program.
function ready() {
    run();
}

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)

/** @suppress{duplicate} This symbol is intended to be present multiple times in the source, the second definition overwrites the first to override default behavior. Closure deletes the first instance. */
function ready() {
	try {
		if (typeof ENVIRONMENT_IS_PTHREAD === 'undefined' || !ENVIRONMENT_IS_PTHREAD) run();
	} catch(e) {
		// Suppress the JS throw message that corresponds to Dots unwinding the call stack to run the application. 
		if (e !== 'unwind') throw e;
	}
}

(function(global, module){
    var _allocateArrayOnHeap = function (typedArray) {
        var requiredMemorySize = typedArray.length * typedArray.BYTES_PER_ELEMENT;
        var ptr = _malloc(requiredMemorySize);
        var heapBytes = new Uint8Array(HEAPU8.buffer, ptr, requiredMemorySize);
        heapBytes.set(new Uint8Array(typedArray.buffer));
        return heapBytes;
    };
    
    var _allocateStringOnHeap = function (string) {
        var bufferSize = lengthBytesUTF8(string) + 1;
        var ptr = _malloc(bufferSize);
        stringToUTF8(string, ptr, bufferSize);
        return ptr;
    };

    var _freeArrayFromHeap = function (heapBytes) {
        if(typeof heapBytes !== "undefined")
            _free(heapBytes.byteOffset);
    };
    
    var _freeStringFromHeap = function (stringPtr) {
        if(typeof stringPtr !== "undefined")
            _free(stringPtr);
    };

    var _sendMessage = function(message, intArr, floatArr, byteArray) {
        if (!Array.isArray(intArr)) {
            intArr = [];
        }
        if (!Array.isArray(floatArr)) {
            floatArr = [];
        }
        if (!Array.isArray(byteArray)) {
            byteArray = [];
        }
        
        var messageOnHeap, intOnHeap, floatOnHeap, bytesOnHeap;
        try {
            messageOnHeap = _allocateStringOnHeap(message);
            intOnHeap = _allocateArrayOnHeap(new Int32Array(intArr));
            floatOnHeap = _allocateArrayOnHeap(new Float32Array(floatArr));
            bytesOnHeap = _allocateArrayOnHeap(new Uint8Array(byteArray));
            
            _SendMessage(messageOnHeap, intOnHeap.byteOffset, intArr.length, floatOnHeap.byteOffset, floatArr.length, bytesOnHeap.byteOffset, byteArray.length);
        }
        finally {
            _freeStringFromHeap(messageOnHeap);
            _freeArrayFromHeap(intOnHeap);
            _freeArrayFromHeap(floatOnHeap);
            _freeArrayFromHeap(bytesOnHeap);
        }
    };

    global["SendMessage"] = _sendMessage;
    module["SendMessage"] = _sendMessage;
})(this, Module);


















/** @param {string|number=} what */
function abort(what) {
  throw what;
}

var tempRet0 = 0;
var setTempRet0 = function(value) {
  tempRet0 = value;
}
var getTempRet0 = function() {
  return tempRet0;
}

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}







// Wraps a JS function as a wasm function with a given signature.
function convertJsFunctionToWasm(func, sig) {

  // If the type reflection proposal is available, use the new
  // "WebAssembly.Function" constructor.
  // Otherwise, construct a minimal wasm module importing the JS function and
  // re-exporting it.
  if (typeof WebAssembly.Function === "function") {
    var typeNames = {
      'i': 'i32',
      'j': 'i64',
      'f': 'f32',
      'd': 'f64'
    };
    var type = {
      parameters: [],
      results: sig[0] == 'v' ? [] : [typeNames[sig[0]]]
    };
    for (var i = 1; i < sig.length; ++i) {
      type.parameters.push(typeNames[sig[i]]);
    }
    return new WebAssembly.Function(type, func);
  }

  // The module is static, with the exception of the type section, which is
  // generated based on the signature passed in.
  var typeSection = [
    0x01, // id: section,
    0x00, // length: 0 (placeholder)
    0x01, // count: 1
    0x60, // form: func
  ];
  var sigRet = sig.slice(0, 1);
  var sigParam = sig.slice(1);
  var typeCodes = {
    'i': 0x7f, // i32
    'j': 0x7e, // i64
    'f': 0x7d, // f32
    'd': 0x7c, // f64
  };

  // Parameters, length + signatures
  typeSection.push(sigParam.length);
  for (var i = 0; i < sigParam.length; ++i) {
    typeSection.push(typeCodes[sigParam[i]]);
  }

  // Return values, length + signatures
  // With no multi-return in MVP, either 0 (void) or 1 (anything else)
  if (sigRet == 'v') {
    typeSection.push(0x00);
  } else {
    typeSection = typeSection.concat([0x01, typeCodes[sigRet]]);
  }

  // Write the overall length of the type section back into the section header
  // (excepting the 2 bytes for the section id and length)
  typeSection[1] = typeSection.length - 2;

  // Rest of the module is static
  var bytes = new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // magic ("\0asm")
    0x01, 0x00, 0x00, 0x00, // version: 1
  ].concat(typeSection, [
    0x02, 0x07, // import section
      // (import "e" "f" (func 0 (type 0)))
      0x01, 0x01, 0x65, 0x01, 0x66, 0x00, 0x00,
    0x07, 0x05, // export section
      // (export "f" (func 0 (type 0)))
      0x01, 0x01, 0x66, 0x00, 0x00,
  ]));

   // We can compile this wasm module synchronously because it is very small.
  // This accepts an import (at "e.f"), that it reroutes to an export (at "f")
  var module = new WebAssembly.Module(bytes);
  var instance = new WebAssembly.Instance(module, {
    'e': {
      'f': func
    }
  });
  var wrappedFunc = instance.exports['f'];
  return wrappedFunc;
}

var freeTableIndexes = [];

// Weak map of functions in the table to their indexes, created on first use.
var functionsInTableMap;

// Add a wasm function to the table.
function addFunctionWasm(func, sig) {
  var table = wasmTable;

  // Check if the function is already in the table, to ensure each function
  // gets a unique index. First, create the map if this is the first use.
  if (!functionsInTableMap) {
    functionsInTableMap = new WeakMap();
    for (var i = 0; i < table.length; i++) {
      var item = table.get(i);
      // Ignore null values.
      if (item) {
        functionsInTableMap.set(item, i);
      }
    }
  }
  if (functionsInTableMap.has(func)) {
    return functionsInTableMap.get(func);
  }

  // It's not in the table, add it now.


  var ret;
  // Reuse a free index if there is one, otherwise grow.
  if (freeTableIndexes.length) {
    ret = freeTableIndexes.pop();
  } else {
    ret = table.length;
    // Grow the table
    try {
      table.grow(1);
    } catch (err) {
      if (!(err instanceof RangeError)) {
        throw err;
      }
      throw 'Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.';
    }
  }

  // Set the new value.
  try {
    // Attempting to call this with JS function will cause of table.set() to fail
    table.set(ret, func);
  } catch (err) {
    if (!(err instanceof TypeError)) {
      throw err;
    }
    var wrapped = convertJsFunctionToWasm(func, sig);
    table.set(ret, wrapped);
  }

  functionsInTableMap.set(func, ret);

  return ret;
}

function removeFunctionWasm(index) {
  functionsInTableMap.delete(wasmTable.get(index));
  freeTableIndexes.push(index);
}

// 'sig' parameter is required for the llvm backend but only when func is not
// already a WebAssembly function.
function addFunction(func, sig) {

  return addFunctionWasm(func, sig);
}

function removeFunction(index) {
  removeFunctionWasm(index);
}





// runtime_strings.js: Strings related runtime functions that are part of both MINIMAL_RUNTIME and regular runtime.

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;

/**
 * @param {number} idx
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ArrayToString(heap, idx, maxBytesToRead) {
  var endIdx = idx + maxBytesToRead;
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  // (As a tiny code save trick, compare endPtr against endIdx using a negation, so that undefined means Infinity)
  while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;

  if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(heap.subarray(idx, endPtr));
  } else {
    var str = '';
    // If building with TextDecoder, we have already computed the string length above, so test loop end condition against that
    while (idx < endPtr) {
      // For UTF8 byte structure, see:
      // http://en.wikipedia.org/wiki/UTF-8#Description
      // https://www.ietf.org/rfc/rfc2279.txt
      // https://tools.ietf.org/html/rfc3629
      var u0 = heap[idx++];
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      var u1 = heap[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      var u2 = heap[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | (heap[idx++] & 63);
      }

      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
  return str;
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns a
// copy of that string as a Javascript String object.
// maxBytesToRead: an optional length that specifies the maximum number of bytes to read. You can omit
//                 this parameter to scan the string until the first \0 byte. If maxBytesToRead is
//                 passed, and the string at [ptr, ptr+maxBytesToReadr[ contains a null byte in the
//                 middle, then the string will cut short at that byte index (i.e. maxBytesToRead will
//                 not produce a string of exact length [ptr, ptr+maxBytesToRead[)
//                 N.B. mixing frequent uses of UTF8ToString() with and without maxBytesToRead may
//                 throw JS JIT optimizations off, so it is worth to consider consistently using one
//                 style or the other.
/**
 * @param {number} ptr
 * @param {number=} maxBytesToRead
 * @return {string}
 */
function UTF8ToString(ptr, maxBytesToRead) {
  return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : '';
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   heap: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array.
//                    This count should include the null terminator,
//                    i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, heap, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) {
      var u1 = str.charCodeAt(++i);
      u = 0x10000 + ((u & 0x3FF) << 10) | (u1 & 0x3FF);
    }
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      heap[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      heap[outIdx++] = 0xC0 | (u >> 6);
      heap[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      heap[outIdx++] = 0xE0 | (u >> 12);
      heap[outIdx++] = 0x80 | ((u >> 6) & 63);
      heap[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 3 >= endIdx) break;
      heap[outIdx++] = 0xF0 | (u >> 18);
      heap[outIdx++] = 0x80 | ((u >> 12) & 63);
      heap[outIdx++] = 0x80 | ((u >> 6) & 63);
      heap[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  heap[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.
function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) ++len;
    else if (u <= 0x7FF) len += 2;
    else if (u <= 0xFFFF) len += 3;
    else len += 4;
  }
  return len;
}









var GLOBAL_BASE = 1024,
    TOTAL_STACK = 524288,
    STATIC_BASE = 1024,
    STACK_BASE = 1841248,
    STACKTOP = STACK_BASE,
    STACK_MAX = 1316960
    , DYNAMICTOP_PTR = 1316784;
    ;


var wasmMaximumMemory = 2048;

var wasmMemory = new WebAssembly.Memory({
  'initial': 2048
  , 'maximum': wasmMaximumMemory
  });

var buffer = wasmMemory.buffer;


var wasmTable = new WebAssembly.Table({
  'initial': 7400,
  'maximum': 7400 + 0,
  'element': 'anyfunc'
});



// In non-ALLOW_MEMORY_GROWTH scenario, we only need to initialize
// the heap once, so optimize code size to do it statically here.
var HEAP8 = new Int8Array(buffer);
var HEAP16 = new Int16Array(buffer);
var HEAP32 = new Int32Array(buffer);
var HEAPU8 = new Uint8Array(buffer);
var HEAPU16 = new Uint16Array(buffer);
var HEAPU32 = new Uint32Array(buffer);
var HEAPF32 = new Float32Array(buffer);
var HEAPF64 = new Float64Array(buffer);




  HEAP32[DYNAMICTOP_PTR>>2] = 1841248;

















/** @param {number|boolean=} ignore */
function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
/** @param {number|boolean=} ignore */
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}




// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/imul

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/clz32

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/trunc


var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;



var memoryInitializer = null;













// === Body ===

var ASM_CONSTS = {
  206729: function() {debugger;}
};

function _emscripten_asm_const_iii(code, sigPtr, argbuf) {
  var args = readAsmConstArgs(sigPtr, argbuf);
  return ASM_CONSTS[code].apply(null, args);
}



// STATICTOP = STATIC_BASE + 1315936;




/* no memory initializer */
// {{PRE_LIBRARY}}


  function ___cxa_atexit(){}

  
  function setErrNo(value) {
      return 0;
    }
  
  
  var PATH={splitPath:function(filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1);
      },normalizeArray:function(parts, allowAboveRoot) {
        // if the path tries to go above the root, `up` ends up > 0
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
          var last = parts[i];
          if (last === '.') {
            parts.splice(i, 1);
          } else if (last === '..') {
            parts.splice(i, 1);
            up++;
          } else if (up) {
            parts.splice(i, 1);
            up--;
          }
        }
        // if the path is allowed to go above the root, restore leading ..s
        if (allowAboveRoot) {
          for (; up; up--) {
            parts.unshift('..');
          }
        }
        return parts;
      },normalize:function(path) {
        var isAbsolute = path.charAt(0) === '/',
            trailingSlash = path.substr(-1) === '/';
        // Normalize the path
        path = PATH.normalizeArray(path.split('/').filter(function(p) {
          return !!p;
        }), !isAbsolute).join('/');
        if (!path && !isAbsolute) {
          path = '.';
        }
        if (path && trailingSlash) {
          path += '/';
        }
        return (isAbsolute ? '/' : '') + path;
      },dirname:function(path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
          // No dirname whatsoever
          return '.';
        }
        if (dir) {
          // It has a dirname, strip trailing slash
          dir = dir.substr(0, dir.length - 1);
        }
        return root + dir;
      },basename:function(path) {
        // EMSCRIPTEN return '/'' for '/', not an empty string
        if (path === '/') return '/';
        var lastSlash = path.lastIndexOf('/');
        if (lastSlash === -1) return path;
        return path.substr(lastSlash+1);
      },extname:function(path) {
        return PATH.splitPath(path)[3];
      },join:function() {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join('/'));
      },join2:function(l, r) {
        return PATH.normalize(l + '/' + r);
      }};var SYSCALLS={mappings:{},buffers:[null,[],[]],printChar:function(stream, curr) {
        var buffer = SYSCALLS.buffers[stream];
        if (curr === 0 || curr === 10) {
          (stream === 1 ? out : err)(UTF8ArrayToString(buffer, 0));
          buffer.length = 0;
        } else {
          buffer.push(curr);
        }
      },varargs:undefined,get:function() {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function(ptr) {
        var ret = UTF8ToString(ptr);
        return ret;
      },get64:function(low, high) {
        return low;
      }};function ___sys_fcntl64(fd, cmd, varargs) {SYSCALLS.varargs = varargs;
  
      return 0;
    }

  function ___sys_ioctl(fd, op, varargs) {SYSCALLS.varargs = varargs;
  
      return 0;
    }

  function ___sys_open(path, flags, varargs) {SYSCALLS.varargs = varargs;
  
  }

  function __emscripten_fetch_free(id) {
    //Note: should just be [id], but indexes off by 1 (see: #8803)
    delete Fetch.xhrs[id-1];
  }

  function _abort() {
      // In MINIMAL_RUNTIME the module object does not exist, so its behavior to abort is to throw directly.
      throw 'abort';
    }

  function _clock() {
      if (_clock.start === undefined) _clock.start = Date.now();
      return ((Date.now() - _clock.start) * (1000000 / 1000))|0;
    }

  function _dlopen(filename, flag) {
      abort("To use dlopen, you need to use Emscripten's linking support, see https://github.com/emscripten-core/emscripten/wiki/Linking");
    }

  function _dlsym(handle, symbol) {
      abort("To use dlopen, you need to use Emscripten's linking support, see https://github.com/emscripten-core/emscripten/wiki/Linking");
    }

  var _emscripten_get_now;_emscripten_get_now = function() { return performance.now(); }
  ;

  function _emscripten_get_sbrk_ptr() {
      return 1316784;
    }

  
  
  function __webgl_enable_ANGLE_instanced_arrays(ctx) {
      // Extension available in WebGL 1 from Firefox 26 and Google Chrome 30 onwards. Core feature in WebGL 2.
      var ext = ctx.getExtension('ANGLE_instanced_arrays');
      if (ext) {
        ctx['vertexAttribDivisor'] = function(index, divisor) { ext['vertexAttribDivisorANGLE'](index, divisor); };
        ctx['drawArraysInstanced'] = function(mode, first, count, primcount) { ext['drawArraysInstancedANGLE'](mode, first, count, primcount); };
        ctx['drawElementsInstanced'] = function(mode, count, type, indices, primcount) { ext['drawElementsInstancedANGLE'](mode, count, type, indices, primcount); };
        return 1;
      }
    }
  
  function __webgl_enable_OES_vertex_array_object(ctx) {
      // Extension available in WebGL 1 from Firefox 25 and WebKit 536.28/desktop Safari 6.0.3 onwards. Core feature in WebGL 2.
      var ext = ctx.getExtension('OES_vertex_array_object');
      if (ext) {
        ctx['createVertexArray'] = function() { return ext['createVertexArrayOES'](); };
        ctx['deleteVertexArray'] = function(vao) { ext['deleteVertexArrayOES'](vao); };
        ctx['bindVertexArray'] = function(vao) { ext['bindVertexArrayOES'](vao); };
        ctx['isVertexArray'] = function(vao) { return ext['isVertexArrayOES'](vao); };
        return 1;
      }
    }
  
  function __webgl_enable_WEBGL_draw_buffers(ctx) {
      // Extension available in WebGL 1 from Firefox 28 onwards. Core feature in WebGL 2.
      var ext = ctx.getExtension('WEBGL_draw_buffers');
      if (ext) {
        ctx['drawBuffers'] = function(n, bufs) { ext['drawBuffersWEBGL'](n, bufs); };
        return 1;
      }
    }
  
  function __webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(ctx) {
      // Closure is expected to be allowed to minify the '.dibvbi' property, so not accessing it quoted.
      return !!(ctx.dibvbi = ctx.getExtension('WEBGL_draw_instanced_base_vertex_base_instance'));
    }var GL={counter:1,buffers:[],programs:[],framebuffers:[],renderbuffers:[],textures:[],uniforms:[],shaders:[],vaos:[],contexts:[],offscreenCanvases:{},timerQueriesEXT:[],queries:[],samplers:[],transformFeedbacks:[],syncs:[],programInfos:{},stringCache:{},stringiCache:{},unpackAlignment:4,recordError:function recordError(errorCode) {
        if (!GL.lastError) {
          GL.lastError = errorCode;
        }
      },getNewId:function(table) {
        var ret = GL.counter++;
        for (var i = table.length; i < ret; i++) {
          table[i] = null;
        }
        return ret;
      },getSource:function(shader, count, string, length) {
        var source = '';
        for (var i = 0; i < count; ++i) {
          var len = length ? HEAP32[(((length)+(i*4))>>2)] : -1;
          source += UTF8ToString(HEAP32[(((string)+(i*4))>>2)], len < 0 ? undefined : len);
        }
        return source;
      },createContext:function(canvas, webGLContextAttributes) {
  
  
  
  
  
        var ctx = 
          (webGLContextAttributes.majorVersion > 1)
          ?
            canvas.getContext("webgl2", webGLContextAttributes)
          :
          (canvas.getContext("webgl", webGLContextAttributes)
            // https://caniuse.com/#feat=webgl
            );
  
  
        if (!ctx) return 0;
  
        var handle = GL.registerContext(ctx, webGLContextAttributes);
  
  
        function disableHalfFloatExtensionIfBroken(ctx) {
          var t = ctx.createTexture();
          ctx.bindTexture(0xDE1/*GL_TEXTURE_2D*/, t);
          for (var i = 0; i < 8 && ctx.getError(); ++i) /*no-op*/;
          var ext = ctx.getExtension('OES_texture_half_float');
          if (!ext) return; // no half-float extension - nothing needed to fix.
          // Bug on Safari on iOS and macOS: texImage2D() and texSubImage2D() do not allow uploading pixel data to half float textures,
          // rendering them useless.
          // See https://bugs.webkit.org/show_bug.cgi?id=183321, https://bugs.webkit.org/show_bug.cgi?id=169999,
          // https://stackoverflow.com/questions/54248633/cannot-create-half-float-oes-texture-from-uint16array-on-ipad
          ctx.texImage2D(0xDE1/*GL_TEXTURE_2D*/, 0, 0x1908/*GL_RGBA*/, 1, 1, 0, 0x1908/*GL_RGBA*/, 0x8d61/*HALF_FLOAT_OES*/, new Uint16Array(4));
          var broken = ctx.getError();
          ctx.bindTexture(0xDE1/*GL_TEXTURE_2D*/, null);
          ctx.deleteTexture(t);
          if (broken) {
            ctx.realGetSupportedExtensions = ctx.getSupportedExtensions;
            ctx.getSupportedExtensions = function() {
              // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
              return (this.realGetSupportedExtensions() || []).filter(function(ext) {
                return ext.indexOf('texture_half_float') == -1;
              });
            }
          }
        }
        disableHalfFloatExtensionIfBroken(ctx);
  
        return handle;
      },registerContext:function(ctx, webGLContextAttributes) {
        // without pthreads a context is just an integer ID
        var handle = GL.getNewId(GL.contexts);
  
        var context = {
          handle: handle,
          attributes: webGLContextAttributes,
          version: webGLContextAttributes.majorVersion,
          GLctx: ctx
        };
  
  
        // Store the created context object so that we can access the context given a canvas without having to pass the parameters again.
        if (ctx.canvas) ctx.canvas.GLctxObject = context;
        GL.contexts[handle] = context;
        if (typeof webGLContextAttributes.enableExtensionsByDefault === 'undefined' || webGLContextAttributes.enableExtensionsByDefault) {
          GL.initExtensions(context);
        }
  
  
  
  
        return handle;
      },makeContextCurrent:function(contextHandle) {
  
        GL.currentContext = GL.contexts[contextHandle]; // Active Emscripten GL layer context object.
        Module.ctx = GLctx = GL.currentContext && GL.currentContext.GLctx; // Active WebGL context object.
        return !(contextHandle && !GLctx);
      },getContext:function(contextHandle) {
        return GL.contexts[contextHandle];
      },deleteContext:function(contextHandle) {
        if (GL.currentContext === GL.contexts[contextHandle]) GL.currentContext = null;
        if (typeof JSEvents === 'object') JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas); // Release all JS event handlers on the DOM element that the GL context is associated with since the context is now deleted.
        if (GL.contexts[contextHandle] && GL.contexts[contextHandle].GLctx.canvas) GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined; // Make sure the canvas object no longer refers to the context object so there are no GC surprises.
        GL.contexts[contextHandle] = null;
      },initExtensions:function(context) {
        // If this function is called without a specific context object, init the extensions of the currently active context.
        if (!context) context = GL.currentContext;
  
        if (context.initExtensionsDone) return;
        context.initExtensionsDone = true;
  
        var GLctx = context.GLctx;
  
        // Detect the presence of a few extensions manually, this GL interop layer itself will need to know if they exist.
  
        // Extensions that are only available in WebGL 1 (the calls will be no-ops if called on a WebGL 2 context active)
        __webgl_enable_ANGLE_instanced_arrays(GLctx);
        __webgl_enable_OES_vertex_array_object(GLctx);
        __webgl_enable_WEBGL_draw_buffers(GLctx);
        // Extensions that are available from WebGL >= 2 (no-op if called on a WebGL 1 context active)
        __webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(GLctx);
  
        GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query");
  
        // These are the 'safe' feature-enabling extensions that don't add any performance impact related to e.g. debugging, and
        // should be enabled by default so that client GLES2/GL code will not need to go through extra hoops to get its stuff working.
        // As new extensions are ratified at http://www.khronos.org/registry/webgl/extensions/ , feel free to add your new extensions
        // here, as long as they don't produce a performance impact for users that might not be using those extensions.
        // E.g. debugging-related extensions should probably be off by default.
        var automaticallyEnabledExtensions = [ // Khronos ratified WebGL extensions ordered by number (no debug extensions):
                                               "OES_texture_float", "OES_texture_half_float", "OES_standard_derivatives",
                                               "OES_vertex_array_object", "WEBGL_compressed_texture_s3tc", "WEBGL_depth_texture",
                                               "OES_element_index_uint", "EXT_texture_filter_anisotropic", "EXT_frag_depth",
                                               "WEBGL_draw_buffers", "ANGLE_instanced_arrays", "OES_texture_float_linear",
                                               "OES_texture_half_float_linear", "EXT_blend_minmax", "EXT_shader_texture_lod",
                                               "EXT_texture_norm16",
                                               // Community approved WebGL extensions ordered by number:
                                               "WEBGL_compressed_texture_pvrtc", "EXT_color_buffer_half_float", "WEBGL_color_buffer_float",
                                               "EXT_sRGB", "WEBGL_compressed_texture_etc1", "EXT_disjoint_timer_query",
                                               "WEBGL_compressed_texture_etc", "WEBGL_compressed_texture_astc", "EXT_color_buffer_float",
                                               "WEBGL_compressed_texture_s3tc_srgb", "EXT_disjoint_timer_query_webgl2",
                                               // Old style prefixed forms of extensions (but still currently used on e.g. iPhone Xs as
                                               // tested on iOS 12.4.1):
                                               "WEBKIT_WEBGL_compressed_texture_pvrtc"];
  
        function shouldEnableAutomatically(extension) {
          var ret = false;
          automaticallyEnabledExtensions.forEach(function(include) {
            if (extension.indexOf(include) != -1) {
              ret = true;
            }
          });
          return ret;
        }
  
        var exts = GLctx.getSupportedExtensions() || []; // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
        exts.forEach(function(ext) {
          if (automaticallyEnabledExtensions.indexOf(ext) != -1) {
            GLctx.getExtension(ext); // Calling .getExtension enables that extension permanently, no need to store the return value to be enabled.
          }
        });
      },populateUniformTable:function(program) {
        var p = GL.programs[program];
        var ptable = GL.programInfos[program] = {
          uniforms: {},
          maxUniformLength: 0, // This is eagerly computed below, since we already enumerate all uniforms anyway.
          maxAttributeLength: -1, // This is lazily computed and cached, computed when/if first asked, "-1" meaning not computed yet.
          maxUniformBlockNameLength: -1 // Lazily computed as well
        };
  
        var utable = ptable.uniforms;
        // A program's uniform table maps the string name of an uniform to an integer location of that uniform.
        // The global GL.uniforms map maps integer locations to WebGLUniformLocations.
        var numUniforms = GLctx.getProgramParameter(p, 0x8B86/*GL_ACTIVE_UNIFORMS*/);
        for (var i = 0; i < numUniforms; ++i) {
          var u = GLctx.getActiveUniform(p, i);
  
          var name = u.name;
          ptable.maxUniformLength = Math.max(ptable.maxUniformLength, name.length+1);
  
          // If we are dealing with an array, e.g. vec4 foo[3], strip off the array index part to canonicalize that "foo", "foo[]",
          // and "foo[0]" will mean the same. Loop below will populate foo[1] and foo[2].
          if (name.slice(-1) == ']') {
            name = name.slice(0, name.lastIndexOf('['));
          }
  
          // Optimize memory usage slightly: If we have an array of uniforms, e.g. 'vec3 colors[3];', then
          // only store the string 'colors' in utable, and 'colors[0]', 'colors[1]' and 'colors[2]' will be parsed as 'colors'+i.
          // Note that for the GL.uniforms table, we still need to fetch the all WebGLUniformLocations for all the indices.
          var loc = GLctx.getUniformLocation(p, name);
          if (loc) {
            var id = GL.getNewId(GL.uniforms);
            utable[name] = [u.size, id];
            GL.uniforms[id] = loc;
  
            for (var j = 1; j < u.size; ++j) {
              var n = name + '['+j+']';
              loc = GLctx.getUniformLocation(p, n);
              id = GL.getNewId(GL.uniforms);
  
              GL.uniforms[id] = loc;
            }
          }
        }
      }};function _emscripten_glActiveTexture(x0) { GLctx['activeTexture'](x0) }

  function _emscripten_glAttachShader(program, shader) {
      GLctx.attachShader(GL.programs[program],
                              GL.shaders[shader]);
    }

  function _emscripten_glBeginQuery(target, id) {
      GLctx['beginQuery'](target, GL.queries[id]);
    }

  function _emscripten_glBeginQueryEXT(target, id) {
      GLctx.disjointTimerQueryExt['beginQueryEXT'](target, GL.timerQueriesEXT[id]);
    }

  function _emscripten_glBeginTransformFeedback(x0) { GLctx['beginTransformFeedback'](x0) }

  function _emscripten_glBindAttribLocation(program, index, name) {
      GLctx.bindAttribLocation(GL.programs[program], index, UTF8ToString(name));
    }

  function _emscripten_glBindBuffer(target, buffer) {
  
      if (target == 0x88EB /*GL_PIXEL_PACK_BUFFER*/) {
        // In WebGL 2 glReadPixels entry point, we need to use a different WebGL 2 API function call when a buffer is bound to
        // GL_PIXEL_PACK_BUFFER_BINDING point, so must keep track whether that binding point is non-null to know what is
        // the proper API function to call.
        GLctx.currentPixelPackBufferBinding = buffer;
      } else if (target == 0x88EC /*GL_PIXEL_UNPACK_BUFFER*/) {
        // In WebGL 2 gl(Compressed)Tex(Sub)Image[23]D entry points, we need to
        // use a different WebGL 2 API function call when a buffer is bound to
        // GL_PIXEL_UNPACK_BUFFER_BINDING point, so must keep track whether that
        // binding point is non-null to know what is the proper API function to
        // call.
        GLctx.currentPixelUnpackBufferBinding = buffer;
      }
      GLctx.bindBuffer(target, GL.buffers[buffer]);
    }

  function _emscripten_glBindBufferBase(target, index, buffer) {
      GLctx['bindBufferBase'](target, index, GL.buffers[buffer]);
    }

  function _emscripten_glBindBufferRange(target, index, buffer, offset, ptrsize) {
      GLctx['bindBufferRange'](target, index, GL.buffers[buffer], offset, ptrsize);
    }

  function _emscripten_glBindFramebuffer(target, framebuffer) {
  
      GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);
  
    }

  function _emscripten_glBindRenderbuffer(target, renderbuffer) {
      GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
    }

  function _emscripten_glBindSampler(unit, sampler) {
      GLctx['bindSampler'](unit, GL.samplers[sampler]);
    }

  function _emscripten_glBindTexture(target, texture) {
      GLctx.bindTexture(target, GL.textures[texture]);
    }

  function _emscripten_glBindTransformFeedback(target, id) {
      GLctx['bindTransformFeedback'](target, GL.transformFeedbacks[id]);
    }

  function _emscripten_glBindVertexArray(vao) {
      GLctx['bindVertexArray'](GL.vaos[vao]);
    }

  function _emscripten_glBindVertexArrayOES(vao) {
      GLctx['bindVertexArray'](GL.vaos[vao]);
    }

  function _emscripten_glBlendColor(x0, x1, x2, x3) { GLctx['blendColor'](x0, x1, x2, x3) }

  function _emscripten_glBlendEquation(x0) { GLctx['blendEquation'](x0) }

  function _emscripten_glBlendEquationSeparate(x0, x1) { GLctx['blendEquationSeparate'](x0, x1) }

  function _emscripten_glBlendFunc(x0, x1) { GLctx['blendFunc'](x0, x1) }

  function _emscripten_glBlendFuncSeparate(x0, x1, x2, x3) { GLctx['blendFuncSeparate'](x0, x1, x2, x3) }

  function _emscripten_glBlitFramebuffer(x0, x1, x2, x3, x4, x5, x6, x7, x8, x9) { GLctx['blitFramebuffer'](x0, x1, x2, x3, x4, x5, x6, x7, x8, x9) }

  function _emscripten_glBufferData(target, size, data, usage) {
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (data) {
          GLctx.bufferData(target, HEAPU8, usage, data, size);
        } else {
          GLctx.bufferData(target, size, usage);
        }
      } else {
        // N.b. here first form specifies a heap subarray, second form an integer size, so the ?: code here is polymorphic. It is advised to avoid
        // randomly mixing both uses in calling code, to avoid any potential JS engine JIT issues.
        GLctx.bufferData(target, data ? HEAPU8.subarray(data, data+size) : size, usage);
      }
    }

  function _emscripten_glBufferSubData(target, offset, size, data) {
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.bufferSubData(target, offset, HEAPU8, data, size);
        return;
      }
      GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data+size));
    }

  function _emscripten_glCheckFramebufferStatus(x0) { return GLctx['checkFramebufferStatus'](x0) }

  function _emscripten_glClear(x0) { GLctx['clear'](x0) }

  function _emscripten_glClearBufferfi(x0, x1, x2, x3) { GLctx['clearBufferfi'](x0, x1, x2, x3) }

  function _emscripten_glClearBufferfv(buffer, drawbuffer, value) {
  
      GLctx['clearBufferfv'](buffer, drawbuffer, HEAPF32, value>>2);
    }

  function _emscripten_glClearBufferiv(buffer, drawbuffer, value) {
  
      GLctx['clearBufferiv'](buffer, drawbuffer, HEAP32, value>>2);
    }

  function _emscripten_glClearBufferuiv(buffer, drawbuffer, value) {
  
      GLctx['clearBufferuiv'](buffer, drawbuffer, HEAPU32, value>>2);
    }

  function _emscripten_glClearColor(x0, x1, x2, x3) { GLctx['clearColor'](x0, x1, x2, x3) }

  function _emscripten_glClearDepthf(x0) { GLctx['clearDepth'](x0) }

  function _emscripten_glClearStencil(x0) { GLctx['clearStencil'](x0) }

  
  function convertI32PairToI53(lo, hi) {
      return (lo >>> 0) + hi * 4294967296;
    }function _emscripten_glClientWaitSync(sync, flags, timeoutLo, timeoutHi) {
      // WebGL2 vs GLES3 differences: in GLES3, the timeout parameter is a uint64, where 0xFFFFFFFFFFFFFFFFULL means GL_TIMEOUT_IGNORED.
      // In JS, there's no 64-bit value types, so instead timeout is taken to be signed, and GL_TIMEOUT_IGNORED is given value -1.
      // Inherently the value accepted in the timeout is lossy, and can't take in arbitrary u64 bit pattern (but most likely doesn't matter)
      // See https://www.khronos.org/registry/webgl/specs/latest/2.0/#5.15
      return GLctx.clientWaitSync(GL.syncs[sync], flags, convertI32PairToI53(timeoutLo, timeoutHi));
    }

  function _emscripten_glColorMask(red, green, blue, alpha) {
      GLctx.colorMask(!!red, !!green, !!blue, !!alpha);
    }

  function _emscripten_glCompileShader(shader) {
      GLctx.compileShader(GL.shaders[shader]);
    }

  function _emscripten_glCompressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data) {
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (GLctx.currentPixelUnpackBufferBinding) {
          GLctx['compressedTexImage2D'](target, level, internalFormat, width, height, border, imageSize, data);
        } else {
          GLctx['compressedTexImage2D'](target, level, internalFormat, width, height, border, HEAPU8, data, imageSize);
        }
        return;
      }
      GLctx['compressedTexImage2D'](target, level, internalFormat, width, height, border, data ? HEAPU8.subarray((data),(data+imageSize)) : null);
    }

  function _emscripten_glCompressedTexImage3D(target, level, internalFormat, width, height, depth, border, imageSize, data) {
      if (GLctx.currentPixelUnpackBufferBinding) {
        GLctx['compressedTexImage3D'](target, level, internalFormat, width, height, depth, border, imageSize, data);
      } else {
        GLctx['compressedTexImage3D'](target, level, internalFormat, width, height, depth, border, HEAPU8, data, imageSize);
      }
    }

  function _emscripten_glCompressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data) {
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (GLctx.currentPixelUnpackBufferBinding) {
          GLctx['compressedTexSubImage2D'](target, level, xoffset, yoffset, width, height, format, imageSize, data);
        } else {
          GLctx['compressedTexSubImage2D'](target, level, xoffset, yoffset, width, height, format, HEAPU8, data, imageSize);
        }
        return;
      }
      GLctx['compressedTexSubImage2D'](target, level, xoffset, yoffset, width, height, format, data ? HEAPU8.subarray((data),(data+imageSize)) : null);
    }

  function _emscripten_glCompressedTexSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, imageSize, data) {
      if (GLctx.currentPixelUnpackBufferBinding) {
        GLctx['compressedTexSubImage3D'](target, level, xoffset, yoffset, zoffset, width, height, depth, format, imageSize, data);
      } else {
        GLctx['compressedTexSubImage3D'](target, level, xoffset, yoffset, zoffset, width, height, depth, format, HEAPU8, data, imageSize);
      }
    }

  function _emscripten_glCopyBufferSubData(x0, x1, x2, x3, x4) { GLctx['copyBufferSubData'](x0, x1, x2, x3, x4) }

  function _emscripten_glCopyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) { GLctx['copyTexImage2D'](x0, x1, x2, x3, x4, x5, x6, x7) }

  function _emscripten_glCopyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) { GLctx['copyTexSubImage2D'](x0, x1, x2, x3, x4, x5, x6, x7) }

  function _emscripten_glCopyTexSubImage3D(x0, x1, x2, x3, x4, x5, x6, x7, x8) { GLctx['copyTexSubImage3D'](x0, x1, x2, x3, x4, x5, x6, x7, x8) }

  function _emscripten_glCreateProgram() {
      var id = GL.getNewId(GL.programs);
      var program = GLctx.createProgram();
      program.name = id;
      GL.programs[id] = program;
      return id;
    }

  function _emscripten_glCreateShader(shaderType) {
      var id = GL.getNewId(GL.shaders);
      GL.shaders[id] = GLctx.createShader(shaderType);
      return id;
    }

  function _emscripten_glCullFace(x0) { GLctx['cullFace'](x0) }

  function _emscripten_glDeleteBuffers(n, buffers) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((buffers)+(i*4))>>2)];
        var buffer = GL.buffers[id];
  
        // From spec: "glDeleteBuffers silently ignores 0's and names that do not
        // correspond to existing buffer objects."
        if (!buffer) continue;
  
        GLctx.deleteBuffer(buffer);
        buffer.name = 0;
        GL.buffers[id] = null;
  
        if (id == GLctx.currentPixelPackBufferBinding) GLctx.currentPixelPackBufferBinding = 0;
        if (id == GLctx.currentPixelUnpackBufferBinding) GLctx.currentPixelUnpackBufferBinding = 0;
      }
    }

  function _emscripten_glDeleteFramebuffers(n, framebuffers) {
      for (var i = 0; i < n; ++i) {
        var id = HEAP32[(((framebuffers)+(i*4))>>2)];
        var framebuffer = GL.framebuffers[id];
        if (!framebuffer) continue; // GL spec: "glDeleteFramebuffers silently ignores 0s and names that do not correspond to existing framebuffer objects".
        GLctx.deleteFramebuffer(framebuffer);
        framebuffer.name = 0;
        GL.framebuffers[id] = null;
      }
    }

  function _emscripten_glDeleteProgram(id) {
      if (!id) return;
      var program = GL.programs[id];
      if (!program) { // glDeleteProgram actually signals an error when deleting a nonexisting object, unlike some other GL delete functions.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      GLctx.deleteProgram(program);
      program.name = 0;
      GL.programs[id] = null;
      GL.programInfos[id] = null;
    }

  function _emscripten_glDeleteQueries(n, ids) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((ids)+(i*4))>>2)];
        var query = GL.queries[id];
        if (!query) continue; // GL spec: "unused names in ids are ignored, as is the name zero."
        GLctx['deleteQuery'](query);
        GL.queries[id] = null;
      }
    }

  function _emscripten_glDeleteQueriesEXT(n, ids) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((ids)+(i*4))>>2)];
        var query = GL.timerQueriesEXT[id];
        if (!query) continue; // GL spec: "unused names in ids are ignored, as is the name zero."
        GLctx.disjointTimerQueryExt['deleteQueryEXT'](query);
        GL.timerQueriesEXT[id] = null;
      }
    }

  function _emscripten_glDeleteRenderbuffers(n, renderbuffers) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((renderbuffers)+(i*4))>>2)];
        var renderbuffer = GL.renderbuffers[id];
        if (!renderbuffer) continue; // GL spec: "glDeleteRenderbuffers silently ignores 0s and names that do not correspond to existing renderbuffer objects".
        GLctx.deleteRenderbuffer(renderbuffer);
        renderbuffer.name = 0;
        GL.renderbuffers[id] = null;
      }
    }

  function _emscripten_glDeleteSamplers(n, samplers) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((samplers)+(i*4))>>2)];
        var sampler = GL.samplers[id];
        if (!sampler) continue;
        GLctx['deleteSampler'](sampler);
        sampler.name = 0;
        GL.samplers[id] = null;
      }
    }

  function _emscripten_glDeleteShader(id) {
      if (!id) return;
      var shader = GL.shaders[id];
      if (!shader) { // glDeleteShader actually signals an error when deleting a nonexisting object, unlike some other GL delete functions.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      GLctx.deleteShader(shader);
      GL.shaders[id] = null;
    }

  function _emscripten_glDeleteSync(id) {
      if (!id) return;
      var sync = GL.syncs[id];
      if (!sync) { // glDeleteSync signals an error when deleting a nonexisting object, unlike some other GL delete functions.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      GLctx.deleteSync(sync);
      sync.name = 0;
      GL.syncs[id] = null;
    }

  function _emscripten_glDeleteTextures(n, textures) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((textures)+(i*4))>>2)];
        var texture = GL.textures[id];
        if (!texture) continue; // GL spec: "glDeleteTextures silently ignores 0s and names that do not correspond to existing textures".
        GLctx.deleteTexture(texture);
        texture.name = 0;
        GL.textures[id] = null;
      }
    }

  function _emscripten_glDeleteTransformFeedbacks(n, ids) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((ids)+(i*4))>>2)];
        var transformFeedback = GL.transformFeedbacks[id];
        if (!transformFeedback) continue; // GL spec: "unused names in ids are ignored, as is the name zero."
        GLctx['deleteTransformFeedback'](transformFeedback);
        transformFeedback.name = 0;
        GL.transformFeedbacks[id] = null;
      }
    }

  function _emscripten_glDeleteVertexArrays(n, vaos) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((vaos)+(i*4))>>2)];
        GLctx['deleteVertexArray'](GL.vaos[id]);
        GL.vaos[id] = null;
      }
    }

  function _emscripten_glDeleteVertexArraysOES(n, vaos) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((vaos)+(i*4))>>2)];
        GLctx['deleteVertexArray'](GL.vaos[id]);
        GL.vaos[id] = null;
      }
    }

  function _emscripten_glDepthFunc(x0) { GLctx['depthFunc'](x0) }

  function _emscripten_glDepthMask(flag) {
      GLctx.depthMask(!!flag);
    }

  function _emscripten_glDepthRangef(x0, x1) { GLctx['depthRange'](x0, x1) }

  function _emscripten_glDetachShader(program, shader) {
      GLctx.detachShader(GL.programs[program],
                              GL.shaders[shader]);
    }

  function _emscripten_glDisable(x0) { GLctx['disable'](x0) }

  function _emscripten_glDisableVertexAttribArray(index) {
      GLctx.disableVertexAttribArray(index);
    }

  function _emscripten_glDrawArrays(mode, first, count) {
  
      GLctx.drawArrays(mode, first, count);
  
    }

  function _emscripten_glDrawArraysInstanced(mode, first, count, primcount) {
      GLctx['drawArraysInstanced'](mode, first, count, primcount);
    }

  function _emscripten_glDrawArraysInstancedANGLE(mode, first, count, primcount) {
      GLctx['drawArraysInstanced'](mode, first, count, primcount);
    }

  function _emscripten_glDrawArraysInstancedARB(mode, first, count, primcount) {
      GLctx['drawArraysInstanced'](mode, first, count, primcount);
    }

  function _emscripten_glDrawArraysInstancedEXT(mode, first, count, primcount) {
      GLctx['drawArraysInstanced'](mode, first, count, primcount);
    }

  function _emscripten_glDrawArraysInstancedNV(mode, first, count, primcount) {
      GLctx['drawArraysInstanced'](mode, first, count, primcount);
    }

  
  var __tempFixedLengthArray=[];function _emscripten_glDrawBuffers(n, bufs) {
  
      var bufArray = __tempFixedLengthArray[n];
      for (var i = 0; i < n; i++) {
        bufArray[i] = HEAP32[(((bufs)+(i*4))>>2)];
      }
  
      GLctx['drawBuffers'](bufArray);
    }

  function _emscripten_glDrawBuffersEXT(n, bufs) {
  
      var bufArray = __tempFixedLengthArray[n];
      for (var i = 0; i < n; i++) {
        bufArray[i] = HEAP32[(((bufs)+(i*4))>>2)];
      }
  
      GLctx['drawBuffers'](bufArray);
    }

  function _emscripten_glDrawBuffersWEBGL(n, bufs) {
  
      var bufArray = __tempFixedLengthArray[n];
      for (var i = 0; i < n; i++) {
        bufArray[i] = HEAP32[(((bufs)+(i*4))>>2)];
      }
  
      GLctx['drawBuffers'](bufArray);
    }

  function _emscripten_glDrawElements(mode, count, type, indices) {
  
      GLctx.drawElements(mode, count, type, indices);
  
    }

  function _emscripten_glDrawElementsInstanced(mode, count, type, indices, primcount) {
      GLctx['drawElementsInstanced'](mode, count, type, indices, primcount);
    }

  function _emscripten_glDrawElementsInstancedANGLE(mode, count, type, indices, primcount) {
      GLctx['drawElementsInstanced'](mode, count, type, indices, primcount);
    }

  function _emscripten_glDrawElementsInstancedARB(mode, count, type, indices, primcount) {
      GLctx['drawElementsInstanced'](mode, count, type, indices, primcount);
    }

  function _emscripten_glDrawElementsInstancedEXT(mode, count, type, indices, primcount) {
      GLctx['drawElementsInstanced'](mode, count, type, indices, primcount);
    }

  function _emscripten_glDrawElementsInstancedNV(mode, count, type, indices, primcount) {
      GLctx['drawElementsInstanced'](mode, count, type, indices, primcount);
    }

  
  function _glDrawElements(mode, count, type, indices) {
  
      GLctx.drawElements(mode, count, type, indices);
  
    }function _emscripten_glDrawRangeElements(mode, start, end, count, type, indices) {
      // TODO: This should be a trivial pass-though function registered at the bottom of this page as
      // glFuncs[6][1] += ' drawRangeElements';
      // but due to https://bugzilla.mozilla.org/show_bug.cgi?id=1202427,
      // we work around by ignoring the range.
      _glDrawElements(mode, count, type, indices);
    }

  function _emscripten_glEnable(x0) { GLctx['enable'](x0) }

  function _emscripten_glEnableVertexAttribArray(index) {
      GLctx.enableVertexAttribArray(index);
    }

  function _emscripten_glEndQuery(x0) { GLctx['endQuery'](x0) }

  function _emscripten_glEndQueryEXT(target) {
      GLctx.disjointTimerQueryExt['endQueryEXT'](target);
    }

  function _emscripten_glEndTransformFeedback() { GLctx['endTransformFeedback']() }

  function _emscripten_glFenceSync(condition, flags) {
      var sync = GLctx.fenceSync(condition, flags);
      if (sync) {
        var id = GL.getNewId(GL.syncs);
        sync.name = id;
        GL.syncs[id] = sync;
        return id;
      } else {
        return 0; // Failed to create a sync object
      }
    }

  function _emscripten_glFinish() { GLctx['finish']() }

  function _emscripten_glFlush() { GLctx['flush']() }

  function _emscripten_glFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) {
      GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget,
                                         GL.renderbuffers[renderbuffer]);
    }

  function _emscripten_glFramebufferTexture2D(target, attachment, textarget, texture, level) {
      GLctx.framebufferTexture2D(target, attachment, textarget,
                                      GL.textures[texture], level);
    }

  function _emscripten_glFramebufferTextureLayer(target, attachment, texture, level, layer) {
      GLctx.framebufferTextureLayer(target, attachment, GL.textures[texture], level, layer);
    }

  function _emscripten_glFrontFace(x0) { GLctx['frontFace'](x0) }

  
  function __glGenObject(n, buffers, createFunction, objectTable
      ) {
      for (var i = 0; i < n; i++) {
        var buffer = GLctx[createFunction]();
        var id = buffer && GL.getNewId(objectTable);
        if (buffer) {
          buffer.name = id;
          objectTable[id] = buffer;
        } else {
          GL.recordError(0x502 /* GL_INVALID_OPERATION */);
        }
        HEAP32[(((buffers)+(i*4))>>2)]=id;
      }
    }function _emscripten_glGenBuffers(n, buffers) {
      __glGenObject(n, buffers, 'createBuffer', GL.buffers
        );
    }

  function _emscripten_glGenFramebuffers(n, ids) {
      __glGenObject(n, ids, 'createFramebuffer', GL.framebuffers
        );
    }

  function _emscripten_glGenQueries(n, ids) {
      __glGenObject(n, ids, 'createQuery', GL.queries
        );
    }

  function _emscripten_glGenQueriesEXT(n, ids) {
      for (var i = 0; i < n; i++) {
        var query = GLctx.disjointTimerQueryExt['createQueryEXT']();
        if (!query) {
          GL.recordError(0x502 /* GL_INVALID_OPERATION */);
          while(i < n) HEAP32[(((ids)+(i++*4))>>2)]=0;
          return;
        }
        var id = GL.getNewId(GL.timerQueriesEXT);
        query.name = id;
        GL.timerQueriesEXT[id] = query;
        HEAP32[(((ids)+(i*4))>>2)]=id;
      }
    }

  function _emscripten_glGenRenderbuffers(n, renderbuffers) {
      __glGenObject(n, renderbuffers, 'createRenderbuffer', GL.renderbuffers
        );
    }

  function _emscripten_glGenSamplers(n, samplers) {
      __glGenObject(n, samplers, 'createSampler', GL.samplers
        );
    }

  function _emscripten_glGenTextures(n, textures) {
      __glGenObject(n, textures, 'createTexture', GL.textures
        );
    }

  function _emscripten_glGenTransformFeedbacks(n, ids) {
      __glGenObject(n, ids, 'createTransformFeedback', GL.transformFeedbacks
        );
    }

  function _emscripten_glGenVertexArrays(n, arrays) {
      __glGenObject(n, arrays, 'createVertexArray', GL.vaos
        );
    }

  function _emscripten_glGenVertexArraysOES(n, arrays) {
      __glGenObject(n, arrays, 'createVertexArray', GL.vaos
        );
    }

  function _emscripten_glGenerateMipmap(x0) { GLctx['generateMipmap'](x0) }

  
  function __glGetActiveAttribOrUniform(funcName, program, index, bufSize, length, size, type, name) {
      program = GL.programs[program];
      var info = GLctx[funcName](program, index);
      if (info) { // If an error occurs, nothing will be written to length, size and type and name.
        var numBytesWrittenExclNull = name && stringToUTF8(info.name, name, bufSize);
        if (length) HEAP32[((length)>>2)]=numBytesWrittenExclNull;
        if (size) HEAP32[((size)>>2)]=info.size;
        if (type) HEAP32[((type)>>2)]=info.type;
      }
    }function _emscripten_glGetActiveAttrib(program, index, bufSize, length, size, type, name) {
      __glGetActiveAttribOrUniform('getActiveAttrib', program, index, bufSize, length, size, type, name);
    }

  function _emscripten_glGetActiveUniform(program, index, bufSize, length, size, type, name) {
      __glGetActiveAttribOrUniform('getActiveUniform', program, index, bufSize, length, size, type, name);
    }

  function _emscripten_glGetActiveUniformBlockName(program, uniformBlockIndex, bufSize, length, uniformBlockName) {
      program = GL.programs[program];
  
      var result = GLctx['getActiveUniformBlockName'](program, uniformBlockIndex);
      if (!result) return; // If an error occurs, nothing will be written to uniformBlockName or length.
      if (uniformBlockName && bufSize > 0) {
        var numBytesWrittenExclNull = stringToUTF8(result, uniformBlockName, bufSize);
        if (length) HEAP32[((length)>>2)]=numBytesWrittenExclNull;
      } else {
        if (length) HEAP32[((length)>>2)]=0;
      }
    }

  function _emscripten_glGetActiveUniformBlockiv(program, uniformBlockIndex, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if params == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      program = GL.programs[program];
  
      switch(pname) {
        case 0x8A41: /* GL_UNIFORM_BLOCK_NAME_LENGTH */
          var name = GLctx['getActiveUniformBlockName'](program, uniformBlockIndex);
          HEAP32[((params)>>2)]=name.length+1;
          return;
        default:
          var result = GLctx['getActiveUniformBlockParameter'](program, uniformBlockIndex, pname);
          if (!result) return; // If an error occurs, nothing will be written to params.
          if (typeof result == 'number') {
            HEAP32[((params)>>2)]=result;
          } else {
            for (var i = 0; i < result.length; i++) {
              HEAP32[(((params)+(i*4))>>2)]=result[i];
            }
          }
      }
    }

  function _emscripten_glGetActiveUniformsiv(program, uniformCount, uniformIndices, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if params == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      if (uniformCount > 0 && uniformIndices == 0) {
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      program = GL.programs[program];
      var ids = [];
      for (var i = 0; i < uniformCount; i++) {
        ids.push(HEAP32[(((uniformIndices)+(i*4))>>2)]);
      }
  
      var result = GLctx['getActiveUniforms'](program, ids, pname);
      if (!result) return; // GL spec: If an error is generated, nothing is written out to params.
  
      var len = result.length;
      for (var i = 0; i < len; i++) {
        HEAP32[(((params)+(i*4))>>2)]=result[i];
      }
    }

  function _emscripten_glGetAttachedShaders(program, maxCount, count, shaders) {
      var result = GLctx.getAttachedShaders(GL.programs[program]);
      var len = result.length;
      if (len > maxCount) {
        len = maxCount;
      }
      HEAP32[((count)>>2)]=len;
      for (var i = 0; i < len; ++i) {
        var id = GL.shaders.indexOf(result[i]);
        HEAP32[(((shaders)+(i*4))>>2)]=id;
      }
    }

  function _emscripten_glGetAttribLocation(program, name) {
      return GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
    }

  
  
  function writeI53ToI64(ptr, num) {
      HEAPU32[ptr>>2] = num;
      HEAPU32[ptr+4>>2] = (num - HEAPU32[ptr>>2])/4294967296;
    }function emscriptenWebGLGet(name_, p, type) {
      // Guard against user passing a null pointer.
      // Note that GLES2 spec does not say anything about how passing a null pointer should be treated.
      // Testing on desktop core GL 3, the application crashes on glGetIntegerv to a null pointer, but
      // better to report an error instead of doing anything random.
      if (!p) {
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var ret = undefined;
      switch(name_) { // Handle a few trivial GLES values
        case 0x8DFA: // GL_SHADER_COMPILER
          ret = 1;
          break;
        case 0x8DF8: // GL_SHADER_BINARY_FORMATS
          if (type != 0 && type != 1) {
            GL.recordError(0x500); // GL_INVALID_ENUM
          }
          return; // Do not write anything to the out pointer, since no binary formats are supported.
        case 0x87FE: // GL_NUM_PROGRAM_BINARY_FORMATS
        case 0x8DF9: // GL_NUM_SHADER_BINARY_FORMATS
          ret = 0;
          break;
        case 0x86A2: // GL_NUM_COMPRESSED_TEXTURE_FORMATS
          // WebGL doesn't have GL_NUM_COMPRESSED_TEXTURE_FORMATS (it's obsolete since GL_COMPRESSED_TEXTURE_FORMATS returns a JS array that can be queried for length),
          // so implement it ourselves to allow C++ GLES2 code get the length.
          var formats = GLctx.getParameter(0x86A3 /*GL_COMPRESSED_TEXTURE_FORMATS*/);
          ret = formats ? formats.length : 0;
          break;
        case 0x821D: // GL_NUM_EXTENSIONS
          if (GL.currentContext.version < 2) {
            GL.recordError(0x502 /* GL_INVALID_OPERATION */); // Calling GLES3/WebGL2 function with a GLES2/WebGL1 context
            return;
          }
          // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
          var exts = GLctx.getSupportedExtensions() || [];
          ret = 2 * exts.length; // each extension is duplicated, first in unprefixed WebGL form, and then a second time with "GL_" prefix.
          break;
        case 0x821B: // GL_MAJOR_VERSION
        case 0x821C: // GL_MINOR_VERSION
          if (GL.currentContext.version < 2) {
            GL.recordError(0x500); // GL_INVALID_ENUM
            return;
          }
          ret = name_ == 0x821B ? 3 : 0; // return version 3.0
          break;
      }
  
      if (ret === undefined) {
        var result = GLctx.getParameter(name_);
        switch (typeof(result)) {
          case "number":
            ret = result;
            break;
          case "boolean":
            ret = result ? 1 : 0;
            break;
          case "string":
            GL.recordError(0x500); // GL_INVALID_ENUM
            return;
          case "object":
            if (result === null) {
              // null is a valid result for some (e.g., which buffer is bound - perhaps nothing is bound), but otherwise
              // can mean an invalid name_, which we need to report as an error
              switch(name_) {
                case 0x8894: // ARRAY_BUFFER_BINDING
                case 0x8B8D: // CURRENT_PROGRAM
                case 0x8895: // ELEMENT_ARRAY_BUFFER_BINDING
                case 0x8CA6: // FRAMEBUFFER_BINDING or DRAW_FRAMEBUFFER_BINDING
                case 0x8CA7: // RENDERBUFFER_BINDING
                case 0x8069: // TEXTURE_BINDING_2D
                case 0x85B5: // WebGL 2 GL_VERTEX_ARRAY_BINDING, or WebGL 1 extension OES_vertex_array_object GL_VERTEX_ARRAY_BINDING_OES
                case 0x8F36: // COPY_READ_BUFFER_BINDING or COPY_READ_BUFFER
                case 0x8F37: // COPY_WRITE_BUFFER_BINDING or COPY_WRITE_BUFFER
                case 0x88ED: // PIXEL_PACK_BUFFER_BINDING
                case 0x88EF: // PIXEL_UNPACK_BUFFER_BINDING
                case 0x8CAA: // READ_FRAMEBUFFER_BINDING
                case 0x8919: // SAMPLER_BINDING
                case 0x8C1D: // TEXTURE_BINDING_2D_ARRAY
                case 0x806A: // TEXTURE_BINDING_3D
                case 0x8E25: // TRANSFORM_FEEDBACK_BINDING
                case 0x8C8F: // TRANSFORM_FEEDBACK_BUFFER_BINDING
                case 0x8A28: // UNIFORM_BUFFER_BINDING
                case 0x8514: { // TEXTURE_BINDING_CUBE_MAP
                  ret = 0;
                  break;
                }
                default: {
                  GL.recordError(0x500); // GL_INVALID_ENUM
                  return;
                }
              }
            } else if (result instanceof Float32Array ||
                       result instanceof Uint32Array ||
                       result instanceof Int32Array ||
                       result instanceof Array) {
              for (var i = 0; i < result.length; ++i) {
                switch (type) {
                  case 0: HEAP32[(((p)+(i*4))>>2)]=result[i]; break;
                  case 2: HEAPF32[(((p)+(i*4))>>2)]=result[i]; break;
                  case 4: HEAP8[(((p)+(i))>>0)]=result[i] ? 1 : 0; break;
                }
              }
              return;
            } else {
              try {
                ret = result.name | 0;
              } catch(e) {
                GL.recordError(0x500); // GL_INVALID_ENUM
                err('GL_INVALID_ENUM in glGet' + type + 'v: Unknown object returned from WebGL getParameter(' + name_ + ')! (error: ' + e + ')');
                return;
              }
            }
            break;
          default:
            GL.recordError(0x500); // GL_INVALID_ENUM
            err('GL_INVALID_ENUM in glGet' + type + 'v: Native code calling glGet' + type + 'v(' + name_ + ') and it returns ' + result + ' of type ' + typeof(result) + '!');
            return;
        }
      }
  
      switch (type) {
        case 1: writeI53ToI64(p, ret); break;
        case 0: HEAP32[((p)>>2)]=ret; break;
        case 2:   HEAPF32[((p)>>2)]=ret; break;
        case 4: HEAP8[((p)>>0)]=ret ? 1 : 0; break;
      }
    }function _emscripten_glGetBooleanv(name_, p) {
      emscriptenWebGLGet(name_, p, 4);
    }

  function _emscripten_glGetBufferParameteri64v(target, value, data) {
      if (!data) {
        // GLES2 specification does not specify how to behave if data is a null pointer. Since calling this function does not make sense
        // if data == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      writeI53ToI64(data, GLctx.getBufferParameter(target, value));
    }

  function _emscripten_glGetBufferParameteriv(target, value, data) {
      if (!data) {
        // GLES2 specification does not specify how to behave if data is a null pointer. Since calling this function does not make sense
        // if data == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAP32[((data)>>2)]=GLctx.getBufferParameter(target, value);
    }

  function _emscripten_glGetError() {
      var error = GLctx.getError() || GL.lastError;
      GL.lastError = 0/*GL_NO_ERROR*/;
      return error;
    }

  function _emscripten_glGetFloatv(name_, p) {
      emscriptenWebGLGet(name_, p, 2);
    }

  function _emscripten_glGetFragDataLocation(program, name) {
      return GLctx['getFragDataLocation'](GL.programs[program], UTF8ToString(name));
    }

  function _emscripten_glGetFramebufferAttachmentParameteriv(target, attachment, pname, params) {
      var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
      if (result instanceof WebGLRenderbuffer ||
          result instanceof WebGLTexture) {
        result = result.name | 0;
      }
      HEAP32[((params)>>2)]=result;
    }

  
  function emscriptenWebGLGetIndexed(target, index, data, type) {
      if (!data) {
        // GLES2 specification does not specify how to behave if data is a null pointer. Since calling this function does not make sense
        // if data == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var result = GLctx['getIndexedParameter'](target, index);
      var ret;
      switch (typeof result) {
        case 'boolean':
          ret = result ? 1 : 0;
          break;
        case 'number':
          ret = result;
          break;
        case 'object':
          if (result === null) {
            switch (target) {
              case 0x8C8F: // TRANSFORM_FEEDBACK_BUFFER_BINDING
              case 0x8A28: // UNIFORM_BUFFER_BINDING
                ret = 0;
                break;
              default: {
                GL.recordError(0x500); // GL_INVALID_ENUM
                return;
              }
            }
          } else if (result instanceof WebGLBuffer) {
            ret = result.name | 0;
          } else {
            GL.recordError(0x500); // GL_INVALID_ENUM
            return;
          }
          break;
        default:
          GL.recordError(0x500); // GL_INVALID_ENUM
          return;
      }
  
      switch (type) {
        case 1: writeI53ToI64(data, ret); break;
        case 0: HEAP32[((data)>>2)]=ret; break;
        case 2: HEAPF32[((data)>>2)]=ret; break;
        case 4: HEAP8[((data)>>0)]=ret ? 1 : 0; break;
        default: throw 'internal emscriptenWebGLGetIndexed() error, bad type: ' + type;
      }
    }function _emscripten_glGetInteger64i_v(target, index, data) {
      emscriptenWebGLGetIndexed(target, index, data, 1);
    }

  function _emscripten_glGetInteger64v(name_, p) {
      emscriptenWebGLGet(name_, p, 1);
    }

  function _emscripten_glGetIntegeri_v(target, index, data) {
      emscriptenWebGLGetIndexed(target, index, data, 0);
    }

  function _emscripten_glGetIntegerv(name_, p) {
      emscriptenWebGLGet(name_, p, 0);
    }

  function _emscripten_glGetInternalformativ(target, internalformat, pname, bufSize, params) {
      if (bufSize < 0) {
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      if (!params) {
        // GLES3 specification does not specify how to behave if values is a null pointer. Since calling this function does not make sense
        // if values == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var ret = GLctx['getInternalformatParameter'](target, internalformat, pname);
      if (ret === null) return;
      for (var i = 0; i < ret.length && i < bufSize; ++i) {
        HEAP32[(((params)+(i))>>2)]=ret[i];
      }
    }

  function _emscripten_glGetProgramBinary(program, bufSize, length, binaryFormat, binary) {
      GL.recordError(0x502/*GL_INVALID_OPERATION*/);
    }

  function _emscripten_glGetProgramInfoLog(program, maxLength, length, infoLog) {
      var log = GLctx.getProgramInfoLog(GL.programs[program]);
      if (log === null) log = '(unknown error)';
      var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
      if (length) HEAP32[((length)>>2)]=numBytesWrittenExclNull;
    }

  function _emscripten_glGetProgramiv(program, pname, p) {
      if (!p) {
        // GLES2 specification does not specify how to behave if p is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
  
      if (program >= GL.counter) {
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
  
      var ptable = GL.programInfos[program];
      if (!ptable) {
        GL.recordError(0x502 /* GL_INVALID_OPERATION */);
        return;
      }
  
      if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
        var log = GLctx.getProgramInfoLog(GL.programs[program]);
        if (log === null) log = '(unknown error)';
        HEAP32[((p)>>2)]=log.length + 1;
      } else if (pname == 0x8B87 /* GL_ACTIVE_UNIFORM_MAX_LENGTH */) {
        HEAP32[((p)>>2)]=ptable.maxUniformLength;
      } else if (pname == 0x8B8A /* GL_ACTIVE_ATTRIBUTE_MAX_LENGTH */) {
        if (ptable.maxAttributeLength == -1) {
          program = GL.programs[program];
          var numAttribs = GLctx.getProgramParameter(program, 0x8B89/*GL_ACTIVE_ATTRIBUTES*/);
          ptable.maxAttributeLength = 0; // Spec says if there are no active attribs, 0 must be returned.
          for (var i = 0; i < numAttribs; ++i) {
            var activeAttrib = GLctx.getActiveAttrib(program, i);
            ptable.maxAttributeLength = Math.max(ptable.maxAttributeLength, activeAttrib.name.length+1);
          }
        }
        HEAP32[((p)>>2)]=ptable.maxAttributeLength;
      } else if (pname == 0x8A35 /* GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH */) {
        if (ptable.maxUniformBlockNameLength == -1) {
          program = GL.programs[program];
          var numBlocks = GLctx.getProgramParameter(program, 0x8A36/*GL_ACTIVE_UNIFORM_BLOCKS*/);
          ptable.maxUniformBlockNameLength = 0;
          for (var i = 0; i < numBlocks; ++i) {
            var activeBlockName = GLctx.getActiveUniformBlockName(program, i);
            ptable.maxUniformBlockNameLength = Math.max(ptable.maxUniformBlockNameLength, activeBlockName.length+1);
          }
        }
        HEAP32[((p)>>2)]=ptable.maxUniformBlockNameLength;
      } else {
        HEAP32[((p)>>2)]=GLctx.getProgramParameter(GL.programs[program], pname);
      }
    }

  function _emscripten_glGetQueryObjecti64vEXT(id, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var query = GL.timerQueriesEXT[id];
      var param = GLctx.disjointTimerQueryExt['getQueryObjectEXT'](query, pname);
      var ret;
      if (typeof param == 'boolean') {
        ret = param ? 1 : 0;
      } else {
        ret = param;
      }
      writeI53ToI64(params, ret);
    }

  function _emscripten_glGetQueryObjectivEXT(id, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var query = GL.timerQueriesEXT[id];
      var param = GLctx.disjointTimerQueryExt['getQueryObjectEXT'](query, pname);
      var ret;
      if (typeof param == 'boolean') {
        ret = param ? 1 : 0;
      } else {
        ret = param;
      }
      HEAP32[((params)>>2)]=ret;
    }

  function _emscripten_glGetQueryObjectui64vEXT(id, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var query = GL.timerQueriesEXT[id];
      var param = GLctx.disjointTimerQueryExt['getQueryObjectEXT'](query, pname);
      var ret;
      if (typeof param == 'boolean') {
        ret = param ? 1 : 0;
      } else {
        ret = param;
      }
      writeI53ToI64(params, ret);
    }

  function _emscripten_glGetQueryObjectuiv(id, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var query = GL.queries[id];
      var param = GLctx['getQueryParameter'](query, pname);
      var ret;
      if (typeof param == 'boolean') {
        ret = param ? 1 : 0;
      } else {
        ret = param;
      }
      HEAP32[((params)>>2)]=ret;
    }

  function _emscripten_glGetQueryObjectuivEXT(id, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var query = GL.timerQueriesEXT[id];
      var param = GLctx.disjointTimerQueryExt['getQueryObjectEXT'](query, pname);
      var ret;
      if (typeof param == 'boolean') {
        ret = param ? 1 : 0;
      } else {
        ret = param;
      }
      HEAP32[((params)>>2)]=ret;
    }

  function _emscripten_glGetQueryiv(target, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAP32[((params)>>2)]=GLctx['getQuery'](target, pname);
    }

  function _emscripten_glGetQueryivEXT(target, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAP32[((params)>>2)]=GLctx.disjointTimerQueryExt['getQueryEXT'](target, pname);
    }

  function _emscripten_glGetRenderbufferParameteriv(target, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if params == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAP32[((params)>>2)]=GLctx.getRenderbufferParameter(target, pname);
    }

  function _emscripten_glGetSamplerParameterfv(sampler, pname, params) {
      if (!params) {
        // GLES3 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      sampler = GL.samplers[sampler];
      HEAPF32[((params)>>2)]=GLctx['getSamplerParameter'](sampler, pname);
    }

  function _emscripten_glGetSamplerParameteriv(sampler, pname, params) {
      if (!params) {
        // GLES3 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      sampler = GL.samplers[sampler];
      HEAP32[((params)>>2)]=GLctx['getSamplerParameter'](sampler, pname);
    }

  function _emscripten_glGetShaderInfoLog(shader, maxLength, length, infoLog) {
      var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
      if (log === null) log = '(unknown error)';
      var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
      if (length) HEAP32[((length)>>2)]=numBytesWrittenExclNull;
    }

  function _emscripten_glGetShaderPrecisionFormat(shaderType, precisionType, range, precision) {
      var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
      HEAP32[((range)>>2)]=result.rangeMin;
      HEAP32[(((range)+(4))>>2)]=result.rangeMax;
      HEAP32[((precision)>>2)]=result.precision;
    }

  function _emscripten_glGetShaderSource(shader, bufSize, length, source) {
      var result = GLctx.getShaderSource(GL.shaders[shader]);
      if (!result) return; // If an error occurs, nothing will be written to length or source.
      var numBytesWrittenExclNull = (bufSize > 0 && source) ? stringToUTF8(result, source, bufSize) : 0;
      if (length) HEAP32[((length)>>2)]=numBytesWrittenExclNull;
    }

  function _emscripten_glGetShaderiv(shader, pname, p) {
      if (!p) {
        // GLES2 specification does not specify how to behave if p is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
        var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
        if (log === null) log = '(unknown error)';
        HEAP32[((p)>>2)]=log.length + 1;
      } else if (pname == 0x8B88) { // GL_SHADER_SOURCE_LENGTH
        var source = GLctx.getShaderSource(GL.shaders[shader]);
        var sourceLength = (source === null || source.length == 0) ? 0 : source.length + 1;
        HEAP32[((p)>>2)]=sourceLength;
      } else {
        HEAP32[((p)>>2)]=GLctx.getShaderParameter(GL.shaders[shader], pname);
      }
    }

  
  function stringToNewUTF8(jsString) {
      var length = lengthBytesUTF8(jsString)+1;
      var cString = _malloc(length);
      stringToUTF8(jsString, cString, length);
      return cString;
    }function _emscripten_glGetString(name_) {
      if (GL.stringCache[name_]) return GL.stringCache[name_];
      var ret;
      switch(name_) {
        case 0x1F03 /* GL_EXTENSIONS */:
          var exts = GLctx.getSupportedExtensions() || []; // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
          exts = exts.concat(exts.map(function(e) { return "GL_" + e; }));
          ret = stringToNewUTF8(exts.join(' '));
          break;
        case 0x1F00 /* GL_VENDOR */:
        case 0x1F01 /* GL_RENDERER */:
        case 0x9245 /* UNMASKED_VENDOR_WEBGL */:
        case 0x9246 /* UNMASKED_RENDERER_WEBGL */:
          var s = GLctx.getParameter(name_);
          if (!s) {
            GL.recordError(0x500/*GL_INVALID_ENUM*/);
          }
          ret = stringToNewUTF8(s);
          break;
  
        case 0x1F02 /* GL_VERSION */:
          var glVersion = GLctx.getParameter(0x1F02 /*GL_VERSION*/);
          // return GLES version string corresponding to the version of the WebGL context
          if (GL.currentContext.version >= 2) glVersion = 'OpenGL ES 3.0 (' + glVersion + ')';
          else
          {
            glVersion = 'OpenGL ES 2.0 (' + glVersion + ')';
          }
          ret = stringToNewUTF8(glVersion);
          break;
        case 0x8B8C /* GL_SHADING_LANGUAGE_VERSION */:
          var glslVersion = GLctx.getParameter(0x8B8C /*GL_SHADING_LANGUAGE_VERSION*/);
          // extract the version number 'N.M' from the string 'WebGL GLSL ES N.M ...'
          var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
          var ver_num = glslVersion.match(ver_re);
          if (ver_num !== null) {
            if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + '0'; // ensure minor version has 2 digits
            glslVersion = 'OpenGL ES GLSL ES ' + ver_num[1] + ' (' + glslVersion + ')';
          }
          ret = stringToNewUTF8(glslVersion);
          break;
        default:
          GL.recordError(0x500/*GL_INVALID_ENUM*/);
          return 0;
      }
      GL.stringCache[name_] = ret;
      return ret;
    }

  function _emscripten_glGetStringi(name, index) {
      if (GL.currentContext.version < 2) {
        GL.recordError(0x502 /* GL_INVALID_OPERATION */); // Calling GLES3/WebGL2 function with a GLES2/WebGL1 context
        return 0;
      }
      var stringiCache = GL.stringiCache[name];
      if (stringiCache) {
        if (index < 0 || index >= stringiCache.length) {
          GL.recordError(0x501/*GL_INVALID_VALUE*/);
          return 0;
        }
        return stringiCache[index];
      }
      switch(name) {
        case 0x1F03 /* GL_EXTENSIONS */:
          var exts = GLctx.getSupportedExtensions() || []; // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
          exts = exts.concat(exts.map(function(e) { return "GL_" + e; }));
          exts = exts.map(function(e) { return stringToNewUTF8(e); });
  
          stringiCache = GL.stringiCache[name] = exts;
          if (index < 0 || index >= stringiCache.length) {
            GL.recordError(0x501/*GL_INVALID_VALUE*/);
            return 0;
          }
          return stringiCache[index];
        default:
          GL.recordError(0x500/*GL_INVALID_ENUM*/);
          return 0;
      }
    }

  function _emscripten_glGetSynciv(sync, pname, bufSize, length, values) {
      if (bufSize < 0) {
        // GLES3 specification does not specify how to behave if bufSize < 0, however in the spec wording for glGetInternalformativ, it does say that GL_INVALID_VALUE should be raised,
        // so raise GL_INVALID_VALUE here as well.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      if (!values) {
        // GLES3 specification does not specify how to behave if values is a null pointer. Since calling this function does not make sense
        // if values == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var ret = GLctx.getSyncParameter(GL.syncs[sync], pname);
      HEAP32[((length)>>2)]=ret;
      if (ret !== null && length) HEAP32[((length)>>2)]=1; // Report a single value outputted.
    }

  function _emscripten_glGetTexParameterfv(target, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAPF32[((params)>>2)]=GLctx.getTexParameter(target, pname);
    }

  function _emscripten_glGetTexParameteriv(target, pname, params) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAP32[((params)>>2)]=GLctx.getTexParameter(target, pname);
    }

  function _emscripten_glGetTransformFeedbackVarying(program, index, bufSize, length, size, type, name) {
      program = GL.programs[program];
      var info = GLctx['getTransformFeedbackVarying'](program, index);
      if (!info) return; // If an error occurred, the return parameters length, size, type and name will be unmodified.
  
      if (name && bufSize > 0) {
        var numBytesWrittenExclNull = stringToUTF8(info.name, name, bufSize);
        if (length) HEAP32[((length)>>2)]=numBytesWrittenExclNull;
      } else {
        if (length) HEAP32[((length)>>2)]=0;
      }
  
      if (size) HEAP32[((size)>>2)]=info.size;
      if (type) HEAP32[((type)>>2)]=info.type;
    }

  function _emscripten_glGetUniformBlockIndex(program, uniformBlockName) {
      return GLctx['getUniformBlockIndex'](GL.programs[program], UTF8ToString(uniformBlockName));
    }

  function _emscripten_glGetUniformIndices(program, uniformCount, uniformNames, uniformIndices) {
      if (!uniformIndices) {
        // GLES2 specification does not specify how to behave if uniformIndices is a null pointer. Since calling this function does not make sense
        // if uniformIndices == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      if (uniformCount > 0 && (uniformNames == 0 || uniformIndices == 0)) {
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      program = GL.programs[program];
      var names = [];
      for (var i = 0; i < uniformCount; i++)
        names.push(UTF8ToString(HEAP32[(((uniformNames)+(i*4))>>2)]));
  
      var result = GLctx['getUniformIndices'](program, names);
      if (!result) return; // GL spec: If an error is generated, nothing is written out to uniformIndices.
  
      var len = result.length;
      for (var i = 0; i < len; i++) {
        HEAP32[(((uniformIndices)+(i*4))>>2)]=result[i];
      }
    }

  
  /** @suppress {checkTypes} */
  function jstoi_q(str) {
      return parseInt(str);
    }function _emscripten_glGetUniformLocation(program, name) {
      name = UTF8ToString(name);
  
      var arrayIndex = 0;
      // If user passed an array accessor "[index]", parse the array index off the accessor.
      if (name[name.length - 1] == ']') {
        var leftBrace = name.lastIndexOf('[');
        arrayIndex = name[leftBrace+1] != ']' ? jstoi_q(name.slice(leftBrace + 1)) : 0; // "index]", parseInt will ignore the ']' at the end; but treat "foo[]" as "foo[0]"
        name = name.slice(0, leftBrace);
      }
  
      var uniformInfo = GL.programInfos[program] && GL.programInfos[program].uniforms[name]; // returns pair [ dimension_of_uniform_array, uniform_location ]
      if (uniformInfo && arrayIndex >= 0 && arrayIndex < uniformInfo[0]) { // Check if user asked for an out-of-bounds element, i.e. for 'vec4 colors[3];' user could ask for 'colors[10]' which should return -1.
        return uniformInfo[1] + arrayIndex;
      } else {
        return -1;
      }
    }

  
  /** @suppress{checkTypes} */
  function emscriptenWebGLGetUniform(program, location, params, type) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if params == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var data = GLctx.getUniform(GL.programs[program], GL.uniforms[location]);
      if (typeof data == 'number' || typeof data == 'boolean') {
        switch (type) {
          case 0: HEAP32[((params)>>2)]=data; break;
          case 2: HEAPF32[((params)>>2)]=data; break;
          default: throw 'internal emscriptenWebGLGetUniform() error, bad type: ' + type;
        }
      } else {
        for (var i = 0; i < data.length; i++) {
          switch (type) {
            case 0: HEAP32[(((params)+(i*4))>>2)]=data[i]; break;
            case 2: HEAPF32[(((params)+(i*4))>>2)]=data[i]; break;
            default: throw 'internal emscriptenWebGLGetUniform() error, bad type: ' + type;
          }
        }
      }
    }function _emscripten_glGetUniformfv(program, location, params) {
      emscriptenWebGLGetUniform(program, location, params, 2);
    }

  function _emscripten_glGetUniformiv(program, location, params) {
      emscriptenWebGLGetUniform(program, location, params, 0);
    }

  function _emscripten_glGetUniformuiv(program, location, params) {
      emscriptenWebGLGetUniform(program, location, params, 0);
    }

  
  /** @suppress{checkTypes} */
  function emscriptenWebGLGetVertexAttrib(index, pname, params, type) {
      if (!params) {
        // GLES2 specification does not specify how to behave if params is a null pointer. Since calling this function does not make sense
        // if params == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      var data = GLctx.getVertexAttrib(index, pname);
      if (pname == 0x889F/*VERTEX_ATTRIB_ARRAY_BUFFER_BINDING*/) {
        HEAP32[((params)>>2)]=data && data["name"];
      } else if (typeof data == 'number' || typeof data == 'boolean') {
        switch (type) {
          case 0: HEAP32[((params)>>2)]=data; break;
          case 2: HEAPF32[((params)>>2)]=data; break;
          case 5: HEAP32[((params)>>2)]=Math.fround(data); break;
          default: throw 'internal emscriptenWebGLGetVertexAttrib() error, bad type: ' + type;
        }
      } else {
        for (var i = 0; i < data.length; i++) {
          switch (type) {
            case 0: HEAP32[(((params)+(i*4))>>2)]=data[i]; break;
            case 2: HEAPF32[(((params)+(i*4))>>2)]=data[i]; break;
            case 5: HEAP32[(((params)+(i*4))>>2)]=Math.fround(data[i]); break;
            default: throw 'internal emscriptenWebGLGetVertexAttrib() error, bad type: ' + type;
          }
        }
      }
    }function _emscripten_glGetVertexAttribIiv(index, pname, params) {
      // N.B. This function may only be called if the vertex attribute was specified using the function glVertexAttribI4iv(),
      // otherwise the results are undefined. (GLES3 spec 6.1.12)
      emscriptenWebGLGetVertexAttrib(index, pname, params, 0);
    }

  function _emscripten_glGetVertexAttribIuiv(index, pname, params) {
      // N.B. This function may only be called if the vertex attribute was specified using the function glVertexAttribI4iv(),
      // otherwise the results are undefined. (GLES3 spec 6.1.12)
      emscriptenWebGLGetVertexAttrib(index, pname, params, 0);
    }

  function _emscripten_glGetVertexAttribPointerv(index, pname, pointer) {
      if (!pointer) {
        // GLES2 specification does not specify how to behave if pointer is a null pointer. Since calling this function does not make sense
        // if pointer == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      HEAP32[((pointer)>>2)]=GLctx.getVertexAttribOffset(index, pname);
    }

  function _emscripten_glGetVertexAttribfv(index, pname, params) {
      // N.B. This function may only be called if the vertex attribute was specified using the function glVertexAttrib*f(),
      // otherwise the results are undefined. (GLES3 spec 6.1.12)
      emscriptenWebGLGetVertexAttrib(index, pname, params, 2);
    }

  function _emscripten_glGetVertexAttribiv(index, pname, params) {
      // N.B. This function may only be called if the vertex attribute was specified using the function glVertexAttrib*f(),
      // otherwise the results are undefined. (GLES3 spec 6.1.12)
      emscriptenWebGLGetVertexAttrib(index, pname, params, 5);
    }

  function _emscripten_glHint(x0, x1) { GLctx['hint'](x0, x1) }

  function _emscripten_glInvalidateFramebuffer(target, numAttachments, attachments) {
      var list = __tempFixedLengthArray[numAttachments];
      for (var i = 0; i < numAttachments; i++) {
        list[i] = HEAP32[(((attachments)+(i*4))>>2)];
      }
  
      GLctx['invalidateFramebuffer'](target, list);
    }

  function _emscripten_glInvalidateSubFramebuffer(target, numAttachments, attachments, x, y, width, height) {
      var list = __tempFixedLengthArray[numAttachments];
      for (var i = 0; i < numAttachments; i++) {
        list[i] = HEAP32[(((attachments)+(i*4))>>2)];
      }
  
      GLctx['invalidateSubFramebuffer'](target, list, x, y, width, height);
    }

  function _emscripten_glIsBuffer(buffer) {
      var b = GL.buffers[buffer];
      if (!b) return 0;
      return GLctx.isBuffer(b);
    }

  function _emscripten_glIsEnabled(x0) { return GLctx['isEnabled'](x0) }

  function _emscripten_glIsFramebuffer(framebuffer) {
      var fb = GL.framebuffers[framebuffer];
      if (!fb) return 0;
      return GLctx.isFramebuffer(fb);
    }

  function _emscripten_glIsProgram(program) {
      program = GL.programs[program];
      if (!program) return 0;
      return GLctx.isProgram(program);
    }

  function _emscripten_glIsQuery(id) {
      var query = GL.queries[id];
      if (!query) return 0;
      return GLctx['isQuery'](query);
    }

  function _emscripten_glIsQueryEXT(id) {
      var query = GL.timerQueriesEXT[id];
      if (!query) return 0;
      return GLctx.disjointTimerQueryExt['isQueryEXT'](query);
    }

  function _emscripten_glIsRenderbuffer(renderbuffer) {
      var rb = GL.renderbuffers[renderbuffer];
      if (!rb) return 0;
      return GLctx.isRenderbuffer(rb);
    }

  function _emscripten_glIsSampler(id) {
      var sampler = GL.samplers[id];
      if (!sampler) return 0;
      return GLctx['isSampler'](sampler);
    }

  function _emscripten_glIsShader(shader) {
      var s = GL.shaders[shader];
      if (!s) return 0;
      return GLctx.isShader(s);
    }

  function _emscripten_glIsSync(sync) {
      return GLctx.isSync(GL.syncs[sync]);
    }

  function _emscripten_glIsTexture(id) {
      var texture = GL.textures[id];
      if (!texture) return 0;
      return GLctx.isTexture(texture);
    }

  function _emscripten_glIsTransformFeedback(id) {
      return GLctx['isTransformFeedback'](GL.transformFeedbacks[id]);
    }

  function _emscripten_glIsVertexArray(array) {
  
      var vao = GL.vaos[array];
      if (!vao) return 0;
      return GLctx['isVertexArray'](vao);
    }

  function _emscripten_glIsVertexArrayOES(array) {
  
      var vao = GL.vaos[array];
      if (!vao) return 0;
      return GLctx['isVertexArray'](vao);
    }

  function _emscripten_glLineWidth(x0) { GLctx['lineWidth'](x0) }

  function _emscripten_glLinkProgram(program) {
      GLctx.linkProgram(GL.programs[program]);
      GL.populateUniformTable(program);
    }

  function _emscripten_glPauseTransformFeedback() { GLctx['pauseTransformFeedback']() }

  function _emscripten_glPixelStorei(pname, param) {
      if (pname == 0xCF5 /* GL_UNPACK_ALIGNMENT */) {
        GL.unpackAlignment = param;
      }
      GLctx.pixelStorei(pname, param);
    }

  function _emscripten_glPolygonOffset(x0, x1) { GLctx['polygonOffset'](x0, x1) }

  function _emscripten_glProgramBinary(program, binaryFormat, binary, length) {
      GL.recordError(0x500/*GL_INVALID_ENUM*/);
    }

  function _emscripten_glProgramParameteri(program, pname, value) {
      GL.recordError(0x500/*GL_INVALID_ENUM*/);
    }

  function _emscripten_glQueryCounterEXT(id, target) {
      GLctx.disjointTimerQueryExt['queryCounterEXT'](GL.timerQueriesEXT[id], target);
    }

  function _emscripten_glReadBuffer(x0) { GLctx['readBuffer'](x0) }

  
  
  function __computeUnpackAlignedImageSize(width, height, sizePerPixel, alignment) {
      function roundedToNextMultipleOf(x, y) {
        return (x + y - 1) & -y;
      }
      var plainRowSize = width * sizePerPixel;
      var alignedRowSize = roundedToNextMultipleOf(plainRowSize, alignment);
      return height * alignedRowSize;
    }
  
  function __colorChannelsInGlTextureFormat(format) {
      // Micro-optimizations for size: map format to size by subtracting smallest enum value (0x1902) from all values first.
      // Also omit the most common size value (1) from the list, which is assumed by formats not on the list.
      var colorChannels = {
        // 0x1902 /* GL_DEPTH_COMPONENT */ - 0x1902: 1,
        // 0x1906 /* GL_ALPHA */ - 0x1902: 1,
        5: 3,
        6: 4,
        // 0x1909 /* GL_LUMINANCE */ - 0x1902: 1,
        8: 2,
        29502: 3,
        29504: 4,
        // 0x1903 /* GL_RED */ - 0x1902: 1,
        26917: 2,
        26918: 2,
        // 0x8D94 /* GL_RED_INTEGER */ - 0x1902: 1,
        29846: 3,
        29847: 4
      };
      return colorChannels[format - 0x1902]||1;
    }
  
  function __heapObjectForWebGLType(type) {
      // Micro-optimization for size: Subtract lowest GL enum number (0x1400/* GL_BYTE */) from type to compare
      // smaller values for the heap, for shorter generated code size.
      // Also the type HEAPU16 is not tested for explicitly, but any unrecognized type will return out HEAPU16.
      // (since most types are HEAPU16)
      type -= 0x1400;
      if (type == 0) return HEAP8;
  
      if (type == 1) return HEAPU8;
  
      if (type == 2) return HEAP16;
  
      if (type == 4) return HEAP32;
  
      if (type == 6) return HEAPF32;
  
      if (type == 5
        || type == 28922
        || type == 28520
        || type == 30779
        || type == 30782
        )
        return HEAPU32;
  
      return HEAPU16;
    }
  
  function __heapAccessShiftForWebGLHeap(heap) {
      return 31 - Math.clz32(heap.BYTES_PER_ELEMENT);
    }function emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) {
      var heap = __heapObjectForWebGLType(type);
      var shift = __heapAccessShiftForWebGLHeap(heap);
      var byteSize = 1<<shift;
      var sizePerPixel = __colorChannelsInGlTextureFormat(format) * byteSize;
      var bytes = __computeUnpackAlignedImageSize(width, height, sizePerPixel, GL.unpackAlignment);
      return heap.subarray(pixels >> shift, pixels + bytes >> shift);
    }function _emscripten_glReadPixels(x, y, width, height, format, type, pixels) {
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (GLctx.currentPixelPackBufferBinding) {
          GLctx.readPixels(x, y, width, height, format, type, pixels);
        } else {
          var heap = __heapObjectForWebGLType(type);
          GLctx.readPixels(x, y, width, height, format, type, heap, pixels >> __heapAccessShiftForWebGLHeap(heap));
        }
        return;
      }
      var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
      if (!pixelData) {
        GL.recordError(0x500/*GL_INVALID_ENUM*/);
        return;
      }
      GLctx.readPixels(x, y, width, height, format, type, pixelData);
    }

  function _emscripten_glReleaseShaderCompiler() {
      // NOP (as allowed by GLES 2.0 spec)
    }

  function _emscripten_glRenderbufferStorage(x0, x1, x2, x3) { GLctx['renderbufferStorage'](x0, x1, x2, x3) }

  function _emscripten_glRenderbufferStorageMultisample(x0, x1, x2, x3, x4) { GLctx['renderbufferStorageMultisample'](x0, x1, x2, x3, x4) }

  function _emscripten_glResumeTransformFeedback() { GLctx['resumeTransformFeedback']() }

  function _emscripten_glSampleCoverage(value, invert) {
      GLctx.sampleCoverage(value, !!invert);
    }

  function _emscripten_glSamplerParameterf(sampler, pname, param) {
      GLctx['samplerParameterf'](GL.samplers[sampler], pname, param);
    }

  function _emscripten_glSamplerParameterfv(sampler, pname, params) {
      var param = HEAPF32[((params)>>2)];
      GLctx['samplerParameterf'](GL.samplers[sampler], pname, param);
    }

  function _emscripten_glSamplerParameteri(sampler, pname, param) {
      GLctx['samplerParameteri'](GL.samplers[sampler], pname, param);
    }

  function _emscripten_glSamplerParameteriv(sampler, pname, params) {
      var param = HEAP32[((params)>>2)];
      GLctx['samplerParameteri'](GL.samplers[sampler], pname, param);
    }

  function _emscripten_glScissor(x0, x1, x2, x3) { GLctx['scissor'](x0, x1, x2, x3) }

  function _emscripten_glShaderBinary() {
      GL.recordError(0x500/*GL_INVALID_ENUM*/);
    }

  function _emscripten_glShaderSource(shader, count, string, length) {
      var source = GL.getSource(shader, count, string, length);
  
  
      GLctx.shaderSource(GL.shaders[shader], source);
    }

  function _emscripten_glStencilFunc(x0, x1, x2) { GLctx['stencilFunc'](x0, x1, x2) }

  function _emscripten_glStencilFuncSeparate(x0, x1, x2, x3) { GLctx['stencilFuncSeparate'](x0, x1, x2, x3) }

  function _emscripten_glStencilMask(x0) { GLctx['stencilMask'](x0) }

  function _emscripten_glStencilMaskSeparate(x0, x1) { GLctx['stencilMaskSeparate'](x0, x1) }

  function _emscripten_glStencilOp(x0, x1, x2) { GLctx['stencilOp'](x0, x1, x2) }

  function _emscripten_glStencilOpSeparate(x0, x1, x2, x3) { GLctx['stencilOpSeparate'](x0, x1, x2, x3) }

  function _emscripten_glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
      if (GL.currentContext.version >= 2) {
        // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (GLctx.currentPixelUnpackBufferBinding) {
          GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels);
        } else if (pixels) {
          var heap = __heapObjectForWebGLType(type);
          GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, heap, pixels >> __heapAccessShiftForWebGLHeap(heap));
        } else {
          GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, null);
        }
        return;
      }
      GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null);
    }

  function _emscripten_glTexImage3D(target, level, internalFormat, width, height, depth, border, format, type, pixels) {
      if (GLctx.currentPixelUnpackBufferBinding) {
        GLctx['texImage3D'](target, level, internalFormat, width, height, depth, border, format, type, pixels);
      } else if (pixels) {
        var heap = __heapObjectForWebGLType(type);
        GLctx['texImage3D'](target, level, internalFormat, width, height, depth, border, format, type, heap, pixels >> __heapAccessShiftForWebGLHeap(heap));
      } else {
        GLctx['texImage3D'](target, level, internalFormat, width, height, depth, border, format, type, null);
      }
    }

  function _emscripten_glTexParameterf(x0, x1, x2) { GLctx['texParameterf'](x0, x1, x2) }

  function _emscripten_glTexParameterfv(target, pname, params) {
      var param = HEAPF32[((params)>>2)];
      GLctx.texParameterf(target, pname, param);
    }

  function _emscripten_glTexParameteri(x0, x1, x2) { GLctx['texParameteri'](x0, x1, x2) }

  function _emscripten_glTexParameteriv(target, pname, params) {
      var param = HEAP32[((params)>>2)];
      GLctx.texParameteri(target, pname, param);
    }

  function _emscripten_glTexStorage2D(x0, x1, x2, x3, x4) { GLctx['texStorage2D'](x0, x1, x2, x3, x4) }

  function _emscripten_glTexStorage3D(x0, x1, x2, x3, x4, x5) { GLctx['texStorage3D'](x0, x1, x2, x3, x4, x5) }

  function _emscripten_glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
      if (GL.currentContext.version >= 2) {
        // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (GLctx.currentPixelUnpackBufferBinding) {
          GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels);
        } else if (pixels) {
          var heap = __heapObjectForWebGLType(type);
          GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, heap, pixels >> __heapAccessShiftForWebGLHeap(heap));
        } else {
          GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, null);
        }
        return;
      }
      var pixelData = null;
      if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0);
      GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
    }

  function _emscripten_glTexSubImage3D(target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, pixels) {
      if (GLctx.currentPixelUnpackBufferBinding) {
        GLctx['texSubImage3D'](target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, pixels);
      } else if (pixels) {
        var heap = __heapObjectForWebGLType(type);
        GLctx['texSubImage3D'](target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, heap, pixels >> __heapAccessShiftForWebGLHeap(heap));
      } else {
        GLctx['texSubImage3D'](target, level, xoffset, yoffset, zoffset, width, height, depth, format, type, null);
      }
    }

  function _emscripten_glTransformFeedbackVaryings(program, count, varyings, bufferMode) {
      program = GL.programs[program];
      var vars = [];
      for (var i = 0; i < count; i++)
        vars.push(UTF8ToString(HEAP32[(((varyings)+(i*4))>>2)]));
  
      GLctx['transformFeedbackVaryings'](program, vars, bufferMode);
    }

  function _emscripten_glUniform1f(location, v0) {
      GLctx.uniform1f(GL.uniforms[location], v0);
    }

  
  var __miniTempWebGLFloatBuffers=[];function _emscripten_glUniform1fv(location, count, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniform1fv(GL.uniforms[location], HEAPF32, value>>2, count);
        return;
      }
  
      if (count <= 288) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLFloatBuffers[count-1];
        for (var i = 0; i < count; ++i) {
          view[i] = HEAPF32[(((value)+(4*i))>>2)];
        }
      } else
      {
        var view = HEAPF32.subarray((value)>>2,(value+count*4)>>2);
      }
      GLctx.uniform1fv(GL.uniforms[location], view);
    }

  function _emscripten_glUniform1i(location, v0) {
      GLctx.uniform1i(GL.uniforms[location], v0);
    }

  
  var __miniTempWebGLIntBuffers=[];function _emscripten_glUniform1iv(location, count, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniform1iv(GL.uniforms[location], HEAP32, value>>2, count);
        return;
      }
  
      if (count <= 288) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLIntBuffers[count-1];
        for (var i = 0; i < count; ++i) {
          view[i] = HEAP32[(((value)+(4*i))>>2)];
        }
      } else
      {
        var view = HEAP32.subarray((value)>>2,(value+count*4)>>2);
      }
      GLctx.uniform1iv(GL.uniforms[location], view);
    }

  function _emscripten_glUniform1ui(location, v0) {
      GLctx.uniform1ui(GL.uniforms[location], v0);
    }

  function _emscripten_glUniform1uiv(location, count, value) {
      GLctx.uniform1uiv(GL.uniforms[location], HEAPU32, value>>2, count);
    }

  function _emscripten_glUniform2f(location, v0, v1) {
      GLctx.uniform2f(GL.uniforms[location], v0, v1);
    }

  function _emscripten_glUniform2fv(location, count, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniform2fv(GL.uniforms[location], HEAPF32, value>>2, count*2);
        return;
      }
  
      if (count <= 144) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLFloatBuffers[2*count-1];
        for (var i = 0; i < 2*count; i += 2) {
          view[i] = HEAPF32[(((value)+(4*i))>>2)];
          view[i+1] = HEAPF32[(((value)+(4*i+4))>>2)];
        }
      } else
      {
        var view = HEAPF32.subarray((value)>>2,(value+count*8)>>2);
      }
      GLctx.uniform2fv(GL.uniforms[location], view);
    }

  function _emscripten_glUniform2i(location, v0, v1) {
      GLctx.uniform2i(GL.uniforms[location], v0, v1);
    }

  function _emscripten_glUniform2iv(location, count, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniform2iv(GL.uniforms[location], HEAP32, value>>2, count*2);
        return;
      }
  
      if (count <= 144) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLIntBuffers[2*count-1];
        for (var i = 0; i < 2*count; i += 2) {
          view[i] = HEAP32[(((value)+(4*i))>>2)];
          view[i+1] = HEAP32[(((value)+(4*i+4))>>2)];
        }
      } else
      {
        var view = HEAP32.subarray((value)>>2,(value+count*8)>>2);
      }
      GLctx.uniform2iv(GL.uniforms[location], view);
    }

  function _emscripten_glUniform2ui(location, v0, v1) {
      GLctx.uniform2ui(GL.uniforms[location], v0, v1);
    }

  function _emscripten_glUniform2uiv(location, count, value) {
      GLctx.uniform2uiv(GL.uniforms[location], HEAPU32, value>>2, count*2);
    }

  function _emscripten_glUniform3f(location, v0, v1, v2) {
      GLctx.uniform3f(GL.uniforms[location], v0, v1, v2);
    }

  function _emscripten_glUniform3fv(location, count, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniform3fv(GL.uniforms[location], HEAPF32, value>>2, count*3);
        return;
      }
  
      if (count <= 96) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLFloatBuffers[3*count-1];
        for (var i = 0; i < 3*count; i += 3) {
          view[i] = HEAPF32[(((value)+(4*i))>>2)];
          view[i+1] = HEAPF32[(((value)+(4*i+4))>>2)];
          view[i+2] = HEAPF32[(((value)+(4*i+8))>>2)];
        }
      } else
      {
        var view = HEAPF32.subarray((value)>>2,(value+count*12)>>2);
      }
      GLctx.uniform3fv(GL.uniforms[location], view);
    }

  function _emscripten_glUniform3i(location, v0, v1, v2) {
      GLctx.uniform3i(GL.uniforms[location], v0, v1, v2);
    }

  function _emscripten_glUniform3iv(location, count, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniform3iv(GL.uniforms[location], HEAP32, value>>2, count*3);
        return;
      }
  
      if (count <= 96) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLIntBuffers[3*count-1];
        for (var i = 0; i < 3*count; i += 3) {
          view[i] = HEAP32[(((value)+(4*i))>>2)];
          view[i+1] = HEAP32[(((value)+(4*i+4))>>2)];
          view[i+2] = HEAP32[(((value)+(4*i+8))>>2)];
        }
      } else
      {
        var view = HEAP32.subarray((value)>>2,(value+count*12)>>2);
      }
      GLctx.uniform3iv(GL.uniforms[location], view);
    }

  function _emscripten_glUniform3ui(location, v0, v1, v2) {
      GLctx.uniform3ui(GL.uniforms[location], v0, v1, v2);
    }

  function _emscripten_glUniform3uiv(location, count, value) {
      GLctx.uniform3uiv(GL.uniforms[location], HEAPU32, value>>2, count*3);
    }

  function _emscripten_glUniform4f(location, v0, v1, v2, v3) {
      GLctx.uniform4f(GL.uniforms[location], v0, v1, v2, v3);
    }

  function _emscripten_glUniform4fv(location, count, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniform4fv(GL.uniforms[location], HEAPF32, value>>2, count*4);
        return;
      }
  
      if (count <= 72) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLFloatBuffers[4*count-1];
        // hoist the heap out of the loop for size and for pthreads+growth.
        var heap = HEAPF32;
        value >>= 2;
        for (var i = 0; i < 4 * count; i += 4) {
          var dst = value + i;
          view[i] = heap[dst];
          view[i + 1] = heap[dst + 1];
          view[i + 2] = heap[dst + 2];
          view[i + 3] = heap[dst + 3];
        }
      } else
      {
        var view = HEAPF32.subarray((value)>>2,(value+count*16)>>2);
      }
      GLctx.uniform4fv(GL.uniforms[location], view);
    }

  function _emscripten_glUniform4i(location, v0, v1, v2, v3) {
      GLctx.uniform4i(GL.uniforms[location], v0, v1, v2, v3);
    }

  function _emscripten_glUniform4iv(location, count, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniform4iv(GL.uniforms[location], HEAP32, value>>2, count*4);
        return;
      }
  
      if (count <= 72) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLIntBuffers[4*count-1];
        for (var i = 0; i < 4*count; i += 4) {
          view[i] = HEAP32[(((value)+(4*i))>>2)];
          view[i+1] = HEAP32[(((value)+(4*i+4))>>2)];
          view[i+2] = HEAP32[(((value)+(4*i+8))>>2)];
          view[i+3] = HEAP32[(((value)+(4*i+12))>>2)];
        }
      } else
      {
        var view = HEAP32.subarray((value)>>2,(value+count*16)>>2);
      }
      GLctx.uniform4iv(GL.uniforms[location], view);
    }

  function _emscripten_glUniform4ui(location, v0, v1, v2, v3) {
      GLctx.uniform4ui(GL.uniforms[location], v0, v1, v2, v3);
    }

  function _emscripten_glUniform4uiv(location, count, value) {
      GLctx.uniform4uiv(GL.uniforms[location], HEAPU32, value>>2, count*4);
    }

  function _emscripten_glUniformBlockBinding(program, uniformBlockIndex, uniformBlockBinding) {
      program = GL.programs[program];
  
      GLctx['uniformBlockBinding'](program, uniformBlockIndex, uniformBlockBinding);
    }

  function _emscripten_glUniformMatrix2fv(location, count, transpose, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniformMatrix2fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*4);
        return;
      }
  
      if (count <= 72) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLFloatBuffers[4*count-1];
        for (var i = 0; i < 4*count; i += 4) {
          view[i] = HEAPF32[(((value)+(4*i))>>2)];
          view[i+1] = HEAPF32[(((value)+(4*i+4))>>2)];
          view[i+2] = HEAPF32[(((value)+(4*i+8))>>2)];
          view[i+3] = HEAPF32[(((value)+(4*i+12))>>2)];
        }
      } else
      {
        var view = HEAPF32.subarray((value)>>2,(value+count*16)>>2);
      }
      GLctx.uniformMatrix2fv(GL.uniforms[location], !!transpose, view);
    }

  function _emscripten_glUniformMatrix2x3fv(location, count, transpose, value) {
      GLctx.uniformMatrix2x3fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*6);
    }

  function _emscripten_glUniformMatrix2x4fv(location, count, transpose, value) {
      GLctx.uniformMatrix2x4fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*8);
    }

  function _emscripten_glUniformMatrix3fv(location, count, transpose, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniformMatrix3fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*9);
        return;
      }
  
      if (count <= 32) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLFloatBuffers[9*count-1];
        for (var i = 0; i < 9*count; i += 9) {
          view[i] = HEAPF32[(((value)+(4*i))>>2)];
          view[i+1] = HEAPF32[(((value)+(4*i+4))>>2)];
          view[i+2] = HEAPF32[(((value)+(4*i+8))>>2)];
          view[i+3] = HEAPF32[(((value)+(4*i+12))>>2)];
          view[i+4] = HEAPF32[(((value)+(4*i+16))>>2)];
          view[i+5] = HEAPF32[(((value)+(4*i+20))>>2)];
          view[i+6] = HEAPF32[(((value)+(4*i+24))>>2)];
          view[i+7] = HEAPF32[(((value)+(4*i+28))>>2)];
          view[i+8] = HEAPF32[(((value)+(4*i+32))>>2)];
        }
      } else
      {
        var view = HEAPF32.subarray((value)>>2,(value+count*36)>>2);
      }
      GLctx.uniformMatrix3fv(GL.uniforms[location], !!transpose, view);
    }

  function _emscripten_glUniformMatrix3x2fv(location, count, transpose, value) {
      GLctx.uniformMatrix3x2fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*6);
    }

  function _emscripten_glUniformMatrix3x4fv(location, count, transpose, value) {
      GLctx.uniformMatrix3x4fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*12);
    }

  function _emscripten_glUniformMatrix4fv(location, count, transpose, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniformMatrix4fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*16);
        return;
      }
  
      if (count <= 18) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLFloatBuffers[16*count-1];
        // hoist the heap out of the loop for size and for pthreads+growth.
        var heap = HEAPF32;
        value >>= 2;
        for (var i = 0; i < 16 * count; i += 16) {
          var dst = value + i;
          view[i] = heap[dst];
          view[i + 1] = heap[dst + 1];
          view[i + 2] = heap[dst + 2];
          view[i + 3] = heap[dst + 3];
          view[i + 4] = heap[dst + 4];
          view[i + 5] = heap[dst + 5];
          view[i + 6] = heap[dst + 6];
          view[i + 7] = heap[dst + 7];
          view[i + 8] = heap[dst + 8];
          view[i + 9] = heap[dst + 9];
          view[i + 10] = heap[dst + 10];
          view[i + 11] = heap[dst + 11];
          view[i + 12] = heap[dst + 12];
          view[i + 13] = heap[dst + 13];
          view[i + 14] = heap[dst + 14];
          view[i + 15] = heap[dst + 15];
        }
      } else
      {
        var view = HEAPF32.subarray((value)>>2,(value+count*64)>>2);
      }
      GLctx.uniformMatrix4fv(GL.uniforms[location], !!transpose, view);
    }

  function _emscripten_glUniformMatrix4x2fv(location, count, transpose, value) {
      GLctx.uniformMatrix4x2fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*8);
    }

  function _emscripten_glUniformMatrix4x3fv(location, count, transpose, value) {
      GLctx.uniformMatrix4x3fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*12);
    }

  function _emscripten_glUseProgram(program) {
      GLctx.useProgram(GL.programs[program]);
    }

  function _emscripten_glValidateProgram(program) {
      GLctx.validateProgram(GL.programs[program]);
    }

  function _emscripten_glVertexAttrib1f(x0, x1) { GLctx['vertexAttrib1f'](x0, x1) }

  function _emscripten_glVertexAttrib1fv(index, v) {
  
      GLctx.vertexAttrib1f(index, HEAPF32[v>>2]);
    }

  function _emscripten_glVertexAttrib2f(x0, x1, x2) { GLctx['vertexAttrib2f'](x0, x1, x2) }

  function _emscripten_glVertexAttrib2fv(index, v) {
  
      GLctx.vertexAttrib2f(index, HEAPF32[v>>2], HEAPF32[v+4>>2]);
    }

  function _emscripten_glVertexAttrib3f(x0, x1, x2, x3) { GLctx['vertexAttrib3f'](x0, x1, x2, x3) }

  function _emscripten_glVertexAttrib3fv(index, v) {
  
      GLctx.vertexAttrib3f(index, HEAPF32[v>>2], HEAPF32[v+4>>2], HEAPF32[v+8>>2]);
    }

  function _emscripten_glVertexAttrib4f(x0, x1, x2, x3, x4) { GLctx['vertexAttrib4f'](x0, x1, x2, x3, x4) }

  function _emscripten_glVertexAttrib4fv(index, v) {
  
      GLctx.vertexAttrib4f(index, HEAPF32[v>>2], HEAPF32[v+4>>2], HEAPF32[v+8>>2], HEAPF32[v+12>>2]);
    }

  function _emscripten_glVertexAttribDivisor(index, divisor) {
      GLctx['vertexAttribDivisor'](index, divisor);
    }

  function _emscripten_glVertexAttribDivisorANGLE(index, divisor) {
      GLctx['vertexAttribDivisor'](index, divisor);
    }

  function _emscripten_glVertexAttribDivisorARB(index, divisor) {
      GLctx['vertexAttribDivisor'](index, divisor);
    }

  function _emscripten_glVertexAttribDivisorEXT(index, divisor) {
      GLctx['vertexAttribDivisor'](index, divisor);
    }

  function _emscripten_glVertexAttribDivisorNV(index, divisor) {
      GLctx['vertexAttribDivisor'](index, divisor);
    }

  function _emscripten_glVertexAttribI4i(x0, x1, x2, x3, x4) { GLctx['vertexAttribI4i'](x0, x1, x2, x3, x4) }

  function _emscripten_glVertexAttribI4iv(index, v) {
      GLctx.vertexAttribI4i(index, HEAP32[v>>2], HEAP32[v+4>>2], HEAP32[v+8>>2], HEAP32[v+12>>2]);
    }

  function _emscripten_glVertexAttribI4ui(x0, x1, x2, x3, x4) { GLctx['vertexAttribI4ui'](x0, x1, x2, x3, x4) }

  function _emscripten_glVertexAttribI4uiv(index, v) {
      GLctx.vertexAttribI4ui(index, HEAPU32[v>>2], HEAPU32[v+4>>2], HEAPU32[v+8>>2], HEAPU32[v+12>>2]);
    }

  function _emscripten_glVertexAttribIPointer(index, size, type, stride, ptr) {
      GLctx['vertexAttribIPointer'](index, size, type, stride, ptr);
    }

  function _emscripten_glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
      GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
    }

  function _emscripten_glViewport(x0, x1, x2, x3) { GLctx['viewport'](x0, x1, x2, x3) }

  function _emscripten_glWaitSync(sync, flags, timeoutLo, timeoutHi) {
      // See WebGL2 vs GLES3 difference on GL_TIMEOUT_IGNORED above (https://www.khronos.org/registry/webgl/specs/latest/2.0/#5.15)
      GLctx.waitSync(GL.syncs[sync], flags, convertI32PairToI53(timeoutLo, timeoutHi));
    }

  function _emscripten_is_main_browser_thread() {
      return typeof importScripts === 'undefined';
    }

  
  
  function reallyNegative(x) {
      return x < 0 || (x === 0 && (1/x) === -Infinity);
    }
  
  function convertU32PairToI53(lo, hi) {
      return (lo >>> 0) + (hi >>> 0) * 4294967296;
    }
  
  function intArrayFromString(stringy, dontAddNull, length) {
    var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array;
  }function formatString(format, varargs) {
      var textIndex = format;
      var argIndex = varargs;
      // This must be called before reading a double or i64 vararg. It will bump the pointer properly.
      // It also does an assert on i32 values, so it's nice to call it before all varargs calls.
      function prepVararg(ptr, type) {
        if (type === 'double' || type === 'i64') {
          // move so the load is aligned
          if (ptr & 7) {
            ptr += 4;
          }
        } else {
        }
        return ptr;
      }
      function getNextArg(type) {
        // NOTE: Explicitly ignoring type safety. Otherwise this fails:
        //       int x = 4; printf("%c\n", (char)x);
        var ret;
        argIndex = prepVararg(argIndex, type);
        if (type === 'double') {
          ret = HEAPF64[((argIndex)>>3)];
          argIndex += 8;
        } else if (type == 'i64') {
          ret = [HEAP32[((argIndex)>>2)],
                 HEAP32[(((argIndex)+(4))>>2)]];
          argIndex += 8;
        } else {
          type = 'i32'; // varargs are always i32, i64, or double
          ret = HEAP32[((argIndex)>>2)];
          argIndex += 4;
        }
        return ret;
      }
  
      var ret = [];
      var curr, next, currArg;
      while(1) {
        var startTextIndex = textIndex;
        curr = HEAP8[((textIndex)>>0)];
        if (curr === 0) break;
        next = HEAP8[((textIndex+1)>>0)];
        if (curr == 37) {
          // Handle flags.
          var flagAlwaysSigned = false;
          var flagLeftAlign = false;
          var flagAlternative = false;
          var flagZeroPad = false;
          var flagPadSign = false;
          flagsLoop: while (1) {
            switch (next) {
              case 43:
                flagAlwaysSigned = true;
                break;
              case 45:
                flagLeftAlign = true;
                break;
              case 35:
                flagAlternative = true;
                break;
              case 48:
                if (flagZeroPad) {
                  break flagsLoop;
                } else {
                  flagZeroPad = true;
                  break;
                }
              case 32:
                flagPadSign = true;
                break;
              default:
                break flagsLoop;
            }
            textIndex++;
            next = HEAP8[((textIndex+1)>>0)];
          }
  
          // Handle width.
          var width = 0;
          if (next == 42) {
            width = getNextArg('i32');
            textIndex++;
            next = HEAP8[((textIndex+1)>>0)];
          } else {
            while (next >= 48 && next <= 57) {
              width = width * 10 + (next - 48);
              textIndex++;
              next = HEAP8[((textIndex+1)>>0)];
            }
          }
  
          // Handle precision.
          var precisionSet = false, precision = -1;
          if (next == 46) {
            precision = 0;
            precisionSet = true;
            textIndex++;
            next = HEAP8[((textIndex+1)>>0)];
            if (next == 42) {
              precision = getNextArg('i32');
              textIndex++;
            } else {
              while(1) {
                var precisionChr = HEAP8[((textIndex+1)>>0)];
                if (precisionChr < 48 ||
                    precisionChr > 57) break;
                precision = precision * 10 + (precisionChr - 48);
                textIndex++;
              }
            }
            next = HEAP8[((textIndex+1)>>0)];
          }
          if (precision < 0) {
            precision = 6; // Standard default.
            precisionSet = false;
          }
  
          // Handle integer sizes. WARNING: These assume a 32-bit architecture!
          var argSize;
          switch (String.fromCharCode(next)) {
            case 'h':
              var nextNext = HEAP8[((textIndex+2)>>0)];
              if (nextNext == 104) {
                textIndex++;
                argSize = 1; // char (actually i32 in varargs)
              } else {
                argSize = 2; // short (actually i32 in varargs)
              }
              break;
            case 'l':
              var nextNext = HEAP8[((textIndex+2)>>0)];
              if (nextNext == 108) {
                textIndex++;
                argSize = 8; // long long
              } else {
                argSize = 4; // long
              }
              break;
            case 'L': // long long
            case 'q': // int64_t
            case 'j': // intmax_t
              argSize = 8;
              break;
            case 'z': // size_t
            case 't': // ptrdiff_t
            case 'I': // signed ptrdiff_t or unsigned size_t
              argSize = 4;
              break;
            default:
              argSize = null;
          }
          if (argSize) textIndex++;
          next = HEAP8[((textIndex+1)>>0)];
  
          // Handle type specifier.
          switch (String.fromCharCode(next)) {
            case 'd': case 'i': case 'u': case 'o': case 'x': case 'X': case 'p': {
              // Integer.
              var signed = next == 100 || next == 105;
              argSize = argSize || 4;
              currArg = getNextArg('i' + (argSize * 8));
              var argText;
              // Flatten i64-1 [low, high] into a (slightly rounded) double
              if (argSize == 8) {
                currArg = next == 117 ? convertU32PairToI53(currArg[0], currArg[1]) : convertI32PairToI53(currArg[0], currArg[1]);
              }
              // Truncate to requested size.
              if (argSize <= 4) {
                var limit = Math.pow(256, argSize) - 1;
                currArg = (signed ? reSign : unSign)(currArg & limit, argSize * 8);
              }
              // Format the number.
              var currAbsArg = Math.abs(currArg);
              var prefix = '';
              if (next == 100 || next == 105) {
                argText = reSign(currArg, 8 * argSize, 1).toString(10);
              } else if (next == 117) {
                argText = unSign(currArg, 8 * argSize, 1).toString(10);
                currArg = Math.abs(currArg);
              } else if (next == 111) {
                argText = (flagAlternative ? '0' : '') + currAbsArg.toString(8);
              } else if (next == 120 || next == 88) {
                prefix = (flagAlternative && currArg != 0) ? '0x' : '';
                if (currArg < 0) {
                  // Represent negative numbers in hex as 2's complement.
                  currArg = -currArg;
                  argText = (currAbsArg - 1).toString(16);
                  var buffer = [];
                  for (var i = 0; i < argText.length; i++) {
                    buffer.push((0xF - parseInt(argText[i], 16)).toString(16));
                  }
                  argText = buffer.join('');
                  while (argText.length < argSize * 2) argText = 'f' + argText;
                } else {
                  argText = currAbsArg.toString(16);
                }
                if (next == 88) {
                  prefix = prefix.toUpperCase();
                  argText = argText.toUpperCase();
                }
              } else if (next == 112) {
                if (currAbsArg === 0) {
                  argText = '(nil)';
                } else {
                  prefix = '0x';
                  argText = currAbsArg.toString(16);
                }
              }
              if (precisionSet) {
                while (argText.length < precision) {
                  argText = '0' + argText;
                }
              }
  
              // Add sign if needed
              if (currArg >= 0) {
                if (flagAlwaysSigned) {
                  prefix = '+' + prefix;
                } else if (flagPadSign) {
                  prefix = ' ' + prefix;
                }
              }
  
              // Move sign to prefix so we zero-pad after the sign
              if (argText.charAt(0) == '-') {
                prefix = '-' + prefix;
                argText = argText.substr(1);
              }
  
              // Add padding.
              while (prefix.length + argText.length < width) {
                if (flagLeftAlign) {
                  argText += ' ';
                } else {
                  if (flagZeroPad) {
                    argText = '0' + argText;
                  } else {
                    prefix = ' ' + prefix;
                  }
                }
              }
  
              // Insert the result into the buffer.
              argText = prefix + argText;
              argText.split('').forEach(function(chr) {
                ret.push(chr.charCodeAt(0));
              });
              break;
            }
            case 'f': case 'F': case 'e': case 'E': case 'g': case 'G': {
              // Float.
              currArg = getNextArg('double');
              var argText;
              if (isNaN(currArg)) {
                argText = 'nan';
                flagZeroPad = false;
              } else if (!isFinite(currArg)) {
                argText = (currArg < 0 ? '-' : '') + 'inf';
                flagZeroPad = false;
              } else {
                var isGeneral = false;
                var effectivePrecision = Math.min(precision, 20);
  
                // Convert g/G to f/F or e/E, as per:
                // http://pubs.opengroup.org/onlinepubs/9699919799/functions/printf.html
                if (next == 103 || next == 71) {
                  isGeneral = true;
                  precision = precision || 1;
                  var exponent = parseInt(currArg.toExponential(effectivePrecision).split('e')[1], 10);
                  if (precision > exponent && exponent >= -4) {
                    next = ((next == 103) ? 'f' : 'F').charCodeAt(0);
                    precision -= exponent + 1;
                  } else {
                    next = ((next == 103) ? 'e' : 'E').charCodeAt(0);
                    precision--;
                  }
                  effectivePrecision = Math.min(precision, 20);
                }
  
                if (next == 101 || next == 69) {
                  argText = currArg.toExponential(effectivePrecision);
                  // Make sure the exponent has at least 2 digits.
                  if (/[eE][-+]\d$/.test(argText)) {
                    argText = argText.slice(0, -1) + '0' + argText.slice(-1);
                  }
                } else if (next == 102 || next == 70) {
                  argText = currArg.toFixed(effectivePrecision);
                  if (currArg === 0 && reallyNegative(currArg)) {
                    argText = '-' + argText;
                  }
                }
  
                var parts = argText.split('e');
                if (isGeneral && !flagAlternative) {
                  // Discard trailing zeros and periods.
                  while (parts[0].length > 1 && parts[0].indexOf('.') != -1 &&
                         (parts[0].slice(-1) == '0' || parts[0].slice(-1) == '.')) {
                    parts[0] = parts[0].slice(0, -1);
                  }
                } else {
                  // Make sure we have a period in alternative mode.
                  if (flagAlternative && argText.indexOf('.') == -1) parts[0] += '.';
                  // Zero pad until required precision.
                  while (precision > effectivePrecision++) parts[0] += '0';
                }
                argText = parts[0] + (parts.length > 1 ? 'e' + parts[1] : '');
  
                // Capitalize 'E' if needed.
                if (next == 69) argText = argText.toUpperCase();
  
                // Add sign.
                if (currArg >= 0) {
                  if (flagAlwaysSigned) {
                    argText = '+' + argText;
                  } else if (flagPadSign) {
                    argText = ' ' + argText;
                  }
                }
              }
  
              // Add padding.
              while (argText.length < width) {
                if (flagLeftAlign) {
                  argText += ' ';
                } else {
                  if (flagZeroPad && (argText[0] == '-' || argText[0] == '+')) {
                    argText = argText[0] + '0' + argText.slice(1);
                  } else {
                    argText = (flagZeroPad ? '0' : ' ') + argText;
                  }
                }
              }
  
              // Adjust case.
              if (next < 97) argText = argText.toUpperCase();
  
              // Insert the result into the buffer.
              argText.split('').forEach(function(chr) {
                ret.push(chr.charCodeAt(0));
              });
              break;
            }
            case 's': {
              // String.
              var arg = getNextArg('i8*');
              var argLength = arg ? _strlen(arg) : '(null)'.length;
              if (precisionSet) argLength = Math.min(argLength, precision);
              if (!flagLeftAlign) {
                while (argLength < width--) {
                  ret.push(32);
                }
              }
              if (arg) {
                for (var i = 0; i < argLength; i++) {
                  ret.push(HEAPU8[((arg++)>>0)]);
                }
              } else {
                ret = ret.concat(intArrayFromString('(null)'.substr(0, argLength), true));
              }
              if (flagLeftAlign) {
                while (argLength < width--) {
                  ret.push(32);
                }
              }
              break;
            }
            case 'c': {
              // Character.
              if (flagLeftAlign) ret.push(getNextArg('i8'));
              while (--width > 0) {
                ret.push(32);
              }
              if (!flagLeftAlign) ret.push(getNextArg('i8'));
              break;
            }
            case 'n': {
              // Write the length written so far to the next parameter.
              var ptr = getNextArg('i32*');
              HEAP32[((ptr)>>2)]=ret.length;
              break;
            }
            case '%': {
              // Literal percent sign.
              ret.push(curr);
              break;
            }
            default: {
              // Unknown specifiers remain untouched.
              for (var i = startTextIndex; i < textIndex + 2; i++) {
                ret.push(HEAP8[((i)>>0)]);
              }
            }
          }
          textIndex += 2;
          // TODO: Support a/A (hex float) and m (last error) specifiers.
          // TODO: Support %1${specifier} for arg selection.
        } else {
          ret.push(curr);
          textIndex += 1;
        }
      }
      return ret;
    }
  
  
  
  function __emscripten_traverse_stack(args) {
      if (!args || !args.callee || !args.callee.name) {
        return [null, '', ''];
      }
  
      var funstr = args.callee.toString();
      var funcname = args.callee.name;
      var str = '(';
      var first = true;
      for (var i in args) {
        var a = args[i];
        if (!first) {
          str += ", ";
        }
        first = false;
        if (typeof a === 'number' || typeof a === 'string') {
          str += a;
        } else {
          str += '(' + typeof a + ')';
        }
      }
      str += ')';
      var caller = args.callee.caller;
      args = caller ? caller.arguments : [];
      if (first)
        str = '';
      return [args, funcname, str];
    }
  
  function jsStackTrace() {
      var err = new Error();
      if (!err.stack) {
        // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
        // so try that as a special-case.
        try {
          throw new Error();
        } catch(e) {
          err = e;
        }
        if (!err.stack) {
          return '(no stack trace available)';
        }
      }
      return err.stack.toString();
    }
  
  function demangle(func) {
      // If demangle has failed before, stop demangling any further function names
      // This avoids an infinite recursion with malloc()->abort()->stackTrace()->demangle()->malloc()->...
      demangle.recursionGuard = (demangle.recursionGuard|0)+1;
      if (demangle.recursionGuard > 1) return func;
      var __cxa_demangle_func = Module['___cxa_demangle'] || Module['__cxa_demangle'];
      assert(__cxa_demangle_func);
      var stackTop = stackSave();
      try {
        var s = func;
        if (s.startsWith('__Z'))
          s = s.substr(1);
        var len = lengthBytesUTF8(s)+1;
        var buf = stackAlloc(len);
        stringToUTF8(s, buf, len);
        var status = stackAlloc(4);
        var ret = __cxa_demangle_func(buf, 0, 0, status);
        if (HEAP32[((status)>>2)] === 0 && ret) {
          return UTF8ToString(ret);
        }
        // otherwise, libcxxabi failed
      } catch(e) {
      } finally {
        _free(ret);
        stackRestore(stackTop);
        if (demangle.recursionGuard < 2) --demangle.recursionGuard;
      }
      // failure when using libcxxabi, don't demangle
      return func;
    }
  
  function warnOnce(text) {
      if (!warnOnce.shown) warnOnce.shown = {};
      if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        err(text);
      }
    }/** @param {number=} flags */
  function _emscripten_get_callstack_js(flags) {
      var callstack = jsStackTrace();
  
      // Find the symbols in the callstack that corresponds to the functions that report callstack information, and remove everything up to these from the output.
      var iThisFunc = callstack.lastIndexOf('_emscripten_log');
      var iThisFunc2 = callstack.lastIndexOf('_emscripten_get_callstack');
      var iNextLine = callstack.indexOf('\n', Math.max(iThisFunc, iThisFunc2))+1;
      callstack = callstack.slice(iNextLine);
  
      // If user requested to see the original source stack, but no source map information is available, just fall back to showing the JS stack.
      if (flags & 8/*EM_LOG_C_STACK*/ && typeof emscripten_source_map === 'undefined') {
        warnOnce('Source map information is not available, emscripten_log with EM_LOG_C_STACK will be ignored. Build with "--pre-js $EMSCRIPTEN/src/emscripten-source-map.min.js" linker flag to add source map loading to code.');
        flags ^= 8/*EM_LOG_C_STACK*/;
        flags |= 16/*EM_LOG_JS_STACK*/;
      }
  
      var stack_args = null;
      if (flags & 128 /*EM_LOG_FUNC_PARAMS*/) {
        // To get the actual parameters to the functions, traverse the stack via the unfortunately deprecated 'arguments.callee' method, if it works:
        stack_args = __emscripten_traverse_stack(arguments);
        while (stack_args[1].indexOf('_emscripten_') >= 0)
          stack_args = __emscripten_traverse_stack(stack_args[0]);
      }
  
      // Process all lines:
      var lines = callstack.split('\n');
      callstack = '';
      var newFirefoxRe = new RegExp('\\s*(.*?)@(.*?):([0-9]+):([0-9]+)'); // New FF30 with column info: extract components of form '       Object._main@http://server.com:4324:12'
      var firefoxRe = new RegExp('\\s*(.*?)@(.*):(.*)(:(.*))?'); // Old FF without column info: extract components of form '       Object._main@http://server.com:4324'
      var chromeRe = new RegExp('\\s*at (.*?) \\\((.*):(.*):(.*)\\\)'); // Extract components of form '    at Object._main (http://server.com/file.html:4324:12)'
  
      for (var l in lines) {
        var line = lines[l];
  
        var jsSymbolName = '';
        var file = '';
        var lineno = 0;
        var column = 0;
  
        var parts = chromeRe.exec(line);
        if (parts && parts.length == 5) {
          jsSymbolName = parts[1];
          file = parts[2];
          lineno = parts[3];
          column = parts[4];
        } else {
          parts = newFirefoxRe.exec(line);
          if (!parts) parts = firefoxRe.exec(line);
          if (parts && parts.length >= 4) {
            jsSymbolName = parts[1];
            file = parts[2];
            lineno = parts[3];
            column = parts[4]|0; // Old Firefox doesn't carry column information, but in new FF30, it is present. See https://bugzilla.mozilla.org/show_bug.cgi?id=762556
          } else {
            // Was not able to extract this line for demangling/sourcemapping purposes. Output it as-is.
            callstack += line + '\n';
            continue;
          }
        }
  
        // Try to demangle the symbol, but fall back to showing the original JS symbol name if not available.
        var cSymbolName = (flags & 32/*EM_LOG_DEMANGLE*/) ? demangle(jsSymbolName) : jsSymbolName;
        if (!cSymbolName) {
          cSymbolName = jsSymbolName;
        }
  
        var haveSourceMap = false;
  
        if (flags & 8/*EM_LOG_C_STACK*/) {
          var orig = emscripten_source_map.originalPositionFor({line: lineno, column: column});
          haveSourceMap = (orig && orig.source);
          if (haveSourceMap) {
            if (flags & 64/*EM_LOG_NO_PATHS*/) {
              orig.source = orig.source.substring(orig.source.replace(/\\/g, "/").lastIndexOf('/')+1);
            }
            callstack += '    at ' + cSymbolName + ' (' + orig.source + ':' + orig.line + ':' + orig.column + ')\n';
          }
        }
        if ((flags & 16/*EM_LOG_JS_STACK*/) || !haveSourceMap) {
          if (flags & 64/*EM_LOG_NO_PATHS*/) {
            file = file.substring(file.replace(/\\/g, "/").lastIndexOf('/')+1);
          }
          callstack += (haveSourceMap ? ('     = '+jsSymbolName) : ('    at '+cSymbolName)) + ' (' + file + ':' + lineno + ':' + column + ')\n';
        }
  
        // If we are still keeping track with the callstack by traversing via 'arguments.callee', print the function parameters as well.
        if (flags & 128 /*EM_LOG_FUNC_PARAMS*/ && stack_args[0]) {
          if (stack_args[1] == jsSymbolName && stack_args[2].length > 0) {
            callstack = callstack.replace(/\s+$/, '');
            callstack += ' with values: ' + stack_args[1] + stack_args[2] + '\n';
          }
          stack_args = __emscripten_traverse_stack(stack_args[0]);
        }
      }
      // Trim extra whitespace at the end of the output.
      callstack = callstack.replace(/\s+$/, '');
      return callstack;
    }function _emscripten_log_js(flags, str) {
      if (flags & 24/*EM_LOG_C_STACK | EM_LOG_JS_STACK*/) {
        str = str.replace(/\s+$/, ''); // Ensure the message and the callstack are joined cleanly with exactly one newline.
        str += (str.length > 0 ? '\n' : '') + _emscripten_get_callstack_js(flags);
      }
  
      if (flags & 1 /*EM_LOG_CONSOLE*/) {
        if (flags & 4 /*EM_LOG_ERROR*/) {
          console.error(str);
        } else if (flags & 2 /*EM_LOG_WARN*/) {
          console.warn(str);
        } else if (flags & 512 /*EM_LOG_INFO*/) {
          console.info(str);
        } else if (flags & 256 /*EM_LOG_DEBUG*/) {
          console.debug(str);
        } else {
          console.log(str);
        }
      } else if (flags & 6 /*EM_LOG_ERROR|EM_LOG_WARN*/) {
        err(str);
      } else {
        out(str);
      }
    }function _emscripten_log(flags, format, varargs) {
      var str = '';
      var result = formatString(format, varargs);
      for (var i = 0 ; i < result.length; ++i) {
        str += String.fromCharCode(result[i]);
      }
      _emscripten_log_js(flags, str);
    }

  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.copyWithin(dest, src, src + num);
    }

  function _emscripten_performance_now() {
      return performance.now();
    }

  function _emscripten_request_animation_frame_loop(cb, userData) {
      function tick(timeStamp) {
        if (dynCall_idi(cb, timeStamp, userData)) {
          requestAnimationFrame(tick);
        }
      }
      return requestAnimationFrame(tick);
    }

  
  function _emscripten_get_heap_size() {
      return HEAPU8.length;
    }
  
  function abortOnCannotGrowMemory(requestedSize) {
      abort('OOM');
    }function _emscripten_resize_heap(requestedSize) {
      requestedSize = requestedSize >>> 0;
      abortOnCannotGrowMemory(requestedSize);
    }

  
  var JSEvents={removeAllEventListeners:function() {
        for(var i = JSEvents.eventHandlers.length-1; i >= 0; --i) {
          JSEvents._removeHandler(i);
        }
        JSEvents.eventHandlers = [];
        JSEvents.deferredCalls = [];
      },deferredCalls:[],deferCall:function(targetFunction, precedence, argsList) {
        function arraysHaveEqualContent(arrA, arrB) {
          if (arrA.length != arrB.length) return false;
  
          for(var i in arrA) {
            if (arrA[i] != arrB[i]) return false;
          }
          return true;
        }
        // Test if the given call was already queued, and if so, don't add it again.
        for(var i in JSEvents.deferredCalls) {
          var call = JSEvents.deferredCalls[i];
          if (call.targetFunction == targetFunction && arraysHaveEqualContent(call.argsList, argsList)) {
            return;
          }
        }
        JSEvents.deferredCalls.push({
          targetFunction: targetFunction,
          precedence: precedence,
          argsList: argsList
        });
  
        JSEvents.deferredCalls.sort(function(x,y) { return x.precedence < y.precedence; });
      },removeDeferredCalls:function(targetFunction) {
        for(var i = 0; i < JSEvents.deferredCalls.length; ++i) {
          if (JSEvents.deferredCalls[i].targetFunction == targetFunction) {
            JSEvents.deferredCalls.splice(i, 1);
            --i;
          }
        }
      },canPerformEventHandlerRequests:function() {
        return JSEvents.inEventHandler && JSEvents.currentEventHandler.allowsDeferredCalls;
      },runDeferredCalls:function() {
        if (!JSEvents.canPerformEventHandlerRequests()) {
          return;
        }
        for(var i = 0; i < JSEvents.deferredCalls.length; ++i) {
          var call = JSEvents.deferredCalls[i];
          JSEvents.deferredCalls.splice(i, 1);
          --i;
          call.targetFunction.apply(null, call.argsList);
        }
      },eventHandlers:[],removeAllHandlersOnTarget:function(target, eventTypeString) {
        for(var i = 0; i < JSEvents.eventHandlers.length; ++i) {
          if (JSEvents.eventHandlers[i].target == target && 
            (!eventTypeString || eventTypeString == JSEvents.eventHandlers[i].eventTypeString)) {
             JSEvents._removeHandler(i--);
           }
        }
      },_removeHandler:function(i) {
        var h = JSEvents.eventHandlers[i];
        h.target.removeEventListener(h.eventTypeString, h.eventListenerFunc, h.useCapture);
        JSEvents.eventHandlers.splice(i, 1);
      },registerOrRemoveHandler:function(eventHandler) {
        var jsEventHandler = function jsEventHandler(event) {
          // Increment nesting count for the event handler.
          ++JSEvents.inEventHandler;
          JSEvents.currentEventHandler = eventHandler;
          // Process any old deferred calls the user has placed.
          JSEvents.runDeferredCalls();
          // Process the actual event, calls back to user C code handler.
          eventHandler.handlerFunc(event);
          // Process any new deferred calls that were placed right now from this event handler.
          JSEvents.runDeferredCalls();
          // Out of event handler - restore nesting count.
          --JSEvents.inEventHandler;
        };
        
        if (eventHandler.callbackfunc) {
          eventHandler.eventListenerFunc = jsEventHandler;
          eventHandler.target.addEventListener(eventHandler.eventTypeString, jsEventHandler, eventHandler.useCapture);
          JSEvents.eventHandlers.push(eventHandler);
        } else {
          for(var i = 0; i < JSEvents.eventHandlers.length; ++i) {
            if (JSEvents.eventHandlers[i].target == eventHandler.target
             && JSEvents.eventHandlers[i].eventTypeString == eventHandler.eventTypeString) {
               JSEvents._removeHandler(i--);
             }
          }
        }
      },getNodeNameForTarget:function(target) {
        if (!target) return '';
        if (target == window) return '#window';
        if (target == screen) return '#screen';
        return (target && target.nodeName) ? target.nodeName : '';
      },fullscreenEnabled:function() {
        return document.fullscreenEnabled
        // Safari 13.0.3 on macOS Catalina 10.15.1 still ships with prefixed webkitFullscreenEnabled.
        // TODO: If Safari at some point ships with unprefixed version, update the version check above.
        || document.webkitFullscreenEnabled
         ;
      }};
  
  
  
  function __maybeCStringToJsString(cString) {
      // "cString > 2" checks if the input is a number, and isn't of the special
      // values we accept here, EMSCRIPTEN_EVENT_TARGET_* (which map to 0, 1, 2).
      // In other words, if cString > 2 then it's a pointer to a valid place in
      // memory, and points to a C string.
      return cString > 2 ? UTF8ToString(cString) : cString;
    }
  
  var specialHTMLTargets=[0, document, window];function __findEventTarget(target) {
      target = __maybeCStringToJsString(target);
      var domElement = specialHTMLTargets[target] || document.querySelector(target);
      return domElement;
    }function __findCanvasEventTarget(target) { return __findEventTarget(target); }function _emscripten_set_canvas_element_size(target, width, height) {
      var canvas = __findCanvasEventTarget(target);
      if (!canvas) return -4;
      canvas.width = width;
      canvas.height = height;
      return 0;
    }

  function _emscripten_set_timeout_loop(cb, msecs, userData) {
      function tick() {
        var t = performance.now();
        var n = t + msecs;
        if (dynCall_idi(cb, t, userData)) {
          setTimeout(tick,
            // Save a little bit of code space: modern browsers should treat negative setTimeout as timeout of 0 (https://stackoverflow.com/questions/8430966/is-calling-settimeout-with-a-negative-delay-ok)
            t - performance.now()
            );
        }
      }
      return setTimeout(tick, 0);
    }

  
  var Fetch={xhrs:[],setu64:function(addr, val) {
      HEAPU32[addr >> 2] = val;
      HEAPU32[addr + 4 >> 2] = (val / 4294967296)|0;
    },staticInit:function() {
      var isMainThread = true;
  
  
    }};
  
  function __emscripten_fetch_xhr(fetch, onsuccess, onerror, onprogress, onreadystatechange) {
    var url = HEAPU32[fetch + 8 >> 2];
    if (!url) {
      onerror(fetch, 0, 'no url specified!');
      return;
    }
    var url_ = UTF8ToString(url);
  
    var fetch_attr = fetch + 112;
    var requestMethod = UTF8ToString(fetch_attr);
    if (!requestMethod) requestMethod = 'GET';
    var userData = HEAPU32[fetch_attr + 32 >> 2];
    var fetchAttributes = HEAPU32[fetch_attr + 52 >> 2];
    var timeoutMsecs = HEAPU32[fetch_attr + 56 >> 2];
    var withCredentials = !!HEAPU32[fetch_attr + 60 >> 2];
    var destinationPath = HEAPU32[fetch_attr + 64 >> 2];
    var userName = HEAPU32[fetch_attr + 68 >> 2];
    var password = HEAPU32[fetch_attr + 72 >> 2];
    var requestHeaders = HEAPU32[fetch_attr + 76 >> 2];
    var overriddenMimeType = HEAPU32[fetch_attr + 80 >> 2];
    var dataPtr = HEAPU32[fetch_attr + 84 >> 2];
    var dataLength = HEAPU32[fetch_attr + 88 >> 2];
  
    var fetchAttrLoadToMemory = !!(fetchAttributes & 1);
    var fetchAttrStreamData = !!(fetchAttributes & 2);
    var fetchAttrAppend = !!(fetchAttributes & 8);
    var fetchAttrReplace = !!(fetchAttributes & 16);
    var fetchAttrSynchronous = !!(fetchAttributes & 64);
    var fetchAttrWaitable = !!(fetchAttributes & 128);
  
    var userNameStr = userName ? UTF8ToString(userName) : undefined;
    var passwordStr = password ? UTF8ToString(password) : undefined;
    var overriddenMimeTypeStr = overriddenMimeType ? UTF8ToString(overriddenMimeType) : undefined;
  
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = withCredentials;
    xhr.open(requestMethod, url_, !fetchAttrSynchronous, userNameStr, passwordStr);
    if (!fetchAttrSynchronous) xhr.timeout = timeoutMsecs; // XHR timeout field is only accessible in async XHRs, and must be set after .open() but before .send().
    xhr.url_ = url_; // Save the url for debugging purposes (and for comparing to the responseURL that server side advertised)
    xhr.responseType = 'arraybuffer';
  
    if (overriddenMimeType) {
      xhr.overrideMimeType(overriddenMimeTypeStr);
    }
    if (requestHeaders) {
      for(;;) {
        var key = HEAPU32[requestHeaders >> 2];
        if (!key) break;
        var value = HEAPU32[requestHeaders + 4 >> 2];
        if (!value) break;
        requestHeaders += 8;
        var keyStr = UTF8ToString(key);
        var valueStr = UTF8ToString(value);
        xhr.setRequestHeader(keyStr, valueStr);
      }
    }
    Fetch.xhrs.push(xhr);
    var id = Fetch.xhrs.length;
    HEAPU32[fetch + 0 >> 2] = id;
    var data = (dataPtr && dataLength) ? HEAPU8.slice(dataPtr, dataPtr + dataLength) : null;
    // TODO: Support specifying custom headers to the request.
  
    // Share the code to save the response, as we need to do so both on success
    // and on error (despite an error, there may be a response, like a 404 page).
    // This receives a condition, which determines whether to save the xhr's
    // response, or just 0.
    function saveResponse(condition) {
      var ptr = 0;
      var ptrLen = 0;
      if (condition) {
        ptrLen = xhr.response ? xhr.response.byteLength : 0;
        // The data pointer malloc()ed here has the same lifetime as the emscripten_fetch_t structure itself has, and is
        // freed when emscripten_fetch_close() is called.
        ptr = _malloc(ptrLen);
        HEAPU8.set(new Uint8Array(xhr.response), ptr);
      }
      HEAPU32[fetch + 12 >> 2] = ptr;
      Fetch.setu64(fetch + 16, ptrLen);
    }
  
    xhr.onload = function(e) {
      saveResponse(fetchAttrLoadToMemory && !fetchAttrStreamData);
      var len = xhr.response ? xhr.response.byteLength : 0;
      Fetch.setu64(fetch + 24, 0);
      if (len) {
        // If the final XHR.onload handler receives the bytedata to compute total length, report that,
        // otherwise don't write anything out here, which will retain the latest byte size reported in
        // the most recent XHR.onprogress handler.
        Fetch.setu64(fetch + 32, len);
      }
      HEAPU16[fetch + 40 >> 1] = xhr.readyState;
      if (xhr.readyState === 4 && xhr.status === 0) {
        if (len > 0) xhr.status = 200; // If loading files from a source that does not give HTTP status code, assume success if we got data bytes.
        else xhr.status = 404; // Conversely, no data bytes is 404.
      }
      HEAPU16[fetch + 42 >> 1] = xhr.status;
      if (xhr.statusText) stringToUTF8(xhr.statusText, fetch + 44, 64);
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onsuccess) onsuccess(fetch, xhr, e);
      } else {
        if (onerror) onerror(fetch, xhr, e);
      }
    };
    xhr.onerror = function(e) {
      saveResponse(fetchAttrLoadToMemory);
      var status = xhr.status; // XXX TODO: Overwriting xhr.status doesn't work here, so don't override anywhere else either.
      if (xhr.readyState === 4 && status === 0) status = 404; // If no error recorded, pretend it was 404 Not Found.
      Fetch.setu64(fetch + 24, 0);
      Fetch.setu64(fetch + 32, xhr.response ? xhr.response.byteLength : 0);
      HEAPU16[fetch + 40 >> 1] = xhr.readyState;
      HEAPU16[fetch + 42 >> 1] = status;
      if (onerror) onerror(fetch, xhr, e);
    };
    xhr.ontimeout = function(e) {
      if (onerror) onerror(fetch, xhr, e);
    };
    xhr.onprogress = function(e) {
      var ptrLen = (fetchAttrLoadToMemory && fetchAttrStreamData && xhr.response) ? xhr.response.byteLength : 0;
      var ptr = 0;
      if (fetchAttrLoadToMemory && fetchAttrStreamData) {
        // Allocate byte data in Emscripten heap for the streamed memory block (freed immediately after onprogress call)
        ptr = _malloc(ptrLen);
        HEAPU8.set(new Uint8Array(xhr.response), ptr);
      }
      HEAPU32[fetch + 12 >> 2] = ptr;
      Fetch.setu64(fetch + 16, ptrLen);
      Fetch.setu64(fetch + 24, e.loaded - ptrLen);
      Fetch.setu64(fetch + 32, e.total);
      HEAPU16[fetch + 40 >> 1] = xhr.readyState;
      if (xhr.readyState >= 3 && xhr.status === 0 && e.loaded > 0) xhr.status = 200; // If loading files from a source that does not give HTTP status code, assume success if we get data bytes
      HEAPU16[fetch + 42 >> 1] = xhr.status;
      if (xhr.statusText) stringToUTF8(xhr.statusText, fetch + 44, 64);
      if (onprogress) onprogress(fetch, xhr, e);
      if (ptr) {
        _free(ptr);
      }
    };
    xhr.onreadystatechange = function(e) {
      HEAPU16[fetch + 40 >> 1] = xhr.readyState;
      if (xhr.readyState >= 2) {
        HEAPU16[fetch + 42 >> 1] = xhr.status;
      }
      if (onreadystatechange) onreadystatechange(fetch, xhr, e);
    };
    try {
      xhr.send(data);
    } catch(e) {
      if (onerror) onerror(fetch, xhr, e);
    }
  }
  
  
  var _fetch_work_queue=1316944;function __emscripten_get_fetch_work_queue() {
      return _fetch_work_queue;
    }function _emscripten_start_fetch(fetch, successcb, errorcb, progresscb, readystatechangecb) {
    if (typeof noExitRuntime !== 'undefined') noExitRuntime = true; // If we are the main Emscripten runtime, we should not be closing down.
  
    var fetch_attr = fetch + 112;
    var requestMethod = UTF8ToString(fetch_attr);
    var onsuccess = HEAPU32[fetch_attr + 36 >> 2];
    var onerror = HEAPU32[fetch_attr + 40 >> 2];
    var onprogress = HEAPU32[fetch_attr + 44 >> 2];
    var onreadystatechange = HEAPU32[fetch_attr + 48 >> 2];
    var fetchAttributes = HEAPU32[fetch_attr + 52 >> 2];
    var fetchAttrLoadToMemory = !!(fetchAttributes & 1);
    var fetchAttrStreamData = !!(fetchAttributes & 2);
    var fetchAttrAppend = !!(fetchAttributes & 8);
    var fetchAttrReplace = !!(fetchAttributes & 16);
  
    var reportSuccess = function(fetch, xhr, e) {
      if (onsuccess) dynCall_vi(onsuccess, fetch);
      else if (successcb) successcb(fetch);
    };
  
    var reportProgress = function(fetch, xhr, e) {
      if (onprogress) dynCall_vi(onprogress, fetch);
      else if (progresscb) progresscb(fetch);
    };
  
    var reportError = function(fetch, xhr, e) {
      if (onerror) dynCall_vi(onerror, fetch);
      else if (errorcb) errorcb(fetch);
    };
  
    var reportReadyStateChange = function(fetch, xhr, e) {
      if (onreadystatechange) dynCall_vi(onreadystatechange, fetch);
      else if (readystatechangecb) readystatechangecb(fetch);
    };
  
    var performUncachedXhr = function(fetch, xhr, e) {
      __emscripten_fetch_xhr(fetch, reportSuccess, reportError, reportProgress, reportReadyStateChange);
    };
  
    __emscripten_fetch_xhr(fetch, reportSuccess, reportError, reportProgress, reportReadyStateChange);
    return fetch;
  }

  function _emscripten_throw_string(str) {
      throw UTF8ToString(str);
    }

  
  function _emscripten_webgl_do_commit_frame() {
      if (!GL.currentContext || !GL.currentContext.GLctx) {
        return -3;
      }
  
      if (!GL.currentContext.attributes.explicitSwapControl) {
        return -3;
      }
      // We would do GL.currentContext.GLctx.commit(); here, but the current implementation
      // in browsers has removed it - swap is implicit, so this function is a no-op for now
      // (until/unless the spec changes).
      return 0;
    }function _emscripten_webgl_commit_frame(
  ) {
  return _emscripten_webgl_do_commit_frame();
  }

  
  
  var __emscripten_webgl_power_preferences=['default', 'low-power', 'high-performance'];function _emscripten_webgl_do_create_context(target, attributes) {
      var contextAttributes = {};
      var a = attributes >> 2;
      contextAttributes['alpha'] = !!HEAP32[a + (0>>2)];
      contextAttributes['depth'] = !!HEAP32[a + (4>>2)];
      contextAttributes['stencil'] = !!HEAP32[a + (8>>2)];
      contextAttributes['antialias'] = !!HEAP32[a + (12>>2)];
      contextAttributes['premultipliedAlpha'] = !!HEAP32[a + (16>>2)];
      contextAttributes['preserveDrawingBuffer'] = !!HEAP32[a + (20>>2)];
      var powerPreference = HEAP32[a + (24>>2)];
      contextAttributes['powerPreference'] = __emscripten_webgl_power_preferences[powerPreference];
      contextAttributes['failIfMajorPerformanceCaveat'] = !!HEAP32[a + (28>>2)];
      contextAttributes.majorVersion = HEAP32[a + (32>>2)];
      contextAttributes.minorVersion = HEAP32[a + (36>>2)];
      contextAttributes.enableExtensionsByDefault = HEAP32[a + (40>>2)];
      contextAttributes.explicitSwapControl = HEAP32[a + (44>>2)];
      contextAttributes.proxyContextToMainThread = HEAP32[a + (48>>2)];
      contextAttributes.renderViaOffscreenBackBuffer = HEAP32[a + (52>>2)];
  
      var canvas = __findCanvasEventTarget(target);
  
  
  
      if (!canvas) {
        return -4;
      }
  
      if (contextAttributes.explicitSwapControl) {
        return -1;
      }
  
  
      var contextHandle = GL.createContext(canvas, contextAttributes);
      return contextHandle;
    }function _emscripten_webgl_create_context(a0,a1
  ) {
  return _emscripten_webgl_do_create_context(a0,a1);
  }

  
  
  function _emscripten_webgl_do_get_current_context() {
      return GL.currentContext ? GL.currentContext.handle : 0;
    }function _emscripten_webgl_get_current_context(
  ) {
  return _emscripten_webgl_do_get_current_context();
  }
  Module["_emscripten_webgl_get_current_context"] = _emscripten_webgl_get_current_context;
  
  function _emscripten_webgl_make_context_current(contextHandle) {
      var success = GL.makeContextCurrent(contextHandle);
      return success ? 0 : -5;
    }
  Module["_emscripten_webgl_make_context_current"] = _emscripten_webgl_make_context_current;function _emscripten_webgl_destroy_context(contextHandle) {
      if (GL.currentContext == contextHandle) GL.currentContext = 0;
      GL.deleteContext(contextHandle);
    }

  function _emscripten_webgl_enable_extension(contextHandle, extension) {
      var context = GL.getContext(contextHandle);
      var extString = UTF8ToString(extension);
      if (extString.indexOf('GL_') == 0) extString = extString.substr(3); // Allow enabling extensions both with "GL_" prefix and without.
  
      // Switch-board that pulls in code for all GL extensions, even if those are not used :/
      // Build with -s GL_SUPPORT_SIMPLE_ENABLE_EXTENSIONS = 0 to avoid this.
  
      // Obtain function entry points to WebGL 1 extension related functions.
      if (extString == 'ANGLE_instanced_arrays') __webgl_enable_ANGLE_instanced_arrays(GLctx);
      if (extString == 'OES_vertex_array_object') __webgl_enable_OES_vertex_array_object(GLctx);
      if (extString == 'WEBGL_draw_buffers') __webgl_enable_WEBGL_draw_buffers(GLctx);
  
      if (extString == 'WEBGL_draw_instanced_base_vertex_base_instance') __webgl_enable_WEBGL_draw_instanced_base_vertex_base_instance(GLctx);
  
  
      var ext = context.GLctx.getExtension(extString);
      return !!ext;
    }

  function _emscripten_webgl_get_context_attributes(c, a) {
      if (!a) return -5;
      c = GL.contexts[c];
      if (!c) return -3;
      var t = c.GLctx;
      if (!t) return -3;
      t = t.getContextAttributes();
  
      HEAP32[((a)>>2)]=t.alpha;
      HEAP32[(((a)+(4))>>2)]=t.depth;
      HEAP32[(((a)+(8))>>2)]=t.stencil;
      HEAP32[(((a)+(12))>>2)]=t.antialias;
      HEAP32[(((a)+(16))>>2)]=t.premultipliedAlpha;
      HEAP32[(((a)+(20))>>2)]=t.preserveDrawingBuffer;
      var power = t['powerPreference'] && __emscripten_webgl_power_preferences.indexOf(t['powerPreference']);
      HEAP32[(((a)+(24))>>2)]=power;
      HEAP32[(((a)+(28))>>2)]=t.failIfMajorPerformanceCaveat;
      HEAP32[(((a)+(32))>>2)]=c.version;
      HEAP32[(((a)+(36))>>2)]=0;
      HEAP32[(((a)+(40))>>2)]=c.attributes.enableExtensionsByDefault;
      return 0;
    }


  function _emscripten_webgl_init_context_attributes(attributes) {
      var a = attributes >> 2;
      for(var i = 0; i < (56>>2); ++i) {
        HEAP32[a+i] = 0;
      }
  
      HEAP32[a + (0>>2)] =
      HEAP32[a + (4>>2)] = 
      HEAP32[a + (12>>2)] = 
      HEAP32[a + (16>>2)] = 
      HEAP32[a + (32>>2)] = 
      HEAP32[a + (40>>2)] = 1;
  
    }


  
  
  var ENV={};
  
  function __getExecutableName() {
      return "./this.program";
    }function getEnvStrings() {
      if (!getEnvStrings.strings) {
        // Default values.
        var env = {
          'USER': 'web_user',
          'LOGNAME': 'web_user',
          'PATH': '/',
          'PWD': '/',
          'HOME': '/home/web_user',
          // Browser language detection #8751
          'LANG': ((typeof navigator === 'object' && navigator.languages && navigator.languages[0]) || 'C').replace('-', '_') + '.UTF-8',
          '_': __getExecutableName()
        };
        // Apply the user-provided values, if any.
        for (var x in ENV) {
          env[x] = ENV[x];
        }
        var strings = [];
        for (var x in env) {
          strings.push(x + '=' + env[x]);
        }
        getEnvStrings.strings = strings;
      }
      return getEnvStrings.strings;
    }
  
  function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; ++i) {
      HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
    }
    // Null-terminate the pointer to the HEAP.
    if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
  }function _environ_get(__environ, environ_buf) {
      var bufSize = 0;
      getEnvStrings().forEach(function(string, i) {
        var ptr = environ_buf + bufSize;
        HEAP32[(((__environ)+(i * 4))>>2)]=ptr;
        writeAsciiToMemory(string, ptr);
        bufSize += string.length + 1;
      });
      return 0;
    }

  function _environ_sizes_get(penviron_count, penviron_buf_size) {
      var strings = getEnvStrings();
      HEAP32[((penviron_count)>>2)]=strings.length;
      var bufSize = 0;
      strings.forEach(function(string) {
        bufSize += string.length + 1;
      });
      HEAP32[((penviron_buf_size)>>2)]=bufSize;
      return 0;
    }

  function _exit(status) {
      throw 'exit(' + status + ')';
    }

  function _fd_close(fd) {
      return 0;
    }

  function _fd_read(fd, iov, iovcnt, pnum) {
      var stream = SYSCALLS.getStreamFromFD(fd);
      var num = SYSCALLS.doReadv(stream, iov, iovcnt);
      HEAP32[((pnum)>>2)]=num
      return 0;
    }

  function _fd_seek(fd, offset_low, offset_high, whence, newOffset) {
  }

  function _fd_write(fd, iov, iovcnt, pnum) {
      // hack to support printf in SYSCALLS_REQUIRE_FILESYSTEM=0
      var num = 0;
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          SYSCALLS.printChar(fd, HEAPU8[ptr+j]);
        }
        num += len;
      }
      HEAP32[((pnum)>>2)]=num
      return 0;
    }

  function _gettimeofday(ptr) {
      var now = Date.now();
      HEAP32[((ptr)>>2)]=(now/1000)|0; // seconds
      HEAP32[(((ptr)+(4))>>2)]=((now % 1000)*1000)|0; // microseconds
      return 0;
    }

  function _glActiveTexture(x0) { GLctx['activeTexture'](x0) }

  function _glAttachShader(program, shader) {
      GLctx.attachShader(GL.programs[program],
                              GL.shaders[shader]);
    }

  function _glBindBuffer(target, buffer) {
  
      if (target == 0x88EB /*GL_PIXEL_PACK_BUFFER*/) {
        // In WebGL 2 glReadPixels entry point, we need to use a different WebGL 2 API function call when a buffer is bound to
        // GL_PIXEL_PACK_BUFFER_BINDING point, so must keep track whether that binding point is non-null to know what is
        // the proper API function to call.
        GLctx.currentPixelPackBufferBinding = buffer;
      } else if (target == 0x88EC /*GL_PIXEL_UNPACK_BUFFER*/) {
        // In WebGL 2 gl(Compressed)Tex(Sub)Image[23]D entry points, we need to
        // use a different WebGL 2 API function call when a buffer is bound to
        // GL_PIXEL_UNPACK_BUFFER_BINDING point, so must keep track whether that
        // binding point is non-null to know what is the proper API function to
        // call.
        GLctx.currentPixelUnpackBufferBinding = buffer;
      }
      GLctx.bindBuffer(target, GL.buffers[buffer]);
    }

  function _glBindFramebuffer(target, framebuffer) {
  
      GLctx.bindFramebuffer(target, GL.framebuffers[framebuffer]);
  
    }

  function _glBindRenderbuffer(target, renderbuffer) {
      GLctx.bindRenderbuffer(target, GL.renderbuffers[renderbuffer]);
    }

  function _glBindTexture(target, texture) {
      GLctx.bindTexture(target, GL.textures[texture]);
    }

  function _glBlendColor(x0, x1, x2, x3) { GLctx['blendColor'](x0, x1, x2, x3) }

  function _glBlendEquationSeparate(x0, x1) { GLctx['blendEquationSeparate'](x0, x1) }

  function _glBlendFuncSeparate(x0, x1, x2, x3) { GLctx['blendFuncSeparate'](x0, x1, x2, x3) }

  function _glBufferData(target, size, data, usage) {
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (data) {
          GLctx.bufferData(target, HEAPU8, usage, data, size);
        } else {
          GLctx.bufferData(target, size, usage);
        }
      } else {
        // N.b. here first form specifies a heap subarray, second form an integer size, so the ?: code here is polymorphic. It is advised to avoid
        // randomly mixing both uses in calling code, to avoid any potential JS engine JIT issues.
        GLctx.bufferData(target, data ? HEAPU8.subarray(data, data+size) : size, usage);
      }
    }

  function _glBufferSubData(target, offset, size, data) {
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.bufferSubData(target, offset, HEAPU8, data, size);
        return;
      }
      GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data+size));
    }

  function _glCheckFramebufferStatus(x0) { return GLctx['checkFramebufferStatus'](x0) }

  function _glClear(x0) { GLctx['clear'](x0) }

  function _glClearColor(x0, x1, x2, x3) { GLctx['clearColor'](x0, x1, x2, x3) }

  function _glClearDepthf(x0) { GLctx['clearDepth'](x0) }

  function _glClearStencil(x0) { GLctx['clearStencil'](x0) }

  function _glColorMask(red, green, blue, alpha) {
      GLctx.colorMask(!!red, !!green, !!blue, !!alpha);
    }

  function _glCompileShader(shader) {
      GLctx.compileShader(GL.shaders[shader]);
    }

  function _glCompressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data) {
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (GLctx.currentPixelUnpackBufferBinding) {
          GLctx['compressedTexImage2D'](target, level, internalFormat, width, height, border, imageSize, data);
        } else {
          GLctx['compressedTexImage2D'](target, level, internalFormat, width, height, border, HEAPU8, data, imageSize);
        }
        return;
      }
      GLctx['compressedTexImage2D'](target, level, internalFormat, width, height, border, data ? HEAPU8.subarray((data),(data+imageSize)) : null);
    }

  function _glCompressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data) {
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (GLctx.currentPixelUnpackBufferBinding) {
          GLctx['compressedTexSubImage2D'](target, level, xoffset, yoffset, width, height, format, imageSize, data);
        } else {
          GLctx['compressedTexSubImage2D'](target, level, xoffset, yoffset, width, height, format, HEAPU8, data, imageSize);
        }
        return;
      }
      GLctx['compressedTexSubImage2D'](target, level, xoffset, yoffset, width, height, format, data ? HEAPU8.subarray((data),(data+imageSize)) : null);
    }

  function _glCreateProgram() {
      var id = GL.getNewId(GL.programs);
      var program = GLctx.createProgram();
      program.name = id;
      GL.programs[id] = program;
      return id;
    }

  function _glCreateShader(shaderType) {
      var id = GL.getNewId(GL.shaders);
      GL.shaders[id] = GLctx.createShader(shaderType);
      return id;
    }

  function _glCullFace(x0) { GLctx['cullFace'](x0) }

  function _glDeleteBuffers(n, buffers) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((buffers)+(i*4))>>2)];
        var buffer = GL.buffers[id];
  
        // From spec: "glDeleteBuffers silently ignores 0's and names that do not
        // correspond to existing buffer objects."
        if (!buffer) continue;
  
        GLctx.deleteBuffer(buffer);
        buffer.name = 0;
        GL.buffers[id] = null;
  
        if (id == GLctx.currentPixelPackBufferBinding) GLctx.currentPixelPackBufferBinding = 0;
        if (id == GLctx.currentPixelUnpackBufferBinding) GLctx.currentPixelUnpackBufferBinding = 0;
      }
    }

  function _glDeleteFramebuffers(n, framebuffers) {
      for (var i = 0; i < n; ++i) {
        var id = HEAP32[(((framebuffers)+(i*4))>>2)];
        var framebuffer = GL.framebuffers[id];
        if (!framebuffer) continue; // GL spec: "glDeleteFramebuffers silently ignores 0s and names that do not correspond to existing framebuffer objects".
        GLctx.deleteFramebuffer(framebuffer);
        framebuffer.name = 0;
        GL.framebuffers[id] = null;
      }
    }

  function _glDeleteProgram(id) {
      if (!id) return;
      var program = GL.programs[id];
      if (!program) { // glDeleteProgram actually signals an error when deleting a nonexisting object, unlike some other GL delete functions.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      GLctx.deleteProgram(program);
      program.name = 0;
      GL.programs[id] = null;
      GL.programInfos[id] = null;
    }

  function _glDeleteRenderbuffers(n, renderbuffers) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((renderbuffers)+(i*4))>>2)];
        var renderbuffer = GL.renderbuffers[id];
        if (!renderbuffer) continue; // GL spec: "glDeleteRenderbuffers silently ignores 0s and names that do not correspond to existing renderbuffer objects".
        GLctx.deleteRenderbuffer(renderbuffer);
        renderbuffer.name = 0;
        GL.renderbuffers[id] = null;
      }
    }

  function _glDeleteShader(id) {
      if (!id) return;
      var shader = GL.shaders[id];
      if (!shader) { // glDeleteShader actually signals an error when deleting a nonexisting object, unlike some other GL delete functions.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      GLctx.deleteShader(shader);
      GL.shaders[id] = null;
    }

  function _glDeleteTextures(n, textures) {
      for (var i = 0; i < n; i++) {
        var id = HEAP32[(((textures)+(i*4))>>2)];
        var texture = GL.textures[id];
        if (!texture) continue; // GL spec: "glDeleteTextures silently ignores 0s and names that do not correspond to existing textures".
        GLctx.deleteTexture(texture);
        texture.name = 0;
        GL.textures[id] = null;
      }
    }

  function _glDepthFunc(x0) { GLctx['depthFunc'](x0) }

  function _glDepthMask(flag) {
      GLctx.depthMask(!!flag);
    }

  function _glDetachShader(program, shader) {
      GLctx.detachShader(GL.programs[program],
                              GL.shaders[shader]);
    }

  function _glDisable(x0) { GLctx['disable'](x0) }

  function _glDisableVertexAttribArray(index) {
      GLctx.disableVertexAttribArray(index);
    }

  function _glDrawArrays(mode, first, count) {
  
      GLctx.drawArrays(mode, first, count);
  
    }


  function _glEnable(x0) { GLctx['enable'](x0) }

  function _glEnableVertexAttribArray(index) {
      GLctx.enableVertexAttribArray(index);
    }

  function _glFlush() { GLctx['flush']() }

  function _glFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) {
      GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget,
                                         GL.renderbuffers[renderbuffer]);
    }

  function _glFramebufferTexture2D(target, attachment, textarget, texture, level) {
      GLctx.framebufferTexture2D(target, attachment, textarget,
                                      GL.textures[texture], level);
    }

  function _glFrontFace(x0) { GLctx['frontFace'](x0) }

  function _glGenBuffers(n, buffers) {
      __glGenObject(n, buffers, 'createBuffer', GL.buffers
        );
    }

  function _glGenFramebuffers(n, ids) {
      __glGenObject(n, ids, 'createFramebuffer', GL.framebuffers
        );
    }

  function _glGenRenderbuffers(n, renderbuffers) {
      __glGenObject(n, renderbuffers, 'createRenderbuffer', GL.renderbuffers
        );
    }

  function _glGenTextures(n, textures) {
      __glGenObject(n, textures, 'createTexture', GL.textures
        );
    }

  function _glGenerateMipmap(x0) { GLctx['generateMipmap'](x0) }

  function _glGetActiveAttrib(program, index, bufSize, length, size, type, name) {
      __glGetActiveAttribOrUniform('getActiveAttrib', program, index, bufSize, length, size, type, name);
    }

  function _glGetActiveUniform(program, index, bufSize, length, size, type, name) {
      __glGetActiveAttribOrUniform('getActiveUniform', program, index, bufSize, length, size, type, name);
    }

  function _glGetAttribLocation(program, name) {
      return GLctx.getAttribLocation(GL.programs[program], UTF8ToString(name));
    }

  function _glGetError() {
      var error = GLctx.getError() || GL.lastError;
      GL.lastError = 0/*GL_NO_ERROR*/;
      return error;
    }

  function _glGetFloatv(name_, p) {
      emscriptenWebGLGet(name_, p, 2);
    }

  function _glGetIntegerv(name_, p) {
      emscriptenWebGLGet(name_, p, 0);
    }

  function _glGetProgramInfoLog(program, maxLength, length, infoLog) {
      var log = GLctx.getProgramInfoLog(GL.programs[program]);
      if (log === null) log = '(unknown error)';
      var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
      if (length) HEAP32[((length)>>2)]=numBytesWrittenExclNull;
    }

  function _glGetProgramiv(program, pname, p) {
      if (!p) {
        // GLES2 specification does not specify how to behave if p is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
  
      if (program >= GL.counter) {
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
  
      var ptable = GL.programInfos[program];
      if (!ptable) {
        GL.recordError(0x502 /* GL_INVALID_OPERATION */);
        return;
      }
  
      if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
        var log = GLctx.getProgramInfoLog(GL.programs[program]);
        if (log === null) log = '(unknown error)';
        HEAP32[((p)>>2)]=log.length + 1;
      } else if (pname == 0x8B87 /* GL_ACTIVE_UNIFORM_MAX_LENGTH */) {
        HEAP32[((p)>>2)]=ptable.maxUniformLength;
      } else if (pname == 0x8B8A /* GL_ACTIVE_ATTRIBUTE_MAX_LENGTH */) {
        if (ptable.maxAttributeLength == -1) {
          program = GL.programs[program];
          var numAttribs = GLctx.getProgramParameter(program, 0x8B89/*GL_ACTIVE_ATTRIBUTES*/);
          ptable.maxAttributeLength = 0; // Spec says if there are no active attribs, 0 must be returned.
          for (var i = 0; i < numAttribs; ++i) {
            var activeAttrib = GLctx.getActiveAttrib(program, i);
            ptable.maxAttributeLength = Math.max(ptable.maxAttributeLength, activeAttrib.name.length+1);
          }
        }
        HEAP32[((p)>>2)]=ptable.maxAttributeLength;
      } else if (pname == 0x8A35 /* GL_ACTIVE_UNIFORM_BLOCK_MAX_NAME_LENGTH */) {
        if (ptable.maxUniformBlockNameLength == -1) {
          program = GL.programs[program];
          var numBlocks = GLctx.getProgramParameter(program, 0x8A36/*GL_ACTIVE_UNIFORM_BLOCKS*/);
          ptable.maxUniformBlockNameLength = 0;
          for (var i = 0; i < numBlocks; ++i) {
            var activeBlockName = GLctx.getActiveUniformBlockName(program, i);
            ptable.maxUniformBlockNameLength = Math.max(ptable.maxUniformBlockNameLength, activeBlockName.length+1);
          }
        }
        HEAP32[((p)>>2)]=ptable.maxUniformBlockNameLength;
      } else {
        HEAP32[((p)>>2)]=GLctx.getProgramParameter(GL.programs[program], pname);
      }
    }

  function _glGetShaderInfoLog(shader, maxLength, length, infoLog) {
      var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
      if (log === null) log = '(unknown error)';
      var numBytesWrittenExclNull = (maxLength > 0 && infoLog) ? stringToUTF8(log, infoLog, maxLength) : 0;
      if (length) HEAP32[((length)>>2)]=numBytesWrittenExclNull;
    }

  function _glGetShaderiv(shader, pname, p) {
      if (!p) {
        // GLES2 specification does not specify how to behave if p is a null pointer. Since calling this function does not make sense
        // if p == null, issue a GL error to notify user about it.
        GL.recordError(0x501 /* GL_INVALID_VALUE */);
        return;
      }
      if (pname == 0x8B84) { // GL_INFO_LOG_LENGTH
        var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
        if (log === null) log = '(unknown error)';
        HEAP32[((p)>>2)]=log.length + 1;
      } else if (pname == 0x8B88) { // GL_SHADER_SOURCE_LENGTH
        var source = GLctx.getShaderSource(GL.shaders[shader]);
        var sourceLength = (source === null || source.length == 0) ? 0 : source.length + 1;
        HEAP32[((p)>>2)]=sourceLength;
      } else {
        HEAP32[((p)>>2)]=GLctx.getShaderParameter(GL.shaders[shader], pname);
      }
    }

  function _glGetString(name_) {
      if (GL.stringCache[name_]) return GL.stringCache[name_];
      var ret;
      switch(name_) {
        case 0x1F03 /* GL_EXTENSIONS */:
          var exts = GLctx.getSupportedExtensions() || []; // .getSupportedExtensions() can return null if context is lost, so coerce to empty array.
          exts = exts.concat(exts.map(function(e) { return "GL_" + e; }));
          ret = stringToNewUTF8(exts.join(' '));
          break;
        case 0x1F00 /* GL_VENDOR */:
        case 0x1F01 /* GL_RENDERER */:
        case 0x9245 /* UNMASKED_VENDOR_WEBGL */:
        case 0x9246 /* UNMASKED_RENDERER_WEBGL */:
          var s = GLctx.getParameter(name_);
          if (!s) {
            GL.recordError(0x500/*GL_INVALID_ENUM*/);
          }
          ret = stringToNewUTF8(s);
          break;
  
        case 0x1F02 /* GL_VERSION */:
          var glVersion = GLctx.getParameter(0x1F02 /*GL_VERSION*/);
          // return GLES version string corresponding to the version of the WebGL context
          if (GL.currentContext.version >= 2) glVersion = 'OpenGL ES 3.0 (' + glVersion + ')';
          else
          {
            glVersion = 'OpenGL ES 2.0 (' + glVersion + ')';
          }
          ret = stringToNewUTF8(glVersion);
          break;
        case 0x8B8C /* GL_SHADING_LANGUAGE_VERSION */:
          var glslVersion = GLctx.getParameter(0x8B8C /*GL_SHADING_LANGUAGE_VERSION*/);
          // extract the version number 'N.M' from the string 'WebGL GLSL ES N.M ...'
          var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
          var ver_num = glslVersion.match(ver_re);
          if (ver_num !== null) {
            if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + '0'; // ensure minor version has 2 digits
            glslVersion = 'OpenGL ES GLSL ES ' + ver_num[1] + ' (' + glslVersion + ')';
          }
          ret = stringToNewUTF8(glslVersion);
          break;
        default:
          GL.recordError(0x500/*GL_INVALID_ENUM*/);
          return 0;
      }
      GL.stringCache[name_] = ret;
      return ret;
    }

  function _glGetUniformLocation(program, name) {
      name = UTF8ToString(name);
  
      var arrayIndex = 0;
      // If user passed an array accessor "[index]", parse the array index off the accessor.
      if (name[name.length - 1] == ']') {
        var leftBrace = name.lastIndexOf('[');
        arrayIndex = name[leftBrace+1] != ']' ? jstoi_q(name.slice(leftBrace + 1)) : 0; // "index]", parseInt will ignore the ']' at the end; but treat "foo[]" as "foo[0]"
        name = name.slice(0, leftBrace);
      }
  
      var uniformInfo = GL.programInfos[program] && GL.programInfos[program].uniforms[name]; // returns pair [ dimension_of_uniform_array, uniform_location ]
      if (uniformInfo && arrayIndex >= 0 && arrayIndex < uniformInfo[0]) { // Check if user asked for an out-of-bounds element, i.e. for 'vec4 colors[3];' user could ask for 'colors[10]' which should return -1.
        return uniformInfo[1] + arrayIndex;
      } else {
        return -1;
      }
    }

  function _glLinkProgram(program) {
      GLctx.linkProgram(GL.programs[program]);
      GL.populateUniformTable(program);
    }

  function _glPixelStorei(pname, param) {
      if (pname == 0xCF5 /* GL_UNPACK_ALIGNMENT */) {
        GL.unpackAlignment = param;
      }
      GLctx.pixelStorei(pname, param);
    }

  function _glReadPixels(x, y, width, height, format, type, pixels) {
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (GLctx.currentPixelPackBufferBinding) {
          GLctx.readPixels(x, y, width, height, format, type, pixels);
        } else {
          var heap = __heapObjectForWebGLType(type);
          GLctx.readPixels(x, y, width, height, format, type, heap, pixels >> __heapAccessShiftForWebGLHeap(heap));
        }
        return;
      }
      var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
      if (!pixelData) {
        GL.recordError(0x500/*GL_INVALID_ENUM*/);
        return;
      }
      GLctx.readPixels(x, y, width, height, format, type, pixelData);
    }

  function _glRenderbufferStorage(x0, x1, x2, x3) { GLctx['renderbufferStorage'](x0, x1, x2, x3) }

  function _glScissor(x0, x1, x2, x3) { GLctx['scissor'](x0, x1, x2, x3) }

  function _glShaderSource(shader, count, string, length) {
      var source = GL.getSource(shader, count, string, length);
  
  
      GLctx.shaderSource(GL.shaders[shader], source);
    }

  function _glStencilFuncSeparate(x0, x1, x2, x3) { GLctx['stencilFuncSeparate'](x0, x1, x2, x3) }

  function _glStencilOpSeparate(x0, x1, x2, x3) { GLctx['stencilOpSeparate'](x0, x1, x2, x3) }

  function _glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
      if (GL.currentContext.version >= 2) {
        // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (GLctx.currentPixelUnpackBufferBinding) {
          GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels);
        } else if (pixels) {
          var heap = __heapObjectForWebGLType(type);
          GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, heap, pixels >> __heapAccessShiftForWebGLHeap(heap));
        } else {
          GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, null);
        }
        return;
      }
      GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixels ? emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) : null);
    }

  function _glTexParameterf(x0, x1, x2) { GLctx['texParameterf'](x0, x1, x2) }

  function _glTexParameterfv(target, pname, params) {
      var param = HEAPF32[((params)>>2)];
      GLctx.texParameterf(target, pname, param);
    }

  function _glTexParameteri(x0, x1, x2) { GLctx['texParameteri'](x0, x1, x2) }

  function _glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
      if (GL.currentContext.version >= 2) {
        // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        if (GLctx.currentPixelUnpackBufferBinding) {
          GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels);
        } else if (pixels) {
          var heap = __heapObjectForWebGLType(type);
          GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, heap, pixels >> __heapAccessShiftForWebGLHeap(heap));
        } else {
          GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, null);
        }
        return;
      }
      var pixelData = null;
      if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0);
      GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData);
    }

  function _glUniform1i(location, v0) {
      GLctx.uniform1i(GL.uniforms[location], v0);
    }

  function _glUniform1iv(location, count, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniform1iv(GL.uniforms[location], HEAP32, value>>2, count);
        return;
      }
  
      if (count <= 288) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLIntBuffers[count-1];
        for (var i = 0; i < count; ++i) {
          view[i] = HEAP32[(((value)+(4*i))>>2)];
        }
      } else
      {
        var view = HEAP32.subarray((value)>>2,(value+count*4)>>2);
      }
      GLctx.uniform1iv(GL.uniforms[location], view);
    }

  function _glUniform4f(location, v0, v1, v2, v3) {
      GLctx.uniform4f(GL.uniforms[location], v0, v1, v2, v3);
    }

  function _glUniform4fv(location, count, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniform4fv(GL.uniforms[location], HEAPF32, value>>2, count*4);
        return;
      }
  
      if (count <= 72) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLFloatBuffers[4*count-1];
        // hoist the heap out of the loop for size and for pthreads+growth.
        var heap = HEAPF32;
        value >>= 2;
        for (var i = 0; i < 4 * count; i += 4) {
          var dst = value + i;
          view[i] = heap[dst];
          view[i + 1] = heap[dst + 1];
          view[i + 2] = heap[dst + 2];
          view[i + 3] = heap[dst + 3];
        }
      } else
      {
        var view = HEAPF32.subarray((value)>>2,(value+count*16)>>2);
      }
      GLctx.uniform4fv(GL.uniforms[location], view);
    }

  function _glUniformMatrix3fv(location, count, transpose, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniformMatrix3fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*9);
        return;
      }
  
      if (count <= 32) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLFloatBuffers[9*count-1];
        for (var i = 0; i < 9*count; i += 9) {
          view[i] = HEAPF32[(((value)+(4*i))>>2)];
          view[i+1] = HEAPF32[(((value)+(4*i+4))>>2)];
          view[i+2] = HEAPF32[(((value)+(4*i+8))>>2)];
          view[i+3] = HEAPF32[(((value)+(4*i+12))>>2)];
          view[i+4] = HEAPF32[(((value)+(4*i+16))>>2)];
          view[i+5] = HEAPF32[(((value)+(4*i+20))>>2)];
          view[i+6] = HEAPF32[(((value)+(4*i+24))>>2)];
          view[i+7] = HEAPF32[(((value)+(4*i+28))>>2)];
          view[i+8] = HEAPF32[(((value)+(4*i+32))>>2)];
        }
      } else
      {
        var view = HEAPF32.subarray((value)>>2,(value+count*36)>>2);
      }
      GLctx.uniformMatrix3fv(GL.uniforms[location], !!transpose, view);
    }

  function _glUniformMatrix4fv(location, count, transpose, value) {
  
  
      if (GL.currentContext.version >= 2) { // WebGL 2 provides new garbage-free entry points to call to WebGL. Use those always when possible.
        GLctx.uniformMatrix4fv(GL.uniforms[location], !!transpose, HEAPF32, value>>2, count*16);
        return;
      }
  
      if (count <= 18) {
        // avoid allocation when uploading few enough uniforms
        var view = __miniTempWebGLFloatBuffers[16*count-1];
        // hoist the heap out of the loop for size and for pthreads+growth.
        var heap = HEAPF32;
        value >>= 2;
        for (var i = 0; i < 16 * count; i += 16) {
          var dst = value + i;
          view[i] = heap[dst];
          view[i + 1] = heap[dst + 1];
          view[i + 2] = heap[dst + 2];
          view[i + 3] = heap[dst + 3];
          view[i + 4] = heap[dst + 4];
          view[i + 5] = heap[dst + 5];
          view[i + 6] = heap[dst + 6];
          view[i + 7] = heap[dst + 7];
          view[i + 8] = heap[dst + 8];
          view[i + 9] = heap[dst + 9];
          view[i + 10] = heap[dst + 10];
          view[i + 11] = heap[dst + 11];
          view[i + 12] = heap[dst + 12];
          view[i + 13] = heap[dst + 13];
          view[i + 14] = heap[dst + 14];
          view[i + 15] = heap[dst + 15];
        }
      } else
      {
        var view = HEAPF32.subarray((value)>>2,(value+count*64)>>2);
      }
      GLctx.uniformMatrix4fv(GL.uniforms[location], !!transpose, view);
    }

  function _glUseProgram(program) {
      GLctx.useProgram(GL.programs[program]);
    }

  function _glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
      GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr);
    }

  function _glViewport(x0, x1, x2, x3) { GLctx['viewport'](x0, x1, x2, x3) }

  function _js_html_audioCheckLoad(audioClipIdx) {
          var WORKING_ON_IT = 0;
          var SUCCESS = 1;
          var FAILED = 2;
  
          if (!this.audioContext || (audioClipIdx < 0) || (this.audioClips[audioClipIdx].loadingStatus == 4))
              return FAILED;        
          if (this.audioClips[audioClipIdx].loadingStatus == 0/*loading compressed*/)
              return WORKING_ON_IT;  
  
          return SUCCESS;
      }

  function _js_html_audioFree(audioClipIdx) {
          if (!this.audioContext || audioClipIdx < 0)
              return;
  
          var audioClip = this.audioClips[audioClipIdx];
          if (!audioClip || (audioClip.loadingStatus == 4/*error*/))
              return;
  
          // If the audio clip is still being played, then stop it.
          if (audioClip.refCount > 0) {
              for (var audioSourceIdx in this.audioSources) {
                  var sourceNode = this.audioSources[audioSourceIdx];
                  if (sourceNode && sourceNode.buffer === audioClip.uncompressedAudioBuffer)
                      sourceNode.stop();
              }
          }
  
          if (audioClip.loadingStatus == 3/*uncompressed loaded*/) {
              var uncompressedAudioBufferSize = audioClip.uncompressedAudioBuffer.length * audioClip.uncompressedAudioBuffer.numberOfChannels * 4;
              this.uncompressedAudioBufferBytes -= uncompressedAudioBufferSize;
              audioClip.refCount = 0;
              audioClip.uncompressedAudioBuffer = null;
          }
  
          if (audioClip.compressedAudioBuffer) {
              audioClip.compressedAudioBuffer = null;
          }
  
          delete this.audioClips[audioClipIdx];
      }

  function _js_html_audioIsPlaying(audioSourceIdx) {
          if (!this.audioContext || audioSourceIdx < 0)
              return false;
  
          if (this.audioSources[audioSourceIdx] == null)
              return false;
  
          return this.audioSources[audioSourceIdx].isPlaying;
      }

  function _js_html_audioIsUnlocked() {
          return this.unlockState == 2/*unlocked*/;
      }

  function _js_html_audioPause() {
          if (this.audioContext && this.audioContext.suspend) {
              this.audioContext.suspend();
          }
      }

  function _js_html_audioPlay(audioClipIdx, audioSourceIdx, volume, pitch, pan, loop) 
      {
          if (!this.audioContext || audioClipIdx < 0 || audioSourceIdx < 0)
              return false;
  
          if (this.audioContext.state !== 'running')
              return false;
  
          var self = this;
  
          // require compressed audio buffer to be loaded
          var audioClip = this.audioClips[audioClipIdx];
          if (!audioClip || (audioClip.loadingStatus == 4/*error*/))
              return false;
  
          if (audioClip.loadingStatus == 1/*compressed loaded*/) {
              audioClip.loadingStatus = 2/*decompressing*/;
  
              //console.log("Decompressing clip " + audioClipIdx);
  
              // Make a copy of the compressed audio data first. We aren't allowed to reuse the buffer we pass in since it will be handled asynchronously
              // on a different thread, even though we know we are only reading from it repeatedly.
              var audioBufferCompressedCopy = audioClip.compressedAudioBuffer.slice(0);
  
              var decodeStartTime = performance.now();
              self.audioContext.decodeAudioData(audioBufferCompressedCopy, function (buffer) {
                  //console.log("Decompressed clip " + audioClipIdx);
  
                  audioClip.loadingStatus = 3/*uncompressed loaded*/;
                  audioClip.uncompressedAudioBuffer = buffer;
                  audioClip.refCount = 0;
                  audioClip.lastPlayedTime = self.audioContext.currentTime;
                  self.uncompressedAudioBufferBytes += buffer.length * buffer.numberOfChannels * 4;
  
                  var decodeDurationMsecs = performance.now() - decodeStartTime;
                  var uncompressedSizeBytes = buffer.length * buffer.numberOfChannels * 4/*sizeof(float)*/;
                  if (uncompressedSizeBytes > 50*1024*1024 || decodeDurationMsecs > 250) {
                      console.warn('Decompression of audio clip ' + self.audioClips[audioClipIdx].url + ' caused a playback delay of ' + decodeDurationMsecs + ' msecs, and resulted in an uncompressed audio buffer size of ' + uncompressedSizeBytes + ' bytes!');
                  }
              });
          }
  
          if (audioClip.loadingStatus != 3)
              return false;
  
          //console.log("Playing clip " + audioClipIdx);
  
          // create audio source node
          var sourceNode = this.audioContext.createBufferSource();
          sourceNode.buffer = audioClip.uncompressedAudioBuffer;
          sourceNode.playbackRate.value = pitch;
  
          var panNode = this.audioContext.createPanner();
          panNode.panningModel = 'equalpower';
          sourceNode.panNode = panNode;
  
          var gainNode = this.audioContext.createGain();
          gainNode.buffer = audioClip.uncompressedAudioBuffer;
          sourceNode.gainNode = gainNode;
  
          sourceNode.connect(gainNode);
          sourceNode.gainNode.connect(panNode);
          sourceNode.panNode.connect(this.audioContext.destination);
  
          ut._HTML.audio_setGain(sourceNode, volume);
          ut._HTML.audio_setPan(sourceNode, pan);
  
          // loop value
          sourceNode.loop = loop;
  
          if (this.audioSources[audioSourceIdx])
              // stop audio source node if it is already playing
              this.audioSources[audioSourceIdx].stop();
              
          // store audio source node
          this.audioSources[audioSourceIdx] = sourceNode;
          
          // on ended event
          sourceNode.onended = function (event) {
              sourceNode.isPlaying = false;
  
              sourceNode.gainNode.disconnect();
              sourceNode.panNode.disconnect();
              sourceNode.disconnect();
  
              delete sourceNode.buffer;
  
               if (self.audioSources[audioSourceIdx] === sourceNode)
                  delete self.audioSources[audioSourceIdx];
  
              audioClip.refCount--;
              audioClip.lastPlayedTime = self.audioContext.currentTime;
          };
  
          // play audio source
          audioClip.lastPlayedTime = self.audioContext.currentTime;
          if (audioClip.refCount >= 1)
              audioClip.refCount++;
          else
              audioClip.refCount = 1;
  
          sourceNode.start();
          sourceNode.isPlaying = true;
  
          return true;
      }

  function _js_html_audioResume() {
          if (this.audioContext && this.audioContext.resume) {
              this.audioContext.resume();
          }
      }

  function _js_html_audioSetPan(audioSourceIdx, pan) {
          if (!this.audioContext || audioSourceIdx < 0)
              return false;
  
          // retrieve audio source node
          var sourceNode = this.audioSources[audioSourceIdx];
          if (!sourceNode)
              return false;
  
          ut._HTML.audio_setPan(sourceNode, pan);
          return true;
      }

  function _js_html_audioSetPitch(audioSourceIdx, pitch) {
          if (!this.audioContext || audioSourceIdx < 0)
              return false;
  
          // retrieve audio source node
          var sourceNode = this.audioSources[audioSourceIdx];
          if (!sourceNode)
              return false;
  
          sourceNode.playbackRate.value = pitch;
          return true;
      }

  function _js_html_audioSetVolume(audioSourceIdx, volume) {
          if (!this.audioContext || audioSourceIdx < 0)
              return false;
  
          // retrieve audio source node
          var sourceNode = this.audioSources[audioSourceIdx];
          if (!sourceNode)
              return false;
  
          ut._HTML.audio_setGain(sourceNode, volume);
          return true;
      }

  function _js_html_audioStartLoadFile(audioClipName, audioClipIdx) 
      {
          if (!this.audioContext || audioClipIdx < 0)
              return -1;
  
          audioClipName = UTF8ToString(audioClipName);
  
          var url = audioClipName;
          if (url.substring(0, 9) === "ut-asset:")
              url = UT_ASSETS[url.substring(9)];
  
          var self = this;
          var request = new XMLHttpRequest();
  
          self.audioClips[audioClipIdx] = {
              loadingStatus: 0/*loading compressed*/,
              url: url
          };
          
          //console.log("Start loading clip " + audioClipIdx);
          request.open('GET', url, true);
          request.responseType = 'arraybuffer';
          request.onload =
              function () {
                  self.audioClips[audioClipIdx].loadingStatus = 1/*loaded compressed*/;
                  self.audioClips[audioClipIdx].compressedAudioBuffer = request.response;
                  //console.log("Loaded clip " + audioClipIdx);
              };
          request.onerror =
              function () {
                  self.audioClips[audioClipIdx].loadingStatus = 4/*error*/;
              };
  
          try {
              request.send();
          } catch (e) {
              // LG Nexus 5 + Android OS 4.4.0 + Google Chrome 30.0.1599.105 browser
              // odd behavior: If loading from base64-encoded data URI and the
              // format is unsupported, request.send() will immediately throw and
              // not raise the failure at .onerror() handler. Therefore catch
              // failures also eagerly from .send() above.
              self.audioClips[audioClipIdx].loadingStatus = 4/*error*/;
          }
  
          return audioClipIdx;
      }

  function _js_html_audioStop(audioSourceIdx, dostop) {
          if (!this.audioContext || audioSourceIdx < 0)
              return false;
  
          // retrieve audio source node
          var sourceNode = this.audioSources[audioSourceIdx];
          if (!sourceNode)
              return false;
  
          // stop audio source
          if (sourceNode.isPlaying && dostop) {
              sourceNode.stop();
              sourceNode.isPlaying = false;
          }
  
          return true;
      }

  function _js_html_audioUnlock() {
          var self = this;
          if (self.unlockState >= 1/*unlocking or unlocked*/ || !self.audioContext ||
              typeof self.audioContext.resume !== 'function')
              return;
  
          // setup a touch start listener to attempt an unlock in
          document.addEventListener('click', ut._HTML.unlock, true);
          document.addEventListener('touchstart', ut._HTML.unlock, true);
          document.addEventListener('touchend', ut._HTML.unlock, true);
          document.addEventListener('keydown', ut._HTML.unlock, true);
          document.addEventListener('keyup', ut._HTML.unlock, true);
          // Record that we are now in the unlocking attempt stage so that the above event listeners
          // will not be attempted to be registered again.
          self.unlockState = 1/*unlocking*/;
      }

  function _js_html_audioUpdate() {
          // To truly implement least-recently played, we would walk the list of sounds once for each sound we unload. Instead, to be more
          // efficient CPU-wise, we will just walk the list twice. 
  
          // Pass #1. Unload all sounds that have not been playing in notRecentlyUsedRefCount frames (a long time). In addition, on this first pass,
          // we'll also unload any really large sounds that aren't currently playing.
          var notRecentlyPlayedSeconds = 15.0;
          var largeAudioAssetSize = 4*1024*1024;
          var currentTime = this.audioContext.currentTime;
          for (var audioClipIdx in this.audioClips) {
              if (this.uncompressedAudioBufferBytes <= this.uncompressedAudioBufferBytesMax)
                  break;
  
              var audioClip = this.audioClips[audioClipIdx];
              if (audioClip && (audioClip.loadingStatus == 3/*uncompressed loaded*/))
              {
                  var notPlaying = audioClip.refCount <= 0;
                  var notRecentlyPlayed = (currentTime - audioClip.lastPlayedTime >= notRecentlyPlayedSeconds);
                  var uncompressedAudioBufferSize = audioClip.uncompressedAudioBuffer.length * audioClip.uncompressedAudioBuffer.numberOfChannels * 4;
                  var largeAudioAsset = uncompressedAudioBufferSize >= largeAudioAssetSize;
  
                  if (notPlaying && (notRecentlyPlayed || largeAudioAsset)) {   
                      this.uncompressedAudioBufferBytes -= uncompressedAudioBufferSize;
                      audioClip.loadingStatus = 1/*compressed loaded*/;
                      audioClip.refCount = 0;
                      audioClip.uncompressedAudioBuffer = null;
                      //console.log("Unloading clip " + audioClipIdx);
                  }
              }
          }
  
          // Pass #2. Unload any unused sounds until we get down to our audio memory budget (uncompressedAudioBufferBytesMax).
          for (var audioClipIdx in this.audioClips) {
              if (this.uncompressedAudioBufferBytes <= this.uncompressedAudioBufferBytesMax)
                  break;
  
              var audioClip = this.audioClips[audioClipIdx];
              if (audioClip && (audioClip.loadingStatus == 3/*uncompressed loaded*/) && (audioClip.refCount <= 0))
              {
                  var uncompressedAudioBufferSize = audioClip.uncompressedAudioBuffer.length * audioClip.uncompressedAudioBuffer.numberOfChannels * 4;
  
                  this.uncompressedAudioBufferBytes -= uncompressedAudioBufferSize;
                  audioClip.loadingStatus = 1/*compressed loaded*/;
                  audioClip.refCount = 0;
                  audioClip.uncompressedAudioBuffer = null;
                  //console.log("Unloading clip " + audioClipIdx);
              }
          }
      }

  function _js_html_checkLoadImage(idx) {
      var img = ut._HTML.images[idx];
  
      if ( img.loaderror ) {
        return 2;
      }
  
      if (img.image) {
        if (!img.image.complete || !img.image.naturalWidth || !img.image.naturalHeight)
          return 0; // null - not yet loaded
      }
  
      if (img.mask) {
        if (!img.mask.complete || !img.mask.naturalWidth || !img.mask.naturalHeight)
          return 0; // null - not yet loaded
      }
  
      return 1; // ok
    }

  function _js_html_finishLoadImage(idx, wPtr, hPtr, alphaPtr) {
      var img = ut._HTML.images[idx];
      // check three combinations of mask and image
      if (img.image && img.mask) { // image and mask, merge mask into image 
        var width = img.image.naturalWidth;
        var height = img.image.naturalHeight;
        var maskwidth = img.mask.naturalWidth;
        var maskheight = img.mask.naturalHeight;
  
        // construct the final image
        var cvscolor = document.createElement('canvas');
        cvscolor.width = width;
        cvscolor.height = height;
        var cxcolor = cvscolor.getContext('2d');
        cxcolor.globalCompositeOperation = 'copy';
        cxcolor.drawImage(img.image, 0, 0);
  
        var cvsalpha = document.createElement('canvas');
        cvsalpha.width = width;
        cvsalpha.height = height;
        var cxalpha = cvsalpha.getContext('2d');
        cxalpha.globalCompositeOperation = 'copy';
        cxalpha.drawImage(img.mask, 0, 0, width, height);
  
        var colorBits = cxcolor.getImageData(0, 0, width, height);
        var alphaBits = cxalpha.getImageData(0, 0, width, height);
        var cdata = colorBits.data, adata = alphaBits.data;
        var sz = width * height;
        for (var i = 0; i < sz; i++)
          cdata[(i<<2) + 3] = adata[i<<2];
        cxcolor.putImageData(colorBits, 0, 0);
  
        img.image = cvscolor;
        img.image.naturalWidth = width;
        img.image.naturalHeight = height; 
        img.hasAlpha = true; 
      } else if (!img.image && img.mask) { // mask only, create image
        var width = img.mask.naturalWidth;
        var height = img.mask.naturalHeight;
  
        // construct the final image: copy R to all channels 
        var cvscolor = document.createElement('canvas');
        cvscolor.width = width;
        cvscolor.height = height;
        var cxcolor = cvscolor.getContext('2d');
        cxcolor.globalCompositeOperation = 'copy';
        cxcolor.drawImage(img.mask, 0, 0);
  
        var colorBits = cxcolor.getImageData(0, 0, width, height);
        var cdata = colorBits.data;
        var sz = width * height;
        for (var i = 0; i < sz; i++) {
          cdata[(i<<2) + 1] = cdata[i<<2];
          cdata[(i<<2) + 2] = cdata[i<<2];
          cdata[(i<<2) + 3] = cdata[i<<2];
        }
        cxcolor.putImageData(colorBits, 0, 0);
  
        img.image = cvscolor;
        img.image.naturalWidth = width;
        img.image.naturalHeight = height; 
        img.hasAlpha = true; 
      } // else img.image only, nothing else to do here
  
      // done, return valid size and hasAlpha
      HEAP32[wPtr>>2] = img.image.naturalWidth;
      HEAP32[hPtr>>2] = img.image.naturalHeight;
      HEAP32[alphaPtr>>2] = img.hasAlpha;
    }

  function _js_html_freeImage(idx) {
      ut._HTML.images[idx] = null;
    }

  function _js_html_getCanvasSize(wPtr, hPtr) {
      var html = ut._HTML;
      var bounds = html.canvasElement.getBoundingClientRect();
      HEAP32[wPtr>>2] = bounds.width;
      HEAP32[hPtr>>2] = bounds.height;
    }

  function _js_html_getDPIScale() {
      return window.devicePixelRatio || 1;
    }

  function _js_html_getFrameSize(wPtr, hPtr) {
      HEAP32[wPtr>>2] = window.innerWidth | 0;
      HEAP32[hPtr>>2] = window.innerHeight | 0;
    }

  function _js_html_getScreenSize(wPtr, hPtr) {
      HEAP32[wPtr>>2] = screen.width | 0;
      HEAP32[hPtr>>2] = screen.height | 0;
    }

  function _js_html_imageToMemory(idx, w, h, dest) {
      // TODO: there could be a fast(ish) path for webgl to get gl to directly write to
      // dest when reading from render targets
      var cvs = ut._HTML.readyCanvasForReadback(idx,w,h);
      if (!cvs)
        return 0;
      var cx = cvs.getContext('2d');
      var imd = cx.getImageData(0, 0, w, h);
      HEAPU8.set(imd.data,dest);
      return 1;
    }

  function _js_html_init() {
      ut = ut || {};
      ut._HTML = ut._HTML || {};
  
      var html = ut._HTML;
      html.visible = true;
      html.focused = true;
    }

  function _js_html_initAudio() {
          
          ut = ut || {};
          ut._HTML = ut._HTML || {};
  
          ut._HTML.audio_setGain = function(sourceNode, volume) {
              sourceNode.gainNode.gain.value = volume;
          };
          
          ut._HTML.audio_setPan = function(sourceNode, pan) {
              sourceNode.panNode.setPosition(pan, 0, 1 - Math.abs(pan));
          };
  
          ut._HTML.audio_isSafari = function() {
              var isChrome = window.navigator.userAgent.indexOf("Chrome") > -1;
              var isSafari = !isChrome && (window.navigator.userAgent.indexOf("Safari") > -1);
              return isSafari;
          };
  
          ut._HTML.unlock = function() {
              // call this method on touch start to create and play a buffer, then check
              // if the audio actually played to determine if audio has now been
              // unlocked on iOS, Android, etc.
              if (!self.audioContext || self.unlockState == 2/*unlocked*/)
                  return;
  
              function unlocked() {
                  // update the unlocked state and prevent this check from happening
                  // again
                  self.unlockState = 2/*unlocked*/;
                  delete self.unlockBuffer;
                  //console.log("[Audio] unlocked");
  
                  // remove the touch start listener
                  document.removeEventListener('click', ut._HTML.unlock, true);
                  document.removeEventListener('touchstart', ut._HTML.unlock, true);
                  document.removeEventListener('touchend', ut._HTML.unlock, true);
                  document.removeEventListener('keydown', ut._HTML.unlock, true);
                  document.removeEventListener('keyup', ut._HTML.unlock, true);
              }
  
              // If AudioContext is already enabled, no need to unlock again
              if (self.audioContext.state === 'running') {
                  unlocked();
                  return;
              }
  
              // fix Android can not play in suspend state
              if (self.audioContext.resume) self.audioContext.resume();
  
              // create an empty buffer for unlocking
              if (!self.unlockBuffer) {
                  self.unlockBuffer = self.audioContext.createBuffer(1, 1, 22050);
              }
  
              // and a source for the empty buffer
              var source = self.audioContext.createBufferSource();
              source.buffer = self.unlockBuffer;
              source.connect(self.audioContext.destination);
  
              // play the empty buffer
              if (typeof source.start === 'undefined') {
                  source.noteOn(0);
              } else {
                  source.start(0);
              }
  
              // calling resume() on a stack initiated by user gesture is what
              // actually unlocks the audio on Android Chrome >= 55
              if (self.audioContext.resume) self.audioContext.resume();
  
              // setup a timeout to check that we are unlocked on the next event
              // loop
              source.onended = function () {
                  source.disconnect(0);
                  unlocked();
              };
          };
  
          // audio initialization
          if (!window.AudioContext && !window.webkitAudioContext)
              return false;
  
          var audioContext =
              new (window.AudioContext || window.webkitAudioContext)();
          if (!audioContext)
              return false;
          audioContext.listener.setPosition(0, 0, 0);
  
          this.audioContext = audioContext;
          this.audioClips = {};
          this.audioSources = {};
          this.compressedAudioBufferBytes = 0;
          this.uncompressedAudioBufferBytes = 0;
          this.uncompressedAudioBufferBytesMax = 50*1024*1024;
  
          // try to unlock audio
          this.unlockState = 0/*locked*/;
          var navigator = (typeof window !== 'undefined' && window.navigator)
              ? window.navigator
              : null;
          var isMobile = /iPhone|iPad|iPod|Android|BlackBerry|BB10|Silk|Mobi/i.test(
              navigator && navigator.userAgent);
          var isTouch = !!(isMobile ||
              (navigator && navigator.maxTouchPoints > 0) ||
              (navigator && navigator.msMaxTouchPoints > 0));
          var isMobileSafari = isMobile && ut._HTML.audio_isSafari();
  
          if (this.audioContext.state !== 'running' || isMobile || isTouch) {
              ut._HTML.unlock();
          } else {
              this.unlockState = 2/*unlocked*/;
          }
  
          if (!isMobileSafari)
          {
              document.addEventListener('visibilitychange', function() {
                  if ((document.visibilityState === 'visible') && audioContext.resume)
                      audioContext.resume();
                  else if ((document.visibilityState !== 'visible') && audioContext.suspend)
                      audioContext.suspend();
              }, true);
          }
  
          //console.log("[Audio] initialized " + (["locked", "unlocking", "unlocked"][this.unlockState]));
          return true;
      }

  function _js_html_initImageLoading() {
      ut = ut || {};
      ut._HTML = ut._HTML || {};
  
      ut._HTML.images = [null];             // referenced by drawable, direct index to loaded image. maps 1:1 to Image2D component
                                      // { image, mask, loaderror, hasAlpha}
      ut._HTML.tintedSprites = [null];      // referenced by drawable, sub-sprite with colorization
                                      // { image, pattern }
      ut._HTML.tintedSpritesFreeList = [];
  
      // local helper functions
      ut._HTML.initImage = function(idx ) {
        ut._HTML.images[idx] = {
          image: null,
          mask: null,
          loaderror: false,
          hasAlpha: true,
          glTexture: null,
          glDisableSmoothing: false
        };
      };
  
      ut._HTML.ensureImageIsReadable = function (idx, w, h) {
        if (ut._HTML.canvasMode == 'webgl2' || ut._HTML.canvasMode == 'webgl') {
          var gl = ut._HTML.canvasContext;
          if (ut._HTML.images[idx].isrt) { // need to readback
            if (!ut._HTML.images[idx].glTexture)
              return false;
            // create fbo, read back bytes, write to image pixels
            var pixels = new Uint8Array(w*h*4);
            var fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ut._HTML.images[idx].glTexture, 0);
            gl.viewport(0,0,w,h);
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)==gl.FRAMEBUFFER_COMPLETE) {
              gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            } else {
              console.log("Warning, can not read back from WebGL framebuffer.");
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
              gl.deleteFramebuffer(fbo);
              return false;
            }
            // restore default fbo
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.deleteFramebuffer(fbo);
            // put pixels onto an image
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            var cx = canvas.getContext('2d');
            var imd = cx.createImageData(w, h);
            imd.data.set(pixels);
            cx.putImageData(imd,0,0);
            ut._HTML.images[idx].image = canvas;
            return true;
          }
        }
        if (ut._HTML.images[idx].isrt)
          return ut._HTML.images[idx].image && ut._HTML.images[idx].width==w && ut._HTML.images[idx].height==h;
        else
          return ut._HTML.images[idx].image && ut._HTML.images[idx].image.naturalWidth===w && ut._HTML.images[idx].image.naturalHeight===h;
      };
  
      ut._HTML.readyCanvasForReadback = function (idx, w, h) {
        if (!ut._HTML.ensureImageIsReadable(idx,w,h)) 
          return null;
        if (ut._HTML.images[idx].image instanceof HTMLCanvasElement) {
          // directly use canvas if the image is already a canvas (RTT case)
          return ut._HTML.images[idx].image;
        } else {
          // otherwise copy to a temp canvas
          var cvs = document.createElement('canvas');
          cvs.width = w;
          cvs.height = h;
          var cx = cvs.getContext('2d');
          var srcimg = ut._HTML.images[idx].image;
          cx.globalCompositeOperation = 'copy';
          cx.drawImage(srcimg, 0, 0, w, h);
          return cvs;
        }
      };
      
      ut._HTML.loadImage = function(idx, image, isMask) {
          var img = new Image();
          if(isMask)
              ut._HTML.images[idx].mask = img;
          else
              ut._HTML.images[idx].image = img;
          ut._HTML.images[idx].hasAlpha = true; // if we support jpeg this should be false
          img.onerror = function() {
            if(!isMask)
            {
              //Failed to load with the Image API, maybe it is a webp image, let's try to decode it first (:Safari case)
              if(!ut._HTML.loadWebPFallback(image, idx))
                  ut._HTML.images[idx].loaderror = true;
            }
            else
              ut._HTML.images[idx].loaderror = true;
          };
          img.src = image;
      }
  
      ut._HTML.loadWebPFallback = function(url, idx) {
        function decode_base64(base64) {
          var size = base64.length;
          while (base64.charCodeAt(size - 1) == 0x3D)
            size--;
          var data = new Uint8Array(size * 3 >> 2);
          for (var c, cPrev = 0, s = 6, d = 0, b = 0; b < size; cPrev = c, s = s + 2 & 7) {
            c = base64.charCodeAt(b++);
            c = c >= 0x61 ? c - 0x47 : c >= 0x41 ? c - 0x41 : c >= 0x30 ? c + 4 : c == 0x2F ? 0x3F : 0x3E;
            if (s < 6)
              data[d++] = cPrev << 2 + s | c >> 4 - s;
          }
          return data;
        }
         
        if(!document.createElement("canvas").toDataURL("image/webp").lastIndexOf("data:image/webp",0))
          return false; // webp is natively supported by the browser
          
        if (!(typeof WebPDecoder == "object"))
          return false; // no webp fallback installed, let it fail on it's own
  
        var webpCanvas;
        var webpPrefix = "data:image/webp;base64,";
        if (!url.lastIndexOf(webpPrefix, 0)) { // data url 
          webpCanvas = document.createElement("canvas");
          WebPDecoder.decode(decode_base64(url.substring(webpPrefix.length)), webpCanvas);
          ut._HTML.initImage(idx);
          ut._HTML.images[idx].image = webpCanvas;
          return true;
        }
  
        webpCanvas = document.createElement("canvas");
        webpCanvas.naturalWidth = 0;
        webpCanvas.naturalHeight = 0;
        webpCanvas.complete = false;
        ut._HTML.initImage(idx);
        ut._HTML.images[idx].image = webpCanvas;
        var webpRequest = new XMLHttpRequest();
        webpRequest.responseType = "arraybuffer";
        webpRequest.open("GET", url);
        webpRequest.onerror = function () {
          ut._HTML.images[idx].loaderror = true;
        };
        webpRequest.onload = function () {
          WebPDecoder.decode(new Uint8Array(webpRequest.response), webpCanvas);
       };
        webpRequest.send();
        return true;
      };
    }

  function _js_html_loadImage(colorName, maskName) {
      colorName = colorName ? UTF8ToString(colorName) : null;
      maskName = maskName ? UTF8ToString(maskName) : null;
  
      // rewrite some special urls 
      if (colorName == "::white1x1") {
        colorName = "data:image/gif;base64,R0lGODlhAQABAIAAAP7//wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
      } else if (colorName && colorName.substring(0, 9) == "ut-asset:") {
        colorName = UT_ASSETS[colorName.substring(9)];
      }
      if (maskName && maskName.substring(0, 9) == "ut-asset:") {
        maskName = UT_ASSETS[maskName.substring(9)];
      }
  
      // grab first free index
      var idx;
      for (var i = 1; i <= ut._HTML.images.length; i++) {
        if (!ut._HTML.images[i]) {
          idx = i;
          break;
        }
      }
      ut._HTML.initImage(idx);
  
      // start actual load
      if (colorName) {
        ut._HTML.loadImage(idx, colorName, false);
      }
  
      if (maskName) {
        ut._HTML.loadImage(idx, maskName, true);
      }
  
      return idx; 
    }

  function _js_html_playerconnectionConnect(address) {
          var stringAddress = UTF8ToString(address);
  
          if (typeof location === 'object' && location.search && typeof URLSearchParams === 'function')
          {
              var params = new URLSearchParams(location.search);
              if (params.has("unityPlayerConnection"))
                  stringAddress = params.get("unityPlayerConnection");
          }
  
          if (!stringAddress)
              return;
  
          this.ws = new WebSocket(stringAddress, "binary");
          this.ws.binaryType = "arraybuffer";
          
          this.pcStateConnecting = true;
  
          this.ws.onopen = function() {
              console.log("WebGL Player Connection opened");
              self.pcStateConnected = true;
              self.pcStateConnecting = false;
          };
          
          this.ws.onmessage = function(e) {
              var data8 = new Uint8Array(e.data);
  
              // Allocate larger buffer for larger data
              if (self.pcBufferSize < self.pcBufferPosW + data8.length) {
                  var oldBuffer = self.pcBuffer;
                  while (self.pcBufferSize < self.pcBufferPosW + data8.length)
                      self.pcBufferSize *= 2;
                  
                  this.pcBuffer = _unsafeutility_malloc(this.pcBufferSize, 0, 0, 4);
                  HEAP8.set(HEAP8.subarray(oldBuffer, oldBuffer + self.pcBufferPosW), self.pcBuffer);                
                  _unsafeutility_free(oldBuffer, 4);
              }
  
              HEAP8.set(data8, self.pcBuffer + self.pcBufferPosW);
              self.pcBufferPosW += data8.length;
          };
          
          this.ws.onclose = function() {
              if (self.pcStateConnected)
                  console.log("WebGL Player Connection closed");
              self.ws.onopen = null;
              self.ws.onmessage = null;
              self.ws.onclose = null;
              delete this.ws;
              self.pcStateConnected = false;
              self.pcStateConnecting = false;
          };
      }

  function _js_html_playerconnectionDisconnect() {
          ut._HTML.pc_disconnect();
      }

  function _js_html_playerconnectionIsConnecting() {
          return this.pcStateConnecting ? 1 : 0;
      }

  function _js_html_playerconnectionLostConnection() {
          return (!this.pcStateConnecting && this.ws && this.ws.readyState == 1 && !ut._HTML.pc_isConnected()) ? 1 : 0;
      }

  function _js_html_playerconnectionPlatformInit() {
          ut = ut || {};
          ut._HTML = ut._HTML || {};
  
          ut._HTML.pc_isConnected = function() {
              return self.pcStateConnected || false;
          };
          
          ut._HTML.pc_disconnect = function() {
              if (!self.ws)
                  return;
              self.ws.onopen = null;
              self.ws.onmessage = null;
              self.ws.onclose = null;
              self.ws.close();
              if (self.pcStateConnected)
                  console.log("WebGL Player Connection disconnected");
              delete self.ws;
  
              self.pcStateConnected = false;
              self.pcStateConnecting = false;
              self.pcBufferPosW = 0;
              self.pcBufferPosR = 0;
          };
          
          this.pcBufferSize = 65536;   // max websocket buffer size
  		this.pcBufferPosW = 0;
          this.pcBufferPosR = 0;
          this.pcStateConnected = false;
          this.pcStateConnecting = false;
  
          // sizeLow32, sizeHigh32, alignment, allocator (4 = persistent)
          this.pcBuffer = _unsafeutility_malloc(this.pcBufferSize, 0, 0, 4);
      }

  function _js_html_playerconnectionPlatformShutdown() {
          ut._HTML.pc_disconnect();
          _unsafeutility_free(this.pcBuffer, 4);
      }

  function _js_html_playerconnectionReceive(outBuffer, reqBytes) {
          if (this.pcStateConnecting)
              return 0;
          if (!ut._HTML.pc_isConnected())
              return 0xffffffff;
  
          // This should happen on the last read to indicate we are done grabbing data from web sockets
          if (this.pcBufferPosR == this.pcBufferPosW) {
              this.pcBufferPosR = 0;
              this.pcBufferPosW = 0;
              return 0;
          }
  
          var outBytes = reqBytes;
          var dataAvail = this.pcBufferPosW - this.pcBufferPosR;
          if (dataAvail < outBytes)
              outBytes = dataAvail;
  
          HEAP8.set(HEAP8.subarray(this.pcBuffer + this.pcBufferPosR, this.pcBuffer + this.pcBufferPosR + outBytes), outBuffer);
          
          this.pcBufferPosR += outBytes;
  
  		return outBytes;
      }

  function _js_html_playerconnectionSend(data, size) {
          if (this.pcStateConnecting)
              return 0;
  
          // readyState 1 is OPEN i.e. ready
          if (this.ws && this.ws.readyState == 1) {
              this.ws.send(HEAPU8.subarray(data, data + size));
          }
  
          // Error if:
          // - not initialized
          // - not connected
          // - connected but send caused buffer overflow resulting in WebSocket auto-disconnect
          if (!ut._HTML.pc_isConnected())
              return 0xffffffff;
  
          // If successful, exactly this size was added to WebSocket internal buffering
          return size;
      }

  function _js_html_setCanvasSize(width, height, fbwidth, fbheight) {
      if (!width>0 || !height>0)
          throw "Bad canvas size at init.";
      var canvas = ut._HTML.canvasElement;
      if (!canvas) {
        // take possible user element
        canvas = document.getElementById("UT_CANVAS");
      }
      if (!canvas) {
        // Note -- if you change this here, make sure you also update
        // tiny_shell.html, which is where the default actually lives
        canvas = document.createElement("canvas");
        canvas.setAttribute("id", "UT_CANVAS");
        canvas.setAttribute("tabindex", "1");
        canvas.style.touchAction = "none";
        if (document.body) {
          document.body.style.margin = "0px";
          document.body.style.border = "0";
          document.body.style.overflow = "hidden"; // disable scrollbars
          document.body.style.display = "block";   // no floating content on sides
          document.body.insertBefore(canvas, document.body.firstChild);
        } else {
          document.documentElement.appendChild(canvas);
        }
      }
  
      ut._HTML.canvasElement = canvas;
  
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      canvas.width = fbwidth || width;
      canvas.height = fbheight || height;
  
      ut._HTML.canvasMode = 'bgfx';
  
      if (!canvas.tiny_initialized) {
        canvas.addEventListener("webglcontextlost", function(event) { event.preventDefault(); }, false);
        canvas.focus();
        canvas.tiny_initialized = true;
      }
  
      if (!window.tiny_initialized) {
        window.addEventListener("focus", function (event) {
          ut._HTML.focus = true;
        });
        window.addEventListener("blur", function (event) {
          ut._HTML.focus = false;
        });
        window.addEventListener("beforeunload", function (event) { 
          _ondestroyapp();
          
          // Guarantees the browser unload will happen as expected
          delete event['returnValue']; 
        });
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible')
            _onpauseapp(0);
          else if (document.visibilityState !== 'visible')
            _onpauseapp(1);
        });
  
        window.tiny_initialized = true;
      }
  
      return true;
    }

  function _js_html_validateWebGLContextFeatures(requireSrgb) {
      if (requireSrgb && GL.currentContext.version == 1 && !GLctx.getExtension('EXT_sRGB')) {
        fatal('WebGL implementation in current browser does not support sRGB rendering (No EXT_sRGB or WebGL 2), but sRGB is required by this page!');
      }
    }

  function _js_inputGetCanvasLost() {
          // need to reset all input state in case the canvas element changed and re-init input
          var inp = ut._HTML.input;
          var canvas = ut._HTML.canvasElement;    
          return canvas != inp.canvas; 
      }

  function _js_inputGetFocusLost() {
          var inp = ut._HTML.input;
          // need to reset all input state in that case
          if ( inp.focusLost ) {
              inp.focusLost = false; 
              return true; 
          }
          return false;
      }

  function _js_inputGetKeyStream(maxLen,destPtr) {
          var inp = ut._HTML.input;
          return inp.getStream(inp.keyStream,maxLen,destPtr);            
      }

  function _js_inputGetMouseStream(maxLen,destPtr) {
          var inp = ut._HTML.input;
          return inp.getStream(inp.mouseStream,maxLen,destPtr);
      }

  function _js_inputGetTouchStream(maxLen,destPtr) {
          var inp = ut._HTML.input;
          return inp.getStream(inp.touchStream,maxLen,destPtr);        
      }

  function _js_inputGetWheelStream(maxLen,destPtr) {
          var inp = ut._HTML.input;
          return inp.getStream(inp.wheelStream,maxLen,destPtr);
      }

  function _js_inputInit() {
          ut._HTML = ut._HTML || {};
          ut._HTML.input = {}; // reset input object, reinit on canvas change
          var inp = ut._HTML.input; 
          var canvas = ut._HTML.canvasElement;
          
          if (!canvas) 
              return false;
          
          // pointer lock object forking for cross browser
          canvas.requestPointerLock = canvas.requestPointerLock ||
                                      canvas.mozRequestPointerLock;
          document.exitPointerLock = document.exitPointerLock ||
                                     document.mozExitPointerLock;
  
          // Calculate the pixelRatio rather than get it from window.devicePixelRatio,
          // for when custom pixel ratios are supported.
          function getPixelRatio() {
              var rect = inp.canvas.getBoundingClientRect();
              return inp.canvas.width / rect.width;
          }
          
          inp.getStream = function(stream,maxLen,destPtr) {
              destPtr>>=2;
              var l = stream.length;
              if ( l>maxLen ) l = maxLen;
              for ( var i=0; i<l; i++ )
                  HEAP32[destPtr+i] = stream[i];
              return l;
          };
     
          inp.updateCursor = function(fromMouseEvent) {
              if (ut.inpActiveMouseMode == ut.inpSavedMouseMode)
                  return;
          
              var canvas = ut._HTML.canvasElement;
              var hasPointerLock = (document.pointerLockElement === canvas ||
                  document.mozPointerLockElement === canvas);
  
              if (ut.inpSavedMouseMode == 0) {
                  // normal
                  document.body.style.cursor = 'auto';
                  if (hasPointerLock)
                      document.exitPointerLock();
                  ut.inpActiveMouseMode = 0;
              }
              else if (ut.inpSavedMouseMode == 1) {
                  // hidden
                  document.body.style.cursor = 'none';
                  if (hasPointerLock)
                      document.exitPointerLock();
                  ut.inpActiveMouseMode = 1;
              }
              else {
                  if (!hasPointerLock && fromMouseEvent) {
                      // locked + hidden
                      canvas.requestPointerLock();
                  }
                  
                  // ut.inpActiveMouseMode won't change until (and if) locking is successful
              }
          };
     
          inp.mouseEventFn = function(ev) {
              // Try restoring the cursor lock on mouse down, if it's stil required.
              // Browsers may drop the lock on ESC, minimize, task switch, etc.
              if (ut.inpSavedMouseMode != ut.inpActiveMouseMode && ev.type == "mousedown") {
                  ut._HTML.input.updateCursor(true);
              }
  
              TinyEventManager.dispatchEvent(ev);
  
              var inp = ut._HTML.input;
              var eventType;
              var buttons = 0;
              if (ev.type == "mouseup") { eventType = 0; buttons = ev.button; }
              else if (ev.type == "mousedown") { eventType = 1; buttons = ev.button; }
              else if (ev.type == "mousemove") { eventType = 2; }
              else return;
              var pixelRatio = getPixelRatio();
              var x = Math.round(ev.clientX * pixelRatio) | 0;
              var y = Math.round((ev.target.clientHeight - 1 - ev.clientY) * pixelRatio) | 0;
              var dx = Math.round(ev.movementX * pixelRatio) | 0;
              var dy = Math.round(ev.movementY * pixelRatio) | 0;
              inp.mouseStream.push(eventType|0);
              inp.mouseStream.push(buttons|0);
              inp.mouseStream.push(x);
              inp.mouseStream.push(y);
              inp.mouseStream.push(dx);
              inp.mouseStream.push(dy);
              ev.preventDefault(); 
              ev.stopPropagation();
          };
  
          // It appears that the scale of scroll wheel input values varies greatly across
          // browsers, different versions of the same browser, OSes and input devices.
          // Trying the approach proposed here to normalize input values:
          // http://jsbin.com/toyaqegumu/edit?html,css,js,output
          var normalizeWheelDelta = function() {
              // Keep a distribution of observed values, and scale by the
              // 33rd percentile.
              var distribution = [];
              var done = null;
              var scale = 1;
              return function(n) {
                // Zeroes don't count.
                if (n == 0) return n;
                // After 500 samples, we stop sampling and keep current factor.
                if (done !== null) return n * done;
                var abs = Math.abs(n);
                // Insert value (sorted in ascending order).
                outer: do { // Just used for break goto
                  for (var i = 0; i < distribution.length; ++i) {
                    if (abs <= distribution[i]) {
                      distribution.splice(i, 0, abs);
                      break outer;
                    }
                  }
                  distribution.push(abs);
                } while (false);
                // Factor is scale divided by 33rd percentile.
                var factor = scale / distribution[Math.floor(distribution.length / 3)];
                if (distribution.length == 500) done = factor;
                return n * factor;
              };
          }();
  
          inp.wheelEventFn = function(ev) {
              TinyEventManager.dispatchEvent(ev);
              var dx = ev.deltaX;
              var dy = ev.deltaY;
              if (dx) {
                  var ndx = Math.round(normalizeWheelDelta(dx));
                  if (!ndx) ndx = dx > 0 ? 1 : -1;
                  dx = ndx;
              }
              if (dy) {
                  var ndy = Math.round(normalizeWheelDelta(dy));
                  if (!ndy) ndy = dy > 0 ? 1 : -1;
                  dy = ndy;
              }
              inp.wheelStream.push(dx|0);
              inp.wheelStream.push(dy|0);
              ev.preventDefault();
              ev.stopPropagation();
          };
          
          inp.touchEventFn = function(ev) {
              TinyEventManager.dispatchEvent(ev);
              var inp = ut._HTML.input;
              var eventType, x, y, touch, touches = ev.changedTouches;
              var buttons = 0;
              if (ev.type == "touchstart") eventType = 1;
              else if (ev.type == "touchend") eventType = 0;
              else if (ev.type == "touchcancel") eventType = 3;
              else eventType = 2;
              var pixelRatio = getPixelRatio();
              for (var i = 0; i < touches.length; ++i) {
                  var t = touches[i];
                  x = Math.round(t.clientX * pixelRatio) | 0;
                  y = Math.round((t.target.clientHeight - 1 - t.clientY) * pixelRatio) | 0;
                  inp.touchStream.push(eventType|0);
                  inp.touchStream.push(t.identifier|0);
                  inp.touchStream.push(x);
                  inp.touchStream.push(y);
              }
              ev.preventDefault();
              ev.stopPropagation();
          };       
  
          inp.keyEventFn = function(ev) {
              TinyEventManager.dispatchEvent(ev);
              var eventType;
              if (ev.type == "keydown") eventType = 1;
              else if (ev.type == "keyup") eventType = 0;
              else return;
              inp.keyStream.push(eventType|0);
              inp.keyStream.push(ev.keyCode|0);
              inp.keyStream.push(ev.location|0);
          };        
  
          inp.clickEventFn = function() {
              // ensures we can regain focus if focus is lost
              this.focus();
              inp.updateCursor();
          };        
  
          inp.focusoutEventFn = function() {
              var inp = ut._HTML.input;
              inp.focusLost = true;
              ut.inpActiveMouseMode = 0;
          };
          
          inp.cursorLockChangeFn = function() {
              var canvas = ut._HTML.canvasElement;
              if (document.pointerLockElement === canvas ||
                  document.mozPointerLockElement === canvas) 
              {
                  // locked successfully
                  ut.inpActiveMouseMode = 2;
              }
              else
              {
                  // unlocked
                  if (ut.inpActiveMouseMode === 2)
                      ut.inpActiveMouseMode = 0;
              }
          };
  
          inp.mouseStream = [];
          inp.wheelStream = [];
          inp.keyStream = [];  
          inp.touchStream = [];
          inp.canvas = canvas; 
          inp.focusLost = false;
          ut.inpSavedMouseMode = ut.inpSavedMouseMode || 0; // user may have set prior to init
          ut.inpActiveMouseMode = ut.inpActiveMouseMode || 0;        
          
          // @TODO: handle multitouch
          // Pointer events get delivered on Android Chrome with pageX/pageY
          // in a coordinate system that I can't figure out.  So don't use
          // them at all.
          //events["pointerdown"] = events["pointerup"] = events["pointermove"] = html.pointerEventFn;
          var events = {}
          events["keydown"] = inp.keyEventFn;
          events["keyup"] = inp.keyEventFn;        
          events["touchstart"] = events["touchend"] = events["touchmove"] = events["touchcancel"] = inp.touchEventFn;
          events["mousedown"] = events["mouseup"] = events["mousemove"] = inp.mouseEventFn;
          events["wheel"] = inp.wheelEventFn;
          events["focusout"] = inp.focusoutEventFn;
          events["click"] = inp.clickEventFn;
  
          for (var ev in events)
              canvas.addEventListener(ev, events[ev]);
                 
          document.addEventListener('pointerlockchange', inp.cursorLockChangeFn);
          document.addEventListener('mozpointerlockchange', inp.cursorLockChangeFn);
          // Detect when the user changes apps/browser tabs on iOS, to reset the touch events.
          document.addEventListener("visibilitychange", inp.focusoutEventFn);
  
          return true;   
      }

  function _js_inputResetStreams(maxLen,destPtr) {
          var inp = ut._HTML.input;
          inp.mouseStream.length = 0;
          inp.wheelStream.length = 0;
          inp.keyStream.length = 0;
          inp.touchStream.length = 0;
      }

  
  function _usleep(useconds) {
      // int usleep(useconds_t useconds);
      // http://pubs.opengroup.org/onlinepubs/000095399/functions/usleep.html
      // We're single-threaded, so use a busy loop. Super-ugly.
      var start = _emscripten_get_now();
      while (_emscripten_get_now() - start < useconds / 1000) {
        // Do nothing.
      }
    }function _nanosleep(rqtp, rmtp) {
      // int nanosleep(const struct timespec  *rqtp, struct timespec *rmtp);
      if (rqtp === 0) {
        setErrNo(28);
        return -1;
      }
      var seconds = HEAP32[((rqtp)>>2)];
      var nanoseconds = HEAP32[(((rqtp)+(4))>>2)];
      if (nanoseconds < 0 || nanoseconds > 999999999 || seconds < 0) {
        setErrNo(28);
        return -1;
      }
      if (rmtp !== 0) {
        HEAP32[((rmtp)>>2)]=0;
        HEAP32[(((rmtp)+(4))>>2)]=0;
      }
      return _usleep((seconds * 1e6) + (nanoseconds / 1000));
    }

  function _setTempRet0($i) {
      setTempRet0(($i) | 0);
    }

  
  var __readAsmConstArgsArray=[];function readAsmConstArgs(sigPtr, buf) {
      __readAsmConstArgsArray.length = 0;
      var ch;
      buf >>= 2; // Align buf up front to index Int32Array (HEAP32)
      while (ch = HEAPU8[sigPtr++]) {
        __readAsmConstArgsArray.push(ch < 105 ? HEAPF64[++buf >> 1] : HEAP32[buf]);
        ++buf;
      }
      return __readAsmConstArgsArray;
    }
var GLctx;;
for (var i = 0; i < 32; ++i) __tempFixedLengthArray.push(new Array(i));;
var __miniTempWebGLFloatBuffersStorage = new Float32Array(288);
  for (/**@suppress{duplicate}*/var i = 0; i < 288; ++i) {
  __miniTempWebGLFloatBuffers[i] = __miniTempWebGLFloatBuffersStorage.subarray(0, i+1);
  }
  ;
var __miniTempWebGLIntBuffersStorage = new Int32Array(288);
  for (/**@suppress{duplicate}*/var i = 0; i < 288; ++i) {
  __miniTempWebGLIntBuffers[i] = __miniTempWebGLIntBuffersStorage.subarray(0, i+1);
  }
  ;
Fetch.staticInit();;
var ut;;
var asmGlobalArg = {};
var asmLibraryArg = { "__cxa_atexit": ___cxa_atexit, "__sys_fcntl64": ___sys_fcntl64, "__sys_ioctl": ___sys_ioctl, "__sys_open": ___sys_open, "_emscripten_fetch_free": __emscripten_fetch_free, "abort": _abort, "clock": _clock, "dlopen": _dlopen, "dlsym": _dlsym, "emscripten_asm_const_iii": _emscripten_asm_const_iii, "emscripten_get_now": _emscripten_get_now, "emscripten_get_sbrk_ptr": _emscripten_get_sbrk_ptr, "emscripten_glActiveTexture": _emscripten_glActiveTexture, "emscripten_glAttachShader": _emscripten_glAttachShader, "emscripten_glBeginQuery": _emscripten_glBeginQuery, "emscripten_glBeginQueryEXT": _emscripten_glBeginQueryEXT, "emscripten_glBeginTransformFeedback": _emscripten_glBeginTransformFeedback, "emscripten_glBindAttribLocation": _emscripten_glBindAttribLocation, "emscripten_glBindBuffer": _emscripten_glBindBuffer, "emscripten_glBindBufferBase": _emscripten_glBindBufferBase, "emscripten_glBindBufferRange": _emscripten_glBindBufferRange, "emscripten_glBindFramebuffer": _emscripten_glBindFramebuffer, "emscripten_glBindRenderbuffer": _emscripten_glBindRenderbuffer, "emscripten_glBindSampler": _emscripten_glBindSampler, "emscripten_glBindTexture": _emscripten_glBindTexture, "emscripten_glBindTransformFeedback": _emscripten_glBindTransformFeedback, "emscripten_glBindVertexArray": _emscripten_glBindVertexArray, "emscripten_glBindVertexArrayOES": _emscripten_glBindVertexArrayOES, "emscripten_glBlendColor": _emscripten_glBlendColor, "emscripten_glBlendEquation": _emscripten_glBlendEquation, "emscripten_glBlendEquationSeparate": _emscripten_glBlendEquationSeparate, "emscripten_glBlendFunc": _emscripten_glBlendFunc, "emscripten_glBlendFuncSeparate": _emscripten_glBlendFuncSeparate, "emscripten_glBlitFramebuffer": _emscripten_glBlitFramebuffer, "emscripten_glBufferData": _emscripten_glBufferData, "emscripten_glBufferSubData": _emscripten_glBufferSubData, "emscripten_glCheckFramebufferStatus": _emscripten_glCheckFramebufferStatus, "emscripten_glClear": _emscripten_glClear, "emscripten_glClearBufferfi": _emscripten_glClearBufferfi, "emscripten_glClearBufferfv": _emscripten_glClearBufferfv, "emscripten_glClearBufferiv": _emscripten_glClearBufferiv, "emscripten_glClearBufferuiv": _emscripten_glClearBufferuiv, "emscripten_glClearColor": _emscripten_glClearColor, "emscripten_glClearDepthf": _emscripten_glClearDepthf, "emscripten_glClearStencil": _emscripten_glClearStencil, "emscripten_glClientWaitSync": _emscripten_glClientWaitSync, "emscripten_glColorMask": _emscripten_glColorMask, "emscripten_glCompileShader": _emscripten_glCompileShader, "emscripten_glCompressedTexImage2D": _emscripten_glCompressedTexImage2D, "emscripten_glCompressedTexImage3D": _emscripten_glCompressedTexImage3D, "emscripten_glCompressedTexSubImage2D": _emscripten_glCompressedTexSubImage2D, "emscripten_glCompressedTexSubImage3D": _emscripten_glCompressedTexSubImage3D, "emscripten_glCopyBufferSubData": _emscripten_glCopyBufferSubData, "emscripten_glCopyTexImage2D": _emscripten_glCopyTexImage2D, "emscripten_glCopyTexSubImage2D": _emscripten_glCopyTexSubImage2D, "emscripten_glCopyTexSubImage3D": _emscripten_glCopyTexSubImage3D, "emscripten_glCreateProgram": _emscripten_glCreateProgram, "emscripten_glCreateShader": _emscripten_glCreateShader, "emscripten_glCullFace": _emscripten_glCullFace, "emscripten_glDeleteBuffers": _emscripten_glDeleteBuffers, "emscripten_glDeleteFramebuffers": _emscripten_glDeleteFramebuffers, "emscripten_glDeleteProgram": _emscripten_glDeleteProgram, "emscripten_glDeleteQueries": _emscripten_glDeleteQueries, "emscripten_glDeleteQueriesEXT": _emscripten_glDeleteQueriesEXT, "emscripten_glDeleteRenderbuffers": _emscripten_glDeleteRenderbuffers, "emscripten_glDeleteSamplers": _emscripten_glDeleteSamplers, "emscripten_glDeleteShader": _emscripten_glDeleteShader, "emscripten_glDeleteSync": _emscripten_glDeleteSync, "emscripten_glDeleteTextures": _emscripten_glDeleteTextures, "emscripten_glDeleteTransformFeedbacks": _emscripten_glDeleteTransformFeedbacks, "emscripten_glDeleteVertexArrays": _emscripten_glDeleteVertexArrays, "emscripten_glDeleteVertexArraysOES": _emscripten_glDeleteVertexArraysOES, "emscripten_glDepthFunc": _emscripten_glDepthFunc, "emscripten_glDepthMask": _emscripten_glDepthMask, "emscripten_glDepthRangef": _emscripten_glDepthRangef, "emscripten_glDetachShader": _emscripten_glDetachShader, "emscripten_glDisable": _emscripten_glDisable, "emscripten_glDisableVertexAttribArray": _emscripten_glDisableVertexAttribArray, "emscripten_glDrawArrays": _emscripten_glDrawArrays, "emscripten_glDrawArraysInstanced": _emscripten_glDrawArraysInstanced, "emscripten_glDrawArraysInstancedANGLE": _emscripten_glDrawArraysInstancedANGLE, "emscripten_glDrawArraysInstancedARB": _emscripten_glDrawArraysInstancedARB, "emscripten_glDrawArraysInstancedEXT": _emscripten_glDrawArraysInstancedEXT, "emscripten_glDrawArraysInstancedNV": _emscripten_glDrawArraysInstancedNV, "emscripten_glDrawBuffers": _emscripten_glDrawBuffers, "emscripten_glDrawBuffersEXT": _emscripten_glDrawBuffersEXT, "emscripten_glDrawBuffersWEBGL": _emscripten_glDrawBuffersWEBGL, "emscripten_glDrawElements": _emscripten_glDrawElements, "emscripten_glDrawElementsInstanced": _emscripten_glDrawElementsInstanced, "emscripten_glDrawElementsInstancedANGLE": _emscripten_glDrawElementsInstancedANGLE, "emscripten_glDrawElementsInstancedARB": _emscripten_glDrawElementsInstancedARB, "emscripten_glDrawElementsInstancedEXT": _emscripten_glDrawElementsInstancedEXT, "emscripten_glDrawElementsInstancedNV": _emscripten_glDrawElementsInstancedNV, "emscripten_glDrawRangeElements": _emscripten_glDrawRangeElements, "emscripten_glEnable": _emscripten_glEnable, "emscripten_glEnableVertexAttribArray": _emscripten_glEnableVertexAttribArray, "emscripten_glEndQuery": _emscripten_glEndQuery, "emscripten_glEndQueryEXT": _emscripten_glEndQueryEXT, "emscripten_glEndTransformFeedback": _emscripten_glEndTransformFeedback, "emscripten_glFenceSync": _emscripten_glFenceSync, "emscripten_glFinish": _emscripten_glFinish, "emscripten_glFlush": _emscripten_glFlush, "emscripten_glFramebufferRenderbuffer": _emscripten_glFramebufferRenderbuffer, "emscripten_glFramebufferTexture2D": _emscripten_glFramebufferTexture2D, "emscripten_glFramebufferTextureLayer": _emscripten_glFramebufferTextureLayer, "emscripten_glFrontFace": _emscripten_glFrontFace, "emscripten_glGenBuffers": _emscripten_glGenBuffers, "emscripten_glGenFramebuffers": _emscripten_glGenFramebuffers, "emscripten_glGenQueries": _emscripten_glGenQueries, "emscripten_glGenQueriesEXT": _emscripten_glGenQueriesEXT, "emscripten_glGenRenderbuffers": _emscripten_glGenRenderbuffers, "emscripten_glGenSamplers": _emscripten_glGenSamplers, "emscripten_glGenTextures": _emscripten_glGenTextures, "emscripten_glGenTransformFeedbacks": _emscripten_glGenTransformFeedbacks, "emscripten_glGenVertexArrays": _emscripten_glGenVertexArrays, "emscripten_glGenVertexArraysOES": _emscripten_glGenVertexArraysOES, "emscripten_glGenerateMipmap": _emscripten_glGenerateMipmap, "emscripten_glGetActiveAttrib": _emscripten_glGetActiveAttrib, "emscripten_glGetActiveUniform": _emscripten_glGetActiveUniform, "emscripten_glGetActiveUniformBlockName": _emscripten_glGetActiveUniformBlockName, "emscripten_glGetActiveUniformBlockiv": _emscripten_glGetActiveUniformBlockiv, "emscripten_glGetActiveUniformsiv": _emscripten_glGetActiveUniformsiv, "emscripten_glGetAttachedShaders": _emscripten_glGetAttachedShaders, "emscripten_glGetAttribLocation": _emscripten_glGetAttribLocation, "emscripten_glGetBooleanv": _emscripten_glGetBooleanv, "emscripten_glGetBufferParameteri64v": _emscripten_glGetBufferParameteri64v, "emscripten_glGetBufferParameteriv": _emscripten_glGetBufferParameteriv, "emscripten_glGetError": _emscripten_glGetError, "emscripten_glGetFloatv": _emscripten_glGetFloatv, "emscripten_glGetFragDataLocation": _emscripten_glGetFragDataLocation, "emscripten_glGetFramebufferAttachmentParameteriv": _emscripten_glGetFramebufferAttachmentParameteriv, "emscripten_glGetInteger64i_v": _emscripten_glGetInteger64i_v, "emscripten_glGetInteger64v": _emscripten_glGetInteger64v, "emscripten_glGetIntegeri_v": _emscripten_glGetIntegeri_v, "emscripten_glGetIntegerv": _emscripten_glGetIntegerv, "emscripten_glGetInternalformativ": _emscripten_glGetInternalformativ, "emscripten_glGetProgramBinary": _emscripten_glGetProgramBinary, "emscripten_glGetProgramInfoLog": _emscripten_glGetProgramInfoLog, "emscripten_glGetProgramiv": _emscripten_glGetProgramiv, "emscripten_glGetQueryObjecti64vEXT": _emscripten_glGetQueryObjecti64vEXT, "emscripten_glGetQueryObjectivEXT": _emscripten_glGetQueryObjectivEXT, "emscripten_glGetQueryObjectui64vEXT": _emscripten_glGetQueryObjectui64vEXT, "emscripten_glGetQueryObjectuiv": _emscripten_glGetQueryObjectuiv, "emscripten_glGetQueryObjectuivEXT": _emscripten_glGetQueryObjectuivEXT, "emscripten_glGetQueryiv": _emscripten_glGetQueryiv, "emscripten_glGetQueryivEXT": _emscripten_glGetQueryivEXT, "emscripten_glGetRenderbufferParameteriv": _emscripten_glGetRenderbufferParameteriv, "emscripten_glGetSamplerParameterfv": _emscripten_glGetSamplerParameterfv, "emscripten_glGetSamplerParameteriv": _emscripten_glGetSamplerParameteriv, "emscripten_glGetShaderInfoLog": _emscripten_glGetShaderInfoLog, "emscripten_glGetShaderPrecisionFormat": _emscripten_glGetShaderPrecisionFormat, "emscripten_glGetShaderSource": _emscripten_glGetShaderSource, "emscripten_glGetShaderiv": _emscripten_glGetShaderiv, "emscripten_glGetString": _emscripten_glGetString, "emscripten_glGetStringi": _emscripten_glGetStringi, "emscripten_glGetSynciv": _emscripten_glGetSynciv, "emscripten_glGetTexParameterfv": _emscripten_glGetTexParameterfv, "emscripten_glGetTexParameteriv": _emscripten_glGetTexParameteriv, "emscripten_glGetTransformFeedbackVarying": _emscripten_glGetTransformFeedbackVarying, "emscripten_glGetUniformBlockIndex": _emscripten_glGetUniformBlockIndex, "emscripten_glGetUniformIndices": _emscripten_glGetUniformIndices, "emscripten_glGetUniformLocation": _emscripten_glGetUniformLocation, "emscripten_glGetUniformfv": _emscripten_glGetUniformfv, "emscripten_glGetUniformiv": _emscripten_glGetUniformiv, "emscripten_glGetUniformuiv": _emscripten_glGetUniformuiv, "emscripten_glGetVertexAttribIiv": _emscripten_glGetVertexAttribIiv, "emscripten_glGetVertexAttribIuiv": _emscripten_glGetVertexAttribIuiv, "emscripten_glGetVertexAttribPointerv": _emscripten_glGetVertexAttribPointerv, "emscripten_glGetVertexAttribfv": _emscripten_glGetVertexAttribfv, "emscripten_glGetVertexAttribiv": _emscripten_glGetVertexAttribiv, "emscripten_glHint": _emscripten_glHint, "emscripten_glInvalidateFramebuffer": _emscripten_glInvalidateFramebuffer, "emscripten_glInvalidateSubFramebuffer": _emscripten_glInvalidateSubFramebuffer, "emscripten_glIsBuffer": _emscripten_glIsBuffer, "emscripten_glIsEnabled": _emscripten_glIsEnabled, "emscripten_glIsFramebuffer": _emscripten_glIsFramebuffer, "emscripten_glIsProgram": _emscripten_glIsProgram, "emscripten_glIsQuery": _emscripten_glIsQuery, "emscripten_glIsQueryEXT": _emscripten_glIsQueryEXT, "emscripten_glIsRenderbuffer": _emscripten_glIsRenderbuffer, "emscripten_glIsSampler": _emscripten_glIsSampler, "emscripten_glIsShader": _emscripten_glIsShader, "emscripten_glIsSync": _emscripten_glIsSync, "emscripten_glIsTexture": _emscripten_glIsTexture, "emscripten_glIsTransformFeedback": _emscripten_glIsTransformFeedback, "emscripten_glIsVertexArray": _emscripten_glIsVertexArray, "emscripten_glIsVertexArrayOES": _emscripten_glIsVertexArrayOES, "emscripten_glLineWidth": _emscripten_glLineWidth, "emscripten_glLinkProgram": _emscripten_glLinkProgram, "emscripten_glPauseTransformFeedback": _emscripten_glPauseTransformFeedback, "emscripten_glPixelStorei": _emscripten_glPixelStorei, "emscripten_glPolygonOffset": _emscripten_glPolygonOffset, "emscripten_glProgramBinary": _emscripten_glProgramBinary, "emscripten_glProgramParameteri": _emscripten_glProgramParameteri, "emscripten_glQueryCounterEXT": _emscripten_glQueryCounterEXT, "emscripten_glReadBuffer": _emscripten_glReadBuffer, "emscripten_glReadPixels": _emscripten_glReadPixels, "emscripten_glReleaseShaderCompiler": _emscripten_glReleaseShaderCompiler, "emscripten_glRenderbufferStorage": _emscripten_glRenderbufferStorage, "emscripten_glRenderbufferStorageMultisample": _emscripten_glRenderbufferStorageMultisample, "emscripten_glResumeTransformFeedback": _emscripten_glResumeTransformFeedback, "emscripten_glSampleCoverage": _emscripten_glSampleCoverage, "emscripten_glSamplerParameterf": _emscripten_glSamplerParameterf, "emscripten_glSamplerParameterfv": _emscripten_glSamplerParameterfv, "emscripten_glSamplerParameteri": _emscripten_glSamplerParameteri, "emscripten_glSamplerParameteriv": _emscripten_glSamplerParameteriv, "emscripten_glScissor": _emscripten_glScissor, "emscripten_glShaderBinary": _emscripten_glShaderBinary, "emscripten_glShaderSource": _emscripten_glShaderSource, "emscripten_glStencilFunc": _emscripten_glStencilFunc, "emscripten_glStencilFuncSeparate": _emscripten_glStencilFuncSeparate, "emscripten_glStencilMask": _emscripten_glStencilMask, "emscripten_glStencilMaskSeparate": _emscripten_glStencilMaskSeparate, "emscripten_glStencilOp": _emscripten_glStencilOp, "emscripten_glStencilOpSeparate": _emscripten_glStencilOpSeparate, "emscripten_glTexImage2D": _emscripten_glTexImage2D, "emscripten_glTexImage3D": _emscripten_glTexImage3D, "emscripten_glTexParameterf": _emscripten_glTexParameterf, "emscripten_glTexParameterfv": _emscripten_glTexParameterfv, "emscripten_glTexParameteri": _emscripten_glTexParameteri, "emscripten_glTexParameteriv": _emscripten_glTexParameteriv, "emscripten_glTexStorage2D": _emscripten_glTexStorage2D, "emscripten_glTexStorage3D": _emscripten_glTexStorage3D, "emscripten_glTexSubImage2D": _emscripten_glTexSubImage2D, "emscripten_glTexSubImage3D": _emscripten_glTexSubImage3D, "emscripten_glTransformFeedbackVaryings": _emscripten_glTransformFeedbackVaryings, "emscripten_glUniform1f": _emscripten_glUniform1f, "emscripten_glUniform1fv": _emscripten_glUniform1fv, "emscripten_glUniform1i": _emscripten_glUniform1i, "emscripten_glUniform1iv": _emscripten_glUniform1iv, "emscripten_glUniform1ui": _emscripten_glUniform1ui, "emscripten_glUniform1uiv": _emscripten_glUniform1uiv, "emscripten_glUniform2f": _emscripten_glUniform2f, "emscripten_glUniform2fv": _emscripten_glUniform2fv, "emscripten_glUniform2i": _emscripten_glUniform2i, "emscripten_glUniform2iv": _emscripten_glUniform2iv, "emscripten_glUniform2ui": _emscripten_glUniform2ui, "emscripten_glUniform2uiv": _emscripten_glUniform2uiv, "emscripten_glUniform3f": _emscripten_glUniform3f, "emscripten_glUniform3fv": _emscripten_glUniform3fv, "emscripten_glUniform3i": _emscripten_glUniform3i, "emscripten_glUniform3iv": _emscripten_glUniform3iv, "emscripten_glUniform3ui": _emscripten_glUniform3ui, "emscripten_glUniform3uiv": _emscripten_glUniform3uiv, "emscripten_glUniform4f": _emscripten_glUniform4f, "emscripten_glUniform4fv": _emscripten_glUniform4fv, "emscripten_glUniform4i": _emscripten_glUniform4i, "emscripten_glUniform4iv": _emscripten_glUniform4iv, "emscripten_glUniform4ui": _emscripten_glUniform4ui, "emscripten_glUniform4uiv": _emscripten_glUniform4uiv, "emscripten_glUniformBlockBinding": _emscripten_glUniformBlockBinding, "emscripten_glUniformMatrix2fv": _emscripten_glUniformMatrix2fv, "emscripten_glUniformMatrix2x3fv": _emscripten_glUniformMatrix2x3fv, "emscripten_glUniformMatrix2x4fv": _emscripten_glUniformMatrix2x4fv, "emscripten_glUniformMatrix3fv": _emscripten_glUniformMatrix3fv, "emscripten_glUniformMatrix3x2fv": _emscripten_glUniformMatrix3x2fv, "emscripten_glUniformMatrix3x4fv": _emscripten_glUniformMatrix3x4fv, "emscripten_glUniformMatrix4fv": _emscripten_glUniformMatrix4fv, "emscripten_glUniformMatrix4x2fv": _emscripten_glUniformMatrix4x2fv, "emscripten_glUniformMatrix4x3fv": _emscripten_glUniformMatrix4x3fv, "emscripten_glUseProgram": _emscripten_glUseProgram, "emscripten_glValidateProgram": _emscripten_glValidateProgram, "emscripten_glVertexAttrib1f": _emscripten_glVertexAttrib1f, "emscripten_glVertexAttrib1fv": _emscripten_glVertexAttrib1fv, "emscripten_glVertexAttrib2f": _emscripten_glVertexAttrib2f, "emscripten_glVertexAttrib2fv": _emscripten_glVertexAttrib2fv, "emscripten_glVertexAttrib3f": _emscripten_glVertexAttrib3f, "emscripten_glVertexAttrib3fv": _emscripten_glVertexAttrib3fv, "emscripten_glVertexAttrib4f": _emscripten_glVertexAttrib4f, "emscripten_glVertexAttrib4fv": _emscripten_glVertexAttrib4fv, "emscripten_glVertexAttribDivisor": _emscripten_glVertexAttribDivisor, "emscripten_glVertexAttribDivisorANGLE": _emscripten_glVertexAttribDivisorANGLE, "emscripten_glVertexAttribDivisorARB": _emscripten_glVertexAttribDivisorARB, "emscripten_glVertexAttribDivisorEXT": _emscripten_glVertexAttribDivisorEXT, "emscripten_glVertexAttribDivisorNV": _emscripten_glVertexAttribDivisorNV, "emscripten_glVertexAttribI4i": _emscripten_glVertexAttribI4i, "emscripten_glVertexAttribI4iv": _emscripten_glVertexAttribI4iv, "emscripten_glVertexAttribI4ui": _emscripten_glVertexAttribI4ui, "emscripten_glVertexAttribI4uiv": _emscripten_glVertexAttribI4uiv, "emscripten_glVertexAttribIPointer": _emscripten_glVertexAttribIPointer, "emscripten_glVertexAttribPointer": _emscripten_glVertexAttribPointer, "emscripten_glViewport": _emscripten_glViewport, "emscripten_glWaitSync": _emscripten_glWaitSync, "emscripten_is_main_browser_thread": _emscripten_is_main_browser_thread, "emscripten_log": _emscripten_log, "emscripten_memcpy_big": _emscripten_memcpy_big, "emscripten_performance_now": _emscripten_performance_now, "emscripten_request_animation_frame_loop": _emscripten_request_animation_frame_loop, "emscripten_resize_heap": _emscripten_resize_heap, "emscripten_set_canvas_element_size": _emscripten_set_canvas_element_size, "emscripten_set_timeout_loop": _emscripten_set_timeout_loop, "emscripten_start_fetch": _emscripten_start_fetch, "emscripten_throw_string": _emscripten_throw_string, "emscripten_webgl_commit_frame": _emscripten_webgl_commit_frame, "emscripten_webgl_create_context": _emscripten_webgl_create_context, "emscripten_webgl_destroy_context": _emscripten_webgl_destroy_context, "emscripten_webgl_enable_extension": _emscripten_webgl_enable_extension, "emscripten_webgl_get_context_attributes": _emscripten_webgl_get_context_attributes, "emscripten_webgl_get_current_context": _emscripten_webgl_get_current_context, "emscripten_webgl_init_context_attributes": _emscripten_webgl_init_context_attributes, "emscripten_webgl_make_context_current": _emscripten_webgl_make_context_current, "environ_get": _environ_get, "environ_sizes_get": _environ_sizes_get, "exit": _exit, "fd_close": _fd_close, "fd_read": _fd_read, "fd_seek": _fd_seek, "fd_write": _fd_write, "gettimeofday": _gettimeofday, "glActiveTexture": _glActiveTexture, "glAttachShader": _glAttachShader, "glBindBuffer": _glBindBuffer, "glBindFramebuffer": _glBindFramebuffer, "glBindRenderbuffer": _glBindRenderbuffer, "glBindTexture": _glBindTexture, "glBlendColor": _glBlendColor, "glBlendEquationSeparate": _glBlendEquationSeparate, "glBlendFuncSeparate": _glBlendFuncSeparate, "glBufferData": _glBufferData, "glBufferSubData": _glBufferSubData, "glCheckFramebufferStatus": _glCheckFramebufferStatus, "glClear": _glClear, "glClearColor": _glClearColor, "glClearDepthf": _glClearDepthf, "glClearStencil": _glClearStencil, "glColorMask": _glColorMask, "glCompileShader": _glCompileShader, "glCompressedTexImage2D": _glCompressedTexImage2D, "glCompressedTexSubImage2D": _glCompressedTexSubImage2D, "glCreateProgram": _glCreateProgram, "glCreateShader": _glCreateShader, "glCullFace": _glCullFace, "glDeleteBuffers": _glDeleteBuffers, "glDeleteFramebuffers": _glDeleteFramebuffers, "glDeleteProgram": _glDeleteProgram, "glDeleteRenderbuffers": _glDeleteRenderbuffers, "glDeleteShader": _glDeleteShader, "glDeleteTextures": _glDeleteTextures, "glDepthFunc": _glDepthFunc, "glDepthMask": _glDepthMask, "glDetachShader": _glDetachShader, "glDisable": _glDisable, "glDisableVertexAttribArray": _glDisableVertexAttribArray, "glDrawArrays": _glDrawArrays, "glDrawElements": _glDrawElements, "glEnable": _glEnable, "glEnableVertexAttribArray": _glEnableVertexAttribArray, "glFlush": _glFlush, "glFramebufferRenderbuffer": _glFramebufferRenderbuffer, "glFramebufferTexture2D": _glFramebufferTexture2D, "glFrontFace": _glFrontFace, "glGenBuffers": _glGenBuffers, "glGenFramebuffers": _glGenFramebuffers, "glGenRenderbuffers": _glGenRenderbuffers, "glGenTextures": _glGenTextures, "glGenerateMipmap": _glGenerateMipmap, "glGetActiveAttrib": _glGetActiveAttrib, "glGetActiveUniform": _glGetActiveUniform, "glGetAttribLocation": _glGetAttribLocation, "glGetError": _glGetError, "glGetFloatv": _glGetFloatv, "glGetIntegerv": _glGetIntegerv, "glGetProgramInfoLog": _glGetProgramInfoLog, "glGetProgramiv": _glGetProgramiv, "glGetShaderInfoLog": _glGetShaderInfoLog, "glGetShaderiv": _glGetShaderiv, "glGetString": _glGetString, "glGetUniformLocation": _glGetUniformLocation, "glLinkProgram": _glLinkProgram, "glPixelStorei": _glPixelStorei, "glReadPixels": _glReadPixels, "glRenderbufferStorage": _glRenderbufferStorage, "glScissor": _glScissor, "glShaderSource": _glShaderSource, "glStencilFuncSeparate": _glStencilFuncSeparate, "glStencilOpSeparate": _glStencilOpSeparate, "glTexImage2D": _glTexImage2D, "glTexParameterf": _glTexParameterf, "glTexParameterfv": _glTexParameterfv, "glTexParameteri": _glTexParameteri, "glTexSubImage2D": _glTexSubImage2D, "glUniform1i": _glUniform1i, "glUniform1iv": _glUniform1iv, "glUniform4f": _glUniform4f, "glUniform4fv": _glUniform4fv, "glUniformMatrix3fv": _glUniformMatrix3fv, "glUniformMatrix4fv": _glUniformMatrix4fv, "glUseProgram": _glUseProgram, "glVertexAttribPointer": _glVertexAttribPointer, "glViewport": _glViewport, "js_html_audioCheckLoad": _js_html_audioCheckLoad, "js_html_audioFree": _js_html_audioFree, "js_html_audioIsPlaying": _js_html_audioIsPlaying, "js_html_audioIsUnlocked": _js_html_audioIsUnlocked, "js_html_audioPause": _js_html_audioPause, "js_html_audioPlay": _js_html_audioPlay, "js_html_audioResume": _js_html_audioResume, "js_html_audioSetPan": _js_html_audioSetPan, "js_html_audioSetPitch": _js_html_audioSetPitch, "js_html_audioSetVolume": _js_html_audioSetVolume, "js_html_audioStartLoadFile": _js_html_audioStartLoadFile, "js_html_audioStop": _js_html_audioStop, "js_html_audioUnlock": _js_html_audioUnlock, "js_html_audioUpdate": _js_html_audioUpdate, "js_html_checkLoadImage": _js_html_checkLoadImage, "js_html_finishLoadImage": _js_html_finishLoadImage, "js_html_freeImage": _js_html_freeImage, "js_html_getCanvasSize": _js_html_getCanvasSize, "js_html_getDPIScale": _js_html_getDPIScale, "js_html_getFrameSize": _js_html_getFrameSize, "js_html_getScreenSize": _js_html_getScreenSize, "js_html_imageToMemory": _js_html_imageToMemory, "js_html_init": _js_html_init, "js_html_initAudio": _js_html_initAudio, "js_html_initImageLoading": _js_html_initImageLoading, "js_html_loadImage": _js_html_loadImage, "js_html_playerconnectionConnect": _js_html_playerconnectionConnect, "js_html_playerconnectionDisconnect": _js_html_playerconnectionDisconnect, "js_html_playerconnectionIsConnecting": _js_html_playerconnectionIsConnecting, "js_html_playerconnectionLostConnection": _js_html_playerconnectionLostConnection, "js_html_playerconnectionPlatformInit": _js_html_playerconnectionPlatformInit, "js_html_playerconnectionPlatformShutdown": _js_html_playerconnectionPlatformShutdown, "js_html_playerconnectionReceive": _js_html_playerconnectionReceive, "js_html_playerconnectionSend": _js_html_playerconnectionSend, "js_html_setCanvasSize": _js_html_setCanvasSize, "js_html_validateWebGLContextFeatures": _js_html_validateWebGLContextFeatures, "js_inputGetCanvasLost": _js_inputGetCanvasLost, "js_inputGetFocusLost": _js_inputGetFocusLost, "js_inputGetKeyStream": _js_inputGetKeyStream, "js_inputGetMouseStream": _js_inputGetMouseStream, "js_inputGetTouchStream": _js_inputGetTouchStream, "js_inputGetWheelStream": _js_inputGetWheelStream, "js_inputInit": _js_inputInit, "js_inputResetStreams": _js_inputResetStreams, "memory": wasmMemory, "nanosleep": _nanosleep, "setTempRet0": _setTempRet0, "table": wasmTable };




// === Auto-generated postamble setup entry stuff ===
































































































































function run() {

    var ret = _main();





}

function initRuntime(asm) {



  asm['__wasm_call_ctors']();

  
}


// Initialize wasm (asynchronous)

var imports = {
  'env': asmLibraryArg
  , 'wasi_snapshot_preview1': asmLibraryArg
};

// In non-fastcomp non-asm.js builds, grab wasm exports to outer scope
// for emscripten_get_exported_function() to be able to access them.


var _malloc,_free,_main,_memset,_unsafeutility_malloc,_unsafeutility_free,_unsafeutility_assertheap,_unsafeutility_memclear,_unsafeutility_memcpystride,_unsafeutility_memcpyreplicate,_unsafeutility_memmove,_unsafeutility_call_p,_unsafeutility_call_pi,_unsafeutility_get_heap_size,_rafcallbackinit_html,_GetOrCreateSharedMemory,_GetStatus,_GetErrorStatus,_Close,_GetData,_RequestAsyncRead,_BGFXAllocator_Init,_BGFXCB_Init,_BGFXCB_Lock,_BGFXCB_UnlockAndClear,_shutdown_html,_destroycallbackinit_html,_pausecallbackinit_html,_RegisterSendMessage,_PlayerConnectionMt_IsAvailableSendStream,_PlayerConnectionMt_Init,_PlayerConnectionMt_DequeSendStream,_PlayerConnectionMt_LockStreamBuilders,_PlayerConnectionMt_UnlockStreamBuilders,_PlayerConnectionMt_Shutdown,_PlayerConnectionMt_AtomicAdd64,_PlayerConnectionMt_LockProfilerHashTables,_PlayerConnectionMt_UnlockProfilerHashTables,_PlayerConnectionMt_DequeFreeStream,_PlayerConnectionMt_AtomicCompareExchange,_PlayerConnectionMt_QueueFreeStream,_PlayerConnectionMt_QueueSendStream,_init_html,_PlayerConnectionMt_RegisterStreamBuilder,_PlayerConnectionMt_AtomicStore,_Time_GetTicksToNanosecondsConversionRatio_Numerator,_Time_GetTicksToNanosecondsConversionRatio_Denominator,_Time_GetTicksMicrosecondsMonotonic,_strlen,_unsafeutility_realloc,_BGFXCB_DeInit,_ondestroyapp,_onpauseapp,_time_html,_SendMessage,_unsafeutility_memset,_unsafeutility_memcpy,_PlayerConnectionMt_UnregisterStreamBuilder,_unsafeutility_memcmp,_GetSecondsMonotonic,_htonl,_htons,_ntohs,__get_tzname,__get_daylight,__get_timezone,stackSave,stackRestore,stackAlloc,___cxa_demangle,_memalign,__growWasmMemory,dynCall_iiii,dynCall_viii,dynCall_iiiii,dynCall_viiii,dynCall_viiiiii,dynCall_vii,dynCall_viiiiiiiiii,dynCall_viiiiiiii,dynCall_viiiii,dynCall_vi,dynCall_v,dynCall_iii,dynCall_ii,dynCall_di,dynCall_ji,dynCall_fi,dynCall_iiif,dynCall_viiiiiii,dynCall_iiiiiiiii,dynCall_iij,dynCall_iid,dynCall_iiiiiii,dynCall_iif,dynCall_iiiiii,dynCall_vif,dynCall_viiiiiiiii,dynCall_id,dynCall_i,dynCall_vijii,dynCall_iijii,dynCall_jiji,dynCall_iiiiji,dynCall_idi,dynCall_vffff,dynCall_vf,dynCall_vff,dynCall_vfi,dynCall_viif,dynCall_viff,dynCall_vifff,dynCall_viffff,dynCall_viiiiiiiiiii,dynCall_viifi,dynCall_iidiiii;

WebAssembly.instantiate(Module['wasm'], imports).then(function(output) {


  // If not using the emscripten_get_exported_function() API or embind, keep the 'asm'
  // exports variable in local scope to this instantiate function to save code size.
  // (otherwise access it without to export it to outer scope)
  var

// WebAssembly instantiation API gotcha: if Module['wasm'] above was a typed array, then the
// output object will have an output.instance and output.module objects. But if Module['wasm']
// is an already compiled WebAssembly module, then output is the WebAssembly instance itself.
// Depending on the build mode, Module['wasm'] can mean a different thing.
  asm = output.instance.exports;


  _malloc = asm["malloc"];
_free = asm["free"];
_main = asm["main"];
_memset = asm["memset"];
_unsafeutility_malloc = asm["unsafeutility_malloc"];
_unsafeutility_free = asm["unsafeutility_free"];
_unsafeutility_assertheap = asm["unsafeutility_assertheap"];
_unsafeutility_memclear = asm["unsafeutility_memclear"];
_unsafeutility_memcpystride = asm["unsafeutility_memcpystride"];
_unsafeutility_memcpyreplicate = asm["unsafeutility_memcpyreplicate"];
_unsafeutility_memmove = asm["unsafeutility_memmove"];
_unsafeutility_call_p = asm["unsafeutility_call_p"];
_unsafeutility_call_pi = asm["unsafeutility_call_pi"];
_unsafeutility_get_heap_size = asm["unsafeutility_get_heap_size"];
_rafcallbackinit_html = asm["rafcallbackinit_html"];
_GetOrCreateSharedMemory = asm["GetOrCreateSharedMemory"];
_GetStatus = asm["GetStatus"];
_GetErrorStatus = asm["GetErrorStatus"];
_Close = asm["Close"];
_GetData = asm["GetData"];
_RequestAsyncRead = asm["RequestAsyncRead"];
_BGFXAllocator_Init = asm["BGFXAllocator_Init"];
_BGFXCB_Init = asm["BGFXCB_Init"];
_BGFXCB_Lock = asm["BGFXCB_Lock"];
_BGFXCB_UnlockAndClear = asm["BGFXCB_UnlockAndClear"];
_shutdown_html = asm["shutdown_html"];
_destroycallbackinit_html = asm["destroycallbackinit_html"];
_pausecallbackinit_html = asm["pausecallbackinit_html"];
_RegisterSendMessage = asm["RegisterSendMessage"];
_PlayerConnectionMt_IsAvailableSendStream = asm["PlayerConnectionMt_IsAvailableSendStream"];
_PlayerConnectionMt_Init = asm["PlayerConnectionMt_Init"];
_PlayerConnectionMt_DequeSendStream = asm["PlayerConnectionMt_DequeSendStream"];
_PlayerConnectionMt_LockStreamBuilders = asm["PlayerConnectionMt_LockStreamBuilders"];
_PlayerConnectionMt_UnlockStreamBuilders = asm["PlayerConnectionMt_UnlockStreamBuilders"];
_PlayerConnectionMt_Shutdown = asm["PlayerConnectionMt_Shutdown"];
_PlayerConnectionMt_AtomicAdd64 = asm["PlayerConnectionMt_AtomicAdd64"];
_PlayerConnectionMt_LockProfilerHashTables = asm["PlayerConnectionMt_LockProfilerHashTables"];
_PlayerConnectionMt_UnlockProfilerHashTables = asm["PlayerConnectionMt_UnlockProfilerHashTables"];
_PlayerConnectionMt_DequeFreeStream = asm["PlayerConnectionMt_DequeFreeStream"];
_PlayerConnectionMt_AtomicCompareExchange = asm["PlayerConnectionMt_AtomicCompareExchange"];
_PlayerConnectionMt_QueueFreeStream = asm["PlayerConnectionMt_QueueFreeStream"];
_PlayerConnectionMt_QueueSendStream = asm["PlayerConnectionMt_QueueSendStream"];
_init_html = asm["init_html"];
_PlayerConnectionMt_RegisterStreamBuilder = asm["PlayerConnectionMt_RegisterStreamBuilder"];
_PlayerConnectionMt_AtomicStore = asm["PlayerConnectionMt_AtomicStore"];
_Time_GetTicksToNanosecondsConversionRatio_Numerator = asm["Time_GetTicksToNanosecondsConversionRatio_Numerator"];
_Time_GetTicksToNanosecondsConversionRatio_Denominator = asm["Time_GetTicksToNanosecondsConversionRatio_Denominator"];
_Time_GetTicksMicrosecondsMonotonic = asm["Time_GetTicksMicrosecondsMonotonic"];
_strlen = asm["strlen"];
_unsafeutility_realloc = asm["unsafeutility_realloc"];
_BGFXCB_DeInit = asm["BGFXCB_DeInit"];
_ondestroyapp = asm["ondestroyapp"];
_onpauseapp = asm["onpauseapp"];
_time_html = asm["time_html"];
_SendMessage = asm["SendMessage"];
_unsafeutility_memset = asm["unsafeutility_memset"];
_unsafeutility_memcpy = asm["unsafeutility_memcpy"];
_PlayerConnectionMt_UnregisterStreamBuilder = asm["PlayerConnectionMt_UnregisterStreamBuilder"];
_unsafeutility_memcmp = asm["unsafeutility_memcmp"];
_GetSecondsMonotonic = asm["GetSecondsMonotonic"];
_htonl = asm["htonl"];
_htons = asm["htons"];
_ntohs = asm["ntohs"];
__get_tzname = asm["_get_tzname"];
__get_daylight = asm["_get_daylight"];
__get_timezone = asm["_get_timezone"];
stackSave = asm["stackSave"];
stackRestore = asm["stackRestore"];
stackAlloc = asm["stackAlloc"];
___cxa_demangle = asm["__cxa_demangle"];
_memalign = asm["memalign"];
__growWasmMemory = asm["__growWasmMemory"];
dynCall_iiii = asm["dynCall_iiii"];
dynCall_viii = asm["dynCall_viii"];
dynCall_iiiii = asm["dynCall_iiiii"];
dynCall_viiii = asm["dynCall_viiii"];
dynCall_viiiiii = asm["dynCall_viiiiii"];
dynCall_vii = asm["dynCall_vii"];
dynCall_viiiiiiiiii = asm["dynCall_viiiiiiiiii"];
dynCall_viiiiiiii = asm["dynCall_viiiiiiii"];
dynCall_viiiii = asm["dynCall_viiiii"];
dynCall_vi = asm["dynCall_vi"];
dynCall_v = asm["dynCall_v"];
dynCall_iii = asm["dynCall_iii"];
dynCall_ii = asm["dynCall_ii"];
dynCall_di = asm["dynCall_di"];
dynCall_ji = asm["dynCall_ji"];
dynCall_fi = asm["dynCall_fi"];
dynCall_iiif = asm["dynCall_iiif"];
dynCall_viiiiiii = asm["dynCall_viiiiiii"];
dynCall_iiiiiiiii = asm["dynCall_iiiiiiiii"];
dynCall_iij = asm["dynCall_iij"];
dynCall_iid = asm["dynCall_iid"];
dynCall_iiiiiii = asm["dynCall_iiiiiii"];
dynCall_iif = asm["dynCall_iif"];
dynCall_iiiiii = asm["dynCall_iiiiii"];
dynCall_vif = asm["dynCall_vif"];
dynCall_viiiiiiiii = asm["dynCall_viiiiiiiii"];
dynCall_id = asm["dynCall_id"];
dynCall_i = asm["dynCall_i"];
dynCall_vijii = asm["dynCall_vijii"];
dynCall_iijii = asm["dynCall_iijii"];
dynCall_jiji = asm["dynCall_jiji"];
dynCall_iiiiji = asm["dynCall_iiiiji"];
dynCall_idi = asm["dynCall_idi"];
dynCall_vffff = asm["dynCall_vffff"];
dynCall_vf = asm["dynCall_vf"];
dynCall_vff = asm["dynCall_vff"];
dynCall_vfi = asm["dynCall_vfi"];
dynCall_viif = asm["dynCall_viif"];
dynCall_viff = asm["dynCall_viff"];
dynCall_vifff = asm["dynCall_vifff"];
dynCall_viffff = asm["dynCall_viffff"];
dynCall_viiiiiiiiiii = asm["dynCall_viiiiiiiiiii"];
dynCall_viifi = asm["dynCall_viifi"];
dynCall_iidiiii = asm["dynCall_iidiiii"];


  initRuntime(asm);
  ready();


})
;









// {{MODULE_ADDITIONS}}



var WebPDecoder = function(WebPDecoder) {
  WebPDecoder = WebPDecoder || {};

var Module=typeof WebPDecoder!="undefined"?WebPDecoder:{};
var ENVIRONMENT_IS_WEB=Module.ENVIRONMENT?Module.ENVIRONMENT=="WEB":typeof window=="object";
var ENVIRONMENT_IS_WORKER = ENVIRONMENT_IS_PTHREAD = typeof importScripts === 'function';
var ENVIRONMENT_IS_NODE=Module.ENVIRONMENT=="NODE"||(!ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER);
Module.print=Module.print||console.log;Module.printErr=Module.printErr||console.warn;Module.thisProgram=Module.thisProgram||(ENVIRONMENT_IS_NODE&&process.argv.length>1?process.argv[1].replace(/\\/g,"/"):"./this.program");Module.arguments=Module.arguments||(ENVIRONMENT_IS_NODE&&process.argv.length>2?process.argv.slice(2):[]);function alignMemory(size){return size+15&-16}function staticAlloc(size){var ret=STATICTOP;STATICTOP=alignMemory(STATICTOP+size);return ret}var GLOBAL_BASE=8;function abort(what){ABORT=true;if(what!==undefined){Module.print(what);Module.printErr(what);what=JSON.stringify(what)}else{what=""}throw"abort("+what+") at "+(new Error).stack}Module["abort"]=abort;function assert(condition,text){if(!condition)abort("Assertion failed: "+text)}function decode_base64(base64){var size=base64.length;while(base64.charCodeAt(size-1)==61)size--;var data=new Uint8Array(size*3>>2);for(var c,cPrev=0,s=6,d=0,b=0;b<size;cPrev=c,s=s+2&7){c=base64.charCodeAt(b++);c=c>=97?c-71:c>=65?c-65:c>=48?c+4:c==47?63:62;if(s<6)data[d++]=cPrev<<2+s|c>>4-s}return data}function UTF8ArrayToString(input,offset){var str="",c;while(c=input[offset++]){var d=c<192?1:c<224?2:c<240?3:4;c&=255>>d;for(var j=1;j<d;j++)c=c<<6|input[offset++]&63;if(c<65536){str+=String.fromCharCode(c)}else{c-=65536;str+=String.fromCharCode(55296|c>>10,56320|c&1023)}}return str}function UTF8ToString(ptr){return UTF8ArrayToString(_HEAPU8,ptr)}function stringToUTF8Array(str,output,offset,maxBytesToWrite){if(!maxBytesToWrite)return 0;var i=0,p=offset,pEnd=offset+maxBytesToWrite-1;while(i<str.length){var c=str.charCodeAt(i++);var d=c<128?1:c<2048?2:55296<=c&&c<56320?4:3;if(p+d>pEnd)break;if(d==4)c=65536+((c&1023)<<10)|str.charCodeAt(i++)&1023;for(var j=d-1;j;j--,c>>=6)output[p+j]=128|c&63;output[p]=d==1?c:3840>>d&255|c;p+=d}output[p]=0;return p-offset}function lengthBytesUTF8(str){var i=0,p=0;while(i<str.length){var c=str.charCodeAt(i++);var d=c<128?1:c<2048?2:55296<=c&&c<56320?4:3;if(d==4)i++;p+=d}return p}var TOTAL_STACK=5242880;var TOTAL_MEMORY=Module.TOTAL_MEMORY||33554432;var buffer=new ArrayBuffer(TOTAL_MEMORY);var _HEAP8=new Int8Array(buffer);var _HEAP16=new Int16Array(buffer);var _HEAP32=new Int32Array(buffer);var _HEAPU8=new Uint8Array(buffer);var _HEAPU16=new Uint16Array(buffer);var _HEAPU32=new Uint32Array(buffer);var _HEAPF32=new Float32Array(buffer);var _HEAPF64=new Float64Array(buffer);var STATIC_BASE,STATICTOP,staticSealed;var STACK_BASE,STACKTOP,STACK_MAX;var DYNAMIC_BASE,DYNAMICTOP_PTR;function abortOnCannotGrowMemory(){abort("Cannot enlarge memory arrays")}function enlargeMemory(){abortOnCannotGrowMemory()}function getTotalMemory(){return TOTAL_MEMORY}var Math_abs=Math.abs;var Math_cos=Math.cos;var Math_sin=Math.sin;var Math_tan=Math.tan;var Math_acos=Math.acos;var Math_asin=Math.asin;var Math_atan=Math.atan;var Math_atan2=Math.atan2;var Math_exp=Math.exp;var Math_log=Math.log;var Math_sqrt=Math.sqrt;var Math_ceil=Math.ceil;var Math_floor=Math.floor;var Math_pow=Math.pow;var Math_imul=Math.imul;var Math_fround=Math.fround;var Math_round=Math.round;var Math_min=Math.min;var Math_clz32=Math.clz32;var Math_trunc=Math.trunc;var memoryInitializer;var __ATINIT__=[];var ABORT=0;STATIC_BASE=GLOBAL_BASE;STATICTOP=STATIC_BASE+8224;__ATINIT__.push();memoryInitializer="data:application/octet-stream;base64,rg8AALIPAAC3DwAAvQ8AAEQWAACxGgAAIRwAACAfAAAAAAAAAQAAAAMAAAAHAAAADwAAAB8AAAA/AAAAfwAAAP8AAAD/AQAA/wMAAP8HAAD/DwAA/x8AAP8/AAD/fwAA//8AAP//AQD//wMA//8HAP//DwD//x8A//8/AP//fwD///8AAAAEAAgADACAAIQAiACMAAABBAEIAQwBgAGEAYgBjAEEAAUABgAHAAgACQAKAAsADAANAA4ADwAQABEAEgATABQAFQAWABcAGAAZABoAGwAcAB0AHgAfACAAIQAiACMAJAAlACYAJwAoACkAKgArACwALQAuAC8AMAAxADIAMwA0ADUANgA3ADgAOQA6ADwAPgBAAEIARABGAEgASgBMAE4AUABSAFQAVgBYAFoAXABeAGAAYgBkAGYAaABqAGwAbgBwAHIAdAB3AHoAfQCAAIMAhgCJAIwAjwCSAJUAmACbAJ4AoQCkAKcAqgCtALEAtQC5AL0AwQDFAMkAzQDRANUA2QDdAOEA5QDqAO8A9QD5AP4AAwEIAQ0BEgEXARwBiguMC44LkguaC6oLygsKDIwMjA2MD4wTGAEAAQABAAEoAAACCENvdWxkIG5vdCBkZWNvZGUgYWxwaGEgZGF0YS4ARnJhbWUgc2V0dXAgZmFpbGVkAG5vIG1lbW9yeSBkdXJpbmcgZnJhbWUgaW5pdGlhbGl6YXRpb24uAAQFBgcICQoKCwwNDg8QERESExQUFRUWFhcXGBkZGhscHR4fICEiIyQlJSYnKCkqKywtLi4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xMTU5PUFFSU1RVVldYWVtdX2BiZGVmaGpsbnBydHZ6fH6AgoSGiIqMj5GUl5qd53gwWXNxeJhwmLNAfqp2LkZfr0WPUFVSSJtnODoKq9q9EQ2YchoRoyzDFQqteRhQwxo+LEBVkEcKJqvVkCIaqi43E4igIc5HPxQIcnLQDAniUSgLYLZUHRAkhrdZiWJlaqWUSLtkgp1vIEtQQmanY0o+KOqAKTUJsvGNGghrSisakkmmMRedQSZpoDM0H3OAaE8MG9n/VxEHV0RHLHIzD7oXLykObra3FRHCQi0ZZsW9FxIWWFiTliouLcTNK2G3dVUmI7M9JzXIVxoVK+irOCIzaHJmHV1NJxxVqzqlWmJAIhZ0zhciK6ZJazYgGjMBUSsfRBlqFkCrJOFyIhMVZoS8EEx8PhJOX1U5MjAzwWUjn9dvWS5vPJQfrNvkFRJvcHFNVbP/JnhyKCoBxPXRChltWCsdjKbVJSuaPT8em0MtRAHRZFAIK5oBMxpHjk5OEP+AIsWrKSgFZtO3BAHdMzIRqNHAFxlSih8kqxumJizlQ1c6qVJzGjuzPztatDumXUmaKCgVdI/RIievLw8QtyLfMS23LhEhtwZiDyC3OS4WGIABNhElQSBJcxyAF4DNKAMJczPAEgbfVyUJcztNQBUvaDcs2gk2NYLiQFpGzSgpFxo5NjlwuAUpJqbVHiIahZh0CiCGJxM13RpyIEn/HwlB6gIPAXZJSyAMM8D/oCszWB8jQ2ZVN7pVOBUXbzvNLSXANyZGfElmASJifWIqWGhVda9SX1Q1WYBkcWUtS097LzOAUasBOREFR2Y5NSkxJiENeTlJGgFVKQpDik1uWi9ycxUCCmb/phcGZR0QClWAZcQaORIKZmbVIhQrdRQPJKOARAEaZj1HJSI1H/PARTxHJkl3HN4lRC2AIgEvC/WrPhETRpJVNz5GJSslmmSjVaABPwlciBxAIMlVSw8JCUD/uHcQVgYcBUD/GfgBOAgRhIn/N3SAOg8UUoc5GnkopDIfiZqFGSPaM2csg4N7HwaeVihAh5TgLbeAFhoRg/CaDgHRLRAVW0DeBwHFOBUnmzyKF2bVUwwNNsD/RC8cVRpVVYCAIJKrEgsHP5CrBAT2IxsKkq6rDBqAvlAjY7RQfjYtVX4vV7AzKRQgZUuAi3aSdIBVOCkPsOxVJQk+Rx4Rd3b/ERKKZSY8ijdGKxqOkiQTHqv/YRsUii09PtsBUbxAICkUdZeOFBWjcBMMPcOAMAQYAAH/Av4DBAb9Bfz7+gf5CPj3////////////////////////////////////////////sPb////////////f8fz///////////n9/f////////////T8///////////q/v7///////////3///////////////b+///////////v/f7///////////7//v////////////j+///////////7//7///////////////////////////3+///////////7/v7///////////7//v////////////79//7////////6//7//v////////7/////////////////////////////////////////////////////////2f/////////////h/PH9///+/////+r68fr9//3+//////7////////////f/v7//////////+79/v7///////////j+///////////5/v////////////////////////////3////////////3/v////////////////////////////3+///////////8//////////////////////////////7+///////////9//////////////////////////////79///////////6//////////////7/////////////////////////////////////////////////////////uvv6///////////q+/T+//////////v78/3+//7///////3+///////////s/f7///////////v9/f7+//////////7+///////////+/v7///////////////////////////7////////////+/v////////////7////////////////////////////+////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////+P/////////////6/vz+//////////j++f3///////////39///////////2/f3///////////z++/7+//////////78///////////4/v3///////////3//v7///////////v+///////////1+/7///////////39/v////////////v9///////////8/f7////////////+//////////////z////////////5//7//////////////v/////////////9///////////6///////////////////////////////////////////+////////////////////////////gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA/Yj+/+TbgICAgIC9gfL/49X/24CAgGp+4/zW0f//gICAAWL4/+zi//+AgIC1he7+3er/moCAgE6GyvfGtP/bgICAAbn5//P/gICAgIC4lvf/7OCAgICAgE1u2P/s5oCAgICAAWX7//H/gICAgICqi/H87NH//4CAgCV0xPPk////gICAAcz+//X/gICAgIDPoPr/7oCAgICAgGZn5//Tq4CAgICAAZj8//D/gICAgICxh/P/6uGAgICAgFCB0//C4ICAgICAAQH/gICAgICAgID2Af+AgICAgICAgP+AgICAgICAgICAxiPt38G7oqCRmz6DLcbdrLDcnfzdAUQvktCVp92i/9+AAZXx/93g//+AgIC4jer93tz/x4CAgFFjtfKwvvnK//+AAYHo/dbF8sT//4BjedL6ycb/yoCAgBdbo/Kqu/fS//+AAcj2/+r/gICAgIBtsvH/5/X//4CAgCyCyf3NwP//gICAAYTv+9vR/6WAgIBeiOH72r7//4CAgBZkrvW6of/HgICAAbb5/+jrgICAgIB8j/H/4+qAgICAgCNNtfvB0//NgICAAZ33/+zn//+AgIB5jev/4eP//4CAgC1jvPvD2f/ggICAAQH7/9X/gICAgIDLAfj//4CAgICAgIkBsf/g/4CAgICA/Qn4+8/Q/8CAgICvDeDzwbn5xv//gEkRq92hs+yn/+qAAV/3/dS3//+AgIDvWvT609H//4CAgJtNw/i8w///gICAARjv+9rb/82AgIDJM9v/xLqAgICAgEUuvu/J2v/kgICAAb/7//+AgICAgIDfpfn/1f+AgICAgI18+P//gICAgICAARD4//+AgICAgIC+JOb/7P+AgICAgJUB/4CAgICAgICAAeL/gICAgICAgID3wP+AgICAgICAgPCA/4CAgICAgICAAYb8//+AgICAgIDVPvr//4CAgICAgDdd/4CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAyhjV67q/3KDwr/9+Jrboqbjkrv+7gD0uituXsvCq/9iAAXDm+se/95///4CmbeT809f/roCAgCdNouistPWy//+AATTc9sbH+dz//4B8Sr/zt8H63f//gBhHgtuaqvO2//+AAbbh+dvw/+CAgICVluL82M3/q4CAgBxsqvK3wv7f//+AAVHm/MzL/8CAgIB7ZtH3vMT/6YCAgBRfmfOkrf/LgICAAd74/9jVgICAgICor/b8683//4CAgC901//T1P//gICAAXns/dTW//+AgICNVNX8ycr/24CAgCpQoPCiuf/NgICAAQH/gICAgICAgID0Af+AgICAgICAgO4B/4CAgICAgICAAAECAwYEBQYGBgYGBgYGBwBPSwBudWxsIFZQOElvIHBhc3NlZCB0byBWUDhHZXRIZWFkZXJzKCkAVHJ1bmNhdGVkIGhlYWRlci4ASW5jb3JyZWN0IGtleWZyYW1lIHBhcmFtZXRlcnMuAEZyYW1lIG5vdCBkaXNwbGF5YWJsZS4AY2Fubm90IHBhcnNlIHBpY3R1cmUgaGVhZGVyAEJhZCBjb2RlIHdvcmQAYmFkIHBhcnRpdGlvbiBsZW5ndGgAY2Fubm90IHBhcnNlIHNlZ21lbnQgaGVhZGVyAGNhbm5vdCBwYXJzZSBmaWx0ZXIgaGVhZGVyAGNhbm5vdCBwYXJzZSBwYXJ0aXRpb25zAE5vdCBhIGtleSBmcmFtZS4AAAEECAUCAwYJDA0KBwsOD62UjACwm4yHALSdjYaCAP7+8+bEsZmMhYKBAE5VTEwgVlA4SW8gcGFyYW1ldGVyIGluIFZQOERlY29kZSgpLgBQcmVtYXR1cmUgZW5kLW9mLXBhcnRpdGlvbjAgZW5jb3VudGVyZWQuAFByZW1hdHVyZSBlbmQtb2YtZmlsZSBlbmNvdW50ZXJlZC4AT3V0cHV0IGFib3J0ZWQuABgHFxkoBicpFhomKjgFNzkVGzY6JStIBEdJFBw1O0ZKJCxYRUs0PANXWRMdVlojLURMVVszPWgCZ2kSHmZqIi5UXENNZWsyPngBd3lTXREfZGxCTnZ6IS91ezE/Y21SXgB0fEFPECBibjBzfVFfQHJ+YW9QcX9gcBESAAECAwQFEAYHCAkKCwwNDg8CAwcDAwtBTFBIAFZQOEwAVlA4IABWUDhYAFJJRkYAV0VCUA==";var tempDoublePtr=STATICTOP;STATICTOP+=16;function _emscripten_memcpy_big(dest,src,num){_HEAPU8.set(_HEAPU8.subarray(src,src+num),dest);return dest}DYNAMICTOP_PTR=staticAlloc(4);STACK_BASE=STACKTOP=alignMemory(STATICTOP);STACK_MAX=STACK_BASE+TOTAL_STACK;DYNAMIC_BASE=alignMemory(STACK_MAX);_HEAP32[DYNAMICTOP_PTR>>2]=DYNAMIC_BASE;staticSealed=true;var ASSERTIONS=false;Module.asmGlobalArg={"Math":Math,"Int8Array":Int8Array,"Int16Array":Int16Array,"Int32Array":Int32Array,"Uint8Array":Uint8Array,"Uint16Array":Uint16Array,"Uint32Array":Uint32Array,"Float32Array":Float32Array,"Float64Array":Float64Array,"NaN":NaN,"Infinity":Infinity};Module.asmLibraryArg={$0:DYNAMICTOP_PTR,$1:tempDoublePtr,$2:ABORT,$3:STACKTOP,$4:STACK_MAX,$5:abort,$6:assert,$7:enlargeMemory,$8:getTotalMemory,$9:abortOnCannotGrowMemory,$10:_emscripten_memcpy_big};// EMSCRIPTEN_START_ASM
var asm=(/** @suppress {uselessCode} */ function(global,env,buffer) {
"use asm";var a=new global.Int8Array(buffer);var b=new global.Int16Array(buffer);var c=new global.Int32Array(buffer);var d=new global.Uint8Array(buffer);var e=new global.Uint16Array(buffer);var f=new global.Uint32Array(buffer);var g=new global.Float32Array(buffer);var h=new global.Float64Array(buffer);var i=env.$0|0;var j=env.$1|0;var k=env.$2|0;var l=env.$3|0;var m=env.$4|0;var n=0;var o=0;var p=0;var q=0;var r=global.NaN,s=global.Infinity;var t=0,u=0,v=0,w=0,x=0.0;var y=0;var z=global.Math.floor;var A=global.Math.abs;var B=global.Math.sqrt;var C=global.Math.pow;var D=global.Math.cos;var E=global.Math.sin;var F=global.Math.tan;var G=global.Math.acos;var H=global.Math.asin;var I=global.Math.atan;var J=global.Math.atan2;var K=global.Math.exp;var L=global.Math.log;var M=global.Math.ceil;var N=global.Math.imul;var O=global.Math.min;var P=global.Math.max;var Q=global.Math.clz32;var R=env.$5;var S=env.$6;var T=env.$7;var U=env.$8;var V=env.$9;var W=env.$10;var X=0.0;
// EMSCRIPTEN_START_FUNCS
function Y(b,f){b=b|0;f=f|0;var g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0;w=c[f+4>>2]|0;x=c[f>>2]|0;y=c[b+1916>>2]|0;g=0;while(1){if((g|0)==16)break;a[y+40+((g<<5)+-1)>>0]=-127;g=g+1|0}g=0;while(1){if((g|0)==8)break;v=(g<<5)+-1|0;a[y+584+v>>0]=-127;a[y+600+v>>0]=-127;g=g+1|0}if((w|0)>0){a[y+567>>0]=-127;a[y+551>>0]=-127;a[y+7>>0]=-127}else{m=y+7|0;n=m+21|0;do{a[m>>0]=127;m=m+1|0}while((m|0)<(n|0));m=y+551|0;n=m+9|0;do{a[m>>0]=127;m=m+1|0}while((m|0)<(n|0));m=y+567|0;n=m+9|0;do{a[m>>0]=127;m=m+1|0}while((m|0)<(n|0))}u=(w|0)==0?6:5;v=(w|0)==0?4:0;t=0;while(1){if((t|0)>=(c[b+208>>2]|0))break;s=c[f+16>>2]|0;a:do if((t|0)>0){g=-1;while(1){if((g|0)==16){g=-1;break}r=g<<5;q=d[y+40+(r|12)>>0]|d[y+40+(r|12)+1>>0]<<8|d[y+40+(r|12)+2>>0]<<16|d[y+40+(r|12)+3>>0]<<24;a[y+40+(r+-4)>>0]=q;a[y+40+(r+-4)+1>>0]=q>>8;a[y+40+(r+-4)+2>>0]=q>>16;a[y+40+(r+-4)+3>>0]=q>>24;g=g+1|0}while(1){if((g|0)==8)break a;q=g<<5;r=y+584+(q+-4)|0;p=y+584+(q|4)|0;p=d[p>>0]|d[p+1>>0]<<8|d[p+2>>0]<<16|d[p+3>>0]<<24;a[r>>0]=p;a[r+1>>0]=p>>8;a[r+2>>0]=p>>16;a[r+3>>0]=p>>24;r=y+600+(q+-4)|0;q=y+600+(q|4)|0;q=d[q>>0]|d[q+1>>0]<<8|d[q+2>>0]<<16|d[q+3>>0]<<24;a[r>>0]=q;a[r+1>>0]=q>>8;a[r+2>>0]=q>>16;a[r+3>>0]=q>>24;g=g+1|0}}while(0);q=c[b+1904>>2]|0;r=q+(t<<5)|0;i=c[s+(t*800|0)+788>>2]|0;if((w|0)>0){m=y+8|0;l=r;n=m+16|0;do{a[m>>0]=a[l>>0]|0;m=m+1|0;l=l+1|0}while((m|0)<(n|0));p=q+(t<<5)+16|0;o=d[p>>0]|d[p+1>>0]<<8|d[p+2>>0]<<16|d[p+3>>0]<<24;p=d[p+4>>0]|d[p+4+1>>0]<<8|d[p+4+2>>0]<<16|d[p+4+3>>0]<<24;a[y+552>>0]=o;a[y+552+1>>0]=o>>8;a[y+552+2>>0]=o>>16;a[y+552+3>>0]=o>>24;a[y+552+4>>0]=p;a[y+552+4+1>>0]=p>>8;a[y+552+4+2>>0]=p>>16;a[y+552+4+3>>0]=p>>24;p=q+(t<<5)+24|0;o=d[p>>0]|d[p+1>>0]<<8|d[p+2>>0]<<16|d[p+3>>0]<<24;p=d[p+4>>0]|d[p+4+1>>0]<<8|d[p+4+2>>0]<<16|d[p+4+3>>0]<<24;a[y+568>>0]=o;a[y+568+1>>0]=o>>8;a[y+568+2>>0]=o>>16;a[y+568+3>>0]=o>>24;a[y+568+4>>0]=p;a[y+568+4+1>>0]=p>>8;a[y+568+4+2>>0]=p>>16;a[y+568+4+3>>0]=p>>24}b:do if(!(a[s+(t*800|0)+768>>0]|0)){p=a[s+(t*800|0)+769>>0]|0;c:do switch(((p<<24>>24==0?((t|0)==0?u:v):p&255)&255)<<24>>24){case 0:{g=0;h=16;while(1){if((g|0)==16)break;p=h+(d[y+40+((g<<5)+-1)>>0]|0)+(d[y+40+(g+-32)>>0]|0)|0;g=g+1|0;h=p}h=h>>>5&255;g=0;while(1){if((g|0)==16)break c;Ma(y+40+(g<<5)|0,h|0,16)|0;g=g+1|0}}case 1:{Db(y+40|0,16);break}case 2:{g=0;while(1){if((g|0)==16)break c;m=y+40+(g<<5)|0;l=y+8|0;n=m+16|0;do{a[m>>0]=a[l>>0]|0;m=m+1|0;l=l+1|0}while((m|0)<(n|0));g=g+1|0}}case 3:{g=16;h=y+40|0;while(1){if((g|0)<=0)break c;Ma(h|0,a[h+-1>>0]|0,16)|0;g=g+-1|0;h=h+32|0}}case 4:{g=0;h=8;while(1){if((g|0)==16)break;p=h+(d[y+40+((g<<5)+-1)>>0]|0)|0;g=g+1|0;h=p}h=h>>>4&255;g=0;while(1){if((g|0)==16)break c;Ma(y+40+(g<<5)|0,h|0,16)|0;g=g+1|0}}case 5:{g=0;h=8;while(1){if((g|0)==16)break;p=h+(d[y+40+(g+-32)>>0]|0)|0;g=g+1|0;h=p}h=h>>>4&255;g=0;while(1){if((g|0)==16)break c;Ma(y+40+(g<<5)|0,h|0,16)|0;g=g+1|0}}case 6:{g=0;while(1){if((g|0)==16)break c;m=y+40+(g<<5)|0;n=m+16|0;do{a[m>>0]=128;m=m+1|0}while((m|0)<(n|0));g=g+1|0}}default:{}}while(0);if(i|0){g=i;h=0;while(1){if((h|0)==16)break b;i=s+(t*800|0)+(h<<4<<1)|0;j=y+40+(e[140+(h<<1)>>1]|0)|0;switch(g>>>30&3){case 3:{Wc(i,j,0);break}case 2:{ha(i,j);break}case 1:{Hb(i,j);break}default:{}}g=g<<2;h=h+1|0}}}else{do if((w|0)>0)if((t|0)<((c[b+208>>2]|0)+-1|0)){g=d[r+32>>0]|d[r+32+1>>0]<<8|d[r+32+2>>0]<<16|d[r+32+3>>0]<<24;a[y+24>>0]=g;a[y+24+1>>0]=g>>8;a[y+24+2>>0]=g>>16;a[y+24+3>>0]=g>>24;break}else{g=a[q+(t<<5)+15>>0]|0;Ma(y+24|0,g|0,4)|0;g=(g&255)<<8|g&255|((g&255)<<8|g&255)<<16;break}else g=c[y+24>>2]|0;while(0);c[y+408>>2]=g;c[y+280>>2]=g;c[y+152>>2]=g;n=i;o=0;while(1){if((o|0)==16)break b;p=y+40+(e[140+(o<<1)>>1]|0)|0;d:do switch(a[s+(t*800|0)+769+o>>0]|0){case 0:{g=0;h=4;while(1){if((g|0)==4)break;m=h+(d[p+(g+-32)>>0]|0)+(d[p+((g<<5)+-1)>>0]|0)|0;g=g+1|0;h=m}h=h>>>3&255;g=0;while(1){if((g|0)==4)break d;Ma(p+(g<<5)|0,h|0,4)|0;g=g+1|0}}case 1:{Db(p,4);break}case 2:{h=d[p+-32>>0]|0;i=d[p+-31>>0]|0;j=((d[p+-33>>0]|0)+2+(h<<1)+i|0)>>>2&255;k=d[p+-30>>0]|0;l=d[p+-29>>0]|0;m=(k+2+(l<<1)+(d[p+-28>>0]|0)|0)>>>2&255;g=0;while(1){if((g|0)==4)break d;z=p+(g<<5)|0;a[z>>0]=j;a[z+1>>0]=(h+2+(i<<1)+k|0)>>>2;a[z+2>>0]=(i+2+(k<<1)+l|0)>>>2;a[z+3>>0]=m;g=g+1|0}}case 3:{k=d[p+-1>>0]|0;l=d[p+31>>0]|0;m=d[p+63>>0]|0;z=d[p+95>>0]|0;j=N(((d[p+-33>>0]|0)+2+(k<<1)+l|0)>>>2&255,16843009)|0;a[p>>0]=j;a[p+1>>0]=j>>8;a[p+2>>0]=j>>16;a[p+3>>0]=j>>24;k=N((k+2+(l<<1)+m|0)>>>2&255,16843009)|0;a[p+32>>0]=k;a[p+32+1>>0]=k>>8;a[p+32+2>>0]=k>>16;a[p+32+3>>0]=k>>24;l=N((l+2+(m<<1)+z|0)>>>2&255,16843009)|0;a[p+64>>0]=l;a[p+64+1>>0]=l>>8;a[p+64+2>>0]=l>>16;a[p+64+3>>0]=l>>24;z=N((m+2+z+(z<<1)|0)>>>2&255,16843009)|0;a[p+96>>0]=z;a[p+96+1>>0]=z>>8;a[p+96+2>>0]=z>>16;a[p+96+3>>0]=z>>24;break}case 4:{i=d[p+-1>>0]|0;h=d[p+31>>0]|0;g=d[p+63>>0]|0;j=d[p+-33>>0]|0;k=d[p+-32>>0]|0;l=d[p+-31>>0]|0;z=d[p+-30>>0]|0;m=d[p+-29>>0]|0;a[p+96>>0]=(h+2+(g<<1)+(d[p+95>>0]|0)|0)>>>2;a[p+64>>0]=((h<<1)+(i+2)+g|0)>>>2;a[p+97>>0]=((h<<1)+(i+2)+g|0)>>>2;a[p+32>>0]=((i<<1)+2+h+j|0)>>>2;a[p+65>>0]=((i<<1)+2+h+j|0)>>>2;a[p+98>>0]=((i<<1)+2+h+j|0)>>>2;a[p>>0]=(i+2+k+(j<<1)|0)>>>2;a[p+33>>0]=(i+2+k+(j<<1)|0)>>>2;a[p+66>>0]=(i+2+k+(j<<1)|0)>>>2;a[p+99>>0]=(i+2+k+(j<<1)|0)>>>2;a[p+1>>0]=(j+2+l+(k<<1)|0)>>>2;a[p+34>>0]=(j+2+l+(k<<1)|0)>>>2;a[p+67>>0]=(j+2+l+(k<<1)|0)>>>2;a[p+2>>0]=(k+2+z+(l<<1)|0)>>>2;a[p+35>>0]=(k+2+z+(l<<1)|0)>>>2;a[p+3>>0]=(l+2+m+(z<<1)|0)>>>2;break}case 5:{i=d[p+-1>>0]|0;h=d[p+31>>0]|0;g=d[p+63>>0]|0;j=d[p+-33>>0]|0;k=d[p+-32>>0]|0;l=d[p+-31>>0]|0;m=d[p+-30>>0]|0;z=d[p+-29>>0]|0;a[p+65>>0]=(j+1+k|0)>>>1;a[p>>0]=(j+1+k|0)>>>1;a[p+66>>0]=(k+1+l|0)>>>1;a[p+1>>0]=(k+1+l|0)>>>1;a[p+67>>0]=(l+1+m|0)>>>1;a[p+2>>0]=(l+1+m|0)>>>1;a[p+3>>0]=(m+1+z|0)>>>1;a[p+96>>0]=(i+2+g+(h<<1)|0)>>>2;a[p+64>>0]=(h+2+(i<<1)+j|0)>>>2;a[p+97>>0]=((j<<1)+(i+2)+k|0)>>>2;a[p+32>>0]=((j<<1)+(i+2)+k|0)>>>2;a[p+98>>0]=(j+2+(k<<1)+l|0)>>>2;a[p+33>>0]=(j+2+(k<<1)+l|0)>>>2;a[p+99>>0]=(k+2+(l<<1)+m|0)>>>2;a[p+34>>0]=(k+2+(l<<1)+m|0)>>>2;a[p+35>>0]=(l+2+(m<<1)+z|0)>>>2;break}case 6:{h=d[p+-31>>0]|0;i=d[p+-30>>0]|0;j=d[p+-29>>0]|0;k=d[p+-28>>0]|0;l=d[p+-27>>0]|0;m=d[p+-26>>0]|0;z=d[p+-25>>0]|0;a[p>>0]=((d[p+-32>>0]|0)+2+(h<<1)+i|0)>>>2;a[p+32>>0]=(h+2+(i<<1)+j|0)>>>2;a[p+1>>0]=(h+2+(i<<1)+j|0)>>>2;a[p+64>>0]=(i+2+(j<<1)+k|0)>>>2;a[p+33>>0]=(i+2+(j<<1)+k|0)>>>2;a[p+2>>0]=(i+2+(j<<1)+k|0)>>>2;a[p+96>>0]=(j+2+(k<<1)+l|0)>>>2;a[p+65>>0]=(j+2+(k<<1)+l|0)>>>2;a[p+34>>0]=(j+2+(k<<1)+l|0)>>>2;a[p+3>>0]=(j+2+(k<<1)+l|0)>>>2;a[p+97>>0]=(k+2+(l<<1)+m|0)>>>2;a[p+66>>0]=(k+2+(l<<1)+m|0)>>>2;a[p+35>>0]=(k+2+(l<<1)+m|0)>>>2;a[p+98>>0]=(l+2+(m<<1)+z|0)>>>2;a[p+67>>0]=(l+2+(m<<1)+z|0)>>>2;a[p+99>>0]=(m+2+z+(z<<1)|0)>>>2;break}case 7:{g=d[p+-32>>0]|0;h=d[p+-31>>0]|0;i=d[p+-30>>0]|0;j=d[p+-29>>0]|0;k=d[p+-28>>0]|0;l=d[p+-27>>0]|0;m=d[p+-26>>0]|0;z=d[p+-25>>0]|0;a[p>>0]=(g+1+h|0)>>>1;a[p+64>>0]=(h+1+i|0)>>>1;a[p+1>>0]=(h+1+i|0)>>>1;a[p+65>>0]=(i+1+j|0)>>>1;a[p+2>>0]=(i+1+j|0)>>>1;a[p+66>>0]=(j+1+k|0)>>>1;a[p+3>>0]=(j+1+k|0)>>>1;a[p+32>>0]=(g+2+(h<<1)+i|0)>>>2;a[p+96>>0]=(h+2+(i<<1)+j|0)>>>2;a[p+33>>0]=(h+2+(i<<1)+j|0)>>>2;a[p+97>>0]=(i+2+(j<<1)+k|0)>>>2;a[p+34>>0]=(i+2+(j<<1)+k|0)>>>2;a[p+98>>0]=(j+2+(k<<1)+l|0)>>>2;a[p+35>>0]=(j+2+(k<<1)+l|0)>>>2;a[p+67>>0]=(k+2+(l<<1)+m|0)>>>2;a[p+99>>0]=(l+2+(m<<1)+z|0)>>>2;break}case 8:{k=d[p+-1>>0]|0;l=d[p+31>>0]|0;z=d[p+63>>0]|0;m=d[p+95>>0]|0;j=d[p+-33>>0]|0;i=d[p+-32>>0]|0;h=d[p+-31>>0]|0;g=d[p+-30>>0]|0;a[p+34>>0]=(k+1+j|0)>>>1;a[p>>0]=(k+1+j|0)>>>1;a[p+66>>0]=(k+1+l|0)>>>1;a[p+32>>0]=(k+1+l|0)>>>1;a[p+98>>0]=(l+1+z|0)>>>1;a[p+64>>0]=(l+1+z|0)>>>1;a[p+96>>0]=(z+1+m|0)>>>1;a[p+3>>0]=(i+2+(h<<1)+g|0)>>>2;a[p+2>>0]=(j+2+(i<<1)+h|0)>>>2;a[p+35>>0]=((j<<1)+(k+2)+i|0)>>>2;a[p+1>>0]=((j<<1)+(k+2)+i|0)>>>2;a[p+67>>0]=(l+2+(k<<1)+j|0)>>>2;a[p+33>>0]=(l+2+(k<<1)+j|0)>>>2;a[p+99>>0]=(k+2+z+(l<<1)|0)>>>2;a[p+65>>0]=(k+2+z+(l<<1)|0)>>>2;a[p+97>>0]=(l+2+m+(z<<1)|0)>>>2;break}case 9:{k=d[p+-1>>0]|0;l=d[p+31>>0]|0;m=d[p+63>>0]|0;z=a[p+95>>0]|0;a[p>>0]=(k+1+l|0)>>>1;a[p+32>>0]=(l+1+m|0)>>>1;a[p+2>>0]=(l+1+m|0)>>>1;a[p+64>>0]=(m+1+(z&255)|0)>>>1;a[p+34>>0]=(m+1+(z&255)|0)>>>1;a[p+1>>0]=(k+2+(l<<1)+m|0)>>>2;a[p+33>>0]=(l+2+(m<<1)+(z&255)|0)>>>2;a[p+3>>0]=(l+2+(m<<1)+(z&255)|0)>>>2;a[p+65>>0]=(m+2+(z&255)+((z&255)<<1)|0)>>>2;a[p+35>>0]=(m+2+(z&255)+((z&255)<<1)|0)>>>2;a[p+66>>0]=z;a[p+67>>0]=z;Ma(p+96|0,z|0,4)|0;break}default:{}}while(0);g=s+(t*800|0)+(o<<4<<1)|0;switch(n>>>30&3){case 3:{Wc(g,p,0);break}case 2:{ha(g,p);break}case 1:{Hb(g,p);break}default:{}}n=n<<2;o=o+1|0}}while(0);i=c[s+(t*800|0)+792>>2]|0;z=a[s+(t*800|0)+785>>0]|0;e:do switch(((z<<24>>24==0?((t|0)==0?u:v):z&255)&255)<<24>>24){case 0:{g=0;h=8;while(1){if((g|0)==8)break;z=h+(d[y+584+(g+-32)>>0]|0)+(d[y+584+((g<<5)+-1)>>0]|0)|0;g=g+1|0;h=z}Mc(h>>>4&255,y+584|0);g=0;h=8;while(1){if((g|0)==8)break;z=h+(d[y+600+(g+-32)>>0]|0)+(d[y+600+((g<<5)+-1)>>0]|0)|0;g=g+1|0;h=z}Mc(h>>>4&255,y+600|0);break}case 1:{Db(y+584|0,8);Db(y+600|0,8);break}case 2:{g=0;while(1){if((g|0)==8){g=0;break}o=d[y+552>>0]|d[y+552+1>>0]<<8|d[y+552+2>>0]<<16|d[y+552+3>>0]<<24;p=d[y+552+4>>0]|d[y+552+4+1>>0]<<8|d[y+552+4+2>>0]<<16|d[y+552+4+3>>0]<<24;z=y+584+(g<<5)|0;a[z>>0]=o;a[z+1>>0]=o>>8;a[z+2>>0]=o>>16;a[z+3>>0]=o>>24;a[z+4>>0]=p;a[z+4+1>>0]=p>>8;a[z+4+2>>0]=p>>16;a[z+4+3>>0]=p>>24;g=g+1|0}while(1){if((g|0)==8)break e;o=d[y+568>>0]|d[y+568+1>>0]<<8|d[y+568+2>>0]<<16|d[y+568+3>>0]<<24;p=d[y+568+4>>0]|d[y+568+4+1>>0]<<8|d[y+568+4+2>>0]<<16|d[y+568+4+3>>0]<<24;z=y+600+(g<<5)|0;a[z>>0]=o;a[z+1>>0]=o>>8;a[z+2>>0]=o>>16;a[z+3>>0]=o>>24;a[z+4>>0]=p;a[z+4+1>>0]=p>>8;a[z+4+2>>0]=p>>16;a[z+4+3>>0]=p>>24;g=g+1|0}}case 3:{g=0;h=y+584|0;while(1){if((g|0)==8){g=0;h=y+600|0;break}Ma(h|0,a[h+-1>>0]|0,8)|0;g=g+1|0;h=h+32|0}while(1){if((g|0)==8)break e;Ma(h|0,a[h+-1>>0]|0,8)|0;g=g+1|0;h=h+32|0}}case 4:{g=0;h=4;while(1){if((g|0)==8)break;z=h+(d[y+584+((g<<5)+-1)>>0]|0)|0;g=g+1|0;h=z}Mc(h>>>3&255,y+584|0);g=0;h=4;while(1){if((g|0)==8)break;z=h+(d[y+600+((g<<5)+-1)>>0]|0)|0;g=g+1|0;h=z}Mc(h>>>3&255,y+600|0);break}case 5:{g=0;h=4;while(1){if((g|0)==8)break;z=h+(d[y+584+(g+-32)>>0]|0)|0;g=g+1|0;h=z}Mc(h>>>3&255,y+584|0);g=0;h=4;while(1){if((g|0)==8)break;z=h+(d[y+600+(g+-32)>>0]|0)|0;g=g+1|0;h=z}Mc(h>>>3&255,y+600|0);break}case 6:{Mc(-128,y+584|0);Mc(-128,y+600|0);break}default:{}}while(0);vb(i,s+(t*800|0)+512|0,y+584|0);vb(i>>>8,s+(t*800|0)+640|0,y+600|0);if((w|0)<((c[b+212>>2]|0)+-1|0)){m=r;l=y+520|0;n=m+16|0;do{a[m>>0]=a[l>>0]|0;m=m+1|0;l=l+1|0}while((m|0)<(n|0));z=d[y+808>>0]|d[y+808+1>>0]<<8|d[y+808+2>>0]<<16|d[y+808+3>>0]<<24;s=d[y+808+4>>0]|d[y+808+4+1>>0]<<8|d[y+808+4+2>>0]<<16|d[y+808+4+3>>0]<<24;r=q+(t<<5)+16|0;a[r>>0]=z;a[r+1>>0]=z>>8;a[r+2>>0]=z>>16;a[r+3>>0]=z>>24;a[r+4>>0]=s;a[r+4+1>>0]=s>>8;a[r+4+2>>0]=s>>16;a[r+4+3>>0]=s>>24;r=d[y+824>>0]|d[y+824+1>>0]<<8|d[y+824+2>>0]<<16|d[y+824+3>>0]<<24;s=d[y+824+4>>0]|d[y+824+4+1>>0]<<8|d[y+824+4+2>>0]<<16|d[y+824+4+3>>0]<<24;z=q+(t<<5)+24|0;a[z>>0]=r;a[z+1>>0]=r>>8;a[z+2>>0]=r>>16;a[z+3>>0]=r>>24;a[z+4>>0]=s;a[z+4+1>>0]=s>>8;a[z+4+2>>0]=s>>16;a[z+4+3>>0]=s>>24}i=N(x<<4,c[b+1932>>2]|0)|0;h=c[b+1936>>2]|0;i=(c[b+1920>>2]|0)+(t<<4)+i|0;k=t<<3;j=(c[b+1924>>2]|0)+k|0;k=(c[b+1928>>2]|0)+k|0;g=0;while(1){if((g|0)==16)break;m=i+(N(c[b+1932>>2]|0,g)|0)|0;l=y+40+(g<<5)|0;n=m+16|0;do{a[m>>0]=a[l>>0]|0;m=m+1|0;l=l+1|0}while((m|0)<(n|0));g=g+1|0}h=N(h,x<<3)|0;g=0;while(1){if((g|0)==8)break;z=j+h+(N(c[b+1936>>2]|0,g)|0)|0;s=g<<5;q=y+584+s|0;q=d[q>>0]|d[q+1>>0]<<8|d[q+2>>0]<<16|d[q+3>>0]<<24;r=y+584+s+4|0;r=d[r>>0]|d[r+1>>0]<<8|d[r+2>>0]<<16|d[r+3>>0]<<24;a[z>>0]=q;a[z+1>>0]=q>>8;a[z+2>>0]=q>>16;a[z+3>>0]=q>>24;a[z+4>>0]=r;a[z+4+1>>0]=r>>8;a[z+4+2>>0]=r>>16;a[z+4+3>>0]=r>>24;z=k+h+(N(c[b+1936>>2]|0,g)|0)|0;r=y+600+s|0;r=d[r>>0]|d[r+1>>0]<<8|d[r+2>>0]<<16|d[r+3>>0]<<24;s=y+600+s+4|0;s=d[s>>0]|d[s+1>>0]<<8|d[s+2>>0]<<16|d[s+3>>0]<<24;a[z>>0]=r;a[z+1>>0]=r>>8;a[z+2>>0]=r>>16;a[z+3>>0]=r>>24;a[z+4>>0]=s;a[z+4+1>>0]=s>>8;a[z+4+2>>0]=s>>16;a[z+4+3>>0]=s>>24;g=g+1|0}t=t+1|0}return}function Z(b,d,e,f,g){b=b|0;d=d|0;e=e|0;f=f|0;g=g|0;var h=0,i=0,j=0,k=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0;v=l;l=l+16|0;u=c[b+8>>2]|0;a:do switch(c[b>>2]|0){case 2:{i=N(u,e-d|0)|0;h=0;while(1){if((h|0)>=(i|0))break a;u=c[f+(h<<2)>>2]|0;c[g+(h<<2)>>2]=((u>>>8&255)<<16|u>>>8&255)+(u&16711935)&16711935|u&-16711936;h=h+1|0}}case 0:{if(!d){h=0;while(1){if((h|0)==1)break;t=c[f+(h<<2)>>2]|0;c[g+(h<<2)>>2]=t+-16777216&-16711936|t&16711935;h=h+1|0}h=c[g>>2]|0;i=0;while(1){if((i|0)>=(u+-1|0))break;t=c[f+4+(i<<2)>>2]|0;t=(t&-16711936)+(h&-16711936)&-16711936|(t&16711935)+(h&16711935)&16711935;c[g+4+(i<<2)>>2]=t;h=t;i=i+1|0}i=1;f=f+(u<<2)|0;j=g+(u<<2)|0;h=u+-1|0}else{i=d;j=g;h=u+-1|0}t=c[b+4>>2]|0;s=((1<<t)+h|0)>>>t;r=(c[b+16>>2]|0)+((N(s,i>>t)|0)<<2)|0;q=j;while(1){if((i|0)>=(e|0))break;j=q+(0-u<<2)|0;h=0;while(1){if((h|0)==1){j=1;h=r;break}p=c[j+(h<<2)>>2]|0;o=c[f+(h<<2)>>2]|0;c[q+(h<<2)>>2]=(o&-16711936)+(p&-16711936)&-16711936|(o&16711935)+(p&16711935)&16711935;h=h+1|0}b:while(1){if((j|0)>=(u|0))break;o=(j&0-(1<<t))+(1<<t)|0;o=(o|0)>(u|0)?u:o;p=h+4|0;do switch((c[h>>2]|0)>>>8&15){case 1:{m=f+(j<<2)|0;n=q+(j<<2)|0;k=o-j|0;h=c[n+-4>>2]|0;j=0;while(1){if((j|0)>=(k|0)){j=o;h=p;continue b}w=c[m+(j<<2)>>2]|0;w=(w&-16711936)+(h&-16711936)&-16711936|(w&16711935)+(h&16711935)&16711935;c[n+(j<<2)>>2]=w;h=w;j=j+1|0}}case 2:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}w=c[m+(0-u<<2)+(h<<2)>>2]|0;n=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(n&-16711936)+(w&-16711936)&-16711936|(n&16711935)+(w&16711935)&16711935;h=h+1|0}}case 3:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}w=c[m+(0-u<<2)+(h<<2)+4>>2]|0;n=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(n&-16711936)+(w&-16711936)&-16711936|(n&16711935)+(w&16711935)&16711935;h=h+1|0}}case 4:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}w=c[m+(0-u<<2)+(h<<2)+-4>>2]|0;n=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(n&-16711936)+(w&-16711936)&-16711936|(n&16711935)+(w&16711935)&16711935;h=h+1|0}}case 5:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}w=c[m+(h+-1<<2)>>2]|0;x=m+(0-u<<2)+(h<<2)|0;n=c[x>>2]|0;x=c[x+4>>2]|0;n=((((x^w)>>>1&2139062143)+(x&w)^n)>>>1&2139062143)+(((x^w)>>>1&2139062143)+(x&w)&n)|0;w=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(n&-16711936)+(w&-16711936)&-16711936|(n&16711935)+(w&16711935)&16711935;h=h+1|0}}case 6:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}w=c[m+(h+-1<<2)>>2]|0;n=c[m+(0-u<<2)+(h<<2)+-4>>2]|0;x=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(((n^w)>>>1&2139062143)+(n&w)&-16711936)+(x&-16711936)&-16711936|(((n^w)>>>1&2139062143)+(n&w)&16711935)+(x&16711935)&16711935;h=h+1|0}}case 7:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}w=c[m+(h+-1<<2)>>2]|0;n=c[m+(0-u<<2)+(h<<2)>>2]|0;x=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(((n^w)>>>1&2139062143)+(n&w)&-16711936)+(x&-16711936)&-16711936|(((n^w)>>>1&2139062143)+(n&w)&16711935)+(x&16711935)&16711935;h=h+1|0}}case 8:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}n=m+(0-u<<2)+(h<<2)|0;w=c[n+-4>>2]|0;n=c[n>>2]|0;x=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(((n^w)>>>1&2139062143)+(n&w)&-16711936)+(x&-16711936)&-16711936|(((n^w)>>>1&2139062143)+(n&w)&16711935)+(x&16711935)&16711935;h=h+1|0}}case 9:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}n=m+(0-u<<2)+(h<<2)|0;w=c[n>>2]|0;n=c[n+4>>2]|0;x=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(((n^w)>>>1&2139062143)+(n&w)&-16711936)+(x&-16711936)&-16711936|(((n^w)>>>1&2139062143)+(n&w)&16711935)+(x&16711935)&16711935;h=h+1|0}}case 10:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}w=c[m+(h+-1<<2)>>2]|0;y=m+(0-u<<2)+(h<<2)|0;x=c[y+-4>>2]|0;n=c[y>>2]|0;y=c[y+4>>2]|0;w=((((y^n)>>>1&2139062143)+(y&n)^((x^w)>>>1&2139062143)+(x&w))>>>1&2139062143)+(((y^n)>>>1&2139062143)+(y&n)&((x^w)>>>1&2139062143)+(x&w))|0;x=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(w&-16711936)+(x&-16711936)&-16711936|(w&16711935)+(x&16711935)&16711935;h=h+1|0}}case 11:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}x=c[m+(h+-1<<2)>>2]|0;w=m+(0-u<<2)+(h<<2)|0;y=c[w>>2]|0;w=c[w+-4>>2]|0;x=((((x&255)-(w&255)|0)>-1?(x&255)-(w&255)|0:0-((x&255)-(w&255))|0)-(((y&255)-(w&255)|0)>-1?(y&255)-(w&255)|0:0-((y&255)-(w&255))|0)-(((y>>>24)-(w>>>24)|0)>-1?(y>>>24)-(w>>>24)|0:0-((y>>>24)-(w>>>24))|0)+(((x>>>24)-(w>>>24)|0)>-1?(x>>>24)-(w>>>24)|0:0-((x>>>24)-(w>>>24))|0)-(((y>>>8&255)-(w>>>8&255)|0)>-1?(y>>>8&255)-(w>>>8&255)|0:0-((y>>>8&255)-(w>>>8&255))|0)+(((x>>>8&255)-(w>>>8&255)|0)>-1?(x>>>8&255)-(w>>>8&255)|0:0-((x>>>8&255)-(w>>>8&255))|0)-(((y>>>16&255)-(w>>>16&255)|0)>-1?(y>>>16&255)-(w>>>16&255)|0:0-((y>>>16&255)-(w>>>16&255))|0)+(((x>>>16&255)-(w>>>16&255)|0)>-1?(x>>>16&255)-(w>>>16&255)|0:0-((x>>>16&255)-(w>>>16&255))|0)|0)<1?y:x;y=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(x&-16711936)+(y&-16711936)&-16711936|(x&16711935)+(y&16711935)&16711935;h=h+1|0}}case 12:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}y=c[m+(h+-1<<2)>>2]|0;x=m+(0-u<<2)+(h<<2)|0;w=c[x>>2]|0;x=c[x+-4>>2]|0;x=(((w>>>24)+(y>>>24)-(x>>>24)|0)>>>0<256?(w>>>24)+(y>>>24)-(x>>>24)|0:((w>>>24)+(y>>>24)-(x>>>24)|0)>>>24^255)<<24|(((w&255)+(y&255)-(x&255)|0)>>>0<256?(w&255)+(y&255)-(x&255)|0:((w&255)+(y&255)-(x&255)|0)>>>24^255)|(((w>>>16&255)+(y>>>16&255)-(x>>>16&255)|0)>>>0<256?(w>>>16&255)+(y>>>16&255)-(x>>>16&255)|0:((w>>>16&255)+(y>>>16&255)-(x>>>16&255)|0)>>>24^255)<<16|(((w>>>8&255)+(y>>>8&255)-(x>>>8&255)|0)>>>0<256?(w>>>8&255)+(y>>>8&255)-(x>>>8&255)|0:((w>>>8&255)+(y>>>8&255)-(x>>>8&255)|0)>>>24^255)<<8;y=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(x&-16711936)+(y&-16711936)&-16711936|(x&16711935)+(y&16711935)&16711935;h=h+1|0}}case 13:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}w=c[m+(h+-1<<2)>>2]|0;A=m+(0-u<<2)+(h<<2)|0;z=c[A>>2]|0;A=c[A+-4>>2]|0;n=((((((z^w)>>>1&2139062143)+(z&w)|0)>>>24)-(A>>>24)|0)/2|0)+((((z^w)>>>1&2139062143)+(z&w)|0)>>>24)|0;y=((((((z^w)>>>1&2139062143)+(z&w)|0)>>>16&255)-(A>>>16&255)|0)/2|0)+((((z^w)>>>1&2139062143)+(z&w)|0)>>>16&255)|0;x=((((((z^w)>>>1&2139062143)+(z&w)|0)>>>8&255)-(A>>>8&255)|0)/2|0)+((((z^w)>>>1&2139062143)+(z&w)|0)>>>8&255)|0;w=(((((z^w)>>>1&2139062143)+(z&w)&255)-(A&255)|0)/2|0)+(((z^w)>>>1&2139062143)+(z&w)&255)|0;x=(n>>>0<256?n:n>>>24^255)<<24|(w>>>0<256?w:w>>>24^255)|(y>>>0<256?y:y>>>24^255)<<16|(x>>>0<256?x:x>>>24^255)<<8;y=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=(x&-16711936)+(y&-16711936)&-16711936|(x&16711935)+(y&16711935)&16711935;h=h+1|0}}default:{k=f+(j<<2)|0;m=q+(j<<2)|0;j=o-j|0;h=0;while(1){if((h|0)>=(j|0)){j=o;h=p;continue b}A=c[k+(h<<2)>>2]|0;c[m+(h<<2)>>2]=A+-16777216&-16711936|A&16711935;h=h+1|0}}}while(0)}A=i+1|0;r=(A&(1<<t)+-1|0)==0?r+(s<<2)|0:r;i=A;f=f+(u<<2)|0;q=q+(u<<2)|0}if((c[b+12>>2]|0)!=(e|0))pa(g+(0-u<<2)|0,g+((N(u,~d+e|0)|0)<<2)|0,u<<2|0)|0;break}case 1:{n=c[b+4>>2]|0;o=u-(u&0-(1<<n))|0;h=f;i=g;m=(c[b+16>>2]|0)+((N((u+-1+(1<<n)|0)>>>n,d>>n)|0)<<2)|0;while(1){if((d|0)>=(e|0))break a;a[v>>0]=0;a[v+1>>0]=0;a[v+2>>0]=0;k=h+((u&0-(1<<n))<<2)|0;f=m;j=h;while(1){if(j>>>0>=k>>>0)break;A=c[f>>2]|0;a[v>>0]=A;a[v+1>>0]=A>>>8;a[v+2>>0]=A>>>16;rb(v,j,1<<n,i);f=f+4|0;j=j+(1<<n<<2)|0;i=i+(1<<n<<2)|0}if(j>>>0<(h+(u<<2)|0)>>>0){h=c[f>>2]|0;a[v>>0]=h;a[v+1>>0]=h>>>8;a[v+2>>0]=h>>>16;rb(v,j,o,i);h=j+(o<<2)|0;i=i+(o<<2)|0}else h=j;A=d+1|0;m=(A&(1<<n)+-1|0)==0?m+((u+-1+(1<<n)|0)>>>n<<2)|0:m;d=A}}case 3:{if((f|0)==(g|0)?(h=c[b+4>>2]|0,(h|0)>0):0){z=N((u+-1+(1<<h)|0)>>>h,e-d|0)|0;A=f+((N(u,e-d|0)|0)<<2)+(0-z<<2)|0;Yb(A|0,f|0,z<<2|0)|0;Wa(b,d,e,A,f);break a}Wa(b,d,e,f,g);break}default:{}}while(0);l=v;return}function _(b,c,e,f,g,h,i,j,k){b=b|0;c=c|0;e=e|0;f=f|0;g=g|0;h=h|0;i=i|0;j=j|0;k=k|0;var l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0;l=(d[f>>0]|0)<<16|(d[e>>0]|0);m=(d[h>>0]|0)<<16|(d[g>>0]|0);s=((d[b>>0]|0)*19077|0)>>>8;q=(((((l*3|0)+131074+m|0)>>>18&255)*26149|0)>>>8)+s|0;r=s-(((((l*3|0)+131074+m|0)>>>2&255)*6419|0)>>>8)-(((((l*3|0)+131074+m|0)>>>18&255)*13320|0)>>>8)|0;s=(((((l*3|0)+131074+m|0)>>>2&255)*33050|0)>>>8)+s|0;a[i>>0]=q>>>0<14234?0:q>>>0>30554?-1:(q+2150|0)>>>6&255;a[i+1>>0]=(r|0)<-8708?0:(r|0)>7612?-1:(r+8708|0)>>>6&255;a[i+2>>0]=s>>>0<17685?0:s>>>0>34005?-1:(s+15083|0)>>>6&255;a[i+3>>0]=-1;if(c|0){s=((d[c>>0]|0)*19077|0)>>>8;q=s+((((l+131074+(m*3|0)|0)>>>18&255)*26149|0)>>>8)|0;r=s-((((l+131074+(m*3|0)|0)>>>2&255)*6419|0)>>>8)-((((l+131074+(m*3|0)|0)>>>18&255)*13320|0)>>>8)|0;s=s+((((l+131074+(m*3|0)|0)>>>2&255)*33050|0)>>>8)|0;a[j>>0]=q>>>0<14234?0:q>>>0>30554?-1:(q+2150|0)>>>6&255;a[j+1>>0]=(r|0)<-8708?0:(r|0)>7612?-1:(r+8708|0)>>>6&255;a[j+2>>0]=s>>>0<17685?0:s>>>0>34005?-1:(s+15083|0)>>>6&255;a[j+3>>0]=-1;s=1}else s=1;while(1){if((s|0)>(k+-1>>1|0))break;o=(d[f+s>>0]|0)<<16|(d[e+s>>0]|0);p=(d[h+s>>0]|0)<<16|(d[g+s>>0]|0);r=m+524296+l+o+p|0;q=(r+(o+m<<1)|0)>>>3;r=(r+(p+l<<1)|0)>>>3;v=q+l|0;l=s<<1;n=i+(l+-1<<2)|0;t=((d[b+(l+-1)>>0]|0)*19077|0)>>>8;u=t-(((v>>>1&255)*6419|0)>>>8)-(((v>>>17&255)*13320|0)>>>8)|0;a[n>>0]=((((v>>>17&255)*26149|0)>>>8)+t|0)>>>0<14234?0:((((v>>>17&255)*26149|0)>>>8)+t|0)>>>0>30554?-1:((((v>>>17&255)*26149|0)>>>8)+t+2150|0)>>>6&255;a[n+1>>0]=(u|0)<-8708?0:(u|0)>7612?-1:(u+8708|0)>>>6&255;a[n+2>>0]=((((v>>>1&255)*33050|0)>>>8)+t|0)>>>0<17685?0:((((v>>>1&255)*33050|0)>>>8)+t|0)>>>0>34005?-1:((((v>>>1&255)*33050|0)>>>8)+t+15083|0)>>>6&255;a[n+3>>0]=-1;n=s<<3;t=((d[b+l>>0]|0)*19077|0)>>>8;v=((((r+o|0)>>>17&255)*26149|0)>>>8)+t|0;u=t-((((r+o|0)>>>1&255)*6419|0)>>>8)-((((r+o|0)>>>17&255)*13320|0)>>>8)|0;t=((((r+o|0)>>>1&255)*33050|0)>>>8)+t|0;a[i+n>>0]=v>>>0<14234?0:v>>>0>30554?-1:(v+2150|0)>>>6&255;a[i+n+1>>0]=(u|0)<-8708?0:(u|0)>7612?-1:(u+8708|0)>>>6&255;a[i+n+2>>0]=t>>>0<17685?0:t>>>0>34005?-1:(t+15083|0)>>>6&255;a[i+n+3>>0]=-1;if(c|0){t=r+m|0;v=j+(l+-1<<2)|0;u=((d[c+(l+-1)>>0]|0)*19077|0)>>>8;r=u-(((t>>>1&255)*6419|0)>>>8)-(((t>>>17&255)*13320|0)>>>8)|0;a[v>>0]=(u+(((t>>>17&255)*26149|0)>>>8)|0)>>>0<14234?0:(u+(((t>>>17&255)*26149|0)>>>8)|0)>>>0>30554?-1:(u+(((t>>>17&255)*26149|0)>>>8)+2150|0)>>>6&255;a[v+1>>0]=(r|0)<-8708?0:(r|0)>7612?-1:(r+8708|0)>>>6&255;a[v+2>>0]=(u+(((t>>>1&255)*33050|0)>>>8)|0)>>>0<17685?0:(u+(((t>>>1&255)*33050|0)>>>8)|0)>>>0>34005?-1:(u+(((t>>>1&255)*33050|0)>>>8)+15083|0)>>>6&255;a[v+3>>0]=-1;v=((d[c+l>>0]|0)*19077|0)>>>8;t=v+((((q+p|0)>>>17&255)*26149|0)>>>8)|0;u=v-((((q+p|0)>>>1&255)*6419|0)>>>8)-((((q+p|0)>>>17&255)*13320|0)>>>8)|0;v=v+((((q+p|0)>>>1&255)*33050|0)>>>8)|0;a[j+n>>0]=t>>>0<14234?0:t>>>0>30554?-1:(t+2150|0)>>>6&255;a[j+n+1>>0]=(u|0)<-8708?0:(u|0)>7612?-1:(u+8708|0)>>>6&255;a[j+n+2>>0]=v>>>0<17685?0:v>>>0>34005?-1:(v+15083|0)>>>6&255;a[j+n+3>>0]=-1}s=s+1|0;l=o;m=p}if((k&1|0)==0?(u=m+131074+(l*3|0)|0,v=i+(k+-1<<2)|0,t=((d[b+(k+-1)>>0]|0)*19077|0)>>>8,i=t-(((u>>>2&255)*6419|0)>>>8)-(((u>>>18&255)*13320|0)>>>8)|0,a[v>>0]=(t+(((u>>>18&255)*26149|0)>>>8)|0)>>>0<14234?0:(t+(((u>>>18&255)*26149|0)>>>8)|0)>>>0>30554?-1:(t+(((u>>>18&255)*26149|0)>>>8)+2150|0)>>>6&255,a[v+1>>0]=(i|0)<-8708?0:(i|0)>7612?-1:(i+8708|0)>>>6&255,a[v+2>>0]=(t+(((u>>>2&255)*33050|0)>>>8)|0)>>>0<17685?0:(t+(((u>>>2&255)*33050|0)>>>8)|0)>>>0>34005?-1:(t+(((u>>>2&255)*33050|0)>>>8)+15083|0)>>>6&255,a[v+3>>0]=-1,c|0):0){u=l+131074+(m*3|0)|0;v=j+(k+-1<<2)|0;t=((d[c+(k+-1)>>0]|0)*19077|0)>>>8;k=t-(((u>>>2&255)*6419|0)>>>8)-(((u>>>18&255)*13320|0)>>>8)|0;a[v>>0]=(t+(((u>>>18&255)*26149|0)>>>8)|0)>>>0<14234?0:(t+(((u>>>18&255)*26149|0)>>>8)|0)>>>0>30554?-1:(t+(((u>>>18&255)*26149|0)>>>8)+2150|0)>>>6&255;a[v+1>>0]=(k|0)<-8708?0:(k|0)>7612?-1:(k+8708|0)>>>6&255;a[v+2>>0]=(t+(((u>>>2&255)*33050|0)>>>8)|0)>>>0<17685?0:(t+(((u>>>2&255)*33050|0)>>>8)|0)>>>0>34005?-1:(t+(((u>>>2&255)*33050|0)>>>8)+15083|0)>>>6&255;a[v+3>>0]=-1}return}function $(a,b,d,e,f,g){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;g=g|0;var h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0;h=c[a+68>>2]|0;r=b+((N(e,d)|0)<<2)|0;s=N(f,d)|0;t=c[a+76>>2]|0;u=(t|0)>0?a+80|0:0;v=c[a+92>>2]|0;if((h|0)<(s|0))e=vc(a+76|0,(h|0)%(d|0)|0,(h|0)/(d|0)|0)|0;else e=0;i=(h|0)/(d|0)|0;m=(h|0)%(d|0)|0;l=b+(h<<2)|0;k=b+(h<<2)|0;a:while(1){o=k;n=i;p=m;while(1){if(l>>>0>=(b+(s<<2)|0)>>>0){q=52;break a}if(!(p&v))e=vc(a+76|0,p,n)|0;if(c[e+28>>2]|0){q=11;break}id(a+24|0);if(c[e+32>>2]|0){h=Pb(e,a+24|0,l)|0;if(oc(a+24|0)|0){q=52;break a}if(!h)break;else m=h}else m=mb(c[e>>2]|0,a+24|0)|0;if(oc(a+24|0)|0){q=52;break a}if((m|0)<256){q=18;break}if((m|0)>=280){q=47;break}j=td(m+-256|0,a+24|0)|0;h=mb(c[e+16>>2]|0,a+24|0)|0;id(a+24|0);h=jc(d,Pc(h,a+24|0)|0)|0;if(oc(a+24|0)|0){q=52;break a}i=l;if((i-b>>2|0)<(h|0)){q=58;break a}if((r-i>>2|0)<(j|0)){q=58;break a}$a(l,h,j);m=j+p|0;while(1){if((m|0)<(d|0))break;h=m-d|0;i=n+1|0;if(!((g|0)!=0&(n|0)<(f|0)&(i&15|0)==0)){n=i;m=h;continue}if((g|0)==1){Xa(a,i);n=i;m=h;continue}else{Ia(a,i);n=i;m=h;continue}}l=l+(j<<2)|0;if(m&v)e=vc(a+76|0,m,n)|0;if((t|0)>0){q=44;break}else p=m}do if((q|0)==11){h=c[e+24>>2]|0;q=21}else if((q|0)==18)if(!(c[e+20>>2]|0)){h=mb(c[e+4>>2]|0,a+24|0)|0;id(a+24|0);i=mb(c[e+8>>2]|0,a+24|0)|0;j=mb(c[e+12>>2]|0,a+24|0)|0;if(!(oc(a+24|0)|0)){h=h<<16|m<<8|i|j<<24;q=21;break}else{q=52;break a}}else{h=c[e+24>>2]|m<<8;q=21;break}else if((q|0)==44){q=0;j=((k>>>0>l>>>0?k:l)+3+(0-o)|0)>>>2;h=k;while(1){if(h>>>0>=l>>>0)break;Oc(u,c[h>>2]|0);h=h+4|0}i=n;k=k+(j<<2)|0;continue a}else if((q|0)==47){if((m|0)>=(t+280|0)){q=58;break a}i=((k>>>0>l>>>0?k:l)+3+(0-o)|0)>>>2;h=k;while(1){if(h>>>0>=l>>>0)break;Oc(u,c[h>>2]|0);h=h+4|0}k=k+(i<<2)|0;h=hd(u,m+-280|0)|0;q=21}while(0);if((q|0)==21){q=0;c[l>>2]=h}j=k;l=l+4|0;h=p+1|0;if((h|0)<(d|0)){i=n;m=h;continue}i=n+1|0;do if((g|0)!=0&(n|0)<(f|0)&(i&15|0)==0)if((g|0)==1){Xa(a,i);break}else{Ia(a,i);break}while(0);if((t|0)<=0){m=0;continue}j=((k>>>0>l>>>0?k:l)+3+(0-j)|0)>>>2;h=k;while(1){if(h>>>0>=l>>>0)break;Oc(u,c[h>>2]|0);h=h+4|0}m=0;k=k+(j<<2)|0}if((q|0)==52){d=oc(a+24|0)|0;c[a+48>>2]=d;if(!d){do if(g|0){e=(n|0)>(f|0)?f:n;if((g|0)==1){Xa(a,e);break}else{Ia(a,e);break}}while(0);c[a>>2]=0;c[a+68>>2]=l-b>>2;e=1}else q=58}if((q|0)==58){c[a>>2]=3;e=0}return e|0}function aa(a,b,d,e,f,g,h,i){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;g=g|0;h=h|0;i=i|0;var j=0,k=0,m=0,n=0,o=0;o=l;l=l+80|0;c[o+60>>2]=a;c[o+56>>2]=b;c[o+64>>2]=0;c[o+52>>2]=0;c[o+48>>2]=0;c[o+44>>2]=0;c[o+40>>2]=0;if(i|0)m=c[i+8>>2]|0;else m=0;a:do if(!((a|0)==0|b>>>0<12)){n=o+4+8|0;c[n>>2]=0;c[n+4>>2]=0;c[n+8>>2]=0;c[n+12>>2]=0;c[n+16>>2]=0;c[n+20>>2]=0;c[n+24>>2]=0;c[o+4>>2]=a;c[o+4+4>>2]=b;a=ab(o+60|0,o+56|0,m,o+4+28|0)|0;if(!a){b=c[o+4+28>>2]|0;c[o>>2]=0;a=wa(o+60|0,o+56|0,o+40|0,o+64|0,o+52|0,o)|0;if(!a){j=c[o>>2]|0;n=c[o+40>>2]|0;if((n|0)!=0&((b|0)!=0^1))a=3;else{if(f|0)c[f>>2]=j>>>4&1;if(g|0)c[g>>2]=(j&2)>>>1;if(h|0)c[h>>2]=0;c[o+48>>2]=c[o+64>>2];c[o+44>>2]=c[o+52>>2];b:do if(!((i|0)==0&((j&2|0)!=0&(n|0)!=0))){do if((c[o+56>>2]|0)>>>0>=4){if(!((b|0)!=0&(n|0)!=0))if((n|b|0)==0?(Eb(c[o+60>>2]|0,4315,4)|0)==0:0)k=19;else a=b;else k=19;if((k|0)==19){a=Ha(o+60|0,o+56|0,b,o+4+16|0,o+4+20|0)|0;if(a|0)break;a=c[o+4+28>>2]|0}a=La(o+60|0,o+56|0,m,a,o+4+24|0,o+4+32|0)|0;if(!a){g=c[o+4+24>>2]|0;if(g>>>0>4294967286){a=3;break a}a=c[o+4+32>>2]|0;if(!((h|0)==0|((j&2)>>>1|0)!=0))c[h>>2]=a|0?2:1;b=c[o+56>>2]|0;if(!a){if(b>>>0<10){a=7;break}a=c[o+60>>2]|0;if(!(bb(a,b,g,o+48|0,o+44|0)|0)){a=3;break a}}else{if(b>>>0<5){a=7;break}a=c[o+60>>2]|0;if(!(gb(a,b,o+48|0,o+44|0,f)|0)){a=3;break a}}if(n|0){if((c[o+64>>2]|0)!=(c[o+48>>2]|0)){a=3;break a}if((c[o+52>>2]|0)!=(c[o+44>>2]|0)){a=3;break a}}if(!i)break b;b=i;g=o+4|0;j=b+36|0;do{c[b>>2]=c[g>>2];b=b+4|0;g=g+4|0}while((b|0)<(j|0));c[i+12>>2]=a-(c[i>>2]|0);break b}}else a=7;while(0);if(!((i|0)==0&((a|0)==7&(n|0)!=0)))break a}while(0);if(f|0)c[f>>2]=c[f>>2]|(c[o+4+16>>2]|0)!=0;if(d|0)c[d>>2]=c[o+48>>2];if(!e){a=0;break}c[e>>2]=c[o+44>>2];a=0;break}}}}else a=7;while(0);l=o;return a|0}function ba(e,f,g){e=e|0;f=f|0;g=g|0;var h=0,i=0,j=0,k=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0;A=l;l=l+96|0;y=c[e+1956>>2]|0;z=c[e+1948>>2]|0;w=d[y+(z*800|0)+797>>0]|0;x=c[e+1908>>2]|0;Ma(y+(z*800|0)|0,0,768)|0;if(!(a[y+(z*800|0)+768>>0]|0)){h=A+64|0;i=h+32|0;do{b[h>>1]=0;h=h+2|0}while((h|0)<(i|0));v=Ka(g,e+1684|0,(d[x+-1>>0]|0)+(d[f+1>>0]|0)|0,e+460+(w*24|0)+8|0,0,A+64|0)|0;a[x+-1>>0]=(v|0)>0&1;a[f+1>>0]=(v|0)>0&1;a:do if((v|0)>1){h=0;while(1){if((h|0)==4){h=y+(z*800|0)|0;i=0;break}r=b[A+64+(h<<1)>>1]|0;v=h+12|0;s=b[A+64+(v<<1)>>1]|0;q=h+4|0;t=b[A+64+(q<<1)>>1]|0;p=h+8|0;u=b[A+64+(p<<1)>>1]|0;c[A+(h<<2)>>2]=u+t+(s+r);c[A+(p<<2)>>2]=s+r-(u+t);c[A+(q<<2)>>2]=t-u+(r-s);c[A+(v<<2)>>2]=r-s-(t-u);h=h+1|0}while(1){if((i|0)==4)break;v=i<<2;s=(c[A+(v<<2)>>2]|0)+3|0;t=c[A+((v|3)<<2)>>2]|0;u=c[A+((v|1)<<2)>>2]|0;v=c[A+((v|2)<<2)>>2]|0;b[h>>1]=(v+u+(s+t)|0)>>>3;b[h+32>>1]=(u-v+(s-t)|0)>>>3;b[h+64>>1]=(s+t-(v+u)|0)>>>3;b[h+96>>1]=(s-t-(u-v)|0)>>>3;h=h+128|0;i=i+1|0}}else{i=((b[A+64>>1]|0)+3|0)>>>3&65535;h=0;while(1){if((h|0)>=256)break a;b[y+(z*800|0)+(h<<1)>>1]=i;h=h+16|0}}while(0);s=1;h=0}else{s=0;h=3}n=e+1616+(h*68|0)|0;o=y+(z*800|0)|0;r=a[f>>0]&15;h=a[x+-2>>0]&15;v=0;q=0;while(1){if((q|0)==4)break;m=h&255;p=0;i=m&1;j=0;k=o;h=r;while(1){if((j|0)==4)break;u=h&255;r=Ka(g,n,(u&1)+i|0,e+460+(w*24|0)|0,s,k)|0;t=(r|0)>(s|0)&1;p=ed(p,r,(b[k>>1]|0)!=0&1)|0;i=t;j=j+1|0;k=k+32|0;h=(t<<7|u>>>1)&255}o=o+128|0;r=(h&255)>>>4;h=(i<<7|m>>>1)&255;v=p|v<<8;q=q+1|0}u=0;t=(h&255)>>>4;n=r&255;o=0;r=y+(z*800|0)+512|0;while(1){if((o|0)>=4)break;i=o+4|0;h=0;p=(d[x+-2>>0]|0)>>>i;q=0;i=(d[f>>0]|0)>>>i;s=r;while(1){if((q|0)==2)break;m=p&1;k=0;j=s;while(1){if((k|0)==2)break;B=Ka(g,e+1752|0,m+(i&1)|0,e+460+(w*24|0)+16|0,0,j)|0;m=(B|0)>0&1;h=ed(h,B,(b[j>>1]|0)!=0&1)|0;k=k+1|0;i=((B|0)>0&1)<<3|i>>>1&127;j=j+32|0}p=m<<5|p>>>1&127;q=q+1|0;i=i>>>2&63;s=s+64|0}u=h<<(o<<2)|u;t=(p&240)<<o|t;n=(i<<4&4080)<<o|n;o=o+2|0;r=r+128|0}a[f>>0]=n;a[x+-2>>0]=t;c[y+(z*800|0)+788>>2]=v;c[y+(z*800|0)+792>>2]=u;l=A;return (u|v|0)==0|0}function ca(d,f,g,h,i){d=d|0;f=f|0;g=g|0;h=h|0;i=i|0;var j=0,k=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0;z=l;l=l+16|0;c[z>>2]=0;k=e[428+(h<<1)>>1]|0;a:do if((i|0)!=0?(_b(d+24|0,1)|0)!=0:0){i=(_b(d+24|0,3)|0)+2|0;j=N((f+-1+(1<<i)|0)>>>i,(g+-1+(1<<i)|0)>>>i)|0;if(!(ma((f+-1+(1<<i)|0)>>>i,(g+-1+(1<<i)|0)>>>i,0,d,z)|0)){g=0;f=0;i=0;v=31}else{c[d+96>>2]=i;g=c[z>>2]|0;i=0;f=1;while(1){if((i|0)>=(j|0)){u=f;v=7;break a}u=g+(i<<2)|0;v=(c[u>>2]|0)>>>8&65535;c[u>>2]=v;i=i+1|0;f=(v|0)<(f|0)?f:v+1|0}}}else{u=1;v=7}while(0);b:do if((v|0)==7)if(!(c[d+48>>2]|0)){i=0;j=0;while(1){if((i|0)==5)break;t=((h|0)>0&(i|0)==0?1<<h:0)+(e[452+(i<<1)>>1]|0)|0;i=i+1|0;j=(j|0)<(t|0)?t:j}f=N(u,k)|0;f=wc(f,((f|0)<0)<<31>>31,4)|0;g=md(u)|0;i=Kc(j,((j|0)<0)<<31>>31,4)|0;if((f|0)==0|((g|0)==0|(i|0)==0)){c[d>>2]=1;v=31;break}else{j=f;s=0}while(1){if((s|0)>=(u|0))break;t=g+(s*548|0)|0;k=0;n=1;o=0;r=0;while(1){if((r|0)>=5)break;p=e[452+(r<<1)>>1]|0;c[g+(s*548|0)+(r<<2)>>2]=j;p=((h|0)>0&(r|0)==0?1<<h:0)+p|0;m=xa(p,d,i,j)|0;if(!m){v=31;break b}A=a[j>>0]|0;q=(n|0)==0|(r|4|0)==4?n:A<<24>>24==0&1;o=o+(A&255)|0;j=j+(m<<2)|0;if((r|0)<4){m=1;n=c[i>>2]|0;while(1){if((m|0)>=(p|0))break;A=c[i+(m<<2)>>2]|0;m=m+1|0;n=(A|0)>(n|0)?A:n}k=n+k|0}n=q;r=r+1|0}c[g+(s*548|0)+20>>2]=n;m=g+(s*548|0)+28|0;c[m>>2]=0;if(((n|0)!=0?(w=(e[(c[g+(s*548|0)+4>>2]|0)+2>>1]|0)<<16|(e[(c[g+(s*548|0)+8>>2]|0)+2>>1]|0)|(e[(c[g+(s*548|0)+12>>2]|0)+2>>1]|0)<<24,x=g+(s*548|0)+24|0,c[x>>2]=w,(o|0)==0):0)?(y=b[(c[t>>2]|0)+2>>1]|0,(y&65535)<256):0){c[m>>2]=1;c[x>>2]=(y&65535)<<8|w;c[g+(s*548|0)+32>>2]=0}else v=27;if((v|0)==27?(v=0,A=(k|0)<6,c[g+(s*548|0)+32>>2]=A&1,A):0)za(t);s=s+1|0}Ed(i);c[d+104>>2]=c[z>>2];c[d+108>>2]=u;c[d+112>>2]=g;c[d+116>>2]=f;i=1}else{g=0;f=0;i=0;v=31}while(0);if((v|0)==31){Ed(i);Ed(c[z>>2]|0);Ed(f);wd(g);i=0}l=z;return i|0}function da(d,e,f,g,h){d=d|0;e=e|0;f=f|0;g=g|0;h=h|0;var i=0,j=0,k=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0;u=l;l=l+144|0;i=u+64|0;j=i+64|0;do{c[i>>2]=0;i=i+4|0}while((i|0)<(j|0));i=0;while(1){if((i|0)>=(g|0)){k=5;break}j=c[f+(i<<2)>>2]|0;if((j|0)>15){i=0;break}c[u+64+(j<<2)>>2]=(c[u+64+(j<<2)>>2]|0)+1;i=i+1|0}a:do if((k|0)==5)if((c[u+64>>2]|0)==(g|0))i=0;else{i=0;j=1;while(1){c[u+(j<<2)>>2]=i;if((j|0)>=15){i=0;break}k=c[u+64+(j<<2)>>2]|0;if((k|0)>(1<<j|0)){i=0;break a}i=k+i|0;j=j+1|0}while(1){if((i|0)>=(g|0))break;j=c[f+(i<<2)>>2]|0;if((j|0)>0){t=c[u+(j<<2)>>2]|0;c[u+(j<<2)>>2]=t+1;b[h+(t<<1)>>1]=i}i=i+1|0}if((c[u+60>>2]|0)==1){a[u+128>>0]=0;b[u+128+2>>1]=b[h>>1]|0;b[u+132>>1]=b[u+128>>1]|0;b[u+132+2>>1]=b[u+128+2>>1]|0;cc(d,1,1<<e,u+132|0);i=1<<e;break}i=1;o=1;g=0;p=2;q=1;m=0;while(1){if((q|0)>(e|0))break;n=i<<1;o=n+o|0;j=u+64+(q<<2)|0;k=c[j>>2]|0;if((n-k|0)<0){i=0;break a}f=q&255;i=k;while(1){if((i|0)<=0)break;a[u+128>>0]=f;b[u+128+2>>1]=b[h+(m<<1)>>1]|0;b[u+132>>1]=b[u+128>>1]|0;b[u+132+2>>1]=b[u+128+2>>1]|0;cc(d+(g<<2)|0,p,1<<e,u+132|0);s=Fc(g,q)|0;t=i+-1|0;c[j>>2]=t;g=s;m=m+1|0;i=t}i=n-k|0;p=p<<1;q=q+1|0}f=1<<e;n=-1;p=d;k=1<<e;t=2;j=e;while(1){s=j+1|0;if((j|0)>=15)break;r=i<<1;o=r+o|0;q=c[u+64+(s<<2)>>2]|0;if((r-q|0)<0){i=0;break a}j=p;i=q;while(1){if((i|0)<=0)break;i=g&(1<<e)+-1;if((i|0)==(n|0))i=n;else{j=j+(f<<2)|0;p=fc(u+64|0,s,e)|0;a[d+(i<<2)>>0]=p+e;b[d+(i<<2)+2>>1]=((j-d|0)>>>2)-i;f=1<<p;k=(1<<p)+k|0}a[u+128>>0]=s-e;b[u+128+2>>1]=b[h+(m<<1)>>1]|0;b[u+132>>1]=b[u+128>>1]|0;b[u+132+2>>1]=b[u+128+2>>1]|0;cc(j+(g>>>e<<2)|0,t,f,u+132|0);v=Fc(g,s)|0;p=(c[u+64+(s<<2)>>2]|0)+-1|0;c[u+64+(s<<2)>>2]=p;n=i;g=v;m=m+1|0;i=p}p=j;i=r-q|0;t=t<<1;j=s}i=(o|0)==((c[u+60>>2]<<1)+-1|0)?k:0}while(0);l=u;return i|0}function ea(e,f){e=e|0;f=f|0;var g=0,h=0,i=0,j=0;a:do if(e){yd(e);if(!f){Lc(e,2,3730)|0;f=0;break}h=c[f+48>>2]|0;i=c[f+44>>2]|0;if(i>>>0<4){Lc(e,7,3767)|0;f=0;break}g=d[h>>0]|0;j=d[h+1>>0]<<8|g|d[h+2>>0]<<16;a[e+40>>0]=g&1^1;a[e+41>>0]=g>>>1&7;a[e+42>>0]=g>>>4&1;c[e+44>>2]=j>>>5;if((g>>>1&7)>3){Lc(e,3,3785)|0;f=0;break}if(!((g>>>4&1)<<24>>24)){Lc(e,4,3816)|0;f=0;break}do if(((g&1^1)&255)<<24>>24){if((i+-3|0)>>>0<7){Lc(e,7,3839)|0;f=0;break a}if(!(xc(h+3|0,i+-3|0)|0)){Lc(e,3,3867)|0;f=0;break a}else{j=d[h+7>>0]<<8&16128|d[h+6>>0];b[e+48>>1]=j;a[e+52>>0]=(d[h+7>>0]|0)>>>6;g=d[h+9>>0]<<8&16128|d[h+8>>0];b[e+50>>1]=g;a[e+53>>0]=(d[h+9>>0]|0)>>>6;c[e+208>>2]=(j+15|0)>>>4;c[e+212>>2]=(g+15|0)>>>4;c[f>>2]=j;c[f+4>>2]=g;c[f+12>>2]=j;c[f+16>>2]=g;qd(e+556|0);Sc(e+104|0);h=h+10|0;g=i+-10|0;f=c[e+44>>2]|0;break}}else{h=h+3|0;g=i+-3|0;f=j>>>5}while(0);if(f>>>0>g>>>0){Lc(e,7,3881)|0;f=0;break}tc(e+12|0,h,f);f=c[e+44>>2]|0;if(a[e+40>>0]|0){a[e+54>>0]=Cd(e+12|0)|0;a[e+55>>0]=Cd(e+12|0)|0}if(!(Ca(e+12|0,e+104|0,e+556|0)|0)){Lc(e,3,3902)|0;f=0;break}if(!(Pa(e+12|0,e)|0)){Lc(e,3,3930)|0;f=0;break}f=_a(e,h+f|0,g-f|0)|0;if(f|0){Lc(e,f,3957)|0;f=0;break}oa(e);if(!(a[e+40>>0]|0)){Lc(e,4,3981)|0;f=0;break}else{Cd(e+12|0)|0;Da(e+12|0,e);c[e+4>>2]=1;f=1;break}}else f=0;while(0);return f|0}function fa(b,d,e,f,g){b=b|0;d=d|0;e=e|0;f=f|0;g=g|0;var h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0;h=c[b+68>>2]|0;q=N(f,e)|0;o=N(g,e)|0;p=c[b+92>>2]|0;if((h|0)<(o|0))f=vc(b+76|0,(h|0)%(e|0)|0,(h|0)/(e|0)|0)|0;else f=0;m=(h|0)/(e|0)|0;i=(h|0)%(e|0)|0;n=h;h=c[b+48>>2]|0;while(1){if(!((n|0)<(o|0)&(h|0)==0)){h=21;break}if(!(i&p))j=vc(b+76|0,i,m)|0;else j=f;id(b+24|0);f=mb(c[j>>2]|0,b+24|0)|0;if((f|0)<256){a[d+n>>0]=f;f=n+1|0;i=i+1|0;if((i|0)>=(e|0)){h=m+1|0;if((m|0)<(g|0)&(h&15|0)==0){jb(b,h);i=0}else i=0}else h=m}else{if((f|0)>=280){h=19;break}l=td(f+-256|0,b+24|0)|0;f=mb(c[j+16>>2]|0,b+24|0)|0;id(b+24|0);f=jc(e,Pc(f,b+24|0)|0)|0;if((q-n|0)<(l|0)|(n|0)<(f|0)){h=19;break}Fa(d+n|0,f,l);k=l+i|0;while(1){if((k|0)<(e|0))break;f=k-e|0;h=m+1|0;if(!((m|0)<(g|0)&(h&15|0)==0)){m=h;k=f;continue}jb(b,h);m=h;k=f}f=l+n|0;if((f|0)>=(o|0)|(k&p|0)==0){h=m;i=k}else{h=m;i=k;j=vc(b+76|0,k,m)|0}}l=oc(b+24|0)|0;c[b+48>>2]=l;m=h;n=f;f=j;h=l}if((h|0)==19){f=oc(b+24|0)|0;c[b+48>>2]=f;h=22}else if((h|0)==21){jb(b,(m|0)>(g|0)?g:m);f=oc(b+24|0)|0;c[b+48>>2]=f;if((q|0)>(n|0)&(f|0)!=0)h=22;else{c[b+68>>2]=n;f=1}}if((h|0)==22){c[b>>2]=f|0?5:3;f=0}return f|0}function ga(b){b=b|0;var d=0,f=0,g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0;j=c[b+128>>2]|0;l=c[b+208>>2]|0;f=c[b+1960>>2]|0;i=(f|0)>0?l<<2:0;f=a[462+f>>0]|0;k=N((((j<<4)+(f&255)|0)*3|0)/2|0,l<<5)|0;if(!(c[b+2e3>>2]|0)){m=0;n=0}else{m=qc(e[b+50>>1]|0|0,0,e[b+48>>1]|0|0,0)|0;n=y}h=Rc(l<<5|0,0,863,0)|0;h=Rc(h|0,y|0,l<<2|0,0)|0;h=Rc(h|0,y|0,l*800|0,0)|0;h=Rc(h|0,y|0,(l<<1)+2|0,0)|0;h=Rc(h|0,y|0,i|0,0)|0;h=Rc(h|0,y|0,k|0,0)|0;h=Rc(h|0,y|0,m|0,n|0)|0;g=y;a:do if((h|0)==(h|0)&(g|0)==0){d=c[b+1940>>2]|0;do if(g>>>0>0|((g|0)==0?h>>>0>(c[b+1944>>2]|0)>>>0:0)){Ed(d);c[b+1944>>2]=0;d=wc(h,g,1)|0;c[b+1940>>2]=d;if(!d){d=Lc(b,1,513)|0;break a}else{c[b+1944>>2]=h;f=a[462+(c[b+1960>>2]|0)>>0]|0;break}}while(0);c[b+1896>>2]=d;d=d+(l<<2)|0;c[b+1904>>2]=d;c[b+1908>>2]=d+(l<<5)+2;h=i|0?d+(l<<5)+((l<<1)+2)|0:0;c[b+1912>>2]=h;c[b+132>>2]=0;c[b+144>>2]=h;i=d+(l<<5)+((l<<1)+2)+i+31&-32;c[b+1916>>2]=i;c[b+1956>>2]=i+832;c[b+148>>2]=i+832;c[b+1932>>2]=l<<4;c[b+1936>>2]=l<<3;h=N(l<<3,(f&255)>>>1&255)|0;g=i+832+(l*800|0)+(N(l<<4,f&255)|0)|0;c[b+1920>>2]=g;g=g+(N(l<<4,j<<4)|0)+h|0;c[b+1924>>2]=g;c[b+1928>>2]=g+(N(j<<3,l<<3)|0)+h;c[b+124>>2]=0;c[b+2016>>2]=(m|0)!=0|(n|0)!=0?i+832+(l*800|0)+k|0:0;Ma(d+(l<<5)+2+-2|0,0,(l<<1)+2|0)|0;Jc(b);Ma(c[b+1896>>2]|0,0,l<<2|0)|0;d=1}else d=0;while(0);return d|0}function ha(c,e){c=c|0;e=e|0;var f=0,g=0,h=0,i=0;g=(b[c>>1]|0)+4|0;f=b[c+8>>1]|0;c=b[c+2>>1]|0;h=(f*20091>>16)+f+g|0;i=(h+((c*20091>>16)+c)>>3)+(d[e>>0]|0)|0;a[e>>0]=i>>>0>255?(i>>>31)+255|0:i;i=(h+(c*35468>>16)>>3)+(d[e+1>>0]|0)|0;a[e+1>>0]=i>>>0>255?(i>>>31)+255|0:i;i=(h-(c*35468>>16)>>3)+(d[e+2>>0]|0)|0;a[e+2>>0]=i>>>0>255?(i>>>31)+255|0:i;h=(h-((c*20091>>16)+c)>>3)+(d[e+3>>0]|0)|0;a[e+3>>0]=h>>>0>255?(h>>>31)+255|0:h;h=(f*35468>>16)+g|0;i=((c*20091>>16)+c+h>>3)+(d[e+32>>0]|0)|0;a[e+32>>0]=i>>>0>255?(i>>>31)+255|0:i;i=(h+(c*35468>>16)>>3)+(d[e+33>>0]|0)|0;a[e+33>>0]=i>>>0>255?(i>>>31)+255|0:i;i=(h-(c*35468>>16)>>3)+(d[e+34>>0]|0)|0;a[e+34>>0]=i>>>0>255?(i>>>31)+255|0:i;h=(h-((c*20091>>16)+c)>>3)+(d[e+35>>0]|0)|0;a[e+35>>0]=h>>>0>255?(h>>>31)+255|0:h;h=g-(f*35468>>16)|0;i=((c*20091>>16)+c+h>>3)+(d[e+64>>0]|0)|0;a[e+64>>0]=i>>>0>255?(i>>>31)+255|0:i;i=(h+(c*35468>>16)>>3)+(d[e+65>>0]|0)|0;a[e+65>>0]=i>>>0>255?(i>>>31)+255|0:i;i=(h-(c*35468>>16)>>3)+(d[e+66>>0]|0)|0;a[e+66>>0]=i>>>0>255?(i>>>31)+255|0:i;h=(h-((c*20091>>16)+c)>>3)+(d[e+67>>0]|0)|0;a[e+67>>0]=h>>>0>255?(h>>>31)+255|0:h;f=g-((f*20091>>16)+f)|0;g=(f+((c*20091>>16)+c)>>3)+(d[e+96>>0]|0)|0;a[e+96>>0]=g>>>0>255?(g>>>31)+255|0:g;g=(f+(c*35468>>16)>>3)+(d[e+97>>0]|0)|0;a[e+97>>0]=g>>>0>255?(g>>>31)+255|0:g;g=(f-(c*35468>>16)>>3)+(d[e+98>>0]|0)|0;a[e+98>>0]=g>>>0>255?(g>>>31)+255|0:g;c=(f-((c*20091>>16)+c)>>3)+(d[e+99>>0]|0)|0;a[e+99>>0]=c>>>0>255?(c>>>31)+255|0:c;return}function ia(b,e,f){b=b|0;e=e|0;f=f|0;var g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0;p=(c[e+1896>>2]|0)+(f<<2)|0;q=c[e+1956>>2]|0;if(!(c[e+108>>2]|0))g=0;else{if(!(ub(b,d[e+556>>0]|0)|0))g=ub(b,d[e+557>>0]|0)|0;else g=(ub(b,d[e+558>>0]|0)|0)+2|0;g=g&255}a[q+(f*800|0)+797>>0]=g;if(c[e+1888>>2]|0)a[q+(f*800|0)+796>>0]=ub(b,d[e+1892>>0]|0)|0;o=(ub(b,145)|0)==0;a[q+(f*800|0)+768>>0]=o&1;a:do if(o){g=q+(f*800|0)+769|0;j=0;while(1){if((j|0)==4)break a;l=e+1900+j|0;h=0;i=d[l>>0]|0;while(1){if((h|0)==4)break;m=p+h|0;n=d[m>>0]|0;k=ub(b,d[680+(n*90|0)+(i*9|0)>>0]|0)|0;while(1){o=a[1580+k>>0]|0;if(!(41706>>>k&1))break;k=(ub(b,d[680+(n*90|0)+(i*9|0)+o>>0]|0)|0)+(o<<1)|0}a[m>>0]=0-o;h=h+1|0;i=0-o|0}o=d[p>>0]|d[p+1>>0]<<8|d[p+2>>0]<<16|d[p+3>>0]<<24;a[g>>0]=o;a[g+1>>0]=o>>8;a[g+2>>0]=o>>16;a[g+3>>0]=o>>24;a[l>>0]=i;g=g+4|0;j=j+1|0}}else{if(!(ub(b,156)|0)){g=(ub(b,163)|0)!=0;g=g?2:0}else{g=(ub(b,128)|0)!=0;g=g?1:3}o=g&255;a[q+(f*800|0)+769>>0]=o;Ma(p|0,o|0,4)|0;Ma(e+1900|0,o|0,4)|0}while(0);if(ub(b,142)|0)if(!(ub(b,114)|0))g=2;else{g=(ub(b,183)|0)!=0;g=g?1:3}else g=0;a[q+(f*800|0)+785>>0]=g;return}function ja(b,e,f){b=b|0;e=e|0;f=f|0;var g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0;h=c[b+132>>2]|0;p=c[b+1932>>2]|0;k=c[b+144>>2]|0;g=(c[b+1920>>2]|0)+(N(h<<4,p)|0)+(e<<4)|0;m=d[k+(e<<2)+1>>0]|0;n=a[k+(e<<2)>>0]|0;do if(n<<24>>24){if((c[b+1960>>2]|0)==1){if((e|0)>0)Sa(g,p,(n&255)+4|0);if(a[k+(e<<2)+2>>0]|0)rc(g,p,n&255);if((f|0)>0)Ra(g,p,(n&255)+4|0);if(!(a[k+(e<<2)+2>>0]|0))break;kc(g,p,n&255);break}o=c[b+1936>>2]|0;i=N(o,h<<3)|0;l=(c[b+1924>>2]|0)+i+(e<<3)|0;i=(c[b+1928>>2]|0)+i+(e<<3)|0;j=d[k+(e<<2)+3>>0]|0;if((e|0)>0){ka(g,1,p,16,(n&255)+4|0,m,j);ka(l,1,o,8,(n&255)+4|0,m,j);ka(i,1,o,8,(n&255)+4|0,m,j)}if(a[k+(e<<2)+2>>0]|0){h=3;b=g;while(1){if((h|0)<=0)break;q=b+4|0;la(q,1,p,16,n&255,m,j);h=h+-1|0;b=q}la(l+4|0,1,o,8,n&255,m,j);la(i+4|0,1,o,8,n&255,m,j)}if((f|0)>0){ka(g,p,1,16,(n&255)+4|0,m,j);ka(l,o,1,8,(n&255)+4|0,m,j);ka(i,o,1,8,(n&255)+4|0,m,j)}if(a[k+(e<<2)+2>>0]|0){h=3;while(1){if((h|0)<=0)break;q=g+(p<<2)|0;la(q,p,1,16,n&255,m,j);h=h+-1|0;g=q}la(l+(o<<2)|0,o,1,8,n&255,m,j);la(i+(o<<2)|0,o,1,8,n&255,m,j)}}while(0);return}function ka(b,e,f,g,h,i,j){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;i=i|0;j=j|0;var k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0,D=0,E=0;E=N(e,-3)|0;w=N(e,-2)|0;x=c[9]|0;y=N(e,-4)|0;z=c[6]|0;A=c[7]|0;B=c[8]|0;while(1){v=g+-1|0;if((g|0)<=0)break;k=b+E|0;l=d[k>>0]|0;m=b+w|0;n=d[m>>0]|0;o=b+(0-e)|0;p=d[o>>0]|0;q=d[b>>0]|0;r=b+e|0;s=d[r>>0]|0;t=b+(e<<1)|0;u=d[t>>0]|0;g=d[b+(e*3|0)>>0]|0;do if((((((((d[x+(p-q)>>0]<<2)+(d[x+(n-s)>>0]|0)|0)<=(h<<1|1|0)?(d[x+((d[b+y>>0]|0)-l)>>0]|0)<=(i|0):0)?(d[x+(l-n)>>0]|0)<=(i|0):0)?(C=d[x+(n-p)>>0]|0,(C|0)<=(i|0)):0)?(d[x+(g-u)>>0]|0)<=(i|0):0)?(d[x+(u-s)>>0]|0)<=(i|0):0)?(D=d[x+(s-q)>>0]|0,(D|0)<=(i|0)):0){g=((q-p|0)*3|0)+(a[z+(n-s)>>0]|0)|0;if((C|0)>(j|0)|(D|0)>(j|0)){u=a[A+(g+4>>3)>>0]|0;a[o>>0]=a[B+((a[A+(g+3>>3)>>0]|0)+p)>>0]|0;a[b>>0]=a[B+(q-u)>>0]|0;break}else{g=a[z+g>>0]|0;a[k>>0]=a[B+(((g*9|0)+63>>7)+l)>>0]|0;a[m>>0]=a[B+(((g*18|0)+63>>7)+n)>>0]|0;a[o>>0]=a[B+(((g*27|0)+63>>7)+p)>>0]|0;a[b>>0]=a[B+(q-((g*27|0)+63>>7))>>0]|0;a[r>>0]=a[B+(s-((g*18|0)+63>>7))>>0]|0;a[t>>0]=a[B+(u-((g*9|0)+63>>7))>>0]|0;break}}while(0);b=b+f|0;g=v}return}function la(b,e,f,g,h,i,j){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;i=i|0;j=j|0;var k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=0,z=0,A=0,B=0,C=0;B=N(e,-3)|0;t=N(e,-2)|0;u=c[9]|0;v=N(e,-4)|0;w=c[6]|0;x=c[7]|0;y=c[8]|0;while(1){s=g+-1|0;if((g|0)<=0)break;C=d[b+B>>0]|0;g=b+t|0;k=d[g>>0]|0;l=b+(0-e)|0;m=d[l>>0]|0;n=d[b>>0]|0;o=b+e|0;p=d[o>>0]|0;q=d[b+(e<<1)>>0]|0;r=d[b+(e*3|0)>>0]|0;do if((((((((d[u+(m-n)>>0]<<2)+(d[u+(k-p)>>0]|0)|0)<=(h<<1|1|0)?(d[u+((d[b+v>>0]|0)-C)>>0]|0)<=(i|0):0)?(d[u+(C-k)>>0]|0)<=(i|0):0)?(z=d[u+(k-m)>>0]|0,(z|0)<=(i|0)):0)?(d[u+(r-q)>>0]|0)<=(i|0):0)?(d[u+(q-p)>>0]|0)<=(i|0):0)?(A=d[u+(p-n)>>0]|0,(A|0)<=(i|0)):0)if((z|0)>(j|0)|(A|0)>(j|0)){r=((n-m|0)*3|0)+(a[w+(k-p)>>0]|0)|0;C=a[x+(r+4>>3)>>0]|0;a[l>>0]=a[y+((a[x+(r+3>>3)>>0]|0)+m)>>0]|0;a[b>>0]=a[y+(n-C)>>0]|0;break}else{C=a[x+(((n-m|0)*3|0)+4>>3)>>0]|0;r=a[x+(((n-m|0)*3|0)+3>>3)>>0]|0;a[g>>0]=a[y+((C+1>>1)+k)>>0]|0;a[l>>0]=a[y+(r+m)>>0]|0;a[b>>0]=a[y+(n-C)>>0]|0;a[o>>0]=a[y+(p-(C+1>>1))>>0]|0;break}while(0);b=b+f|0;g=s}return}function ma(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,i=0;i=l;l=l+16|0;c[i+4>>2]=a;c[i>>2]=b;a:do if(d|0)while(1){if(!(_b(e+24|0,1)|0)){h=4;break a}if(!(ua(i+4|0,i,e)|0)){a=0;h=8;break}}else h=4;while(0);do if((h|0)==4){if(_b(e+24|0,1)|0){a=_b(e+24|0,4)|0;if((a+-1|0)>>>0>=11){c[e>>2]=3;a=0;h=20;break}}else a=0;h=c[i+4>>2]|0;g=(ca(e,h,b,a,d)|0)!=0;if(g){if((a|0)>0){c[e+76>>2]=1<<a;if(!(gc(e+80|0,a)|0)){c[e>>2]=1;a=0;h=20;break}}else c[e+76>>2]=0;ec(e,h,b);if(d|0){c[e+4>>2]=1;g=g&1;a=0;h=19;break}a=qc(b|0,((b|0)<0)<<31>>31|0,h|0,((h|0)<0)<<31>>31|0)|0;a=wc(a,y,4)|0;if(!a){c[e>>2]=1;a=0;h=20;break}if(!($(e,a,h,b,b,0)|0))h=20;else{g=(c[e+48>>2]|0)==0&1;h=19}}else{a=g&1;h=8}}while(0);if((h|0)==8){c[e>>2]=3;g=a;a=0;h=19}if((h|0)==19)if(g){if(f|0)c[f>>2]=a;c[e+68>>2]=0;if(d|0)a=1;else{yc(e+76|0);a=1}}else h=20;if((h|0)==20){Ed(a);yc(e+76|0);a=0}l=i;return a|0}function na(b,d){b=b|0;d=d|0;var e=0,f=0,g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0;p=c[b+132>>2]|0;j=a[462+(c[b+1960>>2]|0)>>0]|0;g=c[b+1932>>2]|0;l=N(g,j&255)|0;e=c[b+1936>>2]|0;m=N(e,(j&255)>>>1&255)|0;g=N(g,p<<4)|0;e=N(e,p<<3)|0;n=(c[b+1920>>2]|0)+(0-l)+g|0;o=(c[b+1924>>2]|0)+(0-m)+e|0;q=(c[b+1928>>2]|0)+(0-m)+e|0;i=c[b+136>>2]|0;r=(i|0)>=((c[b+228>>2]|0)+-1|0);if(c[b+140>>2]|0)sc(b);if(!i){k=i<<4;h=(c[b+1928>>2]|0)+e|0;f=(c[b+1924>>2]|0)+e|0;e=(c[b+1920>>2]|0)+g|0}else{k=(i<<4)-(j&255)|0;h=q;f=o;e=n}c[d+20>>2]=e;c[d+24>>2]=f;c[d+28>>2]=h;e=(i<<4)+16+(r?0:0-(j&255)|0)|0;f=c[d+4>>2]|0;e=(e|0)>(f|0)?f:e;c[d+52>>2]=0;f=(e|0)>(k|0);if((c[b+2e3>>2]|0)!=0&f?(j=Ba(b,d,k,e-k|0)|0,c[d+52>>2]=j,(j|0)==0):0)e=Lc(b,3,465)|0;else{if(f){c[d+8>>2]=k;c[d+12>>2]=c[d>>2];c[d+16>>2]=e-k;e=bc(d)|0}else e=1;if(!(r|(p+1|0)!=(c[b+128>>2]|0))){pa((c[b+1920>>2]|0)+(0-l)|0,n+(c[b+1932>>2]<<4)|0,l|0)|0;pa((c[b+1924>>2]|0)+(0-m)|0,o+(c[b+1936>>2]<<3)|0,m|0)|0;pa((c[b+1928>>2]|0)+(0-m)|0,q+(c[b+1936>>2]<<3)|0,m|0)|0}}return e|0}function oa(b){b=b|0;var f=0,g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0;h=Bc(b+12|0,7)|0;if(!(Cd(b+12|0)|0))i=0;else i=Zc(b+12|0,4)|0;if(!(Cd(b+12|0)|0))j=0;else j=Zc(b+12|0,4)|0;if(!(Cd(b+12|0)|0))k=0;else k=Zc(b+12|0,4)|0;if(!(Cd(b+12|0)|0))l=0;else l=Zc(b+12|0,4)|0;if(!(Cd(b+12|0)|0))m=0;else m=Zc(b+12|0,4)|0;f=0;while(1){if((f|0)==4)break;if(!(c[b+104>>2]|0))if((f|0)>0){g=b+460+(f*24|0)|0;c[g>>2]=c[b+460>>2];c[g+4>>2]=c[b+460+4>>2];c[g+8>>2]=c[b+460+8>>2];c[g+12>>2]=c[b+460+12>>2];c[g+16>>2]=c[b+460+16>>2];c[g+20>>2]=c[b+460+20>>2]}else{g=h;n=17}else{g=((c[b+112>>2]|0)==0?h:0)+(a[b+116+f>>0]|0)|0;n=17}if((n|0)==17){n=0;c[b+460+(f*24|0)>>2]=d[552+(ld(g+i|0,127)|0)>>0];c[b+460+(f*24|0)+4>>2]=e[172+((ld(g,127)|0)<<1)>>1];c[b+460+(f*24|0)+8>>2]=d[552+(ld(g+j|0,127)|0)>>0]<<1;o=(e[172+((ld(g+k|0,127)|0)<<1)>>1]|0)*101581|0;c[b+460+(f*24|0)+12>>2]=o>>>0<524288?8:o>>>16;c[b+460+(f*24|0)+16>>2]=d[552+(ld(g+l|0,117)|0)>>0];c[b+460+(f*24|0)+20>>2]=e[172+((ld(g+m|0,127)|0)<<1)>>1]}f=f+1|0}return}function pa(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0;if((e|0)>=8192)return W(b|0,d|0,e|0)|0;h=b|0;g=b+e|0;if((b&3)==(d&3)){while(b&3){if(!e)return h|0;a[b>>0]=a[d>>0]|0;b=b+1|0;d=d+1|0;e=e-1|0}e=g&-4|0;f=e-64|0;while((b|0)<=(f|0)){c[b>>2]=c[d>>2];c[b+4>>2]=c[d+4>>2];c[b+8>>2]=c[d+8>>2];c[b+12>>2]=c[d+12>>2];c[b+16>>2]=c[d+16>>2];c[b+20>>2]=c[d+20>>2];c[b+24>>2]=c[d+24>>2];c[b+28>>2]=c[d+28>>2];c[b+32>>2]=c[d+32>>2];c[b+36>>2]=c[d+36>>2];c[b+40>>2]=c[d+40>>2];c[b+44>>2]=c[d+44>>2];c[b+48>>2]=c[d+48>>2];c[b+52>>2]=c[d+52>>2];c[b+56>>2]=c[d+56>>2];c[b+60>>2]=c[d+60>>2];b=b+64|0;d=d+64|0}while((b|0)<(e|0)){c[b>>2]=c[d>>2];b=b+4|0;d=d+4|0}}else{e=g-4|0;while((b|0)<(e|0)){a[b>>0]=a[d>>0]|0;a[b+1>>0]=a[d+1>>0]|0;a[b+2>>0]=a[d+2>>0]|0;a[b+3>>0]=a[d+3>>0]|0;b=b+4|0;d=d+4|0}}while((b|0)<(g|0)){a[b>>0]=a[d>>0]|0;b=b+1|0;d=d+1|0}return h|0}function qa(a,e,f,g){a=a|0;e=e|0;f=f|0;g=g|0;var h=0,i=0,j=0,k=0,m=0,n=0,o=0;o=l;l=l+512|0;a:do if(!(Gb(o,7,e,19)|0))n=14;else{if(_b(a+24|0,1)|0){e=(_b(a+24|0,((_b(a+24|0,3)|0)<<1)+2|0)|0)+2|0;if((e|0)>(f|0)){n=14;break}}else e=f;h=0;m=8;while(1){j=h;b:while(1){if((j|0)>=(f|0)){e=1;break a}k=e+-1|0;if(!e){e=1;break a}id(a+24|0);e=(Xc(a+24|0)|0)&127;vd(a+24|0,(c[a+44>>2]|0)+(d[o+(e<<2)>>0]|0)|0);e=b[o+(e<<2)+2>>1]|0;if((e&65535)<16)break;h=d[4312+((e&65535)+-16)>>0]|0;h=(_b(a+24|0,d[4309+((e&65535)+-16)>>0]|0)|0)+h|0;if((h+j|0)>(f|0)){n=14;break a}i=e<<16>>16==16?m:0;e=j;while(1){if((h|0)<=0){j=e;e=k;continue b}c[g+(e<<2)>>2]=i;h=h+-1|0;e=e+1|0}}c[g+(j<<2)>>2]=e&65535;h=j+1|0;m=e<<16>>16==0?m:e&65535;e=k}}while(0);if((n|0)==14){c[a>>2]=3;e=0}l=o;return e|0}function ra(e,f){e=e|0;f=f|0;var g=0,h=0,i=0,j=0,k=0,m=0,n=0,o=0;i=l;l=l+64|0;g=i;h=0;while(1){if((h|0)==4){e=f;g=i;h=0;break}m=b[e>>1]|0;n=b[e+16>>1]|0;k=b[e+8>>1]|0;j=b[e+24>>1]|0;c[g>>2]=(k*20091>>16)+k+(j*35468>>16)+(n+m);c[g+4>>2]=(k*35468>>16)-j-(j*20091>>16)+(m-n);c[g+8>>2]=m-n-((k*35468>>16)-j-(j*20091>>16));c[g+12>>2]=n+m-((k*20091>>16)+k+(j*35468>>16));e=e+2|0;g=g+16|0;h=h+1|0}while(1){if((h|0)==4)break;f=(c[g>>2]|0)+4|0;j=c[g+32>>2]|0;k=c[g+16>>2]|0;m=c[g+48>>2]|0;n=((k*20091>>16)+k+(m*35468>>16)+(f+j)>>3)+(d[e>>0]|0)|0;a[e>>0]=n>>>0>255?(n>>>31)+255|0:n;n=e+1|0;o=((k*35468>>16)-m-(m*20091>>16)+(f-j)>>3)+(d[n>>0]|0)|0;a[n>>0]=o>>>0>255?(o>>>31)+255|0:o;n=e+2|0;o=(f-j-((k*35468>>16)-m-(m*20091>>16))>>3)+(d[n>>0]|0)|0;a[n>>0]=o>>>0>255?(o>>>31)+255|0:o;n=e+3|0;m=(f+j-((k*20091>>16)+k+(m*35468>>16))>>3)+(d[n>>0]|0)|0;a[n>>0]=m>>>0>255?(m>>>31)+255|0:m;e=e+32|0;g=g+4|0;h=h+1|0}l=i;return}function sa(a,b,d){a=a|0;b=b|0;d=d|0;var e=0;e=l;l=l+96|0;c[e>>2]=a;c[e+4>>2]=b;c[e+8>>2]=1;a=Ab(e)|0;do if(!a){Uc(e+40|0);b=c[e+12>>2]|0;c[e+40+48>>2]=(c[e>>2]|0)+b;c[e+40+44>>2]=(c[e+4>>2]|0)-b;c[e+40+40>>2]=d;if(!(c[e+32>>2]|0)){b=Vc()|0;if(!b){a=1;break}c[b+2e3>>2]=c[e+16>>2];c[b+2004>>2]=c[e+20>>2];if(ea(b,e+40|0)|0){a=mc(c[e+40>>2]|0,c[e+40+4>>2]|0,c[d>>2]|0)|0;if(!a)if(!(eb(b,e+40|0)|0))a=c[b>>2]|0;else a=0}else a=c[b>>2]|0;rd(b)}else{b=Tc()|0;if(!b){a=1;break}if(Za(b,e+40|0)|0){a=mc(c[e+40>>2]|0,c[e+40+4>>2]|0,c[d>>2]|0)|0;if(!a)if(!(Ua(b)|0))a=c[b>>2]|0;else a=0}else a=c[b>>2]|0;pd(b)}if(!a)a=0;else Qc(c[d>>2]|0)}while(0);l=e;return a|0}function ta(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0;k=c[a+16>>2]|0;l=c[b>>2]|0;m=c[a+8>>2]|0;d=c[l+20>>2]|0;f=(c[l+16>>2]|0)+(N(d,m)|0)|0;h=c[a+20>>2]|0;g=c[a+24>>2]|0;i=c[a+28>>2]|0;j=c[a+12>>2]|0;if(!m){_(h,0,g,i,g,i,f,0,j);d=k;e=0}else{_(c[b+4>>2]|0,h,c[b+8>>2]|0,c[b+12>>2]|0,g,i,f+(0-d)|0,f,j);d=k+1|0;e=m}while(1){e=e+2|0;if((e|0)>=(m+k|0))break;o=c[a+36>>2]|0;n=g+o|0;o=i+o|0;r=c[l+20>>2]|0;q=f+(r<<1)|0;s=c[a+32>>2]|0;p=h+(s<<1)|0;_(p+(0-s)|0,p,g,i,n,o,q+(0-r)|0,q,j);f=q;h=p;i=o;g=n}e=h+(c[a+32>>2]|0)|0;if((m+k|0)>=(c[a+4>>2]|0)){if(!(m+k&1))_(e,0,g,i,g,i,f+(c[l+20>>2]|0)|0,0,j)}else{pa(c[b+4>>2]|0,e|0,j|0)|0;pa(c[b+8>>2]|0,g|0,(j+1|0)/2|0|0)|0;pa(c[b+12>>2]|0,i|0,(j+1|0)/2|0|0)|0;d=d+-1|0}return d|0}function ua(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0;g=c[d+120>>2]|0;e=_b(d+24|0,2)|0;f=c[d+204>>2]|0;a:do if(!(f&1<<e)){c[d+204>>2]=f|1<<e;c[d+124+(g*20|0)>>2]=e;c[d+124+(g*20|0)+8>>2]=c[a>>2];c[d+124+(g*20|0)+12>>2]=c[b>>2];c[d+124+(g*20|0)+16>>2]=0;c[d+120>>2]=(c[d+120>>2]|0)+1;switch(e|0){case 1:case 0:{b=(_b(d+24|0,3)|0)+2|0;c[d+124+(g*20|0)+4>>2]=b;b=ma(((c[d+124+(g*20|0)+8>>2]|0)+-1+(1<<b)|0)>>>b,((1<<b)+-1+(c[d+124+(g*20|0)+12>>2]|0)|0)>>>b,0,d,d+124+(g*20|0)+16|0)|0;break a}case 3:break;default:{b=1;break a}}b=(_b(d+24|0,8)|0)+1|0;if((b|0)>16)e=0;else e=(b|0)>4?1:(b|0)>2?2:3;c[a>>2]=((c[d+124+(g*20|0)+8>>2]|0)+-1+(1<<e)|0)>>>e;c[d+124+(g*20|0)+4>>2]=e;if(ma(b,1,0,d,d+124+(g*20|0)+16|0)|0)b=(db(b,d+124+(g*20|0)|0)|0)!=0&1;else b=0}else b=0;while(0);return b|0}function va(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,i=0,j=0,k=0;i=c[a+1996>>2]|0;j=c[i>>2]|0;k=c[i+28>>2]|0;if(c[i+8>>2]|0)if(!(wb(i,d+b|0)|0))e=0;else{e=d+b|0;f=13}else{e=c[a+2020>>2]|0;f=N(j,b)|0;g=(c[a+2e3>>2]|0)+1+f|0;f=(c[a+2016>>2]|0)+f|0;a:do if(!(c[i+12>>2]|0)){h=f;f=0;while(1){if((f|0)>=(d|0))break a;pa(h|0,g|0,j|0)|0;e=h;h=h+j|0;g=g+j|0;f=f+1|0}}else{h=g;g=0;while(1){if((g|0)>=(d|0))break a;switch(c[i+12>>2]|0){case 1:{Wb(e,h,f,j);break}case 2:{Tb(e,h,f,j);break}case 3:{lb(e,h,f,j);break}default:{}}e=f;f=f+j|0;h=h+j|0;g=g+1|0}}while(0);c[a+2020>>2]=e;e=d+b|0;f=13}if((f|0)==13)if((e|0)<(k|0))e=1;else{c[a+2008>>2]=1;e=1}return e|0}function wa(a,b,e,f,g,h){a=a|0;b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;var i=0,j=0,k=0,l=0,m=0;c[e>>2]=0;i=c[b>>2]|0;if(i>>>0>=8){l=c[a>>2]|0;if(!(Eb(l,4330,4)|0))if(((d[l+5>>0]|0)<<8|(d[l+4>>0]|0)|((d[l+7>>0]|0)<<8|(d[l+6>>0]|0))<<16|0)==10)if(i>>>0>=18){i=(d[l+9>>0]|0)<<8|(d[l+8>>0]|0)|((d[l+11>>0]|0)<<8|(d[l+10>>0]|0))<<16;j=((d[l+13>>0]|0)<<8|(d[l+12>>0]|0)|(d[l+14>>0]|0)<<16)+1|0;k=((d[l+16>>0]|0)<<8|(d[l+15>>0]|0)|(d[l+17>>0]|0)<<16)+1|0;m=N(j,k)|0;if((k|0)==0?0:((m>>>0)/(((k|0)==0?1:k)>>>0)|0|0)!=(j|0))i=3;else{if(h|0)c[h>>2]=i;if(f|0)c[f>>2]=j;if(g|0)c[g>>2]=k;c[a>>2]=l+18;c[b>>2]=(c[b>>2]|0)+-18;c[e>>2]=1;i=0}}else i=7;else i=3;else i=0}else i=7;return i|0}function xa(a,b,e,f){a=a|0;b=b|0;e=e|0;f=f|0;var g=0,h=0,i=0,j=0,k=0;k=l;l=l+80|0;i=_b(b+24|0,1)|0;Ma(e|0,0,a<<2|0)|0;do if(!i){h=k;i=h+76|0;do{c[h>>2]=0;h=h+4|0}while((h|0)<(i|0));i=(_b(b+24|0,4)|0)+4|0;if((i|0)>19){c[b>>2]=3;g=0;break}else h=0;while(1){if((h|0)>=(i|0))break;j=_b(b+24|0,3)|0;c[k+((d[4290+h>>0]|0)<<2)>>2]=j;h=h+1|0}if(!(qa(b,k,a,e)|0))j=11;else j=9}else{j=_b(b+24|0,1)|0;i=(_b(b+24|0,1)|0)==0;c[e+((_b(b+24|0,i?1:8)|0)<<2)>>2]=1;if((j|0)==1){c[e+((_b(b+24|0,8)|0)<<2)>>2]=1;j=9}else j=9}while(0);if((j|0)==9)if(!((c[b+48>>2]|0)==0?(g=Gb(f,8,e,a)|0,(g|0)!=0):0))j=11;if((j|0)==11){c[b>>2]=3;g=0}l=k;return g|0}function ya(b){b=b|0;var d=0,e=0,f=0,g=0,h=0,i=0;a:do if((c[b+1960>>2]|0)>0){g=0;while(1){if((g|0)==4)break a;if(c[b+104>>2]|0){d=a[b+120+g>>0]|0;if(!(c[b+112>>2]|0))d=(c[b+60>>2]|0)+d|0}else d=c[b+60>>2]|0;f=0;while(1){if((f|0)==2)break;if(c[b+68>>2]|0){e=(c[b+72>>2]|0)+d|0;if(f)e=(c[b+88>>2]|0)+e|0}else e=d;h=(e|0)>0;e=h?((e|0)<63?e:63):0;if(h){i=c[b+64>>2]|0;h=e>>((i|0)>4?2:1);h=(i|0)>0?((h|0)>(9-i|0)?9-i|0:h):e;h=(h|0)>1?h:1;a[b+1964+(g<<3)+(f<<2)+1>>0]=h;a[b+1964+(g<<3)+(f<<2)+3>>0]=(e|0)>39?2:(e|0)>14&1;e=h+(e<<1)&255}else e=0;a[b+1964+(g<<3)+(f<<2)>>0]=e;a[b+1964+(g<<3)+(f<<2)+2>>0]=f;f=f+1|0}g=g+1|0}}while(0);return}function za(a){a=a|0;var d=0,f=0,g=0,h=0,i=0;h=l;l=l+16|0;d=0;while(1){if((d|0)==64)break;f=a+36+(d<<3)|0;g=(c[a>>2]|0)+(d<<2)|0;g=e[g>>1]|e[g+2>>1]<<16;c[h>>2]=g;if((g>>>16&65535)>255){c[f>>2]=g&255|256;c[a+36+(d<<3)+4>>2]=g>>>16}else{c[f>>2]=0;c[a+36+(d<<3)+4>>2]=0;b[h+4>>1]=b[h>>1]|0;b[h+4+2>>1]=b[h+2>>1]|0;g=d>>>(pc(h+4|0,8,f)|0);i=(c[a+4>>2]|0)+(g<<2)|0;b[h+4>>1]=b[i>>1]|0;b[h+4+2>>1]=b[i+2>>1]|0;g=g>>>(pc(h+4|0,16,f)|0);i=(c[a+8>>2]|0)+(g<<2)|0;b[h+4>>1]=b[i>>1]|0;b[h+4+2>>1]=b[i+2>>1]|0;g=g>>>(pc(h+4|0,0,f)|0);g=(c[a+12>>2]|0)+(g<<2)|0;b[h+4>>1]=b[g>>1]|0;b[h+4+2>>1]=b[g+2>>1]|0;pc(h+4|0,24,f)|0}d=d+1|0}l=h;return}function Aa(b,e){b=b|0;e=e|0;var f=0,g=0,h=0,i=0,j=0;g=c[b+1908>>2]|0;h=c[b+1948>>2]|0;i=c[b+1956>>2]|0;if((c[b+1888>>2]|0)!=0?(f=a[i+(h*800|0)+796>>0]|0,f<<24>>24!=0):0){a[g+(h<<1)>>0]=0;a[g+-2>>0]=0;if(!(a[i+(h*800|0)+768>>0]|0)){a[g+(h<<1)+1>>0]=0;a[g+-1>>0]=0}c[i+(h*800|0)+788>>2]=0;c[i+(h*800|0)+792>>2]=0;f=f&255}else f=ba(b,g+(h<<1)|0,e)|0;if((c[b+1960>>2]|0)>0){j=c[b+1912>>2]|0;g=c[b+1948>>2]|0;i=b+1964+(d[i+(h*800|0)+797>>0]<<3)+(d[i+(h*800|0)+768>>0]<<2)|0;i=d[i>>0]|d[i+1>>0]<<8|d[i+2>>0]<<16|d[i+3>>0]<<24;a[j+(g<<2)>>0]=i;a[j+(g<<2)+1>>0]=i>>8;a[j+(g<<2)+2>>0]=i>>16;a[j+(g<<2)+3>>0]=i>>24;a[j+(g<<2)+2>>0]=d[j+(g<<2)+2>>0]|(f|0)==0}return (c[e+24>>2]|0)==0|0}function Ba(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0,g=0,h=0,i=0,j=0;g=c[b>>2]|0;h=c[b+4>>2]|0;a:do if((d|0)<0|(e|0)<1|(e+d|0)>(h|0))f=0;else{do if(!(c[a+2008>>2]|0)){if(!(c[a+1996>>2]|0)){j=Fd()|0;c[a+1996>>2]=j;if(!j){f=0;break a}if(Mb(a,b)|0?Na(c[a+1996>>2]|0,c[a+2e3>>2]|0,c[a+2004>>2]|0,b,c[a+2016>>2]|0)|0:0){f=(c[(c[a+1996>>2]|0)+16>>2]|0)==1?h-d|0:e;i=8}}else{f=e;i=8}if((i|0)==8?va(a,d,f)|0:0){if(!(c[a+2008>>2]|0))break;$c(c[a+1996>>2]|0);c[a+1996>>2]=0;break}zc(a);f=0;break a}while(0);f=(c[a+2016>>2]|0)+(N(g,d)|0)|0}while(0);return f|0}function Ca(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0;g=Cd(b)|0;c[d>>2]=g;a:do if(g){c[d+4>>2]=Cd(b)|0;b:do if(Cd(b)|0){c[d+8>>2]=Cd(b)|0;f=0;while(1){if((f|0)==4){f=0;break}if(!(Cd(b)|0))g=0;else g=Zc(b,7)|0;a[d+12+f>>0]=g;f=f+1|0}while(1){if((f|0)==4)break b;if(!(Cd(b)|0))g=0;else g=Zc(b,6)|0;a[d+16+f>>0]=g;f=f+1|0}}while(0);if(c[d+4>>2]|0){f=0;while(1){if((f|0)==3)break a;if(!(Cd(b)|0))g=255;else g=Bc(b,8)|0;a[e+f>>0]=g;f=f+1|0}}}else c[d+4>>2]=0;while(0);return (c[b+24>>2]|0)==0|0}function Da(b,e){b=b|0;e=e|0;var f=0,g=0,h=0,i=0,j=0;j=0;while(1){if((j|0)==4)break;else h=0;while(1){if((h|0)==8){f=0;break}else g=0;while(1){if((g|0)==3)break;else f=0;while(1){if((f|0)==11)break;if(!(ub(b,d[1598+(j*264|0)+(h*33|0)+(g*11|0)+f>>0]|0)|0))i=d[2654+(j*264|0)+(h*33|0)+(g*11|0)+f>>0]|0;else i=Bc(b,8)|0;a[e+559+(j*264|0)+(h*33|0)+(g*11|0)+f>>0]=i;f=f+1|0}g=g+1|0}h=h+1|0}while(1){if((f|0)==17)break;c[e+1616+(j*68|0)+(f<<2)>>2]=e+559+(j*264|0)+((d[3710+f>>0]|0)*33|0);f=f+1|0}j=j+1|0}j=Cd(b)|0;c[e+1888>>2]=j;if(j|0)a[e+1892>>0]=Bc(b,8)|0;return}function Ea(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0;e=Tc()|0;do if(!e)b=0;else{c[a+20>>2]=e;g=c[a>>2]|0;c[e+56>>2]=g;f=c[a+4>>2]|0;c[e+60>>2]=f;c[e+8>>2]=a+24;c[a+64>>2]=a;c[a+24>>2]=g;c[a+28>>2]=f;c[e>>2]=0;pb(e+24|0,b,d);if(ma(c[a>>2]|0,c[a+4>>2]|0,1,e,0)|0){if(((c[e+120>>2]|0)==1?(c[e+124>>2]|0)==3:0)?(ib(e+76|0)|0)!=0:0){c[a+80>>2]=1;b=Nb(e)|0}else{c[a+80>>2]=0;b=fb(e,c[a>>2]|0)|0}if(b|0){b=1;break}}pd(c[a+20>>2]|0);c[a+20>>2]=0;b=0}while(0);return b|0}function Fa(b,c,e){b=b|0;c=c|0;e=e|0;var f=0,g=0;a:do if((e|0)>7){switch(c|0){case 1:{f=N(d[b+(0-c)>>0]|0,16843009)|0;break}case 2:{f=((d[b+(0-c)>>0]|d[b+(0-c)+1>>0]<<8)&65535)*65537|0;break}case 4:{f=d[b+(0-c)>>0]|d[b+(0-c)+1>>0]<<8|d[b+(0-c)+2>>0]<<16|d[b+(0-c)+3>>0]<<24;break}default:{g=7;break a}}qb(b+(0-c)|0,b,e,f)}else g=7;while(0);b:do if((g|0)==7){if((c|0)<(e|0))f=0;else{pa(b|0,b+(0-c)|0,e|0)|0;break}while(1){if((f|0)>=(e|0))break b;a[b+f>>0]=a[b+(0-c)+f>>0]|0;f=f+1|0}}while(0);return}function Ga(b,e){b=b|0;e=e|0;var f=0,g=0,h=0;do if(!(ub(b,d[e+3>>0]|0)|0))if(!(ub(b,d[e+4>>0]|0)|0))e=2;else e=(ub(b,d[e+5>>0]|0)|0)+3|0;else{if(!(ub(b,d[e+6>>0]|0)|0))if(!(ub(b,d[e+7>>0]|0)|0)){e=(ub(b,159)|0)+5|0;break}else{e=((ub(b,165)|0)<<1)+7|0;e=e+(ub(b,145)|0)|0;break}g=ub(b,d[e+8>>0]|0)|0;g=(ub(b,d[e+(g+9)>>0]|0)|0)+(g<<1)|0;e=0;f=c[8+(g<<2)>>2]|0;while(1){h=a[f>>0]|0;if(!(h<<24>>24))break;e=(ub(b,h&255)|0)+(e<<1)|0;f=f+1|0}e=(8<<g)+3+e|0}while(0);return e|0}function Ha(a,b,e,f,g){a=a|0;b=b|0;e=e|0;f=f|0;g=g|0;var h=0,i=0,j=0,k=0;i=c[a>>2]|0;j=c[b>>2]|0;c[f>>2]=0;c[g>>2]=0;h=22;while(1){c[a>>2]=i;c[b>>2]=j;if(j>>>0<8){h=7;break}k=(d[i+5>>0]|0)<<8|(d[i+4>>0]|0)|((d[i+7>>0]|0)<<8|(d[i+6>>0]|0))<<16;if(k>>>0>4294967286){h=3;break}h=(k+9&-2)+h|0;if((e|0)!=0&h>>>0>e>>>0){h=3;break}if(!(Eb(i,4325,4)|0)){h=0;break}if(!(Eb(i,4320,4)|0)){h=0;break}if(j>>>0<(k+9&-2)>>>0){h=7;break}if(!(Eb(i,4315,4)|0)){c[f>>2]=i+8;c[g>>2]=k}i=i+(k+9&-2)|0;j=j-(k+9&-2)|0}return h|0}function Ia(b,d){b=b|0;d=d|0;var e=0,f=0,g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0;f=c[b+64>>2]|0;m=f;n=d-f|0;g=c[b+16>>2]|0;e=c[b+56>>2]|0;while(1){g=g+((N(e,f)|0)<<2)|0;if((n|0)<=0)break;e=(n|0)<16?n:16;i=c[b+8>>2]|0;h=c[i+40>>2]|0;i=c[i>>2]|0;j=N(i,e)|0;k=(c[h+84>>2]|0)+(N(i,m)|0)|0;l=c[b+20>>2]|0;xb(b,e,g);f=0;while(1){if((f|0)>=(j|0))break;a[k+f>>0]=(c[l+(f<<2)>>2]|0)>>>8;f=f+1|0}f=e+m|0;kb(h,m,f,k,i);m=f;n=n-e|0;f=c[b+56>>2]|0}c[b+72>>2]=d;c[b+64>>2]=d;return}function Ja(a,b){a=a|0;b=b|0;var d=0,e=0,f=0;d=0;a:while(1){c[a+1952>>2]=d;if((d|0)>=(c[a+228>>2]|0)){d=1;break}d=a+236+((c[a+232>>2]&d)*28|0)|0;if(!(nc(a+12|0,a)|0)){f=5;break}e=c[a+1948>>2]|0;while(1){if((e|0)>=(c[a+208>>2]|0))break;if(!(Aa(a,d)|0)){f=8;break a}e=(c[a+1948>>2]|0)+1|0;c[a+1948>>2]=e}Jc(a);if(!(Vb(a,b)|0)){f=11;break}d=(c[a+1952>>2]|0)+1|0}if((f|0)==5){Lc(a,7,4078)|0;d=0}else if((f|0)==8){Lc(a,7,4119)|0;d=0}else if((f|0)==11){Lc(a,6,4154)|0;d=0}return d|0}function Ka(a,e,f,g,h,i){a=a|0;e=e|0;f=f|0;g=g|0;h=h|0;i=i|0;var j=0,k=0,l=0;f=(c[e+(h<<2)>>2]|0)+(f*11|0)|0;a:while(1){if((h|0)>=16){h=16;break}if(!(ub(a,d[f>>0]|0)|0))break;while(1){j=(ub(a,d[f+1>>0]|0)|0)==0;l=h+1|0;k=c[e+(l<<2)>>2]|0;if(!j)break;if((l|0)==16){h=16;break a}else{f=k;h=l}}if(!(ub(a,d[f+2>>0]|0)|0)){j=1;f=k+11|0}else{j=Ga(a,f)|0;f=k+22|0}k=Kb(a,j)|0;k=(N(c[g+(((h|0)>0&1)<<2)>>2]|0,k)|0)&65535;b[i+((d[3998+h>>0]|0)<<1)>>1]=k;h=l}return h|0}function La(a,b,e,f,g,h){a=a|0;b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;var i=0,j=0,k=0,l=0;k=c[a>>2]|0;l=(Eb(k,4320,4)|0)==0;i=c[b>>2]|0;do if(i>>>0>=8){if(!(l|(Eb(k,4325,4)|0)==0)){c[h>>2]=Nc(k,i)|0;c[g>>2]=c[b>>2];a=0;break}j=(d[k+5>>0]|0)<<8|(d[k+4>>0]|0)|((d[k+7>>0]|0)<<8|(d[k+6>>0]|0))<<16;if(!(f>>>0>11&j>>>0>(f+-12|0)>>>0))if((e|0)!=0&j>>>0>(i+-8|0)>>>0)a=7;else{c[g>>2]=j;c[a>>2]=k+8;c[b>>2]=(c[b>>2]|0)+-8;c[h>>2]=l&1;a=0}else a=3}else a=7;while(0);return a|0}function Ma(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0;f=b+e|0;d=d&255;if((e|0)>=67){while(b&3){a[b>>0]=d;b=b+1|0}g=d|d<<8|d<<16|d<<24;while((b|0)<=((f&-4)-64|0)){c[b>>2]=g;c[b+4>>2]=g;c[b+8>>2]=g;c[b+12>>2]=g;c[b+16>>2]=g;c[b+20>>2]=g;c[b+24>>2]=g;c[b+28>>2]=g;c[b+32>>2]=g;c[b+36>>2]=g;c[b+40>>2]=g;c[b+44>>2]=g;c[b+48>>2]=g;c[b+52>>2]=g;c[b+56>>2]=g;c[b+60>>2]=g;b=b+64|0}while((b|0)<(f&-4|0)){c[b>>2]=g;b=b+4|0}}while((b|0)<(f|0)){a[b>>0]=d;b=b+1|0}return f-e|0}function Na(b,e,f,g,h){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;var i=0;c[b+84>>2]=h;c[b>>2]=c[g>>2];c[b+4>>2]=c[g+4>>2];do if((f>>>0>=2?(h=a[e>>0]&3,c[b+8>>2]=h&255,c[b+12>>2]=(d[e>>0]|0)>>>2&3,i=(d[e>>0]|0)>>>4&3,c[b+16>>2]=i,(h&255)<=1):0)?!((d[e>>0]|0)>63|i>>>0>1):0){Uc(b+24|0);c[b+64>>2]=b;c[b+24>>2]=c[g>>2];c[b+28>>2]=c[g+4>>2];if(!(c[b+8>>2]|0)){b=(f+-1|0)>>>0>=(N(c[b+4>>2]|0,c[b>>2]|0)|0)>>>0&1;break}else{b=Ea(b,e+1|0,f+-1|0)|0;break}}else b=0;while(0);return b|0}function Oa(a){a=a|0;var b=0,d=0,e=0,f=0;e=c[a+4>>2]|0;b=c[a+8>>2]|0;do if(!((e|0)<1|(b|0)<1)?(Ad(c[a>>2]|0)|0)!=0:0){if((c[a+12>>2]|0)<1?(c[a+44>>2]|0)==0:0){d=Dc(e|0,((e|0)<0)<<31>>31|0,2)|0;f=y;if(f>>>0>0|(f|0)==0&d>>>0>4294967295){b=2;break}b=qc(e<<2|0,((e<<2|0)<0)<<31>>31|0,b|0,((b|0)<0)<<31>>31|0)|0;d=wc(b,y,1)|0;if(!d){b=1;break}c[a+44>>2]=d;c[a+16>>2]=d;c[a+20>>2]=e<<2;c[a+24>>2]=b}b=hb(a)|0}else b=2;while(0);return b|0}function Pa(a,b){a=a|0;b=b|0;var d=0;c[b+56>>2]=Cd(a)|0;c[b+60>>2]=Bc(a,6)|0;c[b+64>>2]=Bc(a,3)|0;d=Cd(a)|0;c[b+68>>2]=d;a:do if(d|0?Cd(a)|0:0){d=0;while(1){if((d|0)==4){d=0;break}if(Cd(a)|0)c[b+72+(d<<2)>>2]=Zc(a,6)|0;d=d+1|0}while(1){if((d|0)==4)break a;if(Cd(a)|0)c[b+88+(d<<2)>>2]=Zc(a,6)|0;d=d+1|0}}while(0);if(!(c[b+60>>2]|0))d=0;else d=c[b+56>>2]|0?1:2;c[b+1960>>2]=d;return (c[a+24>>2]|0)==0|0}function Qa(a){a=a|0;var b=0,d=0,e=0,f=0;if(!(c[1167]|0)){Cc(4672,4668,4);zb(c[1168]|0,0,c[1167]|0)}e=(a+19&-8)>>>0>24?a+19&-8:24;f=Hc(e)|0;b=0;a=0;while(1){d=(b|0)==0;if(d&(f|0)!=4668)a=f;else break;while(1){a=c[a+16>>2]|0;if(!a){b=0;break}if((a+e|0)>>>0<=(c[a+4>>2]|0)>>>0){b=a;break}}f=f+20|0}if(d){Dd();a=0}else{lc(b);d=a+e|0;e=c[b+4>>2]|0;if((d+24|0)>>>0<=e>>>0)zb(d,b,e);a=a+12|0}return a|0}function Ra(b,e,f){b=b|0;e=e|0;f=f|0;var g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0,q=0;m=N(e,-2)|0;n=c[9]|0;o=c[6]|0;p=c[7]|0;h=c[8]|0;g=0;while(1){if((g|0)==16)break;i=b+g|0;j=d[i+(0-e)>>0]|0;k=d[i>>0]|0;l=(d[i+m>>0]|0)-(d[i+e>>0]|0)|0;if(((d[n+(j-k)>>0]<<2)+(d[n+l>>0]|0)|0)<=(f<<1|1|0)){q=((k-j|0)*3|0)+(a[o+l>>0]|0)|0;l=a[p+(q+4>>3)>>0]|0;a[i+(0-e)>>0]=a[h+((a[p+(q+3>>3)>>0]|0)+j)>>0]|0;a[i>>0]=a[h+(k-l)>>0]|0}g=g+1|0}return}function Sa(b,e,f){b=b|0;e=e|0;f=f|0;var g=0,h=0,i=0,j=0,k=0,l=0,m=0,n=0,o=0,p=0;l=c[9]|0;m=c[6]|0;n=c[7]|0;o=c[8]|0;g=0;while(1){if((g|0)==16)break;h=b+(N(g,e)|0)|0;i=d[h+-1>>0]|0;j=d[h>>0]|0;k=(d[h+-2>>0]|0)-(d[h+1>>0]|0)|0;if(((d[l+(i-j)>>0]<<2)+(d[l+k>>0]|0)|0)<=(f<<1|1|0)){p=((j-i|0)*3|0)+(a[m+k>>0]|0)|0;k=a[n+(p+4>>3)>>0]|0;a[h+-1>>0]=a[o+((a[n+(p+3>>3)>>0]|0)+i)>>0]|0;a[h>>0]=a[o+(j-k)>>0]|0}g=g+1|0}return}function Ta(b,d){b=b|0;d=d|0;var e=0,f=0,g=0,h=0,i=0,j=0,k=0;k=l;l=l+16|0;j=c[b+52>>2]|0;c[k+4>>2]=j;if(j|0){j=c[b+12>>2]|0;g=c[d>>2]|0;f=Cb(b,k+4|0,k)|0;i=c[g+20>>2]|0;f=(c[g+16>>2]|0)+(N(i,f)|0)+3|0;g=c[b>>2]|0;h=c[k>>2]|0;d=0;e=c[k+4>>2]|0;while(1){if((d|0)<(h|0))b=0;else break;while(1){if((b|0)>=(j|0))break;a[f+(b<<2)>>0]=a[e+b>>0]|0;b=b+1|0}d=d+1|0;e=e+g|0;f=f+i|0}}l=k;return}function Ua(a){a=a|0;var b=0,d=0,e=0,f=0,g=0;do if(!a)b=0;else{d=c[a+8>>2]|0;e=c[d+40>>2]|0;if(c[a+4>>2]|0){c[a+12>>2]=c[e>>2];g=c[d>>2]|0;c[d+12>>2]=g;c[d+16>>2]=c[d+4>>2];if(fb(a,g)|0){c[a+4>>2]=0;b=d+4|0;f=6}}else{b=d+4|0;f=6}if((f|0)==6?$(a,c[a+16>>2]|0,c[a+56>>2]|0,c[a+60>>2]|0,c[b>>2]|0,1)|0:0){c[e+16>>2]=c[a+72>>2];b=1;break}Ob(a);b=0}while(0);return b|0}function Va(b,e,f,g,h){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;var i=0,j=0,k=0,l=0;k=c[b+4>>2]|0;l=c[b+8>>2]|0;j=c[b+16>>2]|0;a:do if((8>>>k|0)<8)while(1){if((e|0)<(f|0)){i=0;b=0}else break a;while(1){if((i|0)>=(l|0))break;if(!(i&(1<<k)+-1)){b=d[g>>0]|0;g=g+1|0}a[h>>0]=(c[j+((b&(1<<(8>>>k))+-1)<<2)>>2]|0)>>>8;i=i+1|0;b=b>>>(8>>>k);h=h+1|0}e=e+1|0}else Jb(g,j,h,e,f,l);while(0);return}function Wa(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,i=0,j=0;i=c[a+4>>2]|0;j=c[a+8>>2]|0;h=c[a+16>>2]|0;a:do if((8>>>i|0)<8)while(1){if((b|0)<(d|0)){g=0;a=0}else break a;while(1){if((g|0)>=(j|0))break;if(!(g&(1<<i)+-1)){a=(c[e>>2]|0)>>>8&255;e=e+4|0}c[f>>2]=c[h+((a&(1<<(8>>>i))+-1)<<2)>>2];g=g+1|0;a=a>>>(8>>>i);f=f+4|0}b=b+1|0}else Ib(e,h,f,b,d,j);while(0);return}function Xa(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0,h=0,i=0;d=c[a+64>>2]|0;if((b-d|0)>0){f=(c[a+16>>2]|0)+((N(c[a+56>>2]|0,d)|0)<<2)|0;e=c[a+8>>2]|0;i=c[a+20>>2]|0;h=c[e>>2]<<2;xb(a,b-d|0,f);f=c[a+64>>2]|0;c[e+8>>2]=f;g=c[e>>2]|0;c[e+12>>2]=g;c[e+16>>2]=b-f;e=c[a+12>>2]|0;d=c[e+20>>2]|0;d=dc(i,h,g,b-f|0,(c[e+16>>2]|0)+(N(d,c[a+72>>2]|0)|0)|0,d)|0;c[a+72>>2]=(c[a+72>>2]|0)+d}c[a+64>>2]=b;return}function Ya(){var b=0,d=0;if(!(c[1169]|0)){b=-255;while(1){if((b|0)==256){b=-1020;break}a[7713+(b+255)>>0]=(b|0)<0?0-b|0:b;b=b+1|0}while(1){if((b|0)==1021){b=-112;break}d=(b|0)<127?b:127;a[4680+(b+1020)>>0]=(d|0)>-128?d:-128;b=b+1|0}while(1){if((b|0)==113){b=-255;break}d=(b|0)<15?b:15;a[6721+(b+112)>>0]=(d|0)>-16?d:-16;b=b+1|0}while(1){if((b|0)==511)break;a[6946+(b+255)>>0]=(b|0)>0?((b|0)<255?b:255)&255:0;b=b+1|0}c[1169]=1}return}function Za(a,b){a=a|0;b=b|0;var d=0,e=0,f=0;d=l;l=l+16|0;do if(!a)a=0;else{if(!b){c[a>>2]=2;a=0;break}c[a+8>>2]=b;c[a>>2]=0;pb(a+24|0,c[b+48>>2]|0,c[b+44>>2]|0);if(Ub(a+24|0,d+8|0,d+4|0,d)|0){c[a+4>>2]=2;f=c[d+8>>2]|0;c[b>>2]=f;e=c[d+4>>2]|0;c[b+4>>2]=e;if(ma(f,e,1,a,0)|0){a=1;break}}else c[a>>2]=3;Ob(a);a=0}while(0);l=d;return a|0}function _a(a,b,e){a=a|0;b=b|0;e=e|0;var f=0,g=0,h=0,i=0,j=0,k=0;j=(1<<(Bc(a+12|0,2)|0))+-1|0;c[a+232>>2]=j;if((j*3|0)>>>0>e>>>0)f=7;else{f=0;g=e-(j*3|0)|0;h=b+(j*3|0)|0;i=b;while(1){if((f|0)==(j|0))break;k=(d[i+1>>0]|0)<<8|(d[i>>0]|0)|(d[i+2>>0]|0)<<16;k=k>>>0>g>>>0?g:k;tc(a+236+(f*28|0)|0,h,k);f=f+1|0;g=g-k|0;h=h+k|0;i=i+3|0}tc(a+236+(j*28|0)|0,h,g);f=h>>>0<(b+e|0)>>>0?0:5}return f|0}function $a(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0;if((b|0)<3&(d|0)>3?(a&3|0)==0:0){if((b|0)==1){f=c[a+(0-b<<2)>>2]|0;e=f}else{e=c[a+(0-b<<2)>>2]|0;f=c[a+(0-b<<2)+4>>2]|0}ob(a+(0-b<<2)|0,a,d,e,f)}else g=7;a:do if((g|0)==7){if((b|0)<(d|0))e=0;else{pa(a|0,a+(0-b<<2)|0,d<<2|0)|0;break}while(1){if((e|0)>=(d|0))break a;c[a+(e<<2)>>2]=c[a+(0-b<<2)+(e<<2)>>2];e=e+1|0}}while(0);return}function ab(a,b,e,f){a=a|0;b=b|0;e=e|0;f=f|0;var g=0,h=0,i=0;c[f>>2]=0;h=c[b>>2]|0;if(h>>>0>11?(i=c[a>>2]|0,(Eb(i,4335,4)|0)==0):0)if((Eb(i+8|0,4340,4)|0)==0?(g=(d[i+5>>0]|0)<<8|(d[i+4>>0]|0)|((d[i+7>>0]|0)<<8|(d[i+6>>0]|0))<<16,(g+-12|0)>>>0<=4294967274):0)if((e|0)!=0&g>>>0>(h+-8|0)>>>0)a=7;else{c[f>>2]=g;c[a>>2]=i+12;c[b>>2]=(c[b>>2]|0)+-12;a=0}else a=3;else a=0;return a|0}function bb(a,b,e,f,g){a=a|0;b=b|0;e=e|0;f=f|0;g=g|0;var h=0,i=0;if(((!((a|0)==0|b>>>0<10)?(xc(a+3|0,b+-3|0)|0)!=0:0)?(b=d[a>>0]|0,h=(d[a+7>>0]|0)<<8&16128|(d[a+6>>0]|0),i=(d[a+9>>0]|0)<<8&16128|(d[a+8>>0]|0),(b&25|0)==16?((d[a+1>>0]|0)<<8|b|(d[a+2>>0]|0)<<16)>>>5>>>0<e>>>0:0):0)?!((h|0)==0|(i|0)==0):0){if(f|0)c[f>>2]=h;if(!g)a=1;else{c[g>>2]=i;a=1}}else a=0;return a|0}function cb(a){a=a|0;var b=0,e=0,f=0,g=0,h=0;b=c[a+20>>2]|0;while(1){if((b|0)<=7)break;e=c[a+16>>2]|0;if(e>>>0>=(c[a+12>>2]|0)>>>0)break;g=Ec(c[a>>2]|0,c[a+4>>2]|0,8)|0;f=y;c[a>>2]=g;c[a+4>>2]=f;h=Dc(d[(c[a+8>>2]|0)+e>>0]|0|0,0,56)|0;c[a>>2]=h|g;c[a+4>>2]=y|f;c[a+16>>2]=e+1;e=b+-8|0;c[a+20>>2]=e;b=e}if(oc(a)|0)od(a);return}function db(b,e){b=b|0;e=e|0;var f=0,g=0,h=0,i=0;h=1<<(8>>>(c[e+4>>2]|0));i=wc(h,((h|0)<0)<<31>>31,4)|0;if(!i)f=0;else{g=c[e+16>>2]|0;c[i>>2]=c[g>>2];f=4;while(1){if((f|0)>=(b<<2|0))break;a[i+f>>0]=(d[i+(f+-4)>>0]|0)+(d[g+f>>0]|0);f=f+1|0}while(1){if((f|0)>=(h<<2|0))break;a[i+f>>0]=0;f=f+1|0}Ed(c[e+16>>2]|0);c[e+16>>2]=i;f=1}return f|0}function eb(a,b){a=a|0;b=b|0;var d=0;do if(a){if(!b){Lc(a,2,4041)|0;d=0;break}if((c[a+4>>2]|0)==0?(ea(a,b)|0)==0:0){d=0;break}d=(Zb(a,b)|0)==0;if(d){if(!(Ic(a,b)|0))d=0;else d=Ja(a,b)|0;d=(xd(a,b)|0)&d}else d=d&1;if(!d){Lb(a);d=0;break}else{c[a+4>>2]=0;break}}else d=0;while(0);return d|0}function fb(a,b){a=a|0;b=b|0;var d=0,e=0,f=0;d=c[a+56>>2]|0;e=c[a+60>>2]|0;d=qc(e|0,((e|0)<0)<<31>>31|0,d|0,((d|0)<0)<<31>>31|0)|0;e=y;f=Dc(b|0,((b|0)<0)<<31>>31|0,4)|0;f=Rc(f|0,y|0,b&65535|0,0)|0;e=Rc(f|0,y|0,d|0,e|0)|0;e=wc(e,y,4)|0;c[a+16>>2]=e;if(!e){c[a>>2]=1;f=0;b=0}else{f=1;b=e+(d<<2)+((b&65535)<<2)|0}c[a+20>>2]=b;return f|0}function gb(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0;g=l;l=l+48|0;if(!((a|0)==0|b>>>0<5)?(Nc(a,b)|0)!=0:0){pb(g,a,b);if(Ub(g,g+40|0,g+36|0,g+32|0)|0){if(d|0)c[d>>2]=c[g+40>>2];if(e|0)c[e>>2]=c[g+36>>2];if(!f)a=1;else{c[f>>2]=c[g+32>>2];a=1}}else a=0}else a=0;l=g;return a|0}function hb(a){a=a|0;var b=0,d=0,e=0,f=0;b=c[a+4>>2]|0;if(!(Ad(c[a>>2]|0)|0))a=2;else{f=c[a+20>>2]|0;f=(f|0)>-1?f:0-f|0;d=(c[a+8>>2]|0)+-1|0;d=qc(f|0,((f|0)<0)<<31>>31|0,d|0,((d|0)<0)<<31>>31|0)|0;d=Rc(d|0,y|0,b|0,((b|0)<0)<<31>>31|0)|0;e=y;a=(c[a+16>>2]|0)!=0&((f|0)>=(b<<2|0)&(e>>>0<0|((e|0)==0?d>>>0<=(c[a+24>>2]|0)>>>0:0)))?0:2}return a|0}function ib(b){b=b|0;var d=0,e=0,f=0;a:do if((c[b>>2]|0)>0)d=0;else{e=c[b+32>>2]|0;d=0;while(1){if((d|0)>=(e|0)){d=1;break a}f=c[b+36>>2]|0;if(a[c[f+(d*548|0)+4>>2]>>0]|0){d=0;break a}if(a[c[f+(d*548|0)+8>>2]>>0]|0){d=0;break a}if(!(a[c[f+(d*548|0)+12>>2]>>0]|0))d=d+1|0;else{d=0;break}}}while(0);return d|0}function jb(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0;e=c[a+8>>2]|0;f=c[e+40>>2]|0;d=c[a+64>>2]|0;g=(c[f+12>>2]|0)>>>0<2?0:d;d=(d|0)<(g|0)?g:d;if((d|0)<(b|0)){g=c[e>>2]|0;e=(c[f+84>>2]|0)+(N(g,d)|0)|0;Va(a+124|0,d,b,(c[a+16>>2]|0)+(N(c[a+56>>2]|0,d)|0)|0,e);kb(f,d,b,e,g)}c[a+72>>2]=b;c[a+64>>2]=b;return}function kb(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0;if(c[a+12>>2]|0){g=c[a+88>>2]|0;while(1){if((b|0)>=(d|0))break;switch(c[a+12>>2]|0){case 1:{Wb(g,e,e,f);break}case 2:{Tb(g,e,e,f);break}case 3:{lb(g,e,e,f);break}default:{}}g=e;b=b+1|0;e=e+f|0}c[a+88>>2]=g}return}function lb(b,c,e,f){b=b|0;c=c|0;e=e|0;f=f|0;var g=0,h=0,i=0,j=0,k=0;a:do if(!b)Wb(0,c,e,f);else{i=a[b>>0]|0;g=0;h=i;while(1){if((g|0)>=(f|0))break a;j=a[b+g>>0]|0;k=(h&255)-(i&255)+(j&255)|0;k=(k>>>0<256?k:(k>>>31)+255|0)+(d[c+g>>0]|0)&255;a[e+g>>0]=k;g=g+1|0;h=k;i=j}}while(0);return}function mb(b,d){b=b|0;d=d|0;var f=0,g=0,h=0;f=(Xc(d)|0)&255;h=a[b+(f<<2)>>0]|0;if((h&255)>8){vd(d,(c[d+20>>2]|0)+8|0);g=Xc(d)|0;b=b+(f<<2)+((e[b+(f<<2)+2>>1]|0)<<2)+((g&(1<<(h&255)+-8)+-1)<<2)|0;f=b;g=d+20|0;b=a[b>>0]|0}else{f=b+(f<<2)|0;g=d+20|0;b=h}vd(d,(c[g>>2]|0)+(b&255)|0);return e[f+2>>1]|0|0}function nb(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0;f=l;l=l+80|0;ud(f);Ac(f+48|0);c[f+48>>2]=f;c[f>>2]=0;if(Sb(a,b,f+4|0,f+8|0)|0){if(d|0)c[d>>2]=c[f+4>>2];if(e|0)c[e>>2]=c[f+8>>2];if(!(sa(a,b,f+48|0)|0))a=c[f+16>>2]|0;else a=0}else a=0;l=f;return a|0}function ob(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,i=0;if(!(b&4)){h=d;g=e;e=f}else{c[b>>2]=c[a>>2];h=d+-1|0;b=b+4|0;a=a+4|0;g=f}f=h>>1;d=0;while(1){if((d|0)>=(f|0))break;i=b+(d<<3)|0;c[i>>2]=g;c[i+4>>2]=e;d=d+1|0}d=d<<1;if(h&1|0)c[b+(d<<2)>>2]=c[a+(d<<2)>>2];return}function pb(a,b,e){a=a|0;b=b|0;e=e|0;var f=0,g=0,h=0,i=0;c[a+12>>2]=e;c[a>>2]=0;c[a+4>>2]=0;c[a+20>>2]=0;c[a+24>>2]=0;e=e>>>0<8?e:8;f=0;g=0;h=0;while(1){if(f>>>0>=e>>>0)break;i=Dc(d[b+f>>0]|0|0,0,f<<3|0)|0;f=f+1|0;g=i|g;h=y|h}c[a>>2]=g;c[a+4>>2]=h;c[a+16>>2]=e;c[a+8>>2]=b;return}function qb(b,d,e,f){b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0;h=d;while(1){if(!(h&3))break;a[h>>0]=a[b>>0]|0;f=Bd(f)|0;e=e+-1|0;h=h+1|0;b=b+1|0}g=e>>2;d=0;while(1){if((d|0)>=(g|0))break;c[h+(d<<2)>>2]=f;d=d+1|0}f=d<<2;while(1){if((f|0)>=(e|0))break;a[h+f>>0]=a[b+f>>0]|0;f=f+1|0}return}function rb(b,d,e,f){b=b|0;d=d|0;e=e|0;f=f|0;var g=0,h=0,i=0,j=0;g=0;while(1){if((g|0)>=(e|0))break;j=c[d+(g<<2)>>2]|0;h=((N(j<<16>>24,a[b>>0]|0)|0)>>5)+(j>>>16)|0;i=((N(j<<16>>24,a[b+1>>0]|0)|0)>>>5)+j|0;c[f+(g<<2)>>2]=h<<16&16711680|j&-16711936|i+((N(h<<24>>24,a[b+2>>0]|0)|0)>>>5)&255;g=g+1|0}return}function sb(a){a=a|0;var b=0,d=0,e=0,f=0;f=c[a+4>>2]|0;b=c[a+8>>2]|0;if((b|0)<0){Fb(a);b=c[a+8>>2]|0}d=c[a>>2]|0;e=d>>>b>>>0>(f>>>1&16777215)>>>0;if(e){c[a>>2]=d-((f>>>1&16777215)+1<<b);d=f-(f>>>1&16777215)|0}else d=(f>>>1&16777215)+1|0;f=(Q(d|0)|0)^24;c[a+8>>2]=b-f;c[a+4>>2]=(d<<f)+-1;return e&1|0}function tb(a){a=a|0;var b=0;b=c[a+12>>2]|0;do if(b>>>0>=(c[a+16>>2]|0)>>>0)if(!(c[a+24>>2]|0)){c[a>>2]=c[a>>2]<<8;c[a+8>>2]=(c[a+8>>2]|0)+8;c[a+24>>2]=1;break}else{c[a+8>>2]=0;break}else{c[a+8>>2]=(c[a+8>>2]|0)+8;c[a+12>>2]=b+1;c[a>>2]=c[a>>2]<<8|(d[b>>0]|0)}while(0);return}function ub(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0;g=c[a+4>>2]|0;d=c[a+8>>2]|0;if((d|0)<0){Fb(a);f=c[a+8>>2]|0}else f=d;d=(N(g,b)|0)>>>8;b=c[a>>2]|0;e=b>>>f>>>0>d>>>0;if(e){c[a>>2]=b-(d+1<<f);d=g-d|0}else d=d+1|0;g=(Q(d|0)|0)^24;c[a+8>>2]=f-g;c[a+4>>2]=(d<<g)+-1;return e&1|0}function vb(a,c,d){a=a|0;c=c|0;d=d|0;do if(a&255|0){if(a&170|0){Wc(c,d,1);Wc(c+64|0,d+128|0,1);break}if(b[c>>1]|0)Hb(c,d);if(b[c+32>>1]|0)Hb(c+32|0,d+4|0);if(b[c+64>>1]|0)Hb(c+64|0,d+128|0);if(b[c+96>>1]|0)Hb(c+96|0,d+132|0)}while(0);return}function wb(a,b){a=a|0;b=b|0;var d=0,e=0;e=c[a+20>>2]|0;do if((c[e+64>>2]|0)<(b|0)){d=c[e+16>>2]|0;if(!(c[a+80>>2]|0)){a=$(e,d,c[e+56>>2]|0,c[e+60>>2]|0,b,2)|0;break}else{a=fa(e,d,c[e+56>>2]|0,c[e+60>>2]|0,b)|0;break}}else a=1;while(0);return a|0}function xb(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0,g=0,h=0,i=0;h=c[a+56>>2]|0;i=c[a+64>>2]|0;g=c[a+20>>2]|0;f=c[a+120>>2]|0;while(1){e=f+-1|0;if((f|0)<=0)break;Z(a+124+(e*20|0)|0,i,i+b|0,d,g);f=e;d=g}if((d|0)!=(g|0))pa(g|0,d|0,N(b<<2,h)|0)|0;return}function yb(a){a=a|0;var b=0,d=0,e=0;d=c[a+40>>2]|0;c[d+20>>2]=0;e=c[a>>2]|0;c[a+12>>2]=e;c[a+16>>2]=c[a+4>>2];b=wc(1,0,(e+1>>1<<1)+e|0)|0;c[d+20>>2]=b;if(!b)a=0;else{c[d+4>>2]=b;a=b+(c[a+12>>2]|0)|0;c[d+8>>2]=a;c[d+12>>2]=a+(e+1>>1);a=1}return a|0}function zb(b,d,e){b=b|0;d=d|0;e=e|0;var f=0;f=Hc(e-b|0)|0;c[b>>2]=d;c[b+4>>2]=e;a[b+8>>0]=1;c[b+12>>2]=f;c[b+16>>2]=c[f+16>>2];if(d|0)c[d+4>>2]=b;if((c[1167]|0)!=(e|0))c[e>>2]=b;c[f+16>>2]=b;d=c[b+16>>2]|0;if(d|0)c[d+12>>2]=b;return}function Ab(a){a=a|0;var b=0,d=0;d=l;l=l+16|0;c[d>>2]=0;c[d+4>>2]=aa(c[a>>2]|0,c[a+4>>2]|0,0,0,0,d,0,a)|0;if(!(c[d+4>>2]|0)){if(c[d>>2]|0)b=4}else if(c[d>>2]|0?(c[d+4>>2]|0)==7:0)b=4;if((b|0)==4)c[d+4>>2]=4;l=d;return c[d+4>>2]|0}function Bb(b){b=b|0;var d=0,e=0;if(b|0){d=c[b+-8>>2]|0;if((d|0)!=(c[1167]|0)?(a[d+8>>0]|0)!=0:0){lc(d);e=c[d+4>>2]|0}else e=d;d=c[b+-12>>2]|0;if((d|0)!=0?(a[d+8>>0]|0)!=0:0)lc(d);else d=b+-12|0;zb(d,c[d>>2]|0,e)}return}function Cb(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0;e=c[a+8>>2]|0;f=c[a+16>>2]|0;c[d>>2]=f;if(!e){c[d>>2]=f+-1;b=0}else{c[b>>2]=(c[b>>2]|0)+(0-(c[a>>2]|0));b=e+-1|0}e=(c[a+16>>2]|0)+(c[a+8>>2]|0)|0;if((e|0)==(c[a+4>>2]|0))c[d>>2]=e-b;return b|0}function Db(b,e){b=b|0;e=e|0;var f=0,g=0,h=0,i=0,j=0;j=(c[8]|0)+(0-(d[b+-33>>0]|0))|0;g=b;h=0;while(1){if((h|0)>=(e|0))break;i=j+(d[g+-1>>0]|0)|0;f=0;while(1){if((f|0)==(e|0))break;a[g+f>>0]=a[i+(d[b+-32+f>>0]|0)>>0]|0;f=f+1|0}g=g+32|0;h=h+1|0}return}function Eb(b,c,d){b=b|0;c=c|0;d=d|0;var e=0,f=0;a:do if(!d)b=0;else{while(1){e=a[b>>0]|0;f=a[c>>0]|0;if(e<<24>>24!=f<<24>>24)break;d=d+-1|0;if(!d){b=0;break a}else{b=b+1|0;c=c+1|0}}b=(e&255)-(f&255)|0}while(0);return b|0}function Fb(a){a=a|0;var b=0,e=0;b=c[a+12>>2]|0;if(b>>>0<(c[a+20>>2]|0)>>>0){e=d[b>>0]|d[b+1>>0]<<8|d[b+2>>0]<<16|d[b+3>>0]<<24;c[a+12>>2]=b+3;b=(gd(e|0)|0)>>>8;c[a>>2]=c[a>>2]<<24|b;c[a+8>>2]=(c[a+8>>2]|0)+24}else tb(a);return}function Gb(a,b,c,d){a=a|0;b=b|0;c=c|0;d=d|0;var e=0,f=0;f=l;l=l+1024|0;if((d|0)>=513){e=wc(d,((d|0)<0)<<31>>31,2)|0;if(!e)a=0;else{a=da(a,b,c,d,e)|0;Ed(e)}}else a=da(a,b,c,d,f)|0;l=f;return a|0}function Hb(c,e){c=c|0;e=e|0;var f=0,g=0,h=0,i=0,j=0;g=(b[c>>1]|0)+4>>3;c=0;while(1){if((c|0)==4)break;h=c<<5;f=0;while(1){if((f|0)==4)break;i=e+(f+h)|0;j=g+(d[i>>0]|0)|0;a[i>>0]=j>>>0>255?(j>>>31)+255|0:j;f=f+1|0}c=c+1|0}return}function Ib(a,b,d,e,f,g){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;g=g|0;var h=0;while(1){if((e|0)<(f|0))h=0;else break;while(1){if((h|0)>=(g|0))break;c[d>>2]=c[b+(((c[a>>2]|0)>>>8&255)<<2)>>2];h=h+1|0;a=a+4|0;d=d+4|0}e=e+1|0}return}function Jb(b,e,f,g,h,i){b=b|0;e=e|0;f=f|0;g=g|0;h=h|0;i=i|0;var j=0;while(1){if((g|0)<(h|0))j=0;else break;while(1){if((j|0)>=(i|0))break;a[f>>0]=(c[e+((d[b>>0]|0)<<2)>>2]|0)>>>8;j=j+1|0;b=b+1|0;f=f+1|0}g=g+1|0}return}function Kb(a,b){a=a|0;b=b|0;var d=0,e=0,f=0,g=0;d=c[a+8>>2]|0;if((d|0)<0){Fb(a);d=c[a+8>>2]|0}f=c[a+4>>2]|0;g=c[a>>2]|0;e=(f>>>1)-(g>>>d)>>31;c[a+8>>2]=d+-1;c[a+4>>2]=e+f|1;c[a>>2]=g-((e&(f>>>1)+1)<<d);return (e^b)-e|0}function Lb(a){a=a|0;if(a|0){zc(a);Ed(c[a+1940>>2]|0);c[a+1940>>2]=0;c[a+1944>>2]=0;c[a+12>>2]=0;c[a+12+4>>2]=0;c[a+12+8>>2]=0;c[a+12+12>>2]=0;c[a+12+16>>2]=0;c[a+12+20>>2]=0;c[a+12+24>>2]=0;c[a+4>>2]=0}return}function Mb(a,b){a=a|0;b=b|0;var d=0;d=c[b>>2]|0;b=c[b+4>>2]|0;b=qc(b|0,((b|0)<0)<<31>>31|0,d|0,((d|0)<0)<<31>>31|0)|0;b=wc(b,y,1)|0;c[a+2012>>2]=b;if(!b)b=0;else{c[a+2016>>2]=b;c[a+2020>>2]=0;b=1}return b|0}function Nb(a){a=a|0;var b=0,d=0;b=c[a+56>>2]|0;d=c[a+60>>2]|0;b=qc(d|0,((d|0)<0)<<31>>31|0,b|0,((b|0)<0)<<31>>31|0)|0;c[a+20>>2]=0;b=wc(b,y,1)|0;c[a+16>>2]=b;if(!b){c[a>>2]=1;a=0}else a=1;return a|0}function Ob(a){a=a|0;var b=0;if(a|0){yc(a+76|0);Ed(c[a+16>>2]|0);c[a+16>>2]=0;b=0;while(1){if((b|0)>=(c[a+120>>2]|0))break;kd(a+124+(b*20|0)|0);b=b+1|0}c[a+120>>2]=0;c[a+204>>2]=0;c[a+12>>2]=0}return}function Pb(a,b,d){a=a|0;b=b|0;d=d|0;var e=0,f=0;e=(Xc(b)|0)&63;f=c[a+36+(e<<3)>>2]|0;a=c[a+36+(e<<3)+4>>2]|0;e=(c[b+20>>2]|0)+f|0;if((f|0)<256){vd(b,e);c[d>>2]=a;a=0}else vd(b,e+-256|0);return a|0}function Qb(){}function Rb(a,b){a=a|0;b=b|0;var c=0,d=0,e=0;c=N(b&65535,a&65535)|0;e=(c>>>16)+(N(b&65535,a>>>16)|0)|0;d=N(b>>>16,a&65535)|0;return (y=(e>>>16)+(N(b>>>16,a>>>16)|0)+(((e&65535)+d|0)>>>16)|0,e+d<<16|c&65535|0)|0}function Sb(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;var f=0;f=l;l=l+48|0;if(!(hc(a,b,f)|0)){if(d|0)c[d>>2]=c[f>>2];if(!e)a=1;else{c[e>>2]=c[f+4>>2];a=1}}else a=0;l=f;return a|0}function Tb(b,c,e,f){b=b|0;c=c|0;e=e|0;f=f|0;var g=0;a:do if(!b)Wb(0,c,e,f);else{g=0;while(1){if((g|0)>=(f|0))break a;a[e+g>>0]=(d[c+g>>0]|0)+(d[b+g>>0]|0);g=g+1|0}}while(0);return}function Ub(a,b,d,e){a=a|0;b=b|0;d=d|0;e=e|0;if((_b(a,8)|0)==47?(c[b>>2]=(_b(a,14)|0)+1,c[d>>2]=(_b(a,14)|0)+1,c[e>>2]=_b(a,1)|0,(_b(a,3)|0)==0):0)a=(c[a+24>>2]|0)==0&1;else a=0;return a|0}function Vb(a,b){a=a|0;b=b|0;var d=0,e=0;e=c[a+1952>>2]|0;if((c[a+1960>>2]|0)>0?(e|0)>=(c[a+220>>2]|0):0)d=(e|0)<=(c[a+228>>2]|0)&1;else d=0;c[a+136>>2]=e;c[a+140>>2]=d;Y(a,a+132|0);return na(a,b)|0}function Wb(b,c,e,f){b=b|0;c=c|0;e=e|0;f=f|0;var g=0,h=0;if(!b){g=0;b=0}else{g=0;b=a[b>>0]|0}while(1){if((g|0)>=(f|0))break;h=(d[c+g>>0]|0)+(b&255)&255;a[e+g>>0]=h;g=g+1|0;b=h}return}function Xb(b,d,e){b=b|0;d=d|0;e=e|0;var f=0,g=0;f=b;while(1){if(f>>>0>=(b+(d<<2)|0)>>>0)break;g=c[f>>2]|0;a[e>>0]=g>>>16;a[e+1>>0]=g>>>8;a[e+2>>0]=g;a[e+3>>0]=g>>>24;f=f+4|0;e=e+4|0}return}function Yb(b,c,d){b=b|0;c=c|0;d=d|0;var e=0;if((c|0)<(b|0)&(b|0)<(c+d|0)){e=b;c=c+d|0;b=b+d|0;while((d|0)>0){b=b-1|0;c=c-1|0;d=d-1|0;a[b>>0]=a[c>>0]|0}b=e}else pa(b,c,d)|0;return b|0}function Zb(a,b){a=a|0;b=b|0;if(!(yb(b)|0)){Lc(a,6,494)|0;a=c[a>>2]|0}else{c[a+216>>2]=0;c[a+220>>2]=0;c[a+224>>2]=c[a+208>>2];c[a+228>>2]=c[a+212>>2];ya(a);a=0}return a|0}function _b(a,b){a=a|0;b=b|0;var d=0;if((b|0)<25&(c[a+24>>2]|0)==0){d=Xc(a)|0;d=c[40+(b<<2)>>2]&d;c[a+20>>2]=(c[a+20>>2]|0)+b;cb(a);a=d}else{od(a);a=0}return a|0}function $b(a,b,c){a=a|0;b=b|0;c=c|0;var d=0;c=qc(c|0,0,a|0,b|0)|0;d=y;if((a|0)==0&(b|0)==0)return 1;else return (d>>>0<0|(d|0)==0&c>>>0<2147418113)&((c|0)==(c|0)&(d|0)==0)&1|0;return 0}function ac(a,b){a=a|0;b=b|0;c[b+8>>2]=0;c[b+20>>2]=c[a+1920>>2];c[b+24>>2]=c[a+1924>>2];c[b+28>>2]=c[a+1928>>2];c[b+32>>2]=c[a+1932>>2];c[b+36>>2]=c[a+1936>>2];c[b+52>>2]=0;return}function bc(a){a=a|0;var b=0,d=0;b=c[a+40>>2]|0;if((c[a+12>>2]|0)<1?1:(c[a+16>>2]|0)<1)a=0;else{d=ta(a,b)|0;Ta(a,b);c[b+16>>2]=(c[b+16>>2]|0)+d;a=1}return a|0}function cc(a,c,d,f){a=a|0;c=c|0;d=d|0;f=f|0;var g=0;f=e[f>>1]|e[f+2>>1]<<16;do{d=d-c|0;g=a+(d<<2)|0;b[g>>1]=f;b[g+2>>1]=f>>>16}while((d|0)>0);return}function dc(a,b,c,d,e,f){a=a|0;b=b|0;c=c|0;d=d|0;e=e|0;f=f|0;var g=0;g=d;while(1){if((g|0)<=0)break;Xb(a,c,e);e=e+f|0;g=g+-1|0;a=a+b|0}return d|0}function ec(a,b,d){a=a|0;b=b|0;d=d|0;var e=0;e=c[a+96>>2]|0;c[a+56>>2]=b;c[a+60>>2]=d;c[a+100>>2]=(b+-1+(1<<e)|0)>>>e;c[a+92>>2]=(e|0)==0?-1:(1<<e)+-1|0;return}function fc(a,b,d){a=a|0;b=b|0;d=d|0;var e=0;e=1<<b-d;while(1){if((b|0)>=15)break;e=e-(c[a+(b<<2)>>2]|0)|0;if((e|0)<1)break;e=e<<1;b=b+1|0}return b-d|0}function gc(a,b){a=a|0;b=b|0;var d=0;d=Kc(1<<b,((1<<b|0)<0)<<31>>31,4)|0;c[a>>2]=d;if(!d)a=0;else{c[a+4>>2]=32-b;c[a+8>>2]=b;a=1}return a|0}function hc(a,b,c){a=a|0;b=b|0;c=c|0;if((a|0)==0|(c|0)==0)a=2;else{Yc(c);a=aa(a,b,c,c+4|0,c+8|0,c+12|0,c+16|0,0)|0}return a|0}function ic(a,b){a=a|0;b=b|0;if((a|0)==0|(b&-256|0)!=512)a=0;else{b=a+48|0;do{c[a>>2]=0;a=a+4|0}while((a|0)<(b|0));a=1}return a|0}function jc(a,b){a=a|0;b=b|0;if((b|0)>120)a=b+-120|0;else{b=d[4170+(b+-1)>>0]|0;a=(N(b>>>4,a)|0)+(8-(b&15))|0;a=(a|0)>1?a:1}return a|0}function kc(a,b,c){a=a|0;b=b|0;c=c|0;var d=0,e=0;d=3;while(1){if((d|0)<=0)break;e=a+(b<<2)|0;Ra(e,b,c);d=d+-1|0;a=e}return}function lc(b){b=b|0;var d=0,e=0;d=c[b+12>>2]|0;c[d+16>>2]=c[b+16>>2];e=c[b+16>>2]|0;if(e|0)c[e+12>>2]=d;a[b+8>>0]=0;return}function mc(a,b,d){a=a|0;b=b|0;d=d|0;if((b|0)<1|((a|0)<1|(d|0)==0))a=2;else{c[d+4>>2]=a;c[d+8>>2]=b;a=Oa(d)|0}return a|0}function nc(a,b){a=a|0;b=b|0;var d=0;d=0;while(1){if((d|0)>=(c[b+208>>2]|0))break;ia(a,b,d);d=d+1|0}return (c[b+36>>2]|0)==0|0}function oc(a){a=a|0;if(!(c[a+24>>2]|0))if((c[a+16>>2]|0)==(c[a+12>>2]|0))a=(c[a+20>>2]|0)>64&1;else a=0;else a=1;return a|0}function pc(a,b,f){a=a|0;b=b|0;f=f|0;var g=0;g=d[a>>0]|0;c[f>>2]=(c[f>>2]|0)+g;c[f+4>>2]=(e[a+2>>1]|0)<<b|c[f+4>>2];return g|0}function qc(a,b,c,d){a=a|0;b=b|0;c=c|0;d=d|0;var e=0,f=0;e=Rb(a,c)|0;f=y;return (y=(N(b,c)|0)+(N(d,a)|0)+f|f&0,e|0|0)|0}function rc(a,b,c){a=a|0;b=b|0;c=c|0;var d=0,e=0;d=3;while(1){if((d|0)<=0)break;e=a+4|0;Sa(e,b,c);d=d+-1|0;a=e}return}function sc(a){a=a|0;var b=0,d=0;d=c[a+136>>2]|0;b=c[a+216>>2]|0;while(1){if((b|0)>=(c[a+224>>2]|0))break;ja(a,b,d);b=b+1|0}return}function tc(a,b,d){a=a|0;b=b|0;d=d|0;c[a+4>>2]=254;c[a>>2]=0;c[a+8>>2]=-8;c[a+24>>2]=0;Gc(a,b,d);Fb(a);return}function uc(a,b,d,e,f){a=a|0;b=b|0;d=d|0;e=e|0;f=f|0;if(!d)a=0;else a=c[a+((N(f>>d,b)|0)+(e>>d)<<2)>>2]|0;return a|0}function vc(a,b,d){a=a|0;b=b|0;d=d|0;d=uc(c[a+28>>2]|0,c[a+24>>2]|0,c[a+20>>2]|0,b,d)|0;return (c[a+36>>2]|0)+(d*548|0)|0}function wc(a,b,c){a=a|0;b=b|0;c=c|0;if(!($b(a,b,c)|0))a=0;else{a=qc(c|0,0,a|0,b|0)|0;a=Qa(a)|0}return a|0}function xc(b,c){b=b|0;c=c|0;if((c>>>0>2?(a[b>>0]|0)==-99:0)?(a[b+1>>0]|0)==1:0)b=(a[b+2>>0]|0)==42&1;else b=0;return b|0}function yc(a){a=a|0;Ed(c[a+28>>2]|0);Ed(c[a+40>>2]|0);wd(c[a+36>>2]|0);fd(a+4|0);_c(a);return}function zc(a){a=a|0;Ed(c[a+2012>>2]|0);c[a+2012>>2]=0;c[a+2016>>2]=0;$c(c[a+1996>>2]|0);c[a+1996>>2]=0;return}function Ac(a){a=a|0;if(a|0){c[a>>2]=0;c[a+4>>2]=0;c[a+8>>2]=0;c[a+12>>2]=0;c[a+16>>2]=0;c[a+20>>2]=0}return}function Bc(a,b){a=a|0;b=b|0;var c=0,d=0;d=0;while(1){c=b+-1|0;if((b|0)<=0)break;d=(sb(a)|0)<<c|d;b=c}return d|0}function Cc(a,b,d){a=a|0;b=b|0;d=d|0;c[a>>2]=(c[i>>2]|0)+d;a=U()|0;c[i>>2]=a;c[b>>2]=a;return}function Dc(a,b,c){a=a|0;b=b|0;c=c|0;if((c|0)<32){y=b<<c|(a&(1<<c)-1<<32-c)>>>32-c;return a<<c}y=a<<c-32;return 0}function Ec(a,b,c){a=a|0;b=b|0;c=c|0;if((c|0)<32){y=b>>>c;return a>>>c|(b&(1<<c)-1)<<32-c}y=0;return b>>>c-32|0}function Fc(a,b){a=a|0;b=b|0;b=1<<b+-1;while(1)if(!(b&a))break;else b=b>>>1;return ((b|0)==0?a:(b+-1&a)+b|0)|0}function Gc(a,b,d){a=a|0;b=b|0;d=d|0;c[a+12>>2]=b;c[a+16>>2]=b+d;c[a+20>>2]=d>>>0>3?b+d+-4+1|0:b;return}function Hc(a){a=a|0;var b=0;b=4348;a=a>>>5;while(1){if(!((a|0)!=0&(b|0)!=4648))break;b=b+20|0;a=a>>>1}return b|0}function Ic(a,b){a=a|0;b=b|0;nd(a);if(!(ga(a)|0))a=0;else{ac(a,b);Ya();a=1}return a|0}function Jc(b){b=b|0;var d=0;d=c[b+1908>>2]|0;a[d+-2>>0]=0;a[d+-1>>0]=0;c[b+1900>>2]=0;c[b+1948>>2]=0;return}function Kc(a,b,c){a=a|0;b=b|0;c=c|0;if(!($b(a,b,c)|0))a=0;else a=ad(a,c)|0;return a|0}function Lc(a,b,d){a=a|0;b=b|0;d=d|0;if(!(c[a>>2]|0)){c[a>>2]=b;c[a+8>>2]=d;c[a+4>>2]=0}return 0}function Mc(a,b){a=a|0;b=b|0;var c=0;c=0;while(1){if((c|0)==8)break;Ma(b+(c<<5)|0,a|0,8)|0;c=c+1|0}return}function Nc(b,c){b=b|0;c=c|0;if(c>>>0>4?(a[b>>0]|0)==47:0)b=(d[b+4>>0]|0)<32&1;else b=0;return b|0}function Oc(a,b){a=a|0;b=b|0;var d=0;d=dd(b,c[a+4>>2]|0)|0;c[(c[a>>2]|0)+(d<<2)>>2]=b;return}function Pc(a,b){a=a|0;b=b|0;if((a|0)>=4)a=(_b(b,a+-2>>1)|0)+((a&1|2)<<(a+-2>>1))|0;return a+1|0}function Qc(a){a=a|0;if(a|0){if((c[a+12>>2]|0)<1)Ed(c[a+44>>2]|0);c[a+44>>2]=0}return}function Rc(a,b,c,d){a=a|0;b=b|0;c=c|0;d=d|0;return (y=b+d+(a+c>>>0>>>0<a>>>0|0)>>>0,a+c>>>0|0)|0}function Sc(a){a=a|0;c[a>>2]=0;c[a+4>>2]=0;c[a+8>>2]=1;c[a+12>>2]=0;c[a+16>>2]=0;return}function Tc(){var a=0;a=Kc(1,0,208)|0;if(!a)a=0;else{c[a>>2]=0;c[a+4>>2]=2}return a|0}function Uc(a){a=a|0;var b=0;if(a|0){b=a+56|0;do{c[a>>2]=0;a=a+4|0}while((a|0)<(b|0))}return}function Vc(){var a=0;a=Kc(1,0,2024)|0;if(a|0){yd(a);c[a+4>>2]=0;c[a+232>>2]=0}return a|0}function Wc(a,b,c){a=a|0;b=b|0;c=c|0;ra(a,b);if(c|0)ra(a+32|0,b+4|0);return}function Xc(a){a=a|0;a=Ec(c[a>>2]|0,c[a+4>>2]|0,c[a+20>>2]&63|0)|0;return a|0}function Yc(a){a=a|0;var b=0;b=a+40|0;do{c[a>>2]=0;a=a+4|0}while((a|0)<(b|0));return}function Zc(a,b){a=a|0;b=b|0;b=Bc(a,b)|0;a=(Cd(a)|0)!=0;return (a?0-b|0:b)|0}function _c(a){a=a|0;var b=0;b=a+44|0;do{c[a>>2]=0;a=a+4|0}while((a|0)<(b|0));return}function $c(a){a=a|0;if(a|0){pd(c[a+20>>2]|0);c[a+20>>2]=0;Ed(a)}return}function ad(a,b){a=a|0;b=b|0;a=N(b,a)|0;b=Qa(a)|0;Ma(b|0,0,a|0)|0;return b|0}function bd(a){a=a|0;a=(c[a+40>>2]|0)+20|0;Ed(c[a>>2]|0);c[a>>2]=0;return}function cd(a){a=a|0;var b=0;b=l;l=l+a|0;l=l+15&-16;return b|0}function dd(a,b){a=a|0;b=b|0;b=Ec(N(a,506832829)|0,0,b|0)|0;return b|0}function ed(a,b,c){a=a|0;b=b|0;c=c|0;return ((b|0)>3?3:(b|0)>1?2:c)|a<<2|0}function fd(a){a=a|0;if(a|0){Ed(c[a>>2]|0);c[a>>2]=0}return}function gd(a){a=a|0;return (a&255)<<24|(a>>8&255)<<16|(a>>16&255)<<8|a>>>24|0}function hd(a,b){a=a|0;b=b|0;return c[(c[a>>2]|0)+(b<<2)>>2]|0}function id(a){a=a|0;if((c[a+20>>2]|0)>31)zd(a);return}function jd(a,b){a=a|0;b=b|0;if(!n){n=a;o=b}}function kd(a){a=a|0;Ed(c[a+16>>2]|0);c[a+16>>2]=0;return}function ld(a,b){a=a|0;b=b|0;return ((a|0)<0?0:(a|0)>(b|0)?b:a)|0}function md(a){a=a|0;return wc(a,((a|0)<0)<<31>>31,548)|0}function nd(a){a=a|0;c[a+124>>2]=0;c[a+128>>2]=1;return}function od(a){a=a|0;c[a+24>>2]=1;c[a+20>>2]=0;return}function pd(a){a=a|0;if(a|0){Ob(a);Ed(a)}return}function qd(c){c=c|0;b[c>>1]=65535;a[c+2>>0]=255;return}function rd(a){a=a|0;if(a|0){Lb(a);Ed(a)}return}function sd(a,b){a=a|0;b=b|0;l=a;m=b}function td(a,b){a=a|0;b=b|0;return Pc(a,b)|0}function ud(a){a=a|0;ic(a,520)|0;return}function vd(a,b){a=a|0;b=b|0;c[a+20>>2]=b;return}function wd(a){a=a|0;if(a|0)Ed(a);return}function xd(a,b){a=a|0;b=b|0;bd(b);return 1}function yd(a){a=a|0;c[a>>2]=0;c[a+8>>2]=3727;return}function zd(a){a=a|0;cb(a);return}function Ad(a){a=a|0;return (a|0)==0|0}function Bd(a){a=a|0;return a<<24|a>>>8|0}function Cd(a){a=a|0;return Bc(a,1)|0}function Dd(){V();return}function Ed(a){a=a|0;Bb(a);return}function Fd(){return Kc(1,0,92)|0}function Gd(a){a=a|0;l=a}function Hd(a){a=a|0;y=a}function Id(){return y|0}function Jd(){return l|0}

// EMSCRIPTEN_END_FUNCS
return{_DecodeRGBA:nb,___muldi3:qc,_bitshift64Lshr:Ec,_bitshift64Shl:Dc,_free:Bb,_i64Add:Rc,_llvm_bswap_i32:gd,_malloc:Qa,_mallocFailed:Dd,_mallocInit:Cc,_memcpy:pa,_memmove:Yb,_memset:Ma,establishStackSpace:sd,getTempRet0:Id,runPostSets:Qb,setTempRet0:Hd,setThrew:jd,stackAlloc:cd,stackRestore:Gd,stackSave:Jd}})


// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg,Module.asmLibraryArg,buffer);
for(var asm_function in asm)
  Module[asm_function]=asm[asm_function];
if(typeof memoryInitializer=="string"&&!memoryInitializer.lastIndexOf("data:application/octet-stream;base64,",0))
  _HEAPU8.set(decode_base64(memoryInitializer.substring(memoryInitializer.indexOf(",")+1)),GLOBAL_BASE);
for(;__ATINIT__.length;__ATINIT__.shift())__ATINIT__[0].func(typeof __ATINIT__[0].arg=="undefined"?null:__ATINIT__[0].arg);
Module.decode=(function(data,canvas){
  var webp=Module._malloc(8+data.length);
  _HEAPU8.set(data,webp+8);
  var rgba=Module._DecodeRGBA(webp+8,data.length,webp,webp+4);
  if(rgba){
    canvas.width=_HEAPU32[webp>>2];
    canvas.height=_HEAPU32[webp+4>>2];
    var context=canvas.getContext("2d");
    var imageData=context.getImageData(0,0,canvas.width,canvas.height);
    imageData.data.set(_HEAPU8.subarray(rgba,rgba+imageData.data.length));
    context.putImageData(imageData,0,0);
    canvas.naturalWidth = canvas.width;
    canvas.naturalHeight = canvas.height;
    canvas.complete = true;
  }else{
    canvas.naturalWidth = 0;
    canvas.naturalHeight = 0;
    canvas.complete = false;
    console.log("Error: failed to decode WebP image");
  }
  Module._free(rgba);
  Module._free(webp);
})

  return WebPDecoder;
}();
if (typeof exports === 'object' && typeof module === 'object')
  module.exports = WebPDecoder;
else if (typeof define === 'function' && define['amd'])
  define([], function() { return WebPDecoder; });
else if (typeof exports === 'object')
  exports["WebPDecoder"] = WebPDecoder;

