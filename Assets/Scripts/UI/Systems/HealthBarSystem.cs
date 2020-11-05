using Timespawn.TinyRogue.Gameplay;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace Timespawn.TinyRogue.UI
{
    public class HealthBarSystem : SystemBase
    {
        protected override void OnUpdate()
        {
            ComponentDataFromEntity<HealthBar> healthBarFromEntity = GetComponentDataFromEntity<HealthBar>(true);
            ComponentDataFromEntity<NonUniformScale> scaleFromEntity = GetComponentDataFromEntity<NonUniformScale>(true);

            EndSimulationEntityCommandBufferSystem endSimECBSystem = World.GetOrCreateSystem<EndSimulationEntityCommandBufferSystem>();
            EntityCommandBuffer.ParallelWriter parallelWriter = endSimECBSystem.CreateCommandBuffer().AsParallelWriter();
            Entities
                .WithReadOnly(healthBarFromEntity)
                .WithReadOnly(scaleFromEntity)
                .WithChangeFilter<Health>()
                .ForEach((int entityInQueryIndex, in Health health, in HealthBarLink healthBarLink) =>
                {
                    HealthBar healthBar = healthBarFromEntity[healthBarLink.Value];
                    NonUniformScale scale = scaleFromEntity[healthBar.BarEntity];
                    scale.Value = new float3((float) health.Current / health.Max, 1.0f, 1.0f);

                    parallelWriter.SetComponent(entityInQueryIndex, healthBar.BarEntity, scale);
                }).ScheduleParallel();

            endSimECBSystem.AddJobHandleForProducer(Dependency);
        }
    }
}