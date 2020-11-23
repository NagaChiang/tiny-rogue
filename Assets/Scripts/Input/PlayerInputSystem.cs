using Timespawn.TinyRogue.Common;
using Timespawn.TinyRogue.Gameplay;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Tiny.Input;

namespace Timespawn.TinyRogue.Input
{
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    [UpdateAfter(typeof(TurnSystem))]
    [UpdateBefore(typeof(ActorActionSystem))]
    public class PlayerInputSystem : SystemBase
    {
        private const float SwipeThreshold = 30.0f;
        private const float SwipeTimeLimit = 0.5f;

        private bool IsSwiping;
        private float SwipeTime;
        private int TouchingFingerId;
        private float2 SwipeStartPosition;
        private bool HasSwiped;
        private Direction SwipeDirection;

        protected override void OnUpdate()
        {
            UpdateSwipeInput();

            Direction direction;
            if (!TryGetKeyboardInput(out direction) && !TryGetTouchInput(out direction))
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

        private bool TryGetKeyboardInput(out Direction direction)
        {
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
                direction = default;
                return false;
            }

            return true;
        }

        private bool TryGetTouchInput(out Direction direction)
        {
            direction = SwipeDirection;
            return HasSwiped;
        }

        private void UpdateSwipeInput()
        {
            HasSwiped = false;
            if (IsSwiping)
            {
                SwipeTime += Time.DeltaTime;
                if (SwipeTime > SwipeTimeLimit)
                {
                    IsSwiping = false;
                }
            }

            InputSystem inputSystem = World.GetOrCreateSystem<InputSystem>();
            if (inputSystem.IsTouchSupported())
            {
                for (int i = 0; i < inputSystem.TouchCount(); i++)
                {
                    Touch touch = inputSystem.GetTouch(i);
                    if (!IsSwiping)
                    {
                        if (touch.phase == TouchState.Began)
                        {
                            StartSwipe(touch.fingerId, new float2(touch.x, touch.y));
                            return;
                        }
                    }
                    else
                    {
                        if (touch.fingerId == TouchingFingerId && touch.phase == TouchState.Ended)
                        {
                            EndSwipe(new float2(touch.x, touch.y));
                            return;
                        }
                    }
                }
            }
            else
            {
                if (!IsSwiping)
                {
                    if (inputSystem.GetMouseButtonDown(0))
                    {
                        StartSwipe(0, inputSystem.GetInputPosition());
                    }
                }
                else
                {
                    if (inputSystem.GetMouseButtonUp(0))
                    {
                        EndSwipe(inputSystem.GetInputPosition());
                    }
                }
            }
        }

        private void StartSwipe(int fingerId, float2 startPos)
        {
            IsSwiping = true;
            SwipeTime = 0.0f;
            TouchingFingerId = fingerId;
            SwipeStartPosition = startPos;
        }

        private void EndSwipe(float2 endPos)
        {
            IsSwiping = false;

            float2 delta = endPos - SwipeStartPosition;
            if (math.lengthsq(delta) > SwipeThreshold * SwipeThreshold)
            {
                HasSwiped = true;
                SwipeDirection = DeltaToDirection(delta);
            }
        }

        private Direction DeltaToDirection(float2 delta)
        {
            if (math.abs(delta.x) > math.abs(delta.y))
            {
                if (delta.x > 0)
                {
                    return Direction.Right;
                }
                else
                {
                    return Direction.Left;
                }
            }
            else
            {
                if (delta.y > 0)
                {
                    return Direction.Up;
                }
                else
                {
                    return Direction.Down;
                }
            }
        }
    }
}