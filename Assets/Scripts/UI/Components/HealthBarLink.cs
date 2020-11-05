using Unity.Entities;

namespace Timespawn.TinyRogue.UI
{
    public struct HealthBarLink : IComponentData
    {
        public Entity Value;

        public HealthBarLink(Entity value)
        {
            Value = value;
        }
    }
}