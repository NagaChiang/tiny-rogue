using Unity.Entities;

namespace Timespawn.TinyRogue.Gameplay
{
    [GenerateAuthoringComponent]
    public struct Attack : IComponentData
    {
        public ushort Value;
    }
}