using UnityEditor;
using UnityEngine;
using UnityEditor.SceneManagement;

[InitializeOnLoad]
public class EditorCameraParenter
{
    static EditorCameraParenter()
    {
        EditorApplication.update += UpdateCameraParenting;
    }

    private static void UpdateCameraParenting()
    {
        // Only run when not in play mode to avoid interfering with runtime dynamics
        if (EditorApplication.isPlaying) return;

        var activeScene = EditorSceneManager.GetActiveScene();
        if (activeScene.name == "00_Scene" || activeScene.name.Contains("UFO") || activeScene.name == "Scene")
        {
            GameObject cameraObj = GameObject.FindWithTag("MainCamera") ?? GameObject.Find("Main Camera");
            GameObject ufoObj = GameObject.FindWithTag("Player") ?? GameObject.Find("UFO") ?? GameObject.Find("UFO_0");

            if (cameraObj != null && ufoObj != null && cameraObj.transform.parent != ufoObj.transform)
            {
                Undo.SetTransformParent(cameraObj.transform, ufoObj.transform, "Parent Camera to UFO");
                cameraObj.transform.localPosition = new Vector3(0, 0, -10);
                cameraObj.transform.localRotation = Quaternion.identity;
                
                // Ensure CameraController is attached to Main Camera
                if (cameraObj.GetComponent<CameraController>() == null)
                {
                    Undo.AddComponent<CameraController>(cameraObj);
                }

                // Ensure CameraFollow is removed if present
                CameraFollow follow = cameraObj.GetComponent<CameraFollow>();
                if (follow != null)
                {
                    Undo.DestroyObjectImmediate(follow);
                }

                EditorSceneManager.MarkSceneDirty(activeScene);
                Debug.Log("EditorCameraParenter: Automatically parented Main Camera to UFO in active scene: " + activeScene.name);
            }
        }
    }
}
