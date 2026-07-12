using UnityEngine;
using System.Collections;
using System.Collections.Generic;

public class Bullet : MonoBehaviour
{
    public float grazeRadius = 0.6f;   // outer ring
    public float hitRadius = 0.15f;    // actual soul hitbox
    private bool hasGrazed = false;
    public int damage = 1;
    public Vector2 velocity;

    void OnEnable()
    {
        hasGrazed = false;
    }

    void Update()
    {
        transform.position += (Vector3)(velocity * Time.deltaTime);

        // Dynamically find the player target (prioritize PlayerSoul, fallback to any tagged Player like the UFO)
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

        if (playerTarget == null) return;

        float dist = Vector2.Distance(transform.position, playerTarget.position);

        // Graze logic
        if (dist < grazeRadius && dist > hitRadius && !hasGrazed)
        {
            hasGrazed = true;
            if (ScoreManager.Instance != null)
            {
                ScoreManager.Instance.AddGraze();
            }
        }

        // Hit logic
        if (dist < hitRadius)
        {
            PlayerSoul soul = playerTarget.GetComponent<PlayerSoul>();
            if (soul != null)
            {
                soul.TakeDamage(damage);
            }
            else
            {
                UFOController ufo = playerTarget.GetComponent<UFOController>();
                if (ufo != null)
                {
                    ufo.TakeDamage(damage);
                }
            }

            Destroy(gameObject);
            return;
        }

        // Off-screen cleanup
        if (BattleBox.Instance != null)
        {
            if (!BattleBox.Instance.IsNearBox(transform.position, 3f))
            {
                if (BulletPool.Instance != null)
                {
                    BulletPool.Instance.Return(gameObject);
                }
                else
                {
                    Destroy(gameObject);
                }
            }
        }
        else
        {
            // Fallback: cleanup if too far from the screen center
            if (Vector2.Distance(transform.position, Vector2.zero) > 25f)
            {
                if (BulletPool.Instance != null)
                {
                    BulletPool.Instance.Return(gameObject);
                }
                else
                {
                    Destroy(gameObject);
                }
            }
        }
    }
}
