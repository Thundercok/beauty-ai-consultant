using UnityEngine;
using TMPro;

public class UndertalePickup : MonoBehaviour
{
    public enum PickupType { Heal, Shield }

    [Header("Type Settings")]
    public PickupType type = PickupType.Heal;

    [Header("Stats Settings")]
    [SerializeField] private int _scoreValue = 15; // Score for shield pickup
    [SerializeField] private int _healAmount = 5;  // Heal for health pickup
    [SerializeField] private float _shieldDuration = 2.0f;

    private bool _isCollected = false;
    private SpriteRenderer _spriteRenderer;

    private void Start()
    {
        _spriteRenderer = GetComponent<SpriteRenderer>();
        if (_spriteRenderer != null)
        {
            // Tint the rotating UFO pickup green for healing, or yellow/gold for shield!
            _spriteRenderer.color = (type == PickupType.Heal) ? Color.green : Color.yellow;
        }
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        if (_isCollected) return;

        if (other.CompareTag("Player"))
        {
            _isCollected = true;

            if (type == PickupType.Heal)
            {
                // 1. Heal player soul
                if (PlayerSoul.Instance != null)
                {
                    PlayerSoul.Instance.Heal(_healAmount);
                }

                // 2. Play sound
                if (SoundManager.Instance != null)
                {
                    SoundManager.Instance.PlaySelect();
                }

                // 3. Floating text
                CreateFloatingText($"+{_healAmount} HP", transform.position, Color.green);
            }
            else if (type == PickupType.Shield)
            {
                // 1. Add score / graze points
                if (ScoreManager.Instance != null)
                {
                    for (int i = 0; i < _scoreValue; i++)
                    {
                        ScoreManager.Instance.AddGraze();
                    }
                }

                // 2. Trigger invulnerability shield
                if (PlayerSoul.Instance != null)
                {
                    PlayerSoul.Instance.TriggerShield(_shieldDuration);
                }

                // 3. Play sound
                if (SoundManager.Instance != null)
                {
                    SoundManager.Instance.PlaySelect();
                }

                // 4. Floating text
                CreateFloatingText($"+{_scoreValue} GRAZE & SHIELD!", transform.position, Color.yellow);
            }

            // Destroy self
            Destroy(gameObject);
        }
    }

    private void CreateFloatingText(string text, Vector3 position, Color color)
    {
        GameObject go = new GameObject("FloatingText");
        go.transform.position = position + Vector3.up * 0.5f;

        Canvas canvas = FindFirstObjectByType<Canvas>();
        if (canvas != null)
        {
            go.transform.SetParent(canvas.transform, true);
        }

        TextMeshProUGUI tmp = go.AddComponent<TextMeshProUGUI>();
        tmp.text = text;
        tmp.color = color;
        tmp.fontSize = 20;
        tmp.fontStyle = FontStyles.Bold;
        tmp.alignment = TextAlignmentOptions.Center;

        RectTransform rt = go.GetComponent<RectTransform>();
        if (rt != null)
        {
            rt.sizeDelta = new Vector2(250, 40);
        }

        // Float up and destroy routine
        StartCoroutine(FloatAndDestroy(go, tmp));
    }

    private System.Collections.IEnumerator FloatAndDestroy(GameObject go, TextMeshProUGUI text)
    {
        float duration = 0.8f;
        float elapsed = 0f;
        while (elapsed < duration)
        {
            if (go == null || text == null) yield break;
            elapsed += Time.deltaTime;
            go.transform.position += Vector3.up * Time.deltaTime * 0.6f;
            text.color = new Color(text.color.r, text.color.g, text.color.b, 1f - (elapsed / duration));
            yield return null;
        }
        Destroy(go);
    }
}
