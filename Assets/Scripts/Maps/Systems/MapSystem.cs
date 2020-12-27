using System;
using Timespawn.TinyRogue.Assets;
using Timespawn.TinyRogue.Common;
using Timespawn.TinyRogue.Gameplay;
using Timespawn.TinyRogue.UI;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using Random = Unity.Mathematics.Random;

namespace Timespawn.TinyRogue.Maps
{
    public class MapSystem : SystemBase
    {
        private Entity MapEntity;
        private EntityQuery MapQuery;
        private EntityQuery PlayerQuery;

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
            PlayerQuery = GetEntityQuery(ComponentType.ReadOnly<Player>());
        }

        protected override void OnUpdate()
        {
            AssetLoader assetLoader = World.GetOrCreateSystem<AssetSystem>().GetAssetLoader();
            NativeArray<Random> randomArray = World.GetOrCreateSystem<RandomSystem>().GetRandomArray();

            EndSimulationEntityCommandBufferSystem endInitECBSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
            EntityCommandBuffer commandBuffer = endInitECBSystem.CreateCommandBuffer();

            Entities.ForEach((Entity entity, in Translation translation, in MapGenerateCommand command) =>
            {
                Random random = randomArray[0];

                commandBuffer.RemoveComponent<MapGenerateCommand>(entity);
                commandBuffer.AddComponent(entity, new Map());

                Grid grid = new Grid(command.MapSetting.Width, command.MapSetting.Height);
                commandBuffer.AddComponent(entity, grid);

                MapGenerator generator = new MapGenerator(command.MapSetting, grid, assetLoader, ref random);
                DynamicBuffer<Cell> cellBuffer = commandBuffer.AddBuffer<Cell>(entity);
                for (int y = 0; y < command.MapSetting.Height; y++)
                {
                    for (int x = 0; x < command.MapSetting.Width; x++)
                    {
                        Entity prefab = generator.GetPrefab(x, y);
                        Entity terrainEntity = Entity.Null;
                        if (prefab != Entity.Null)
                        {
                            terrainEntity = grid.Instantiate(commandBuffer, prefab, translation.Value, x, y);
                        }

                        Cell cell = new Cell(terrainEntity, Entity.Null);
                        cellBuffer.Add(cell);
                    }
                }

                generator.Dispose();

                randomArray[0] = random;
            }).Schedule();

            // TODO: Generate units for debugging for now
            if (PlayerQuery.IsEmptyIgnoreFilter)
            {
                ComponentDataFromEntity<Block> blockFromEntity = GetComponentDataFromEntity<Block>(true);
                Entities
                    .WithReadOnly(blockFromEntity)
                    .ForEach((Entity entity, in DynamicBuffer<Cell> cellBuffer, in Translation translation, in Grid grid) =>
                    {
                        Random random = randomArray[0];

                        NativeArray<Cell> cells = cellBuffer.ToNativeArray(Allocator.Temp);

                        int2 playerCoord = grid.GetRandomWalkableCoord(blockFromEntity, cells, ref random);
                        Entity playerUnit = grid.Instantiate(commandBuffer, assetLoader.Player, translation.Value, playerCoord);
                        AddHealthBar(commandBuffer, playerUnit, assetLoader.HealthBar);
                        SetCellUnit(ref cells, grid, playerCoord, playerUnit);

                        const int mobCount = 10;
                        for (int i = 0; i < mobCount; i++)
                        {
                            int2 mobCoord = grid.GetRandomWalkableCoord(blockFromEntity, cells, ref random);
                            Entity mobUnit = grid.Instantiate(commandBuffer, assetLoader.Mob, translation.Value, mobCoord);
                            AddHealthBar(commandBuffer, mobUnit, assetLoader.HealthBar);
                            SetCellUnit(ref cells, grid, mobCoord, mobUnit);
                        }

                        commandBuffer.SetBuffer<Cell>(entity);
                        for (int i = 0; i < cells.Length; i++)
                        {
                            commandBuffer.AppendToBuffer(entity, cells[i]);
                        }

                        randomArray[0] = random;
                    }).Schedule();
            }

            endInitECBSystem.AddJobHandleForProducer(Dependency);
        }

        private static void SetCellUnit(ref NativeArray<Cell> cells, in Grid grid, int2 coord, Entity unitEntity)
        {
            int index = grid.GetIndex(coord);
            Cell cell = cells[index];
            cells[index] = new Cell(cell.Terrain, unitEntity);
        }
    }
}