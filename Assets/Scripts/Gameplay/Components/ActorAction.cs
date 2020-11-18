using Timespawn.TinyRogue.Common;
using Unity.Entities;

namespace Timespawn.TinyRogue.Gameplay
{
    public struct ActorAction : IComponentData
    {
        public Direction Direction;

        public ActorAction(Direction direction)
        {
            Direction = direction;
        }
    }
}