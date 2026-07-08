using UnityEngine;

public class GameManager : MonoBehaviour
{
    // This allows other scripts to access the GameManager instantly
    public static GameManager Instance; 

    public GameObject pickupPrefab;
    public int pickupCount = 5;
    public Vector2 spawnRangeMin = new Vector2(-12, -12);
    public Vector2 spawnRangeMax = new Vector2(12, 12);

    void Awake()
    {
        // Set up the static reference
        Instance = this;
    }

    void Start()
    {
        for (int i = 0; i < pickupCount; i++)
            SpawnPickup();
    }

    // Changed from "void" to "public void" so the UFO can trigger it
    public void SpawnPickup()
    {
        Vector2 pos = new Vector2(
            Random.Range(spawnRangeMin.x, spawnRangeMax.x),
            Random.Range(spawnRangeMin.y, spawnRangeMax.y)
        );
        Instantiate(pickupPrefab, pos, Quaternion.identity);
    }
}
