using Timespawn.Core.DOTS;
using Timespawn.TinyRogue.Assets;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace Timespawn.TinyRogue.Map
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
                        float3 cellPos = map.GetCellCenter(translation.Value, x, y);
                        Entity terrainEntity = parallelWriter.Instantiate(entityInQueryIndex, assetLoader.Terrain);
                        parallelWriter.AddComponent(entityInQueryIndex, terrainEntity, new Tile(x, y));
                        parallelWriter.SetComponent(entityInQueryIndex, terrainEntity, new Translation {Value = cellPos});

                        Cell cell = new Cell(terrainEntity, Entity.Null);
                        cellBuffer.Add(cell);
                    }
                }

                parallelWriter.RemoveComponent<MapGenerationCommand>(entityInQueryIndex, entity);
            }).ScheduleParallel();

            DotsUtils.GetSystemFromDefaultWorld<EndSimulationEntityCommandBufferSystem>().AddJobHandleForProducer(Dependency);
        }
    }
}