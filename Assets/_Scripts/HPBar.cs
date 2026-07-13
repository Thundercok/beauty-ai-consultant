using UnityEngine;
using UnityEngine.UI;
using TMPro;

public class HPBar : MonoBehaviour
{
    public static HPBar Instance { get; private set; }

    [Header("UI References")]
    [SerializeField] private Image _fillBar;
    [SerializeField] private TextMeshProUGUI _statsText; // Renders e.g. "CHARA   LV 1   HP"
    [SerializeField] private TextMeshProUGUI _hpNumbersText; // Renders e.g. "20 / 20"

    [Header("Settings")]
    [SerializeField] private float _lerpSpeed = 5f;

    private float _targetFill = 1f;

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

        if (_fillBar != null)
        {
            // Set colors to Undertale standard: Yellow for health, dark red for background
            _fillBar.color = Color.yellow;
            
            Image bgBar = GetComponent<Image>();
            if (bgBar != null)
            {
                bgBar.color = new Color(0.7f, 0f, 0f); // Dark red background
            }
        }
    }

    private void Update()
    {
        if (_fillBar != null)
        {
            _fillBar.fillAmount = Mathf.Lerp(_fillBar.fillAmount, _targetFill, Time.deltaTime * _lerpSpeed);
        }
    }

    public void OnDamageTaken(int currentHP, int maxHP)
    {
        if (maxHP <= 0) return;
        _targetFill = (float)currentHP / maxHP;
        _targetFill = Mathf.Clamp01(_targetFill);

        // Update name, LV, HP, and Graze/Score text
        if (_statsText != null)
        {
            int score = ScoreManager.Instance != null ? ScoreManager.Instance.grazeCount : 0;
            _statsText.text = $"CHARA   LV 1   HP   (GRAZE: {score})";
        }

        if (_hpNumbersText != null)
        {
            _hpNumbersText.text = $"{currentHP} / {maxHP}";
        }
    }

    // Properties for editor setup script to assign dynamically if needed
    public Image FillBar
    {
        get => _fillBar;
        set => _fillBar = value;
    }

    public TextMeshProUGUI StatsText
    {
        get => _statsText;
        set => _statsText = value;
    }

    public TextMeshProUGUI HPNumbersText
    {
        get => _hpNumbersText;
        set => _hpNumbersText = value;
    }
}
