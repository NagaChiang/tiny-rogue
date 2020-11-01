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

            EndInitializationEntityCommandBufferSystem endInitECBSystem = World.GetOrCreateSystem<EndInitializationEntityCommandBufferSystem>();
            EntityCommandBuffer.ParallelWriter parallelWriter = endInitECBSystem.CreateCommandBuffer().AsParallelWriter();
            Entities.ForEach((Entity entity, int entityInQueryIndex, in Translation translation, in MapGenerateCommand command) =>
            {
                parallelWriter.AddComponent(entityInQueryIndex, entity, new Map());

                Grid grid = new Grid(command);
                parallelWriter.AddComponent(entityInQueryIndex, entity, grid);

                DynamicBuffer<Cell> cellBuffer = parallelWriter.AddBuffer<Cell>(entityInQueryIndex, entity);
                for (ushort y = 0; y < command.Height; y++)
                {
                    for (ushort x = 0; x < command.Width; x++)
                    {
                        Entity groundEntity = grid.Instantiate(parallelWriter, entityInQueryIndex, assetLoader.Terrain, translation.Value, x, y);

                        Entity actorEntity = Entity.Null;
                        if (x == 2 && y == 2)
                        {
                            actorEntity = grid.Instantiate(parallelWriter, entityInQueryIndex, assetLoader.Player, translation.Value, x, y);
                        }
                        else if (x == 3 && y == 3)
                        {
                            actorEntity = grid.Instantiate(parallelWriter, entityInQueryIndex, assetLoader.Mob, translation.Value, x, y);
                        }

                        Cell cell = new Cell(groundEntity, actorEntity);
                        cellBuffer.Add(cell);
                    }
                }

                parallelWriter.RemoveComponent<MapGenerateCommand>(entityInQueryIndex, entity);
            }).ScheduleParallel();

            endInitECBSystem.AddJobHandleForProducer(Dependency);
        }
    }
}