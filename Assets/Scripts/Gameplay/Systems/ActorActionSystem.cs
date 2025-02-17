﻿using Timespawn.TinyRogue.Common;
using Timespawn.TinyRogue.Maps;
using Unity.Collections;
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
            Grid grid = GetComponent<Grid>(mapEntity);
            DynamicBuffer<Cell> cellBuffer = GetBuffer<Cell>(mapEntity);
            ComponentDataFromEntity<Block> blockFromEntity = GetComponentDataFromEntity<Block>(true);

            EntityCommandBuffer commandBuffer = new EntityCommandBuffer(Allocator.TempJob);
            Entities
                .WithReadOnly(blockFromEntity)
                .WithAll<TurnToken>()
                .ForEach((Entity entity, in ActorAction action, in Tile tile) =>
                {
                    commandBuffer.RemoveComponent<ActorAction>(entity);

                    int2 targetCoord = tile.GetCoord() + CommonUtils.DirectionToInt2(action.Direction);
                    Entity target = grid.GetUnit(cellBuffer.AsNativeArray(), targetCoord);
                    if (target != Entity.Null)
                    {
                        // Attack
                        commandBuffer.AddComponent(entity, new AttackCommand(target));
                    }
                    else if (grid.IsWalkable(blockFromEntity, cellBuffer.AsNativeArray(), targetCoord))
                    {
                        // Move
                        commandBuffer.AddComponent(entity, new GridMoveCommand(targetCoord));
                    }
                    else
                    {
                        return;
                    }

                    commandBuffer.RemoveComponent<TurnToken>(entity);
                }).Schedule();

            Dependency.Complete();

            commandBuffer.Playback(EntityManager);
            commandBuffer.Dispose();
        }
    }
}