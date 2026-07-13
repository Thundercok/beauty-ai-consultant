using UnityEngine;

public class BattleBox : MonoBehaviour
{
    public static BattleBox Instance { get; private set; }
    
    [Header("Size Settings")]
    [SerializeField] private Vector2 _size = new Vector2(8.5f, 2.5f); // Current width, height in units
    [SerializeField] private float _morphSpeed = 10f;

    [Header("References")]
    [SerializeField] private LineRenderer _lineRenderer;

    private Vector2 _targetSize = new Vector2(8.5f, 2.5f);
    private Vector2 _center;

    // Public Properties
    public Vector2 Size
    {
        get => _size;
        set => _size = value;
    }

    public Vector2 TargetSize
    {
        get => _targetSize;
        set => _targetSize = value;
    }

    public float MorphSpeed => _morphSpeed;
    
    // Dynamic Center matches the visual center of the morphed box (shifting up when height expands)
    public Vector2 Center => new Vector2(_center.x, _center.y - 1.25f + _size.y / 2f);

    private void Awake()
    {
        if (Instance == null)
        {
            Instance = this;
        }
        else
        {
            Destroy(gameObject);
            return;
        }

        _center = transform.position;
        _targetSize = _size;

        if (_lineRenderer == null)
        {
            _lineRenderer = GetComponent<LineRenderer>();
            if (_lineRenderer == null)
            {
                _lineRenderer = gameObject.AddComponent<LineRenderer>();
            }
        }

        SetupLineRenderer();
    }

    private void Start()
    {
        RedrawBox();
    }

    private void Update()
    {
        // Smoothly morph size towards target size
        if (Vector2.Distance(_size, _targetSize) > 0.01f)
        {
            _size = Vector2.Lerp(_size, _targetSize, Time.deltaTime * _morphSpeed);
            RedrawBox();
        }
    }

    private void SetupLineRenderer()
    {
        if (_lineRenderer == null) return;

        _lineRenderer.startWidth = 0.08f;
        _lineRenderer.endWidth = 0.08f;
        _lineRenderer.useWorldSpace = true;
        _lineRenderer.loop = true;
        _lineRenderer.positionCount = 4;

        // Simple default sprite shader for clean drawing
        Shader shader = Shader.Find("Universal Render Pipeline/2D/Sprite-Unlit-Default");
        if (shader == null) shader = Shader.Find("Sprites/Default");
        _lineRenderer.material = new Material(shader);
        _lineRenderer.startColor = Color.white;
        _lineRenderer.endColor = Color.white;
    }

    public void RedrawBox()
    {
        if (_lineRenderer == null) return;

        float halfW = _size.x / 2f;
        float bottomY = _center.y - 1.25f; // Keep bottom edge fixed at Y = 1.25
        float topY = bottomY + _size.y;

        Vector3[] corners = new Vector3[4] {
            new Vector3(_center.x - halfW, bottomY, 0),
            new Vector3(_center.x - halfW, topY, 0),
            new Vector3(_center.x + halfW, topY, 0),
            new Vector3(_center.x + halfW, bottomY, 0)
        };
        _lineRenderer.SetPositions(corners);
    }

    public Vector2 ClampToBox(Vector2 pos)
    {
        float halfW = _size.x / 2f - 0.12f; // Subtract soul half-size margin
        float bottomY = _center.y - 1.25f + 0.12f;
        float topY = _center.y - 1.25f + _size.y - 0.12f;
        return new Vector2(
            Mathf.Clamp(pos.x, _center.x - halfW, _center.x + halfW),
            Mathf.Clamp(pos.y, bottomY, topY)
        );
    }

    public Vector2 RandomEdgePoint()
    {
        float halfW = _size.x / 2f;
        float bottomY = _center.y - 1.25f;
        float topY = bottomY + _size.y;
        int edge = Random.Range(0, 4); // 0=top, 1=bottom, 2=left, 3=right

        switch (edge)
        {
            case 0: return new Vector2(Random.Range(_center.x - halfW, _center.x + halfW), topY);
            case 1: return new Vector2(Random.Range(_center.x - halfW, _center.x + halfW), bottomY);
            case 2: return new Vector2(_center.x - halfW, Random.Range(bottomY, topY));
            default: return new Vector2(_center.x + halfW, Random.Range(bottomY, topY));
        }
    }

    public bool IsNearBox(Vector2 pos, float margin)
    {
        float halfW = _size.x / 2f + margin;
        float bottomY = _center.y - 1.25f - margin;
        float topY = _center.y - 1.25f + _size.y + margin;
        return pos.x > _center.x - halfW && pos.x < _center.x + halfW &&
               pos.y > bottomY && pos.y < topY;
    }

    private void OnDrawGizmos()
    {
        float bottomY = transform.position.y - 1.25f;
        Gizmos.color = Color.white;
        Gizmos.DrawWireCube(new Vector3(transform.position.x, bottomY + _size.y / 2f, 0), _size);
    }
}
