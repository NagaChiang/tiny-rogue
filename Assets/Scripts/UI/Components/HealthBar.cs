using Unity.Entities;

namespace Timespawn.TinyRogue.UI
{
    [GenerateAuthoringComponent]
    public struct HealthBar : IComponentData
    {
        public Entity BarEntity;
    }
}