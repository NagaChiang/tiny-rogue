using Timespawn.TinyRogue.Assets;
using Timespawn.TinyRogue.Common;
using Timespawn.TinyRogue.UI;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace Timespawn.TinyRogue.Maps
{
    public class MapSystem : SystemBase
    {
        private Entity MapEntity;
        private EntityQuery MapCommandQuery;
        private EntityQuery MapQuery;

        private static void AddHealthBar(EntityCommandBuffer commandBuffer, Entity entity, Entity healthBarPrefab)
        {
            Entity healthBarEntity = commandBuffer.Instantiate(healthBarPrefab);
            commandBuffer.AddComponent(healthBarEntity, new Parent {Value = entity});
            commandBuffer.AddComponent(healthBarEntity, new LocalToParent {Value = float4x4.identity});
            commandBuffer.SetComponent(healthBarEntity, new Translation {Value = new float3(-0.5f, 0.5f, 0.0f)});

            commandBuffer.AddComponent(entity, new HealthBarLink(healthBarEntity));
            commandBuffer.AppendToBuffer(entity, new LinkedEntityGroup {Value = entity});
            commandBuffer.AppendToBuffer(entity, new LinkedEntityGroup {Value = healthBarEntity});
        }

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
            if (MapCommandQuery.IsEmptyIgnoreFilter)
            {
                return;
            }

            AssetLoader assetLoader = World.GetOrCreateSystem<AssetSystem>().GetAssetLoader();
            NativeArray<Random> randomArray = World.GetOrCreateSystem<RandomSystem>().GetRandomArray();

            EndSimulationEntityCommandBufferSystem endInitECBSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
            EntityCommandBuffer commandBuffer = endInitECBSystem.CreateCommandBuffer();
            Entities
                .WithStoreEntityQueryInField(ref MapCommandQuery)
                .ForEach((Entity entity, in Translation translation, in MapGenerateCommand command) =>
                {
                    Random random = randomArray[0];

                    commandBuffer.AddComponent(entity, new Map());

                    Grid grid = new Grid(command);
                    commandBuffer.AddComponent(entity, grid);

                    DynamicBuffer<Cell> cellBuffer = commandBuffer.AddBuffer<Cell>(entity);
                    for (int y = 0; y < command.Height; y++)
                    {
                        for (int x = 0; x < command.Width; x++)
                        {
                            Entity groundEntity = grid.Instantiate(commandBuffer, assetLoader.Terrain, translation.Value, x, y);
                            Cell cell = new Cell(groundEntity, Entity.Null);
                            cellBuffer.Add(cell);
                        }
                    }

                    // TODO: Units for debugging for now
                    int2 playerCoord = random.NextInt2(new int2(grid.Width, grid.Height));
                    Entity playerUnit = grid.Instantiate(commandBuffer, assetLoader.Player, translation.Value, playerCoord);
                    AddHealthBar(commandBuffer, playerUnit, assetLoader.HealthBar);
                    grid.SetUnit(cellBuffer, playerCoord, playerUnit);

                    const int mobCount = 10;
                    for (int i = 0; i < mobCount; i++)
                    {
                        int2 mobCoord = int2.zero;
                        do
                        {
                            mobCoord = random.NextInt2(new int2(grid.Width, grid.Height));
                        } while (grid.HasUnit(cellBuffer, mobCoord));

                        Entity mobUnit = grid.Instantiate(commandBuffer, assetLoader.Mob, translation.Value, mobCoord);
                        AddHealthBar(commandBuffer, mobUnit, assetLoader.HealthBar);
                        grid.SetUnit(cellBuffer, mobCoord, mobUnit);
                    }

                    commandBuffer.RemoveComponent<MapGenerateCommand>(entity);

                    randomArray[0] = random;
                }).Run();
        }
    }
}