using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class CameraController : MonoBehaviour
{
    // Start is called before the first frame update
    void Start()
    {
    }

    // Update is called once per frame
    void Update()
    {
        // If the camera is not parented, search for the UFO dynamically on every frame
        if (transform.parent == null)
        {
            GameObject ufo = GameObject.FindWithTag("Player") ?? 
                             GameObject.Find("UFO") ?? 
                             GameObject.Find("UFO_0") ?? 
                             GameObject.Find("UFO(Clone)");
            
            if (ufo == null)
            {
                UFOController controller = Object.FindFirstObjectByType<UFOController>();
                if (controller != null) ufo = controller.gameObject;
            }

            if (ufo != null)
            {
                transform.SetParent(ufo.transform);
                transform.localPosition = new Vector3(0, 0, -10);
                transform.localRotation = Quaternion.identity;
                Debug.Log("CameraController: Dynamically parented Main Camera to UFO.");
            }
        }

        // -- To prevent the random rotate of Camera
        // transform.eulerAngles = Vector3.zero;
        transform.eulerAngles = Vector2.zero;

        // -- Show the current location of UFO or Camera
        Vector2 UFO_pos = transform.position;
        Debug.Log("Now the UFO is located at " + UFO_pos);
    }
}
