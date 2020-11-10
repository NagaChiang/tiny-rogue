using Unity.Collections;
using Unity.Entities;

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
            ActorQuery = GetEntityQuery(ComponentType.ReadOnly<Actor>());
        }

        protected override void OnUpdate()
        {
            if (!TurnTokenQuery.IsEmptyIgnoreFilter)
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
                        actor.NextActionTime -= forwardTime;
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