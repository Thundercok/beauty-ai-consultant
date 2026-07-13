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
        // -- To prevent the random rotate of Camera
        // transform.eulerAngles = Vector3.zero;
        transform.eulerAngles = Vector2.zero;

        // -- Show the current location of UFO or Camera
        Vector2 UFO_pos = transform.position;
        Debug.Log("Now the UFO is located at " + UFO_pos);
    }

    // LateUpdate is called after all Update functions and physics updates
    void LateUpdate()
    {
        // Lock world-space rotation to prevent physics-induced parent spin from rotating the camera
        transform.eulerAngles = Vector2.zero;
    }
}
