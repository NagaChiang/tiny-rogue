using Timespawn.EntityTween.Math;
using Timespawn.EntityTween.Tweens;
using Timespawn.TinyRogue.Gameplay;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Tiny;
using Unity.Transforms;

namespace Timespawn.TinyRogue.Maps
{
    public class GridMoveSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            Entity mapEntity = World.GetOrCreateSystem<MapSystem>().GetMapEntity();
            Translation mapTrans = EntityManager.GetComponentData<Translation>(mapEntity);
            Grid grid = EntityManager.GetComponentData<Grid>(mapEntity);
            DynamicBuffer<Cell> cellBuffer = EntityManager.GetBuffer<Cell>(mapEntity);

            EntityCommandBuffer commandBuffer = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>().CreateCommandBuffer();
            Entities.ForEach((Entity entity, ref Actor actor, ref Tile tile, in Translation translation, in GridMoveCommand command) =>
            {
                commandBuffer.RemoveComponent<GridMoveCommand>(entity);

                actor.NextActionTime = 20; // TODO: Data

                grid.SetUnit(cellBuffer, tile.x, tile.y, Entity.Null);
                grid.SetUnit(cellBuffer, command.GetCoord(), entity);

                tile = new Tile(command.GetCoord());
                float3 targetPos = grid.GetCellCenter(mapTrans.Value, tile.GetCoord());
                Tween.Move(commandBuffer, entity, translation.Value, targetPos, 0.1f, new EaseDesc(EaseType.SmoothStep, 2)); // TODO: Data
            }).Run();
        }
    }
}