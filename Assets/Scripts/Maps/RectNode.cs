using Unity.Collections;
using Unity.Mathematics;

namespace Timespawn.TinyRogue.Maps
{
    public struct RectNode
    {
        public const int INVALID_INDEX = -1;

        public Rect Rect;
        public int LeftNodeIndex;
        public int RightNodeIndex;

        public RectNode(in Rect rect, int leftNodeIndex = INVALID_INDEX, int rightNodeIndex = INVALID_INDEX)
        {
            Rect = rect;
            LeftNodeIndex = leftNodeIndex;
            RightNodeIndex = rightNodeIndex;
        }

        public static NativeArray<RectNode> CreateBspTree(in Rect rect, int maxRectLength, float minSplitRatio, float maxSplitRatio, ref Random random)
        {
            NativeList<RectNode> nodeList = new NativeList<RectNode>(Allocator.Temp);

            RectNode root = new RectNode(rect);
            nodeList.Add(root);

            NativeList<int> nodeIndexStack = new NativeList<int>(Allocator.Temp);
            nodeIndexStack.Add(0); // Index of root node
            while (nodeIndexStack.Length > 0)
            {
                int index = nodeIndexStack[nodeIndexStack.Length - 1];
                nodeIndexStack.RemoveAt(nodeIndexStack.Length - 1);

                RectNode node = nodeList[index];
                if (node.Rect.Width < maxRectLength && node.Rect.Height < maxRectLength)
                {
                    continue;
                }

                Rect leftRect;
                Rect rightRect;
                float splitRatio = random.NextFloat(minSplitRatio, maxSplitRatio);
                if (node.Rect.Width >= node.Rect.Height)
                {
                    // Split horizontally
                    int leftWidth = (int) math.floor(node.Rect.Width * splitRatio);
                    int2 rightPos = node.Rect.LowerLeft + new int2(leftWidth, 0);

                    leftRect = new Rect(node.Rect.LowerLeft, leftWidth, node.Rect.Height);
                    rightRect = new Rect(rightPos, node.Rect.Width - leftWidth, node.Rect.Height);
                }
                else
                {
                    // Split vertically
                    int lowerHeight = (int) math.floor(node.Rect.Height * splitRatio);
                    int2 upperPos = node.Rect.LowerLeft + new int2(0, lowerHeight);

                    leftRect = new Rect(node.Rect.LowerLeft, node.Rect.Width, lowerHeight);
                    rightRect = new Rect(upperPos, node.Rect.Width, node.Rect.Height - lowerHeight);
                }

                RectNode leftNode = new RectNode(leftRect);
                int leftIndex = nodeList.Length;
                nodeList.Add(leftNode);
                nodeIndexStack.Add(leftIndex);

                RectNode rightNode = new RectNode(rightRect);
                int rightIndex = nodeList.Length;
                nodeList.Add(rightNode);
                nodeIndexStack.Add(rightIndex);

                node.LeftNodeIndex = leftIndex;
                node.RightNodeIndex = rightIndex;
                nodeList[index] = node;
            }

            NativeArray<RectNode> nodes = nodeList.ToArray(Allocator.Temp);

            nodeList.Dispose();
            nodeIndexStack.Dispose();

            return nodes;
        }

        public static NativeArray<int> GetAllLeafIndices(in NativeArray<RectNode> nodes)
        {
            NativeList<int> indexList = new NativeList<int>(Allocator.Temp);
            for (int i = 0; i < nodes.Length; i++)
            {
                if (nodes[i].IsLeaf())
                {
                    indexList.Add(i);
                }
            }

            NativeArray<int> indices = indexList.ToArray(Allocator.Temp);
            indexList.Dispose();

            return indices;
        }

        public static NativeArray<int> GetLeafIndices(in NativeArray<RectNode> nodes, int rootIndex)
        {
            NativeList<int> indexList = new NativeList<int>(Allocator.Temp);

            NativeList<int> indexStack = new NativeList<int>(Allocator.Temp);
            indexStack.Add(rootIndex);
            while (indexStack.Length > 0)
            {
                int index = indexStack[indexStack.Length - 1];
                indexStack.RemoveAt(indexStack.Length - 1);

                RectNode node = nodes[index];
                if (node.IsLeaf())
                {
                    indexList.Add(index);
                    continue;
                }

                indexStack.Add(node.LeftNodeIndex);
                indexStack.Add(node.RightNodeIndex);
            }

            NativeArray<int> indices = indexList.ToArray(Allocator.Temp);
            indexList.Dispose();
            indexStack.Dispose();

            return indices;
        }

        public static int GetRandomLeafIndex(in NativeArray<RectNode> nodes, int rootIndex, ref Random random)
        {
            NativeArray<int> leafIndices = GetLeafIndices(nodes, rootIndex);
            int leafIndex = leafIndices[random.NextInt(leafIndices.Length)];

            leafIndices.Dispose();

            return leafIndex;
        }

        public bool IsLeaf()
        {
            return LeftNodeIndex == INVALID_INDEX && RightNodeIndex == INVALID_INDEX;
        }
    }
}