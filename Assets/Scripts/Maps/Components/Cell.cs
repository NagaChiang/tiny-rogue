using Unity.Entities;

namespace Timespawn.TinyRogue.Maps
{
    public struct Cell : IBufferElementData
    {
        public Entity Terrain;
        public Entity Unit;

        public Cell(Entity terrain, Entity unit)
        {
            Terrain = terrain;
            Unit = unit;
        }
    }
}