using UnityEngine;

public class BattleBox : MonoBehaviour
{
    public static BattleBox Instance;
    
    [Header("Size Settings")]
    public Vector2 size = new Vector2(8.5f, 2.5f); // Current width, height in units
    public Vector2 targetSize = new Vector2(8.5f, 2.5f);
    public float morphSpeed = 10f;
    public Vector2 center;

    private LineRenderer lineRenderer;

    void Awake()
    {
        Instance = this;
        center = transform.position;
        targetSize = size;

        lineRenderer = GetComponent<LineRenderer>();
        if (lineRenderer == null)
        {
            lineRenderer = gameObject.AddComponent<LineRenderer>();
        }

        SetupLineRenderer();
    }

    void Start()
    {
        RedrawBox();
    }

    void Update()
    {
        // Smoothly morph size towards target size
        if (Vector2.Distance(size, targetSize) > 0.01f)
        {
            size = Vector2.Lerp(size, targetSize, Time.deltaTime * morphSpeed);
            RedrawBox();
        }
    }

    private void SetupLineRenderer()
    {
        lineRenderer.startWidth = 0.08f;
        lineRenderer.endWidth = 0.08f;
        lineRenderer.useWorldSpace = true;
        lineRenderer.loop = true;
        lineRenderer.positionCount = 4;

        // Simple default sprite shader for clean drawing
        lineRenderer.material = new Material(Shader.Find("Sprites/Default"));
        lineRenderer.startColor = Color.white;
        lineRenderer.endColor = Color.white;
    }

    public void RedrawBox()
    {
        if (lineRenderer == null) return;

        float halfW = size.x / 2f;
        float halfH = size.y / 2f;

        Vector3[] corners = new Vector3[4] {
            new Vector3(center.x - halfW, center.y - halfH, 0),
            new Vector3(center.x - halfW, center.y + halfH, 0),
            new Vector3(center.x + halfW, center.y + halfH, 0),
            new Vector3(center.x + halfW, center.y - halfH, 0)
        };
        lineRenderer.SetPositions(corners);
    }

    public Vector2 ClampToBox(Vector2 pos)
    {
        float halfW = size.x / 2f - 0.15f; // Subtract soul half-size margin
        float halfH = size.y / 2f - 0.15f;
        return new Vector2(
            Mathf.Clamp(pos.x, center.x - halfW, center.x + halfW),
            Mathf.Clamp(pos.y, center.y - halfH, center.y + halfH)
        );
    }

    public Vector2 RandomEdgePoint()
    {
        float halfW = size.x / 2f;
        float halfH = size.y / 2f;
        int edge = Random.Range(0, 4); // 0=top, 1=bottom, 2=left, 3=right

        switch (edge)
        {
            case 0: return new Vector2(Random.Range(center.x - halfW, center.x + halfW), center.y + halfH);
            case 1: return new Vector2(Random.Range(center.x - halfW, center.x + halfW), center.y - halfH);
            case 2: return new Vector2(center.x - halfW, Random.Range(center.y - halfH, center.y + halfH));
            default: return new Vector2(center.x + halfW, Random.Range(center.y - halfH, center.y + halfH));
        }
    }

    public bool IsNearBox(Vector2 pos, float margin)
    {
        float halfW = size.x / 2f + margin;
        float halfH = size.y / 2f + margin;
        return pos.x > center.x - halfW && pos.x < center.x + halfW &&
               pos.y > center.y - halfH && pos.y < center.y + halfH;
    }

    void OnDrawGizmos()
    {
        Gizmos.color = Color.white;
        Gizmos.DrawWireCube(transform.position, size);
    }
}
