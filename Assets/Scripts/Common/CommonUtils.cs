using Unity.Mathematics;

namespace Timespawn.TinyRogue.Common
{
    public static class CommonUtils
    {
        public static int2 DirectionToInt2(Direction direction)
        {
            switch (direction)
            {
                case Direction.Up:
                    return new int2(0, 1);
                case Direction.Down:
                    return new int2(0, -1);
                case Direction.Left:
                    return new int2(-1, 0);
                case Direction.Right:
                    return new int2(1, 0);
            }

            return int2.zero;
        }

        public static bool HasFlags(GridMask source, GridMask flags)
        {
            int sourceInt = (int) source;
            int flagsInt = (int) flags;

            return (sourceInt & flagsInt) == flagsInt;
        }
    }
}