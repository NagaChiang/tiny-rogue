using Unity.Entities;

namespace Timespawn.TinyRogue.Gameplay
{
    [GenerateAuthoringComponent]
    public struct Health : IComponentData
    {
        public ushort Current;
        public ushort Max;

        public Health(ushort current, ushort max)
        {
            Current = current;
            Max = max;
        }
    }
}