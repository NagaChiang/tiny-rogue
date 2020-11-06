using Timespawn.Core.Common;
using Timespawn.TinyRogue.Gameplay;
using Unity.Collections;
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
            if (inputSystem.GetKeyDown(KeyCode.UpArrow))
            {
                direction = Direction2D.Up;
            }
            else if (inputSystem.GetKeyDown(KeyCode.DownArrow))
            {
                direction = Direction2D.Down;
            }
            else if (inputSystem.GetKeyDown(KeyCode.LeftArrow))
            {
                direction = Direction2D.Left;
            }
            else if (inputSystem.GetKeyDown(KeyCode.RightArrow))
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
            
            EntityCommandBuffer commandBuffer = new EntityCommandBuffer(Allocator.Temp);
            Entities
                .WithAll<Player, TurnToken>()
                .ForEach((Entity entity) =>
                {
                    commandBuffer.RemoveComponent<TurnToken>(entity);
                    commandBuffer.AddComponent(entity, new ActorAction(direction));
                }).Run();

            commandBuffer.Playback(EntityManager);
            commandBuffer.Dispose();
        }
    }
}