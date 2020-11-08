using Unity.Entities;

namespace Timespawn.TinyRogue.Assets
{
    public class AssetSystem : SystemBase
    {
        private Entity AssetLoaderEntity;
        private EntityQuery LoaderQuery;

        public AssetLoader GetAssetLoader()
        {
            if (AssetLoaderEntity == Entity.Null)
            {
                AssetLoaderEntity = LoaderQuery.GetSingletonEntity();
            }

            return EntityManager.GetComponentData<AssetLoader>(AssetLoaderEntity);
        }

        protected override void OnCreate()
        {
            LoaderQuery = EntityManager.CreateEntityQuery(ComponentType.ReadOnly<AssetLoader>());
        }

        protected override void OnUpdate()
        {
            
        }
    }
}