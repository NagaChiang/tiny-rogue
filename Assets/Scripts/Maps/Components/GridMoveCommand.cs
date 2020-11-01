using Unity.Entities;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.Maps
{
    public struct GridMoveCommand : IComponentData
    {
        public ushort x;
        public ushort y;

        public GridMoveCommand(ushort x, ushort y)
        {
            this.x = x;
            this.y = y;
        }

        public GridMoveCommand(int2 coord)
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