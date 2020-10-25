using Timespawn.Core.Common;
using Unity.Entities;

namespace Timespawn.TinyRogue.Gameplay
{
    public struct ActorCommand : IComponentData
    {
        public Direction2D Direction;

        public ActorCommand(Direction2D direction)
        {
            Direction = direction;
        }
    }
}