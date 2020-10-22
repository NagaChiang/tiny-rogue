using Unity.Entities;

namespace Timespawn.TinyRogue.Map
{
    [GenerateAuthoringComponent]
    public struct MapGenerationCommand : IComponentData
    {
        public ushort Width;
        public ushort Height;
    }
}