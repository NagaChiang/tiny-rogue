using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace Timespawn.TinyRogue.Maps
{
    public static class MapUtils
    {
        public static Entity Instantiate(
            EntityCommandBuffer.ParallelWriter parallelWriter,
            int entityInQueryIndex,
            Entity prefab,
            Map map,
            float3 mapPos,
            ushort x,
            ushort y)
        {
            float3 cellPos = map.GetCellCenter(mapPos, x, y);
            Entity entity = parallelWriter.Instantiate(entityInQueryIndex, prefab);
            parallelWriter.AddComponent(entityInQueryIndex, entity, new Tile(x, y));
            parallelWriter.SetComponent(entityInQueryIndex, entity, new Translation {Value = cellPos});

            return entity;
        }
    }
}