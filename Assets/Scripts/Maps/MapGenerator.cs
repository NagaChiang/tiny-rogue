﻿using Timespawn.TinyRogue.Assets;
using Timespawn.TinyRogue.Common;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Tiny;
using Random = Unity.Mathematics.Random;

namespace Timespawn.TinyRogue.Maps
{
    public enum CellType
    {
        None,
        Floor,
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
        private struct CoordMaskPair
        {
            public int2 Coord;
            public GridMask Mask;

            public CoordMaskPair(int2 coord, GridMask mask)
            {
                Coord = coord;
                Mask = mask;
            }
        }

        private MapGenerateSetting Setting;
        private Grid Grid;
        private AssetLoader AssetLoader;
        private NativeArray<CellType> CellData;
        private NativeArray<GridMask> WallMasks;

        public MapGenerator(in MapGenerateSetting setting, in Grid grid, in AssetLoader assetLoader, ref Random random)
        {
            Setting = setting;
            Grid = grid;
            AssetLoader = assetLoader;
            CellData = new NativeArray<CellType>(Grid.Width * Grid.Height, Allocator.Temp);
            WallMasks = new NativeArray<GridMask>(Grid.Width * Grid.Height, Allocator.Temp);

            for (int i = 0; i < CellData.Length; i++)
            {
                CellData[i] = CellType.Wall;
            }

            GenerateCellData(ref random);
            GenerateWallMasks();
        }

