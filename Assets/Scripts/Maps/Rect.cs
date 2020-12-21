using Unity.Collections;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.Maps
{
    public struct Rect
    {
        public enum OperationMode
        {
            BoundaryIncluded,
            BoundaryExcluded,
            BoundaryOnly,
        }

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

        public NativeArray<int2> GetPositions(Allocator allocator, OperationMode mode = OperationMode.BoundaryIncluded)
        {
            NativeList<int2> posList = new NativeList<int2>(Allocator.Temp);
            for (int y = 0; y < Height; y++)
            {
                for (int x = 0; x < Width; x++)
                {
                    if (!ShouldOperate(x, y, mode))
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

        public int2 GetRandomPosition(ref Random random, OperationMode mode = OperationMode.BoundaryIncluded)
        {
            NativeArray<int2> positions = GetPositions(Allocator.Temp, mode);
            int2 randomPos = positions[random.NextInt(positions.Length)];

            positions.Dispose();

            return randomPos;
        }

        public bool IsOnBoundary(int x, int y)
        {
            return x == 0 || x == Width - 1 || y == 0 || y == Height - 1;
        }

        public bool ShouldOperate(int x, int y, OperationMode mode)
        {
            if (IsOnBoundary(x, y))
            {
                if (mode == Rect.OperationMode.BoundaryExcluded)
                {
                    return false;
                }
            }
            else
            {
                if (mode == Rect.OperationMode.BoundaryOnly)
                {
                    return false;
                }
            }

            return true;
        }

        public bool IsValid()
        {
            return Width > 0 && Height > 0;
        }
    }
}