using Timespawn.TinyRogue.Common;
using Timespawn.TinyRogue.Gameplay;
using Timespawn.TinyRogue.Maps;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.AI
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(TurnSystem))]
    [UpdateBefore(typeof(ActorActionSystem))]
    public class MobAISystem : SystemBase
    {
        protected override void OnUpdate()
        {
            Entity mapEntity = World.GetOrCreateSystem<MapSystem>().GetMapEntity();
            Grid grid = GetComponent<Grid>(mapEntity);
            DynamicBuffer<Cell> cellBuffer = GetBuffer<Cell>(mapEntity);
            NativeArray<Random> randomArray = World.GetOrCreateSystem<RandomSystem>().GetRandomArray();

            EntityCommandBuffer commandBuffer = new EntityCommandBuffer(Allocator.TempJob);
            Entities
                .WithAll<TurnToken, Mob>()
                .WithNone<ActorAction>()
                .ForEach((Entity entity, in Tile tile) =>
                {
                    Random random = randomArray[0];
                    ComponentDataFromEntity<Block> blockFromEntity = GetComponentDataFromEntity<Block>(true);

                    NativeArray<Direction> walkableDirections = grid.GetWalkableDirections(blockFromEntity, cellBuffer, tile.x, tile.y, Allocator.Temp);
                    if (walkableDirections.Length > 0)
                    {
                        Direction direction = walkableDirections[random.NextInt(walkableDirections.Length)];
                        commandBuffer.AddComponent(entity, new ActorAction(direction));
                    }
                    else
                    {
                        commandBuffer.RemoveComponent<TurnToken>(entity);
                    }

                    walkableDirections.Dispose();
                    randomArray[0] = random;
                }).Schedule();

            Dependency.Complete();

            commandBuffer.Playback(EntityManager);
            commandBuffer.Dispose();
        }
    }
}