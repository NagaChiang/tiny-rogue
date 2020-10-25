using Unity.Entities;

namespace Timespawn.TinyRogue.Maps
{
    public struct Cell : IBufferElementData
    {
        public Entity TerrainEntity;
        public Entity ActorEntity;

        public Cell(Entity terrainEntity, Entity actorEntity)
        {
            TerrainEntity = terrainEntity;
            ActorEntity = actorEntity;
        }
    }
}