using UnityEngine;

public class BattleBox : MonoBehaviour
{
    public static BattleBox Instance;
    public Vector2 size = new Vector2(4f, 3f); // width, height in units
    public Vector2 center;

    void Awake()
    {
        Instance = this;
        center = transform.position;
    }

    void Start()
    {
        // Dynamically add a LineRenderer to draw the white outline border
        LineRenderer lr = GetComponent<LineRenderer>();
        if (lr == null)
        {
            lr = gameObject.AddComponent<LineRenderer>();
        }

        lr.startWidth = 0.08f;
        lr.endWidth = 0.08f;
        lr.useWorldSpace = true;
        lr.loop = true;
        lr.positionCount = 4;

        // Use a simple sprite default material so we don't need external assets
        lr.material = new Material(Shader.Find("Sprites/Default"));
        lr.startColor = Color.white;
        lr.endColor = Color.white;

        float halfW = size.x / 2f, halfH = size.y / 2f;
        Vector3[] corners = new Vector3[4] {
            new Vector3(center.x - halfW, center.y - halfH, 0),
            new Vector3(center.x - halfW, center.y + halfH, 0),
            new Vector3(center.x + halfW, center.y + halfH, 0),
            new Vector3(center.x + halfW, center.y - halfH, 0)
        };
        lr.SetPositions(corners);
    }

    public Vector2 ClampToBox(Vector2 pos)
    {
        float halfW = size.x / 2f, halfH = size.y / 2f;
        return new Vector2(
            Mathf.Clamp(pos.x, center.x - halfW, center.x + halfW),
            Mathf.Clamp(pos.y, center.y - halfH, center.y + halfH)
        );
    }

    public Vector2 RandomEdgePoint()
    {
        float halfW = size.x / 2f, halfH = size.y / 2f;
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
        float halfW = size.x / 2f + margin, halfH = size.y / 2f + margin;
        return pos.x > center.x - halfW && pos.x < center.x + halfW &&
               pos.y > center.y - halfH && pos.y < center.y + halfH;
    }

    void OnDrawGizmos()
    { // visualize in editor
        Gizmos.color = Color.white;
        Gizmos.DrawWireCube(center, size);
    }
}
