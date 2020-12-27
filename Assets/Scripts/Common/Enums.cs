using System;

namespace Timespawn.TinyRogue.Common
{
    public enum Direction
    {
        Up,
        Down,
        Left,
        Right,
    }

    [Flags]
    public enum GridMask
    {
        North = 1 << 0,
        West = 1 << 1,
        Center = 1 << 2,
        East = 1 << 3,
        South = 1 << 4,
        NorthWest = 1 << 5,
        NorthEast = 1 << 6,
        SouthWest = 1 << 7,
        SouthEast = 1 << 8,
    }
}