using Timespawn.Core.Common;
using Timespawn.Core.DOTS;
using Timespawn.TinyRogue.Input;
using Timespawn.TinyRogue.Maps;
using Unity.Entities;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.Gameplay
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(PlayerInputSystem))]
    public class ActorCommandSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            Entity mapEntity = World.GetOrCreateSystem<MapSystem>().GetMapEntity();
            Grid grid = EntityManager.GetComponentData<Grid>(mapEntity);
            DynamicBuffer<Cell> cellBuffer = EntityManager.GetBuffer<Cell>(mapEntity);

            EntityCommandBuffer commandBuffer = DotsUtils.CreateCommandBuffer<EndInitializationEntityCommandBufferSystem>();
            Entities.ForEach((Entity entity, in ActorCommand command, in Tile tile) =>
            {
                int2 targetCoord = tile.GetCoord() + CommonUtils.DirectionToInt2(command.Direction);
                if (!grid.HasActor(cellBuffer, targetCoord))
                {
                    commandBuffer.AddComponent(entity, new GridMovementCommand(targetCoord));
                }

                commandBuffer.RemoveComponent<ActorCommand>(entity);
            }).Run();
        }
    }
}