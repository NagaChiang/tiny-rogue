﻿using Unity.Collections;
using Unity.Mathematics;
using Random = Unity.Mathematics.Random;

namespace Timespawn.TinyRogue.Maps
{
    public enum CellType
    {
        Ground,
        Wall,
    }

    [System.Serializable]
    public struct MapGenerateSetting
    {
        public ushort Width;
        public ushort Height;
        public ushort MinRoomLength;
        public ushort MaxRoomLength;
        public float MinSplitRatio;
        public float MaxSplitRatio;
    }

    public struct MapGenerator : System.IDisposable
    {
        public MapGenerateSetting Setting;

        private NativeArray<CellType> CellData;

        public MapGenerator(MapGenerateSetting setting)
        {
            Setting = setting;

            CellData = new NativeArray<CellType>(Setting.Width * Setting.Height, Allocator.Temp);
            for (int i = 0; i < CellData.Length; i++)
            {
                CellData[i] = CellType.Wall;
            }
        }

        public NativeArray<CellType> Generate(ref Random random)
        {
            // Rooms
            Rect fullRect = new Rect(int2.zero, Setting.Width, Setting.Height);
            NativeArray<RectNode> nodes = RectNode.CreateBspTree(fullRect, Setting.MaxRoomLength, Setting.MinSplitRatio, Setting.MaxSplitRatio, ref random);
            NativeArray<int> leafIndices = RectNode.GetAllLeafIndices(nodes);
            NativeArray<Rect> rooms = new NativeArray<Rect>(nodes.Length, Allocator.Temp);
            for (int i = 0; i < leafIndices.Length; i++)
            {
                int leafIndex = leafIndices[i];
                Rect leafRect = nodes[leafIndex].Rect;
                rooms[leafIndex] = GenerateRoom(leafRect, ref random);
            }

            // Paths
            NativeList<int> nodeIndexStack = new NativeList<int>(Allocator.Temp);
            nodeIndexStack.Add(0); // Root node index
            while (nodeIndexStack.Length > 0)
            {
                int index = nodeIndexStack[nodeIndexStack.Length - 1];
                nodeIndexStack.RemoveAt(nodeIndexStack.Length - 1);

                RectNode node = nodes[index];
                if (node.IsLeaf())
                {
                    continue;
                }

                Rect leftRoom = rooms[RectNode.GetRandomLeafIndex(nodes, node.LeftNodeIndex, ref random)];
                Rect rightRoom = rooms[RectNode.GetRandomLeafIndex(nodes, node.RightNodeIndex, ref random)];

                if (leftRoom.IsValid() && rightRoom.IsValid())
                {
                    GeneratePath(leftRoom, rightRoom, ref random);
                }

                nodeIndexStack.Add(node.LeftNodeIndex);
                nodeIndexStack.Add(node.RightNodeIndex);
            }

            nodes.Dispose();
            leafIndices.Dispose();
            rooms.Dispose();
            nodeIndexStack.Dispose();

            return CellData;
        }

        public void Dispose()
        {
            CellData.Dispose();
        }

        private Rect GenerateRoom(in Rect rect, ref Random random)
        {
            if (rect.Width < Setting.MinRoomLength || rect.Height < Setting.MinRoomLength)
            {
                return default;
            }

            int width = random.NextInt(Setting.MinRoomLength, rect.Width + 1);
            int height = random.NextInt(Setting.MinRoomLength, rect.Height + 1);
            int2 lowerLeft = rect.LowerLeft + random.NextInt2(int2.zero, new int2(rect.Width - width, rect.Height - height));
            Rect room = new Rect(lowerLeft, width, height);

            SetCellType(room, CellType.Ground, true);

            return room;
        }

        private void GeneratePath(in Rect room1, in Rect room2, ref Random random)
        {
            int2 pos1 = room1.GetRandomPosition(ref random, true);
            int2 pos2 = room2.GetRandomPosition(ref random, true);
            int2 offset = pos2 - pos1;
            int horizontalLength = math.abs(offset.x) + 1;
            int verticalLength = math.abs(offset.y) + 1;
            
            bool isHorizontalFirst = random.NextBool();
            if (isHorizontalFirst)
            {
                // Horizontal first
                if (offset.x >= 0)
                {
                    // Right
                    SetCellType(new Rect(pos1, horizontalLength, 1), CellType.Ground);

                    if (offset.y >= 0)
                    {
                        // Up
                        SetCellType(new Rect(pos2.x, pos1.y, 1, verticalLength), CellType.Ground);
                    }
                    else
                    {
                        // Down
                        SetCellType(new Rect(pos2.x, pos2.y, 1, verticalLength), CellType.Ground);
                    }
                }
                else
                {
                    // Left
                    SetCellType(new Rect(pos2.x, pos1.y, horizontalLength, 1), CellType.Ground);

                    if (offset.y >= 0)
                    {
                        // Up
                        SetCellType(new Rect(pos2.x, pos1.y, 1, verticalLength), CellType.Ground);
                    }
                    else
                    {
                        // Down
                        SetCellType(new Rect(pos2.x, pos2.y, 1, verticalLength), CellType.Ground);
                    }
                }
            }
            else
            {
                // Vertical first
                if (offset.y >= 0)
                {
                    // Up
                    SetCellType(new Rect(pos1, 1, verticalLength), CellType.Ground);

                    if (offset.x >= 0)
                    {
                        // Right
                        SetCellType(new Rect(pos1.x, pos2.y, horizontalLength, 1), CellType.Ground);
                    }
                    else
                    {
                        // Left
                        SetCellType(new Rect(pos2, horizontalLength, 1), CellType.Ground);
                    }
                }
                else
                {
                    // Down
                    SetCellType(new Rect(pos1.x, pos2.y, 1, verticalLength), CellType.Ground);

                    if (offset.x >= 0)
                    {
                        // Right
                        SetCellType(new Rect(pos1.x, pos2.y, horizontalLength, 1), CellType.Ground);
                    }
                    else
                    {
                        // Left
                        SetCellType(new Rect(pos2, horizontalLength, 1), CellType.Ground);
                    }
                }
            }
        }

        private void SetCellType(in Rect rect, CellType cellType, bool isBoundaryExcluded = false)
        {
            for (int y = 0; y < rect.Height; y++)
            {
                if (isBoundaryExcluded && (y == 0 || y == rect.Height - 1))
                {
                    continue;
                }

                for (int x = 0; x < rect.Width; x++)
                {
                    if (isBoundaryExcluded && (x == 0 || x == rect.Width - 1))
                    {
                        continue;
                    }

                    SetCellType(rect.LowerLeft + new int2(x, y), cellType);
                }
            }
        }

        private void SetCellType(int2 coord, CellType cellType)
        {
            int index = (Setting.Width * coord.y) + coord.x;
            CellData[index] = cellType;
        }
    }
}