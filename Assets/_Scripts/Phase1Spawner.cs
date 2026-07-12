using UnityEngine;
using System.Collections;

public class Phase1Spawner : MonoBehaviour
{
    public float spawnInterval = 0.8f;
    public float bulletSpeed = 2f;

    private Coroutine spawnCoroutine;

    public void StartSpawning()
    {
        if (spawnCoroutine != null) StopCoroutine(spawnCoroutine);
        spawnCoroutine = StartCoroutine(RunPhase1());
    }

    public void StopSpawning()
    {
        if (spawnCoroutine != null)
        {
            StopCoroutine(spawnCoroutine);
            spawnCoroutine = null;
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

                        bulletScript.velocity = offsetDir * bulletSpeed;
                    }
                }
            }

            yield return new WaitForSeconds(spawnInterval);
        }
    }
}
