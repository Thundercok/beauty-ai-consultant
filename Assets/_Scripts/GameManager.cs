using UnityEngine;

public class GameManager : MonoBehaviour
{
    public GameObject pickupPrefab;
    public GameObject enemyPrefab;
    public int pickupCount = 5;
    public Vector2 spawnRangeMin = new Vector2(-12, -12);
    public Vector2 spawnRangeMax = new Vector2(12, 12);

    void Awake()
    {
        // Fallback auto-assignment in the editor if references are left empty
#if UNITY_EDITOR
        if (pickupPrefab == null)
        {
            pickupPrefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/pickupPrefab.prefab");
            if (pickupPrefab != null)
            {
                Debug.Log("Successfully auto-assigned pickupPrefab on GameManager at runtime.");
            }
        }
        if (enemyPrefab == null)
        {
            enemyPrefab = UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/EnemyPrefab.prefab");
            if (enemyPrefab != null)
            {
                Debug.Log("Successfully auto-assigned enemyPrefab on GameManager at runtime.");
            }
        }
#endif
    }

    void Start()
    {
        if (pickupPrefab != null)
        {
            for (int i = 0; i < pickupCount; i++)
            {
                SpawnPickup();
            }
        }
        else
        {
            Debug.LogError("GameManager: pickupPrefab is null! Please assign it in the inspector.", this);
        }

        if (enemyPrefab != null)
        {
            Instantiate(enemyPrefab, new Vector2(10, 10), Quaternion.identity);
        }
        else
        {
            Debug.LogError("GameManager: enemyPrefab is null! Please assign it in the inspector.", this);
        }
    }

    void SpawnPickup()
    {
        if (pickupPrefab == null) return;
        
        Vector2 pos = new Vector2(
            Random.Range(spawnRangeMin.x, spawnRangeMax.x),
            Random.Range(spawnRangeMin.y, spawnRangeMax.y)
        );
        Instantiate(pickupPrefab, pos, Quaternion.identity);
    }
}
