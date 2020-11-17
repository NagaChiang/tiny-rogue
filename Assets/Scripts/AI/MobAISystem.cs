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
            int directionCount = (int) Direction.Right + 1;

            EndInitializationEntityCommandBufferSystem endInitECBSystem = World.GetOrCreateSystem<EndInitializationEntityCommandBufferSystem>();
            EntityCommandBuffer commandBuffer = endInitECBSystem.CreateCommandBuffer();
            Entities
                .WithAll<TurnToken, Mob>()
                .WithNone<ActorAction>()
                .ForEach((Entity entity) =>
                {
                    Random random = randomArray[0];

                    Direction direction = (Direction) random.NextInt(directionCount);
                    commandBuffer.AddComponent(entity, new ActorAction(direction));

                    randomArray[0] = random;
                }).Schedule();

            endInitECBSystem.AddJobHandleForProducer(Dependency);
        }
    }
}