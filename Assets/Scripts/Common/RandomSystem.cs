using Unity.Collections;
using Unity.Entities;
using Unity.Jobs.LowLevel.Unsafe;
using Unity.Mathematics;
using Unity.Tiny;

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
            Random seedRandom = Random.CreateFromIndex((uint) 1); // TODO: Random seed
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