using Timespawn.Core.Extensions;
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

        public Grid(MapGenerateCommand command)
        {
            Width = command.Width;
            Height = command.Height;
        }

        public Entity Instantiate(
            EntityCommandBuffer.ParallelWriter parallelWriter,
            int entityInQueryIndex,
            Entity prefab,
            float3 mapPos,
            ushort x,
            ushort y)
        {
            float3 cellPos = GetCellCenter(mapPos, x, y);
            Entity entity = parallelWriter.Instantiate(entityInQueryIndex, prefab);
            parallelWriter.AddComponent(entityInQueryIndex, entity, new Tile(x, y));
            parallelWriter.SetComponent(entityInQueryIndex, entity, new Translation {Value = cellPos});

            return entity;
        }

        public Entity GetUnit(DynamicBuffer<Cell> cellBuffer, int2 coord)
        {
            return GetUnit(cellBuffer, coord.x, coord.y);
        }

        public Entity GetUnit(DynamicBuffer<Cell> cellBuffer, int x, int y)
        {
            if (!IsValidCoord(x, y))
            {
                return Entity.Null;
            }

            return cellBuffer[GetIndex(x, y)].Unit;
        }

        public void SetUnit(DynamicBuffer<Cell> cellBuffer, int2 coord, Entity actor)
        {
            SetUnit(cellBuffer, coord.x, coord.y, actor);
        }

        public void SetUnit(DynamicBuffer<Cell> cellBuffer, int x, int y, Entity actor)
        {
            if (!IsValidCoord(x, y))
            {
                return;
            }

            Cell cell = cellBuffer[GetIndex(x, y)];
            cellBuffer[GetIndex(x, y)] = new Cell(cell.Ground, actor);
        }

        public bool HasUnit(DynamicBuffer<Cell> cellBuffer, int2 coord)
        {
            return GetUnit(cellBuffer, coord.x, coord.y) != Entity.Null;
        }

        public bool HasUnit(DynamicBuffer<Cell> cellBuffer, int x, int y)
        {
            return GetUnit(cellBuffer, x, y) != Entity.Null;
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