#if UNITY_EDITOR
using UnityEditor;
using System.IO;
using System.Collections.Generic;
using UnityEngine;

[InitializeOnLoad]
public static class AutoSceneBuildRegister
{
    static AutoSceneBuildRegister()
    {
        RegisterScenes();
    }

    [MenuItem("Tools/Register All Scenes in Build Settings")]
    public static void RegisterScenes()
    {
        string scenesDir = "Assets/_Scenes";
        if (!Directory.Exists(scenesDir))
        {
            Debug.LogWarning($"Scenes directory not found: {scenesDir}");
            return;
        }

        string[] sceneFiles = Directory.GetFiles(scenesDir, "*.unity", SearchOption.AllDirectories);
        List<EditorBuildSettingsScene> buildScenes = new List<EditorBuildSettingsScene>();

        foreach (string file in sceneFiles)
        {
            string normalizedPath = file.Replace('\\', '/');
            buildScenes.Add(new EditorBuildSettingsScene(normalizedPath, true));
            Debug.Log($"Automatically registered scene: {normalizedPath}");
        }

        EditorBuildSettings.scenes = buildScenes.ToArray();
    }
}
#endif
