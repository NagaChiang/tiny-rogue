using Timespawn.Core.Common;
using Timespawn.TinyRogue.Gameplay;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.AI
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateBefore(typeof(ActorActionSystem))]
    public class MobAISystem : SystemBase
    {
        private Random Random;

        protected override void OnCreate()
        {
            Random = new Random(10); // TODO: Random system
        }

        protected override void OnUpdate()
        {
            Random random = Random;
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

            Random = random;
        }
    }
}