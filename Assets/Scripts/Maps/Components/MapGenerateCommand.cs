using Unity.Entities;

namespace Timespawn.TinyRogue.Maps
{
    [GenerateAuthoringComponent]
    public struct MapGenerateCommand : IComponentData
    {
        public ushort Width;
        public ushort Height;
    }
}