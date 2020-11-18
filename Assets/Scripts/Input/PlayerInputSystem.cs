using Timespawn.TinyRogue.Common;
using Timespawn.TinyRogue.Gameplay;
using Unity.Entities;
using Unity.Tiny.Input;

namespace Timespawn.TinyRogue.Input
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(TurnSystem))]
    [UpdateBefore(typeof(ActorActionSystem))]
    public class PlayerInputSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            bool hasInput = true;
            Direction direction = default;
            InputSystem inputSystem = World.GetOrCreateSystem<InputSystem>();
            if (inputSystem.GetKeyDown(KeyCode.UpArrow))
            {
                direction = Direction.Up;
            }
            else if (inputSystem.GetKeyDown(KeyCode.DownArrow))
            {
                direction = Direction.Down;
            }
            else if (inputSystem.GetKeyDown(KeyCode.LeftArrow))
            {
                direction = Direction.Left;
            }
            else if (inputSystem.GetKeyDown(KeyCode.RightArrow))
            {
                direction = Direction.Right;
            }
            else
            {
                hasInput = false;
            }

            if (!hasInput)
            {
                return;
            }

            EndInitializationEntityCommandBufferSystem endInitECBSystem = World.GetOrCreateSystem<EndInitializationEntityCommandBufferSystem>();
            EntityCommandBuffer commandBuffer = endInitECBSystem.CreateCommandBuffer();
            Entities
                .WithAll<Player, TurnToken>()
                .WithNone<ActorAction>()
                .ForEach((Entity entity) =>
                {
                    commandBuffer.AddComponent(entity, new ActorAction(direction));
                }).Schedule();

            endInitECBSystem.AddJobHandleForProducer(Dependency);
        }
    }
}