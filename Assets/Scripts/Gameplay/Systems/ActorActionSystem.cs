using Timespawn.Core.Common;
using Timespawn.TinyRogue.Input;
using Timespawn.TinyRogue.Maps;
using Unity.Entities;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.Gameplay
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(PlayerInputSystem))]
    public class ActorActionSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            Entity mapEntity = World.GetOrCreateSystem<MapSystem>().GetMapEntity();
            Grid grid = EntityManager.GetComponentData<Grid>(mapEntity);
            DynamicBuffer<Cell> cellBuffer = EntityManager.GetBuffer<Cell>(mapEntity);

            EntityCommandBuffer commandBuffer = World.GetOrCreateSystem<EndInitializationEntityCommandBufferSystem>().CreateCommandBuffer();
            Entities.ForEach((Entity entity, in ActorCommand command, in Tile tile) =>
            {
                commandBuffer.RemoveComponent<ActorCommand>(entity);

                int2 targetCoord = tile.GetCoord() + CommonUtils.DirectionToInt2(command.Direction);
                if (!grid.IsValidCoord(targetCoord))
                {
                    return;
                }

                Entity target = grid.GetActor(cellBuffer, targetCoord);
                if (target != Entity.Null)
                {
                    // Attack
                    commandBuffer.AddComponent(entity, new AttackCommand(target));
                }
                else
                {
                    // Move
                    commandBuffer.AddComponent(entity, new GridMovementCommand(targetCoord));
                }
            }).Run();
        }
    }
}