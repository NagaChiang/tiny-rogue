﻿using Timespawn.TinyRogue.Common;
using Timespawn.TinyRogue.Extensions;
using Timespawn.TinyRogue.Gameplay;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace Timespawn.TinyRogue.Maps
{
    public struct Grid : IComponentData
    {
        private static readonly float2 CellSize = new float2(1.0f);

        public ushort Width;
        public ushort Height;

        public Grid(ushort width, ushort height)
        {
            Width = width;
            Height = height;
        }

        public Entity Instantiate(
            EntityCommandBuffer commandBuffer,
            in Entity prefab,
            in float3 mapPos,
            in int2 coord)
        {
            return Instantiate(commandBuffer, prefab, mapPos, coord.x, coord.y);
        }

        public Entity Instantiate(
            EntityCommandBuffer commandBuffer,
            in Entity prefab,
            in float3 mapPos,
            int x,
            int y)
        {
            if (!IsValidCoord(x, y))
            {
                return default;
            }

            float3 cellPos = GetCellCenter(mapPos, x, y);
            Entity entity = commandBuffer.Instantiate(prefab);
            commandBuffer.AddComponent(entity, new Tile(x, y));
            commandBuffer.SetComponent(entity, new Translation {Value = cellPos});

            return entity;
        }

        public Entity Instantiate(
            EntityCommandBuffer.ParallelWriter parallelWriter,
            int entityInQueryIndex,
            in Entity prefab,
            in float3 mapPos,
            in int2 coord)
        {
            return Instantiate(parallelWriter, entityInQueryIndex, prefab, mapPos, coord.x, coord.y);
        }

        public Entity Instantiate(
            EntityCommandBuffer.ParallelWriter parallelWriter,
            int entityInQueryIndex,
            in Entity prefab,
            in float3 mapPos,
            int x,
            int y)
        {
            if (!IsValidCoord(x, y))
            {
                return default;
            }

            float3 cellPos = GetCellCenter(mapPos, x, y);
            Entity entity = parallelWriter.Instantiate(entityInQueryIndex, prefab);
            parallelWriter.AddComponent(entityInQueryIndex, entity, new Tile(x, y));
            parallelWriter.SetComponent(entityInQueryIndex, entity, new Translation {Value = cellPos});

            return entity;
        }

        public Entity GetUnit(in NativeArray<Cell> cells, in int2 coord)
        {
            return GetUnit(cells, coord.x, coord.y);
        }

        public Entity GetUnit(in NativeArray<Cell> cells, int x, int y)
        {
            if (!IsValidCoord(x, y))
            {
                return Entity.Null;
            }

            return cells[GetIndex(x, y)].Unit;
        }

        public void SetUnit(DynamicBuffer<Cell> cellBuffer, in int2 coord, in Entity unit)
        {
            SetUnit(cellBuffer, coord.x, coord.y, unit);
        }

        public void SetUnit(DynamicBuffer<Cell> cellBuffer, int x, int y, in Entity unit)
        {
            if (!IsValidCoord(x, y))
            {
                return;
            }

            Cell cell = cellBuffer[GetIndex(x, y)];
            cellBuffer[GetIndex(x, y)] = new Cell(cell.Terrain, unit);
        }

        public bool HasUnit(in NativeArray<Cell> cells, int2 coord)
        {
            return GetUnit(cells, coord.x, coord.y) != Entity.Null;
        }

        public bool HasUnit(in NativeArray<Cell> cells, int x, int y)
        {
            return GetUnit(cells, x, y) != Entity.Null;
        }

        public Entity GetTerrain(in NativeArray<Cell> cells, in int2 coord)
        {
            return GetTerrain(cells, coord.x, coord.y);
        }

        public Entity GetTerrain(in NativeArray<Cell> cells, int x, int y)
        {
            if (!IsValidCoord(x, y))
            {
                return Entity.Null;
            }

            return cells[GetIndex(x, y)].Terrain;
        }

        public int GetIndex(int2 coord)
        {
            return GetIndex(coord.x, coord.y);
        }

        public int GetIndex(int x, int y)
        {
            return x + (y * Width);
        }

        public float3 GetCellCenter(in float3 gridPosition, in int2 coord)
        {
            return GetCellCenter(gridPosition, coord.x, coord.y);
        }

        public float3 GetCellCenter(in float3 gridPosition, int x, int y)
        {
            if (!IsValidCoord(x, y))
            {
                return default;
            }

            return gridPosition - GetLocalCenter().ToFloat3() + GetLocalCellCenter(x, y).ToFloat3();
        }

        public float2 GetLocalCellCenter(int x, int y)
        {
            if (!IsValidCoord(x, y))
            {
                return default;
            }

            float2 center = new float2
            {
                x = CellSize.x * (x + 0.5f),
                y = CellSize.y * (y + 0.5f)
            };

            return center;
        }

        public float2 GetLocalCenter()
        {
            float2 center = new float2
            {
                x = CellSize.x * Width * 0.5f,
                y = CellSize.y * Height * 0.5f
            };
            
            return center;
        }

        public bool IsValidCoord(in int2 coord)
        {
            return IsValidCoord(coord.x, coord.y);
        }

        public bool IsValidCoord(int x, int y)
        {
            return x >= 0 && x < Width && y >= 0 && y < Height;
        }

        public bool IsWalkable(in ComponentDataFromEntity<Block> blockFromEntity, in NativeArray<Cell> cells, in int2 coord)
        {
            return IsWalkable(blockFromEntity, cells, coord.x, coord.y);
        }

        public bool IsWalkable(in ComponentDataFromEntity<Block> blockFromEntity, in NativeArray<Cell> cells, int x, int y)
        {
            if (!IsValidCoord(x, y))
            {
                return false;
            }

            Entity terrain = GetTerrain(cells, x, y);
            if (terrain == Entity.Null)
            {
                return false;
            }

            return !blockFromEntity.HasComponent(terrain);
        }

        public int2 GetRandomWalkableCoord(in ComponentDataFromEntity<Block> blockFromEntity, in NativeArray<Cell> cellBuffer, ref Random random)
        {
            NativeList<int2> coords = new NativeList<int2>(Allocator.Temp);
            for (int y = 0; y < Height; y++)
            {
                for (int x = 0; x < Width; x++)
                {
                    if (HasUnit(cellBuffer, x, y))
                    {
                        continue;
                    }

                    if (!IsWalkable(blockFromEntity, cellBuffer, x, y))
                    {
                        continue;
                    }

                    coords.Add(new int2(x, y));
                }
            }

            int2 coord = coords[random.NextInt(coords.Length)];
            coords.Dispose();

            return coord;
        }

        public NativeArray<Direction> GetWalkableDirections(in ComponentDataFromEntity<Block> blockFromEntity, in NativeArray<Cell> cells, in int2 coord, in Allocator allocator)
        {
            return GetWalkableDirections(blockFromEntity, cells, coord.x, coord.y, allocator);
        }

        public NativeArray<Direction> GetWalkableDirections(in ComponentDataFromEntity<Block> blockFromEntity, in NativeArray<Cell> cells, in int x, in int y, in Allocator allocator)
        {
            NativeList<Direction> directionList = new NativeList<Direction>(allocator);
            for (int i = (int) Direction.Up; i <= (int) Direction.Right; i++)
            {
                if (IsWalkable(blockFromEntity, cells, x, y))
                {
                    directionList.Add((Direction) i);
                }
            }

            NativeArray<Direction> walkableDirections = directionList.ToArray(allocator);
            directionList.Dispose();

            return walkableDirections;
        }
    }
}