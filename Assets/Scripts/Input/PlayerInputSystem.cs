using Timespawn.Core.Common;
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
            Direction2D direction = default;
            InputSystem inputSystem = World.GetOrCreateSystem<InputSystem>();
            if (inputSystem.GetKey(KeyCode.UpArrow))
            {
                direction = Direction2D.Up;
            }
            else if (inputSystem.GetKey(KeyCode.DownArrow))
            {
                direction = Direction2D.Down;
            }
            else if (inputSystem.GetKey(KeyCode.LeftArrow))
            {
                direction = Direction2D.Left;
            }
            else if (inputSystem.GetKey(KeyCode.RightArrow))
            {
                direction = Direction2D.Right;
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