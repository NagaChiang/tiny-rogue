using Timespawn.Core.Extensions;
using Unity.Entities;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.Map
{
    public struct Map : IComponentData
    {
        private static readonly float2 CellSize = new float2(1.0f);

        public ushort Width;
        public ushort Height;

        public Map(MapGenerationCommand command)
        {
            Width = command.Width;
            Height = command.Height;
        }

        public float3 GetCellCenter(float3 mapPosition, int2 coord)
        {
            return GetCellCenter(mapPosition, coord.x, coord.y);
        }

        public float3 GetCellCenter(float3 mapPosition, int x, int y)
        {
            if (!IsValidCoord(x, y))
            {
                return default;
            }

            return mapPosition - GetLocalCenter().ToFloat3() + GetLocalCellCenter(x, y).ToFloat3();
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