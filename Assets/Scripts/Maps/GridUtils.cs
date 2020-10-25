using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;

namespace Timespawn.TinyRogue.Maps
{
    public static class GridUtils
    {
        public static Entity Instantiate(
            EntityCommandBuffer.ParallelWriter parallelWriter,
            int entityInQueryIndex,
            Entity prefab,
            Grid grid,
            float3 mapPos,
            ushort x,
            ushort y)
        {
            float3 cellPos = grid.GetCellCenter(mapPos, x, y);
            Entity entity = parallelWriter.Instantiate(entityInQueryIndex, prefab);
            parallelWriter.AddComponent(entityInQueryIndex, entity, new Tile(x, y));
            parallelWriter.SetComponent(entityInQueryIndex, entity, new Translation {Value = cellPos});

            return entity;
        }
    }
}