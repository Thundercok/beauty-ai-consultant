using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class CameraController : MonoBehaviour
{
    // Start is called before the first frame update
    void Start()
    {
        if (transform.parent == null)
        {
            GameObject ufo = GameObject.FindWithTag("Player") ?? GameObject.Find("UFO") ?? GameObject.Find("UFO_0");
            if (ufo != null)
            {
                transform.SetParent(ufo.transform);
                transform.localPosition = new Vector3(0, 0, -10);
                transform.localRotation = Quaternion.identity;
                Debug.Log("CameraController: Dynamically parented Main Camera to UFO.");
            }
        }
    }

    // Update is called once per frame
    void Update()
    {
        // -- To prevent the random rotate of Camera
        // transform.eulerAngles = Vector3.zero;
        transform.eulerAngles = Vector2.zero;

        // -- Show the current location of UFO or Camera
        Vector2 UFO_pos = transform.position;
        Debug.Log("Now the UFO is located at " + UFO_pos);
    }
}
