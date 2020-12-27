using Unity.Entities;

namespace Timespawn.TinyRogue.Assets
{
    [GenerateAuthoringComponent]
    public struct AssetLoader : IComponentData
    {
        public Entity Floor;
        public Entity Wall;
        public Entity Player;
        public Entity Mob;
        public Entity HealthBar;

        public Entity NFloor;
        public Entity EFloor;
        public Entity WFloor;
        public Entity SFloor;
        public Entity EWFloor;
        public Entity NSFloor;
        public Entity SWFloor;
        public Entity SEFloor;
        public Entity NWFloor;
        public Entity NEFloor;
        public Entity EWSFloor;
        public Entity NESFloor;
        public Entity NWSFloor;
        public Entity NEWFloor;
        public Entity NEWSFloor;

        public Entity NWall;
        public Entity EWall;
        public Entity WWall;
        public Entity SWall;
        public Entity EWWall;
        public Entity NSWall;
        public Entity SWWall;
        public Entity SEWall;
        public Entity NWWall;
        public Entity NEWall;
        public Entity EWSWall;
        public Entity NESWall;
        public Entity NWSWall;
        public Entity NEWWall;
        public Entity NEWSWall;
    }
}