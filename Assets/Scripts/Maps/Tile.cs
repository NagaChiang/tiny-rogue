using Unity.Entities;

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
    }
}