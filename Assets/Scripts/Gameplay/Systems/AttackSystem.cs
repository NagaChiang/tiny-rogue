using Timespawn.Core.Extensions;
using Timespawn.EntityTween.Math;
using Timespawn.EntityTween.Tweens;
using Timespawn.TinyRogue.Maps;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace Timespawn.TinyRogue.Gameplay
{
    public class AttackSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            EndSimulationEntityCommandBufferSystem endSimECBSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
            EntityCommandBuffer commandBuffer = endSimECBSystem.CreateCommandBuffer();
            Entities.ForEach((Entity entity, ref Actor actor, in AttackCommand command, in Attack attack, in Tile tile, in Translation translation) =>
            {
                commandBuffer.RemoveComponent<AttackCommand>(entity);

                Entity target = command.Target;
                if (!HasComponent<Health>(target))
                {
                    return;
                }

                actor.NextActionTime = 20; // TODO: Data

                Health targetHealth = GetComponent<Health>(target);
                int newHealth = targetHealth.Current - attack.Value;
                newHealth = math.clamp(newHealth, 0, targetHealth.Max);
                commandBuffer.SetComponent(target, new Health((ushort) newHealth, targetHealth.Max));

                if (HasComponent<Tile>(target))
                {
                    Tile targetTile = GetComponent<Tile>(target);
                    float2 direction = math.normalize(new float2(targetTile.x, targetTile.y) - new float2(tile.x, tile.y));

                    float3 start = translation.Value;
                    float3 end = start + (direction.ToFloat3() * 0.5f);
                    Tween.Move(commandBuffer, entity, start, end, 0.05f, new EaseDesc(EaseType.SmoothStep, 2), true); // TODO: Data
                }
            }).Schedule();

            endSimECBSystem.AddJobHandleForProducer(Dependency);
        }
    }
}