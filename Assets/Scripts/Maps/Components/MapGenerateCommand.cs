using Unity.Entities;

namespace Timespawn.TinyRogue.Maps
{
    [GenerateAuthoringComponent]
    public struct MapGenerateCommand : IComponentData
    {
        public MapGenerateSetting MapSetting;
    }
}