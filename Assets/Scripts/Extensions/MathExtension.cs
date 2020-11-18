using Unity.Mathematics;

namespace Timespawn.TinyRogue.Extensions
{
    public static class MathExtension
    {
        public static float3 ToFloat3(this float2 pos)
        {
            return new float3(pos.x, pos.y, 0.0f);
        }

        public static int3 ToInt3(this int2 pos)
        {
            return new int3(pos.x, pos.y, 0);
        }
    }
}