using System;
using System.Collections.Generic;
using System.Linq;
using Unity.Build;
using UnityEditor;
using UnityEngine;

namespace Timespawn.TinyRogue.Editor.CI
{
    public static class BuildUtils
    {
        private const string BuildConfigurationFolderPath = "Assets/BuildConfiguration";

        [MenuItem("Test/Build")]
        public static void BuildDefaultScene()
        {
            string[] args = GetExecuteMethodArguments(typeof(BuildUtils).FullName + "." + nameof(BuildDefaultScene));
            string buildConfigurationName = args.ElementAtOrDefault(0);

            Build(buildConfigurationName);
        }

        public static void Build(string buildConfigurationName)
        {
            Debug.Log($"Start building with configuration {buildConfigurationName}.");

            BuildConfiguration buildConfig = BuildConfiguration.LoadAsset($"{BuildConfigurationFolderPath}/{buildConfigurationName}{BuildConfiguration.AssetExtension}");
            if (!buildConfig)
            {
                Debug.LogError($"Build failed. Build configuration {buildConfigurationName} not found.");
                return;
            }

            BuildResult buildResult = buildConfig.Build();
            if (buildResult.Failed)
            {
                Debug.LogError($"Build failed with configuration {buildConfigurationName}.");
            }

            buildResult.LogResult();
        }

        private static string[] GetExecuteMethodArguments(string methodFullName)
        {
            List<string> optionArgs = new List<string>();
            string[] allArgs = Environment.GetCommandLineArgs();

            bool hasMethodNameFound = false;
            foreach (string arg in allArgs)
            {
                if (!hasMethodNameFound)
                {
                    if (arg.ToLower() == methodFullName.ToLower())
                    {
                        hasMethodNameFound = true;
                    }
                }
                else
                {
                    optionArgs.Add(arg);
                }
            }

            return optionArgs.ToArray();
        }
    }
}