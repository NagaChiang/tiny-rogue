using Unity.Entities;

namespace Timespawn.TinyRogue.Assets
{
    public class AssetSystem : SystemBase
    {
        private Entity AssetLoaderEntity;

        public AssetLoader GetAssetLoader()
        {
            return EntityManager.GetComponentData<AssetLoader>(AssetLoaderEntity);
        }

        protected override void OnStartRunning()
        {
            EntityQuery query = EntityManager.CreateEntityQuery(ComponentType.ReadOnly<AssetLoader>());
            AssetLoaderEntity = query.GetSingletonEntity();
        }

        protected override void OnUpdate()
        {
            
        }
    }
}