        public Entity GetPrefab(int x, int y)
        {
            if (!Grid.IsValidCoord(x, y) || CellData[Grid.GetIndex(x, y)] == CellType.None)
            { 
                return Entity.Null;
            }

            GridMask wallMask = WallMasks[Grid.GetIndex(x, y)];
            bool isWall = (wallMask & GridMask.Center) != 0;
            if (CommonUtils.HasFlags(wallMask, GridMask.North | GridMask.East | GridMask.West | GridMask.South))
            {
                return isWall ? AssetLoader.NEWSWall : AssetLoader.NEWSFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.East | GridMask.West | GridMask.South))
                //&& (wallMask & (GridMask.SouthEast | GridMask.SouthWest)) == 0)
            {
                return isWall ? AssetLoader.EWSWall : AssetLoader.EWSFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.North | GridMask.East | GridMask.South))
                //&& (wallMask & (GridMask.SouthEast | GridMask.NorthEast)) == 0)
            {
                return isWall ? AssetLoader.NESWall : AssetLoader.NESFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.North | GridMask.West | GridMask.South))
                //&& (wallMask & (GridMask.NorthWest | GridMask.SouthWest)) == 0)
            {
                return isWall ? AssetLoader.NWSWall : AssetLoader.NWSFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.North | GridMask.East | GridMask.West))
                //&& (wallMask & (GridMask.NorthWest | GridMask.NorthEast)) == 0)
            {
                return isWall ? AssetLoader.NEWWall : AssetLoader.NEWFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.West | GridMask.East))
            {
                return isWall ? AssetLoader.EWWall : AssetLoader.EWFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.North | GridMask.South))
            {
                return isWall ? AssetLoader.NSWall : AssetLoader.NSFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.North | GridMask.West))
            {
                return isWall ? AssetLoader.NWWall : AssetLoader.NWFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.North | GridMask.East))
            {
                return isWall ? AssetLoader.NEWall : AssetLoader.NEFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.South | GridMask.West))
            {
                return isWall ? AssetLoader.SWWall : AssetLoader.SWFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.South | GridMask.East))
            {
                return isWall ? AssetLoader.SEWall : AssetLoader.SEFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.North))
            {
                return isWall ? AssetLoader.NWall : AssetLoader.NFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.East))
            {
                return isWall ? AssetLoader.EWall : AssetLoader.EFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.West))
            {
                return isWall ? AssetLoader.WWall : AssetLoader.WFloor;
            }

            if (CommonUtils.HasFlags(wallMask, GridMask.South))
            {
                return isWall ? AssetLoader.SWall : AssetLoader.SFloor;
            }

            return AssetLoader.Floor;
        }

        public void Dispose()
        {
            CellData.Dispose();
            WallMasks.Dispose();
        }

        private void GenerateWallMasks()
        {
            NativeList<CoordMaskPair> relativeCoordToMasks = new NativeList<CoordMaskPair>(Allocator.Temp);
            relativeCoordToMasks.Add(new CoordMaskPair(new int2(0, 1), GridMask.North));
            relativeCoordToMasks.Add(new CoordMaskPair(new int2(-1, 0), GridMask.West));
            relativeCoordToMasks.Add(new CoordMaskPair(new int2(0, 0), GridMask.Center));
            relativeCoordToMasks.Add(new CoordMaskPair(new int2(1, 0), GridMask.East));
            relativeCoordToMasks.Add(new CoordMaskPair(new int2(0, -1), GridMask.South));
            relativeCoordToMasks.Add(new CoordMaskPair(new int2(-1, 1), GridMask.NorthWest));
            relativeCoordToMasks.Add(new CoordMaskPair(new int2(1, 1), GridMask.NorthEast));
            relativeCoordToMasks.Add(new CoordMaskPair(new int2(-1, -1), GridMask.SouthWest));
            relativeCoordToMasks.Add(new CoordMaskPair(new int2(1, -1), GridMask.SouthEast));

            for (int y = 0; y < Grid.Height; y++)
            {
                for (int x = 0; x < Grid.Width; x++)
                {
                    GridMask wallMask = 0;
                    for (int i = 0; i < relativeCoordToMasks.Length; i++)
                    {
                        int2 coord = new int2(x, y) + relativeCoordToMasks[i].Coord;
                        GridMask mask = relativeCoordToMasks[i].Mask;
                        if (Grid.IsValidCoord(coord) && CellData[Grid.GetIndex(coord)] == CellType.Wall)
                        {
                            wallMask |= mask;
                        }
                    }

                    WallMasks[Grid.GetIndex(x, y)] = wallMask;
                }
            }

            relativeCoordToMasks.Dispose();
        }

        private void GenerateCellData(ref Random random)
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

            CarveOuterSpace();

            nodes.Dispose();
            leafIndices.Dispose();
            rooms.Dispose();
            nodeIndexStack.Dispose();
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

            SetCellType(room, CellType.Floor, Rect.OperationMode.BoundaryExcluded);

            return room;
        }

        private void GeneratePath(in Rect room1, in Rect room2, ref Random random)
        {
            int2 pos1 = room1.GetRandomPosition(ref random, Rect.OperationMode.BoundaryExcluded);
            int2 pos2 = room2.GetRandomPosition(ref random, Rect.OperationMode.BoundaryExcluded);
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
                    SetCellType(new Rect(pos1, horizontalLength, 1), CellType.Floor);

                    if (offset.y >= 0)
                    {
                        // Up
                        SetCellType(new Rect(pos2.x, pos1.y, 1, verticalLength), CellType.Floor);
                    }
                    else
                    {
                        // Down
                        SetCellType(new Rect(pos2.x, pos2.y, 1, verticalLength), CellType.Floor);
                    }
                }
                else
                {
                    // Left
                    SetCellType(new Rect(pos2.x, pos1.y, horizontalLength, 1), CellType.Floor);

                    if (offset.y >= 0)
                    {
                        // Up
                        SetCellType(new Rect(pos2.x, pos1.y, 1, verticalLength), CellType.Floor);
                    }
                    else
                    {
                        // Down
                        SetCellType(new Rect(pos2.x, pos2.y, 1, verticalLength), CellType.Floor);
                    }
                }
            }
            else
            {
                // Vertical first
                if (offset.y >= 0)
                {
                    // Up
                    SetCellType(new Rect(pos1, 1, verticalLength), CellType.Floor);

                    if (offset.x >= 0)
                    {
                        // Right
                        SetCellType(new Rect(pos1.x, pos2.y, horizontalLength, 1), CellType.Floor);
                    }
                    else
                    {
                        // Left
                        SetCellType(new Rect(pos2, horizontalLength, 1), CellType.Floor);
                    }
                }
                else
                {
                    // Down
                    SetCellType(new Rect(pos1.x, pos2.y, 1, verticalLength), CellType.Floor);

                    if (offset.x >= 0)
                    {
                        // Right
                        SetCellType(new Rect(pos1.x, pos2.y, horizontalLength, 1), CellType.Floor);
                    }
                    else
                    {
                        // Left
                        SetCellType(new Rect(pos2, horizontalLength, 1), CellType.Floor);
                    }
                }
            }
        }

        private void CarveOuterSpace()
        {
            for (int y = 0; y < Grid.Height; y++)
            {
                for (int x = 0; x < Grid.Width; x++)
                {
                    bool isInner = false;
                    for (int v = -1; v <= 1; v++)
                    {
                        for (int u = -1; u <= 1; u++)
                        {
                            int2 coord = new int2(x + u, y + v);
                            if (!Grid.IsValidCoord(coord))
                            {
                                continue;
                            }

                            if (CellData[Grid.GetIndex(coord)] == CellType.Floor)
                            {
                                isInner = true;
                                break;
                            }
                        }

                        if (isInner)
                        {
                            break;
                        }
                    }

                    if (!isInner)
                    {
                        CellData[Grid.GetIndex(x, y)] = CellType.None;
                    }
                }
            }
        }

        private void SetCellType(in Rect rect, CellType cellType, Rect.OperationMode mode = Rect.OperationMode.BoundaryIncluded)
        {
            for (int y = 0; y < rect.Height; y++)
            {
                for (int x = 0; x < rect.Width; x++)
                {
                    if (!rect.ShouldOperate(x, y, mode))
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