using System;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs.LowLevel.Unsafe;
using Unity.Tiny;
using Random = Unity.Mathematics.Random;

namespace Timespawn.TinyRogue.Common
{
    public class RandomSystem : SystemBase
    {
        private NativeArray<Random> RandomArray;

        public NativeArray<Random> GetRandomArray()
        {
            return RandomArray;
        }

        protected override void OnCreate()
        {
            Random seedRandom = Random.CreateFromIndex((uint) DateTime.UtcNow.Ticks & int.MaxValue);
            Debug.LogAlways($"Random seed: {seedRandom.state}");

            RandomArray = new NativeArray<Random>(JobsUtility.MaxJobThreadCount, Allocator.Persistent);
            for (int i = 0; i < RandomArray.Length; i++)
            {
                RandomArray[i] = Random.CreateFromIndex(seedRandom.NextUInt());
            }
        }

        protected override void OnUpdate()
        {
            
        }

        protected override void OnDestroy()
        {
            RandomArray.Dispose();
        }
    }
}