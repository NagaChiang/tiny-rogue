﻿using Unity.Entities;

namespace Timespawn.TinyRogue.Gameplay
{
    [GenerateAuthoringComponent]
    public struct Actor : IComponentData
    {
        public ushort NextActionTime; // 100 = 1 sec
    }
}