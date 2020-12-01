using Timespawn.EntityTween.Math;
using Timespawn.EntityTween.Tweens;
using Timespawn.TinyRogue.Gameplay;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace Timespawn.TinyRogue.Maps
{
    public class GridMoveSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            Entity mapEntity = World.GetOrCreateSystem<MapSystem>().GetMapEntity();
            Translation mapTrans = GetComponent<Translation>(mapEntity);
            Grid grid = GetComponent<Grid>(mapEntity);

            EndSimulationEntityCommandBufferSystem endSimECBSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
            EntityCommandBuffer commandBuffer = endSimECBSystem.CreateCommandBuffer();
            Entities.ForEach((Entity entity, ref Actor actor, ref Tile tile, ref Translation translation, in GridMoveCommand command) =>
            {
                commandBuffer.RemoveComponent<GridMoveCommand>(entity);

                actor.NextActionTime = 20; // TODO: Data

                DynamicBuffer<Cell> cellBuffer = GetBuffer<Cell>(mapEntity);
                grid.SetUnit(cellBuffer, tile.x, tile.y, Entity.Null);
                grid.SetUnit(cellBuffer, command.GetCoord(), entity);

                tile = new Tile(command.GetCoord());
                float3 targetPos = grid.GetCellCenter(mapTrans.Value, tile.GetCoord());
                //Tween.Move(commandBuffer, entity, translation.Value, targetPos, 0.05f, new EaseDesc(EaseType.SmoothStep, 2)); // TODO: Data
                translation.Value = targetPos;
            }).Schedule();

            endSimECBSystem.AddJobHandleForProducer(Dependency);
        }
    }
}