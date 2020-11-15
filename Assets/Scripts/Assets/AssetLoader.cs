using Unity.Entities;

namespace Timespawn.TinyRogue.Assets
{
    [GenerateAuthoringComponent]
    public struct AssetLoader : IComponentData
    {
        public Entity Ground;
        public Entity Wall;
        public Entity Player;
        public Entity Mob;
        public Entity HealthBar;
    }
}