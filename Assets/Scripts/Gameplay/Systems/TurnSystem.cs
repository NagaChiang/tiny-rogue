using System.Linq;
using Timespawn.EntityTween.Tweens;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Tiny;

namespace Timespawn.TinyRogue.Gameplay
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public class TurnSystem : SystemBase
    {
        private EntityQuery TurnTokenQuery;
        private EntityQuery TweeningActorQuery;
        private EntityQuery ActorQuery;

        protected override void OnCreate()
        {
            TurnTokenQuery = GetEntityQuery(ComponentType.ReadOnly<TurnToken>());
            TweeningActorQuery = GetEntityQuery(ComponentType.ReadOnly<TweenState>(), ComponentType.ReadOnly<Actor>());
            ActorQuery = GetEntityQuery(ComponentType.ReadOnly<Actor>());
        }

        protected override void OnUpdate()
        {
            if (TurnTokenQuery.CalculateEntityCount() > 0 || TweeningActorQuery.CalculateEntityCount() > 0)
            {
                return;
            }

            NativeArray<Entity> entities = ActorQuery.ToEntityArray(Allocator.TempJob);
            if (entities.Length > 0)
            {
                Entity nextTurnEntity = FindNextTurnEntity(entities);
                if (nextTurnEntity != Entity.Null)
                {
                    ushort forwardTime = EntityManager.GetComponentData<Actor>(nextTurnEntity).NextActionTime;

                    EntityCommandBuffer commandBuffer = World.GetOrCreateSystem<EndInitializationEntityCommandBufferSystem>().CreateCommandBuffer();
                    commandBuffer.AddComponent<TurnToken>(nextTurnEntity);

                    Entities.ForEach((ref Actor actor) =>
                    {
                        int newTime = actor.NextActionTime - forwardTime;
                        actor.NextActionTime = (ushort) math.min(newTime, 0);
                    }).Run();
                }
            }

            entities.Dispose();
        }

        private Entity FindNextTurnEntity(NativeArray<Entity> entities)
        {
            entities.Sort();

            Entity minNextActionTimeEntity = Entity.Null;
            ushort minNextActionTime = ushort.MaxValue;
            foreach (Entity entity in entities)
            {
                Actor actor = EntityManager.GetComponentData<Actor>(entity);
                if (actor.NextActionTime < minNextActionTime)
                {
                    minNextActionTimeEntity = entity;
                    minNextActionTime = actor.NextActionTime;
                }
            }

            return minNextActionTimeEntity;
        }
    }
}