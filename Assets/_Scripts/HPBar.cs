using UnityEngine;
using UnityEngine.UI;
using TMPro;

public class HPBar : MonoBehaviour
{
    public static HPBar Instance;

    public Image fillBar;
    public TextMeshProUGUI statsText; // Renders e.g. "CHARA   LV 1   HP"
    public TextMeshProUGUI hpNumbersText; // Renders e.g. "20 / 20"

    private float targetFill = 1f;
    private float lerpSpeed = 5f;

    void Awake()
    {
        Instance = this;

        if (fillBar != null)
        {
            if (fillBar.sprite == null)
            {
                fillBar.sprite = CreateWhiteSprite();
            }
            
            // Set colors to Undertale standard: Yellow for health, dark red for background
            fillBar.color = Color.yellow;
            
            Image bgBar = GetComponent<Image>();
            if (bgBar != null)
            {
                bgBar.color = new Color(0.7f, 0f, 0f); // Dark red background
            }
        }
    }

    public void OnDamageTaken(int currentHP, int maxHP)
    {
        if (maxHP <= 0) return;
        targetFill = (float)currentHP / maxHP;
        targetFill = Mathf.Clamp01(targetFill);

        // Update name, LV and HP text
        if (statsText != null)
        {
            statsText.text = "CHARA   LV 1      HP";
        }

        if (hpNumbersText != null)
        {
            hpNumbersText.text = $"{currentHP} / {maxHP}";
        }
    }

    void Update()
    {
        if (fillBar != null)
        {
            fillBar.fillAmount = Mathf.Lerp(fillBar.fillAmount, targetFill, Time.deltaTime * lerpSpeed);
        }
    }

    private Sprite CreateWhiteSprite()
    {
        Texture2D tex = new Texture2D(2, 2);
        for (int y = 0; y < 2; y++)
        {
            for (int x = 0; x < 2; x++)
            {
                tex.SetPixel(x, y, Color.white);
            }
        }
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, 2, 2), new Vector2(0.5f, 0.5f), 100f);
    }
}
