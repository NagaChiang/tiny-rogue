using Unity.Entities;

namespace Timespawn.TinyRogue.Maps
{
    public struct Cell : IBufferElementData
    {
        public Entity Ground;
        public Entity Unit;

        public Cell(Entity ground, Entity unit)
        {
            Ground = ground;
            Unit = unit;
        }
    }
}