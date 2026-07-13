using UnityEngine;

public class CameraFollow : MonoBehaviour
{
    [Header("Zoom Settings")]
    [Tooltip("Camera size when in the Undertale bullet-hell scene.")]
    public float undertaleSceneZoom = 3.5f;

    private Camera cam;

    void Start()
    {
        cam = GetComponent<Camera>();
        if (cam != null)
        {
            cam.orthographic = true;
        }
    }

    void Update()
    {
        if (cam == null)
        {
            cam = GetComponent<Camera>();
        }

        // Check if we are in the Undertale scene (BattleBox is present)
        if (BattleBox.Instance != null)
        {
            // Lock camera statically on the BattleBox center
            transform.position = new Vector3(BattleBox.Instance.Center.x, BattleBox.Instance.Center.y, -10f);

            if (cam != null)
            {
                cam.orthographicSize = undertaleSceneZoom;
            }
        }
        else
        {
            // UFO Scene: Static camera centered at (0, 0)
            transform.position = new Vector3(0f, 0f, -10f);

            // We do NOT override cam.orthographicSize in UFO mode.
            // This allows you to change the Camera's size directly in the Inspector.
        }
    }
}

public class CameraInitializer
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
    static void OnSceneLoad()
    {
        Camera mainCam = Camera.main;
        if (mainCam != null && mainCam.GetComponent<CameraFollow>() == null)
        {
            mainCam.gameObject.AddComponent<CameraFollow>();
            Debug.Log("CameraFollow (Fixed) component automatically added to Main Camera.");
        }
    }
}
