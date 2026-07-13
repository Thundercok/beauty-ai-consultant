#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

public static class VerifyScene
{
    [MenuItem("Tools/Verify Scene Diagnostics")]
    public static void RunDiagnostics()
    {
        string[] scenes = {
            "Assets/_Scenes/00_Scene.unity",
            "Assets/_Scenes/01_Underta.unity",
            "Assets/_Scenes/13_UFO_Pickups_CameraControl.unity",
            "Assets/_Scenes/14_UFO_Pickups_UI.unity",
            "Assets/_Scenes/15_UFO_Pickups_UI-Complete.unity",
            "Assets/_Scenes/Scene.unity",
            "Assets/Project UFO.unity"
        };

        foreach (var scenePath in scenes)
        {
            if (!System.IO.File.Exists(scenePath))
            {
                Debug.Log($"Scene not found at path: {scenePath}");
                continue;
            }

            UnityEngine.SceneManagement.Scene activeScene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);
            Debug.Log($"\n=========================================\n=== SCENE DIAGNOSTICS: {scenePath} ===\n=========================================");

            // 1. Check Cameras
            Camera[] cameras = GameObject.FindObjectsByType<Camera>(FindObjectsSortMode.None);
            Debug.Log($"Found {cameras.Length} cameras in the scene:");
            foreach (var cam in cameras)
            {
                Debug.Log($"- Camera Name: {cam.name}, Tag: {cam.tag}, Active: {cam.gameObject.activeInHierarchy}, Position: {cam.transform.position}, Orthographic: {cam.orthographic}, Size: {cam.orthographicSize}");
            }

            // 2. Scan all GameObjects and print components
            GameObject[] allGo = GameObject.FindObjectsByType<GameObject>(FindObjectsSortMode.None);
            Debug.Log($"Total GameObjects in scene: {allGo.Length}");
            foreach (var go in allGo)
            {
                if (go.transform.parent != null) continue; // Only log root objects to avoid massive spam, but check everything for errors
                LogObjectAndChildren(go, "");
            }
        }
    }

    private static void LogObjectAndChildren(GameObject go, string indent)
    {
        Component[] components = go.GetComponents<Component>();
        string compList = "";
        foreach (var c in components)
        {
            if (c == null)
            {
                compList += "[MISSING SCRIPT Reference!], ";
                continue;
            }
            compList += c.GetType().Name + ", ";
        }
        
        Debug.Log($"{indent}- GO: {go.name}, Tag: {go.tag}, Active: {go.activeSelf}, Position: {go.transform.position}, Components: [{compList}]");
        
        // Reference checks for important components
        UFOController ufo = go.GetComponent<UFOController>();
        if (ufo != null)
        {
            Debug.Log($"{indent}  [UFOController Ref Check] Speed: {ufo.speed}, Status_Message: {(ufo.Status_Message != null ? "Assigned" : "NULL")}, Disp_Win: {(ufo.Disp_Win != null ? "Assigned" : "NULL")}, HPBar.Instance: {(HPBar.Instance != null ? "Exists" : "NULL")}");
        }

        GameManager gm = go.GetComponent<GameManager>();
        if (gm != null)
        {
            Debug.Log($"{indent}  [GameManager Ref Check] pickupPrefab: {(gm.pickupPrefab != null ? "Assigned" : "NULL")}, enemyPrefab: {(gm.enemyPrefab != null ? "Assigned" : "NULL")}");
        }

        HPBar hpBar = go.GetComponent<HPBar>();
        if (hpBar != null)
        {
            Debug.Log($"{indent}  [HPBar Ref Check] FillBar: {(hpBar.FillBar != null ? "Assigned" : "NULL")}");
        }

        Phase1Spawner spawner = go.GetComponent<Phase1Spawner>();
        if (spawner != null)
        {
            Debug.Log($"{indent}  [Phase1Spawner Ref Check] PickupPrefab: {(spawner.PickupPrefab != null ? "Assigned" : "NULL")}");
        }

        for (int i = 0; i < go.transform.childCount; i++)
        {
            LogObjectAndChildren(go.transform.GetChild(i).gameObject, indent + "  ");
        }
    }
}
#endif

