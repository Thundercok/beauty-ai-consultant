using UnityEngine;
using System.Collections;

public class Phase1Spawner : MonoBehaviour
{
    public float spawnInterval = 0.8f;
    public float bulletSpeed = 2f;

    void Start()
    {
        StartCoroutine(RunPhase1());
    }

    public IEnumerator RunPhase1()
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
                // Fallback: spawn on a random edge of a screen area (e.g. from -10 to 10)
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
                    // Find player dynamically (prioritize PlayerSoul, fallback to any tagged Player)
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

                    Vector2 dirToPlayer = Vector2.down; // default fallback
                    if (playerTarget != null)
                    {
                        dirToPlayer = ((Vector2)playerTarget.position - spawnPos).normalized;
                    }

                    Bullet bulletScript = b.GetComponent<Bullet>();
                    if (bulletScript != null)
                    {
                        bulletScript.velocity = dirToPlayer * bulletSpeed;
                    }
                }
            }

            yield return new WaitForSeconds(spawnInterval);
        }
    }
}
