using Unity.Entities;

namespace Timespawn.TinyRogue.Map
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