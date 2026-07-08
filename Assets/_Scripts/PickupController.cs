using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class PickupController : MonoBehaviour
{
    public float RotateSpeed = 45;

    // Start is called before the first frame update
    private void Start()
    {
        
    }

    // Update is called once per frame
    private void Update()
    {
        transform.Rotate(new Vector3(0, 0, RotateSpeed) * Time.deltaTime);
    }
}
