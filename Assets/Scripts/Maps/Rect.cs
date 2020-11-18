using Unity.Collections;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.Maps
{
    public struct Rect
    {
        public int2 LowerLeft;
        public int Width;
        public int Height;

        public Rect(int2 lowerLeft, int width, int height)
        {
            LowerLeft = lowerLeft;
            Width = width;
            Height = height;
        }

        public Rect(int x, int y, int width, int height)
        {
            LowerLeft = new int2(x, y);
            Width = width;
            Height = height;
        }

        public NativeArray<int2> GetPositions(Allocator allocator, bool isBoundaryExcluded = false)
        {
            NativeList<int2> posList = new NativeList<int2>(Allocator.Temp);
            for (int y = 0; y < Height; y++)
            {
                if (isBoundaryExcluded && (y == 0 || y == Height - 1))
                {
                    continue;
                }

                for (int x = 0; x < Width; x++)
                {
                    if (isBoundaryExcluded && (x == 0 || x == Width - 1))
                    {
                        continue;
                    }

                    posList.Add(LowerLeft + new int2(x, y));
                }
            }

            NativeArray<int2> positions = posList.ToArray(allocator);
            posList.Dispose();

            return positions;
        }

        public int2 GetRandomPosition(ref Random random, bool isBoundaryExcluded = false)
        {
            NativeArray<int2> positions = GetPositions(Allocator.Temp, isBoundaryExcluded);
            int2 randomPos = positions[random.NextInt(positions.Length)];

            positions.Dispose();

            return randomPos;
        }

        public bool IsValid()
        {
            return Width > 0 && Height > 0;
        }
    }
}