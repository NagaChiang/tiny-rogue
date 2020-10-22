using Unity.Entities;

namespace Timespawn.TinyRogue.Assets
{
    [GenerateAuthoringComponent]
    public struct AssetLoader : IComponentData
    {
        public Entity Terrain;
    }
}