using Timespawn.Core.DOTS;
using Timespawn.TinyRogue.Assets;
using Unity.Entities;
using Unity.Transforms;

namespace Timespawn.TinyRogue.Maps
{
    public class MapGenerationSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            AssetLoader assetLoader = AssetSystem.GetAssetLoader(EntityManager);

            EntityCommandBuffer.ParallelWriter parallelWriter = DotsUtils.CreateParallelWriter<EndSimulationEntityCommandBufferSystem>();
            Entities.ForEach((Entity entity, int entityInQueryIndex, in Translation translation, in MapGenerationCommand command) =>
            {
                Map map = new Map(command);
                parallelWriter.AddComponent(entityInQueryIndex, entity, map);
                DynamicBuffer<Cell> cellBuffer = parallelWriter.AddBuffer<Cell>(entityInQueryIndex, entity);
                for (ushort y = 0; y < command.Height; y++)
                {
                    for (ushort x = 0; x < command.Width; x++)
                    {
                        Entity terrainEntity = MapUtils.Instantiate(parallelWriter, entityInQueryIndex, assetLoader.Terrain, map, translation.Value, x, y);

                        Entity actorEntity = Entity.Null;
                        if (x == 2 && y == 2)
                        {
                            actorEntity = MapUtils.Instantiate(parallelWriter, entityInQueryIndex, assetLoader.Player, map, translation.Value, x, y);
                        }

                        Cell cell = new Cell(terrainEntity, actorEntity);
                        cellBuffer.Add(cell);
                    }
                }

                parallelWriter.RemoveComponent<MapGenerationCommand>(entityInQueryIndex, entity);
            }).ScheduleParallel();

            DotsUtils.GetSystemFromDefaultWorld<EndSimulationEntityCommandBufferSystem>().AddJobHandleForProducer(Dependency);
        }
    }
}