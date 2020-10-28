using Unity.Entities;

namespace Timespawn.TinyRogue.Gameplay
{
    public struct AttackCommand : IComponentData
    {
        public Entity Target;

        public AttackCommand(Entity target)
        {
            Target = target;
        }
    }
}