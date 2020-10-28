﻿using Timespawn.Core.Extensions;
using Unity.Entities;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.Maps
{
    public struct Grid : IComponentData
    {
        private static readonly float2 CellSize = new float2(1.0f);

        public ushort Width;
        public ushort Height;

        public Grid(MapGenerationCommand command)
        {
            Width = command.Width;
            Height = command.Height;
        }

        public Entity GetActor(DynamicBuffer<Cell> cellBuffer, int2 coord)
        {
            return GetActor(cellBuffer, coord.x, coord.y);
        }

        public Entity GetActor(DynamicBuffer<Cell> cellBuffer, int x, int y)
        {
            if (!IsValidCoord(x, y))
            {
                return Entity.Null;
            }

            return cellBuffer[GetIndex(x, y)].Actor;
        }

        public void SetActor(DynamicBuffer<Cell> cellBuffer, int2 coord, Entity actor)
        {
            SetActor(cellBuffer, coord.x, coord.y, actor);
        }

        public void SetActor(DynamicBuffer<Cell> cellBuffer, int x, int y, Entity actor)
        {
            if (!IsValidCoord(x, y))
            {
                return;
            }

            Cell cell = cellBuffer[GetIndex(x, y)];
            cellBuffer[GetIndex(x, y)] = new Cell(cell.Terrain, actor);
        }

        public bool HasActor(DynamicBuffer<Cell> cellBuffer, int2 coord)
        {
            return GetActor(cellBuffer, coord.x, coord.y) != Entity.Null;
        }

        public bool HasActor(DynamicBuffer<Cell> cellBuffer, int x, int y)
        {
            return GetActor(cellBuffer, x, y) != Entity.Null;
        }

        public int GetIndex(int x, int y)
        {
            return x + (y * Width);
        }

        public float3 GetCellCenter(float3 gridPosition, int2 coord)
        {
            return GetCellCenter(gridPosition, coord.x, coord.y);
        }

        public float3 GetCellCenter(float3 gridPosition, int x, int y)
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

        public bool IsValidCoord(int2 coord)
        {
            return IsValidCoord(coord.x, coord.y);
        }

        public bool IsValidCoord(int x, int y)
        {
            return x >= 0 && x < Width && y >= 0 && y < Height;
        }
    }
}