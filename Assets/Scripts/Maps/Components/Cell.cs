using Unity.Entities;

namespace Timespawn.TinyRogue.Maps
{
    public struct Cell : IBufferElementData
    {
        public Entity Terrain;
        public Entity Actor;

        public Cell(Entity terrain, Entity actor)
        {
            Terrain = terrain;
            Actor = actor;
        }
    }
}