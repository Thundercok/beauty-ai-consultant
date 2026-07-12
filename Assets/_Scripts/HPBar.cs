using UnityEngine;
using UnityEngine.UI;

public class HPBar : MonoBehaviour
{
    public static HPBar Instance;

    public Image fillBar;
    private float targetFill = 1f;
    private float lerpSpeed = 3f;

    void Awake()
    {
        Instance = this;

        // In Unity, a Filled Image MUST have a sprite assigned,
        // otherwise the fillAmount property is ignored and it stays 100% filled.
        if (fillBar != null && fillBar.sprite == null)
        {
            fillBar.sprite = CreateWhiteSprite();
        }
    }

    public void OnDamageTaken(int currentHP, int maxHP)
    {
        if (maxHP <= 0) return;
        targetFill = (float)currentHP / maxHP;
        targetFill = Mathf.Clamp01(targetFill);
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
