using UnityEngine;
using System.Collections.Generic;

public class BulletPool : MonoBehaviour
{
    public static BulletPool Instance
    {
        get
        {
            if (_instance == null)
            {
                _instance = FindFirstObjectByType<BulletPool>();
                if (_instance == null)
                {
                    GameObject g = new GameObject("BulletPool");
                    _instance = g.AddComponent<BulletPool>();
                }
            }
            return _instance;
        }
    }
    private static BulletPool _instance;

    [Header("Pool Settings")]
    public GameObject bulletPrefab;
    public int initialPoolSize = 50;

    private Queue<GameObject> pool = new Queue<GameObject>();

    void Awake()
    {
        if (_instance == null)
        {
            _instance = this;
        }
        else if (_instance != this)
        {
            Destroy(gameObject);
            return;
        }
    }

    void Start()
    {
        for (int i = 0; i < initialPoolSize; i++)
        {
            GameObject obj = CreateNewBullet();
            if (obj != null)
            {
                obj.SetActive(false);
                pool.Enqueue(obj);
            }
        }
    }

    public GameObject Get(Vector2 position)
    {
        GameObject obj = null;
        if (pool.Count > 0)
        {
            obj = pool.Dequeue();
            // Safety check in case the object was destroyed externally
            while (obj == null && pool.Count > 0)
            {
                obj = pool.Dequeue();
            }
        }

        if (obj == null)
        {
            obj = CreateNewBullet();
        }

        if (obj != null)
        {
            obj.transform.position = position;
            obj.SetActive(true);
        }
        return obj;
    }

    public void Return(GameObject obj)
    {
        if (obj == null) return;
        obj.SetActive(false);
        pool.Enqueue(obj);
    }

    private GameObject CreateNewBullet()
    {
        if (bulletPrefab != null)
        {
            return Instantiate(bulletPrefab);
        }
        else
        {
            return CreateDefaultBulletPrefab();
        }
    }

    private GameObject CreateDefaultBulletPrefab()
    {
        GameObject obj = new GameObject("DefaultBullet");
        
        // Sprite Renderer setup
        SpriteRenderer sr = obj.AddComponent<SpriteRenderer>();
        sr.sortingOrder = 5; // Render on top

        // Generate 16x16 circle texture programmatically
        Texture2D tex = new Texture2D(16, 16);
        tex.filterMode = FilterMode.Point;
        for (int y = 0; y < 16; y++)
        {
            for (int x = 0; x < 16; x++)
            {
                float dist = Vector2.Distance(new Vector2(x, y), new Vector2(7.5f, 7.5f));
                tex.SetPixel(x, y, dist <= 7.5f ? Color.red : Color.clear);
            }
        }
        tex.Apply();
        
        sr.sprite = Sprite.Create(tex, new Rect(0, 0, 16, 16), new Vector2(0.5f, 0.5f), 16f); // 16 pixels per unit

        // Collider setup
        CircleCollider2D col = obj.AddComponent<CircleCollider2D>();
        col.radius = 0.15f;
        col.isTrigger = true;

        // Bullet script setup
        Bullet b = obj.AddComponent<Bullet>();
        b.hitRadius = 0.15f;
        b.grazeRadius = 0.6f;
        b.damage = 1;

        return obj;
    }
}
