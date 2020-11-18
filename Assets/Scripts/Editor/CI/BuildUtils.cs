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

        public static void CommandBuild()
        {
            string[] args = GetExecuteMethodArguments(typeof(BuildUtils).FullName + "." + nameof(CommandBuild));
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
            buildResult.LogResult();

            if (buildResult.Failed)
            {
                Debug.LogError($"Build failed with configuration {buildConfigurationName}.");
                EditorApplication.Exit(1);
            }
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