using Unity.Entities;

namespace Timespawn.TinyRogue.Maps
{
    [GenerateAuthoringComponent]
    public struct MapGenerationCommand : IComponentData
    {
        public ushort Width;
        public ushort Height;
    }
}