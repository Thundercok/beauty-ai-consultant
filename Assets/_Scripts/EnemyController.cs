using UnityEngine;

public class EnemyController : MonoBehaviour
{
    public float speed = 3f;
    private Transform target;

    void Start()
    {
        FindPlayerTarget();
    }

    void Update()
    {
        if (target == null)
        {
            FindPlayerTarget();
            if (target == null) return;
        }

        Vector2 dir = (target.position - transform.position).normalized;
        transform.position += (Vector3)(dir * speed * Time.deltaTime);
    }

    void FindPlayerTarget()
    {
        if (PlayerSoul.Instance != null)
        {
            target = PlayerSoul.Instance.transform;
        }
        else
        {
            GameObject playerObj = GameObject.FindGameObjectWithTag("Player");
            if (playerObj != null)
            {
                target = playerObj.transform;
            }
        }
    }
}
