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
            EntityManager entityManager = EntityManager;
            EntityCommandBuffer commandBuffer = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>().CreateCommandBuffer();
            Entities.ForEach((Entity entity, ref Actor actor, in AttackCommand command, in Attack attack, in Tile tile, in Translation translation) =>
            {
                commandBuffer.RemoveComponent<AttackCommand>(entity);

                Entity target = command.Target;
                if (!entityManager.HasComponent<Health>(target))
                {
                    return;
                }

                actor.NextActionTime = 20; // TODO: Data

                Health targetHealth = entityManager.GetComponentData<Health>(target);
                int newHealth = targetHealth.Current - attack.Value;
                newHealth = math.clamp(newHealth, 0, targetHealth.Max);
                entityManager.SetComponentData(target, new Health((ushort) newHealth, targetHealth.Max));

                if (entityManager.HasComponent<Tile>(target))
                {
                    Tile targetTile = entityManager.GetComponentData<Tile>(target);
                    float2 direction = math.normalize(new float2(targetTile.x, targetTile.y) - new float2(tile.x, tile.y));

                    float3 start = translation.Value;
                    float3 end = start + (direction.ToFloat3() * 0.5f); // TODO: Data
                    Tween.Move(commandBuffer, entity, start, end, 0.1f, new EaseDesc(EaseType.SmoothStep, 2), true); // TODO: Data
                }
            }).Run();
        }
    }
}