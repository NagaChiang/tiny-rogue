using Unity.Entities;

namespace Timespawn.TinyRogue.Assets
{
    public class AssetSystem : SystemBase
    {
        private static Entity AssetLoaderEntity;

        public static AssetLoader GetAssetLoader(EntityManager entityManager)
        {
            return entityManager.GetComponentData<AssetLoader>(AssetLoaderEntity);
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