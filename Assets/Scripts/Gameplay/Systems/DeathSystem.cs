using Timespawn.TinyRogue.Maps;
using Unity.Entities;

namespace Timespawn.TinyRogue.Gameplay
{
    [UpdateAfter(typeof(AttackSystem))]
    public class DeathSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            Entity mapEntity = World.GetOrCreateSystem<MapSystem>().GetMapEntity();
            Grid grid = EntityManager.GetComponentData<Grid>(mapEntity);
            DynamicBuffer<Cell> cellBuffer = EntityManager.GetBuffer<Cell>(mapEntity);

            EntityCommandBuffer commandBuffer = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>().CreateCommandBuffer();
            Entities
                .WithChangeFilter<Health>()
                .ForEach((Entity entity, in Health health, in Tile tile) =>
                {
                    if (health.Current > 0)
                    {
                        return;
                    }

                    commandBuffer.DestroyEntity(entity);
                    grid.SetUnit(cellBuffer, tile.GetCoord(), Entity.Null);
                }).Run();
        }
    }
}