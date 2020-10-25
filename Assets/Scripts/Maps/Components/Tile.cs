﻿using Unity.Entities;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.Maps
{
    [GenerateAuthoringComponent]
    public struct Tile : IComponentData
    {
        public ushort x;
        public ushort y;

        public Tile(ushort x, ushort y)
        {
            this.x = x;
            this.y = y;
        }

        public Tile(int2 coord)
        {
            x = (ushort) coord.x;
            y = (ushort) coord.y;
        }

        public int2 GetCoord()
        {
            return new int2(x, y);
        }
    }
}