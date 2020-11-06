using Timespawn.Core.Common;
using Timespawn.TinyRogue.Maps;
using Unity.Entities;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.Gameplay
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public class ActorActionSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            Entity mapEntity = World.GetOrCreateSystem<MapSystem>().GetMapEntity();
            Grid grid = EntityManager.GetComponentData<Grid>(mapEntity);
            DynamicBuffer<Cell> cellBuffer = EntityManager.GetBuffer<Cell>(mapEntity);

            EntityCommandBuffer commandBuffer = World.GetOrCreateSystem<EndInitializationEntityCommandBufferSystem>().CreateCommandBuffer();
            Entities.ForEach((Entity entity, in ActorAction command, in Tile tile) =>
            {
                commandBuffer.RemoveComponent<ActorAction>(entity);

                int2 targetCoord = tile.GetCoord() + CommonUtils.DirectionToInt2(command.Direction);
                if (!grid.IsValidCoord(targetCoord))
                {
                    return;
                }

                Entity target = grid.GetUnit(cellBuffer, targetCoord);
                if (target != Entity.Null)
                {
                    // Attack
                    commandBuffer.AddComponent(entity, new AttackCommand(target));
                }
                else
                {
                    // Move
                    commandBuffer.AddComponent(entity, new GridMoveCommand(targetCoord));
                }
            }).Run();
        }
    }
}