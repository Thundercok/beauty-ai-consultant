using UnityEngine;
using System.Collections;

public class Phase1Spawner : MonoBehaviour
{
    [Header("Spawner Settings")]
    [SerializeField] private float _spawnInterval = 0.45f;
    [SerializeField] private float _bulletSpeed = 3.5f;

    [Header("References")]
    [SerializeField] private GameObject _pickupPrefab;

    private Coroutine _spawnCoroutine;
    private Coroutine _pickupCoroutine;

    // Public Properties
    public GameObject PickupPrefab
    {
        get => _pickupPrefab;
        set => _pickupPrefab = value;
    }

    public float SpawnInterval
    {
        get => _spawnInterval;
        set => _spawnInterval = value;
    }

    public float BulletSpeed
    {
        get => _bulletSpeed;
        set => _bulletSpeed = value;
    }

    public void StartSpawning()
    {
        if (_spawnCoroutine != null) StopCoroutine(_spawnCoroutine);
        _spawnCoroutine = StartCoroutine(RunPhase1());

        if (_pickupCoroutine != null) StopCoroutine(_pickupCoroutine);
        _pickupCoroutine = StartCoroutine(RunPickupSpawner());
    }

    public void StopSpawning()
    {
        if (_spawnCoroutine != null)
        {
            StopCoroutine(_spawnCoroutine);
            _spawnCoroutine = null;
        }

        if (_pickupCoroutine != null)
        {
            StopCoroutine(_pickupCoroutine);
            _pickupCoroutine = null;
        }
    }

    private IEnumerator RunPhase1()
    {
        while (true)
        {
            Vector2 spawnPos;
            if (BattleBox.Instance != null)
            {
                spawnPos = BattleBox.Instance.RandomEdgePoint();
            }
            else
            {
                float spawnX = Random.Range(-10f, 10f);
                float spawnY = Random.Range(-10f, 10f);
                if (Random.value > 0.5f)
                {
                    spawnX = Random.value > 0.5f ? 10f : -10f;
                }
                else
                {
                    spawnY = Random.value > 0.5f ? 10f : -10f;
                }
                spawnPos = new Vector2(spawnX, spawnY);
            }

            if (BulletPool.Instance != null)
            {
                GameObject b = BulletPool.Instance.Get(spawnPos);
                if (b != null)
                {
                    Transform playerTarget = null;
                    if (PlayerSoul.Instance != null)
                    {
                        playerTarget = PlayerSoul.Instance.transform;
                    }
                    else
                    {
                        GameObject playerObj = GameObject.FindGameObjectWithTag("Player");
                        if (playerObj != null)
                        {
                            playerTarget = playerObj.transform;
                        }
                    }

                    Vector2 dirToPlayer = Vector2.down; // default
                    if (playerTarget != null)
                    {
                        dirToPlayer = ((Vector2)playerTarget.position - spawnPos).normalized;
                    }

                    Bullet bulletScript = b.GetComponent<Bullet>();
                    if (bulletScript != null)
                    {
                        // Add some slight randomness to bullet trajectories to make dodging interesting!
                        Vector2 offsetDir = dirToPlayer;
                        float randomAngle = Random.Range(-15f, 15f);
                        offsetDir = Quaternion.Euler(0, 0, randomAngle) * dirToPlayer;

                        bulletScript.velocity = offsetDir * _bulletSpeed;
                    }
                }
            }

            yield return new WaitForSeconds(_spawnInterval);
        }
    }

    private IEnumerator RunPickupSpawner()
    {
        while (true)
        {
            // Spawn a pickup every 2 to 4 seconds
            yield return new WaitForSeconds(Random.Range(2.0f, 4.0f));

            if (BattleBox.Instance != null && UndertaleBattleManager.Instance != null &&
                UndertaleBattleManager.Instance.CurrentState == UndertaleBattleManager.BattleState.EnemyAttack)
            {
                Vector2 boxSize = BattleBox.Instance.Size;
                Vector2 boxCenter = BattleBox.Instance.Center;

                // Keep pickups safely inside the box boundaries
                float margin = 0.6f;
                float rx = Random.Range(-boxSize.x / 2f + margin, boxSize.x / 2f - margin);
                float ry = Random.Range(-boxSize.y / 2f + margin, boxSize.y / 2f - margin);

                Vector2 spawnPos = boxCenter + new Vector2(rx, ry);

                if (_pickupPrefab != null)
                {
                    GameObject p = Instantiate(_pickupPrefab, spawnPos, Quaternion.identity);
                    p.tag = "Pickup";
                    
                    // Scale down to match the Undertale scale
                    p.transform.localScale = new Vector3(0.4f, 0.4f, 1f);

                    // Attach script to manage collision and scoring
                    UndertalePickup up = p.AddComponent<UndertalePickup>();
                    up.type = (Random.value > 0.5f) ? UndertalePickup.PickupType.Heal : UndertalePickup.PickupType.Shield;

                    // Clean up after 3.5 seconds if not collected
                    Destroy(p, 3.5f);
                }
            }
        }
    }
}
