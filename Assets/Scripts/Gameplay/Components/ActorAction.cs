using Timespawn.Core.Common;
using Unity.Entities;

namespace Timespawn.TinyRogue.Gameplay
{
    public struct ActorAction : IComponentData
    {
        public Direction2D Direction;

        public ActorAction(Direction2D direction)
        {
            Direction = direction;
        }
    }
}