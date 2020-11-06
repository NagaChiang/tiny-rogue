using Timespawn.Core.Common;
using Timespawn.TinyRogue.Common;
using Timespawn.TinyRogue.Gameplay;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.AI
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(TurnSystem))]
    [UpdateBefore(typeof(ActorActionSystem))]
    public class MobAISystem : SystemBase
    {
        protected override void OnUpdate()
        {
            NativeArray<Random> randomArray = World.GetOrCreateSystem<RandomSystem>().GetRandomArray();
            Random random = randomArray[0];
            int directionCount = CommonUtils.GetEnumCount<Direction2D>();

            EntityCommandBuffer commandBuffer = new EntityCommandBuffer(Allocator.Temp);
            Entities
                .WithAll<TurnToken, Mob>()
                .ForEach((Entity entity) =>
                {
                    commandBuffer.RemoveComponent<TurnToken>(entity);

                    Direction2D direction = (Direction2D) random.NextInt(directionCount);
                    commandBuffer.AddComponent(entity, new ActorAction(direction));
                }).Run();

            commandBuffer.Playback(EntityManager);
            commandBuffer.Dispose();

            randomArray[0] = random;
        }
    }
}