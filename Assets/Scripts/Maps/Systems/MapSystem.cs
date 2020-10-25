using Timespawn.Core.DOTS;
using Timespawn.TinyRogue.Assets;
using Unity.Entities;
using Unity.Transforms;

namespace Timespawn.TinyRogue.Maps
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public class MapSystem : SystemBase
    {
        private Entity MapEntity;
        private EntityQuery MapQuery;

        public Entity GetMapEntity()
        {
            if (MapEntity == Entity.Null)
            {
                MapEntity = MapQuery.GetSingletonEntity();
            }

            return MapEntity;
        }

        protected override void OnCreate()
        {
            MapQuery = GetEntityQuery(ComponentType.ReadOnly<Map>());
        }

        protected override void OnUpdate()
        {
            AssetLoader assetLoader = World.GetOrCreateSystem<AssetSystem>().GetAssetLoader();
            EntityCommandBuffer.ParallelWriter parallelWriter = DotsUtils.CreateParallelWriter<EndInitializationEntityCommandBufferSystem>();
            Entities.ForEach((Entity entity, int entityInQueryIndex, in Translation translation, in MapGenerationCommand command) =>
            {
                parallelWriter.AddComponent(entityInQueryIndex, entity, new Map());

                Grid grid = new Grid(command);
                parallelWriter.AddComponent(entityInQueryIndex, entity, grid);

                DynamicBuffer<Cell> cellBuffer = parallelWriter.AddBuffer<Cell>(entityInQueryIndex, entity);
                for (ushort y = 0; y < command.Height; y++)
                {
                    for (ushort x = 0; x < command.Width; x++)
                    {
                        Entity terrainEntity = GridUtils.Instantiate(parallelWriter, entityInQueryIndex, assetLoader.Terrain, grid, translation.Value, x, y);

                        Entity actorEntity = Entity.Null;
                        if (x == 2 && y == 2)
                        {
                            actorEntity = GridUtils.Instantiate(parallelWriter, entityInQueryIndex, assetLoader.Player, grid, translation.Value, x, y);
                        }

                        Cell cell = new Cell(terrainEntity, actorEntity);
                        cellBuffer.Add(cell);
                    }
                }

                parallelWriter.RemoveComponent<MapGenerationCommand>(entityInQueryIndex, entity);
            }).ScheduleParallel();

            DotsUtils.GetSystemFromDefaultWorld<EndInitializationEntityCommandBufferSystem>().AddJobHandleForProducer(Dependency);
        }
    }
}