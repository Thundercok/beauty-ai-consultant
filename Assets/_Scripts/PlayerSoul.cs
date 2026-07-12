using UnityEngine;
using UnityEngine.SceneManagement;

public class PlayerSoul : MonoBehaviour
{
    public static PlayerSoul Instance;
    public float speed = 5f;
    public int maxHP = 20;
    public int currentHP;

    [Header("Survival Settings")]
    public float survivalTime = 20f;
    private bool isWon = false;

    void Awake()
    {
        Instance = this;
        currentHP = maxHP;

        // Automatically assign tag so bullet spawner and bullets can find it
        gameObject.tag = "Player";

        // Dynamically add SpriteRenderer and assign a generated heart sprite if none exists
        SpriteRenderer sr = GetComponent<SpriteRenderer>();
        if (sr == null)
        {
            sr = gameObject.AddComponent<SpriteRenderer>();
            sr.sprite = CreateHeartSprite();
            sr.sortingOrder = 10; // Draw on top
        }
    }

    void Start()
    {
        // Initialize HP Bar if it exists in the scene
        if (HPBar.Instance != null)
        {
            HPBar.Instance.OnDamageTaken(currentHP, maxHP);
        }
        UpdateSurvivalUI();
    }

    void Update()
    {
        if (isWon)
        {
            if (Input.GetKeyDown(KeyCode.R))
            {
                SceneManager.LoadScene(SceneManager.GetActiveScene().name);
            }
            return;
        }

        Vector2 input = new Vector2(Input.GetAxisRaw("Horizontal"), Input.GetAxisRaw("Vertical"));
        Vector2 nextPos = (Vector2)transform.position + input * speed * Time.deltaTime;

        if (BattleBox.Instance != null)
        {
            transform.position = BattleBox.Instance.ClampToBox(nextPos);
            
            // Survival countdown ticks down while in the BattleBox
            survivalTime -= Time.deltaTime;
            if (survivalTime <= 0f)
            {
                WinSurvival();
            }
            else
            {
                UpdateSurvivalUI();
            }
        }
        else
        {
            transform.position = nextPos;
        }
    }

    public void TakeDamage(int dmg)
    {
        if (isWon) return;

        currentHP -= dmg;
        if (HPBar.Instance != null)
        {
            HPBar.Instance.OnDamageTaken(currentHP, maxHP);
        }

        if (currentHP <= 0)
        {
            GameOver();
        }
    }

    void UpdateSurvivalUI()
    {
        if (UIManager.Instance != null && UIManager.Instance.grazeText != null)
        {
            int grazeCount = ScoreManager.Instance != null ? ScoreManager.Instance.grazeCount : 0;
            UIManager.Instance.grazeText.text = $"Graze: {grazeCount} | Survive: {Mathf.CeilToInt(survivalTime)}s";
        }
    }

    void WinSurvival()
    {
        isWon = true;
        Debug.Log("Survival Victory!");
        if (UIManager.Instance != null && UIManager.Instance.grazeText != null)
        {
            UIManager.Instance.grazeText.text = "VICTORY! You survived! Press R to Restart.";
        }
    }

    void GameOver()
    {
        Debug.Log("Player Soul Died! Reloading Scene.");
        SceneManager.LoadScene(SceneManager.GetActiveScene().name);
    }

    Sprite CreateHeartSprite()
    {
        Texture2D tex = new Texture2D(16, 16);
        tex.filterMode = FilterMode.Point;
        
        // 16x16 pixel heart grid (0 = transparent, 1 = red)
        int[,] heartGrid = new int[16, 16] {
            {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},
            {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},
            {0,0,1,1,1,0,0,0,0,0,1,1,1,0,0,0},
            {0,1,1,1,1,1,0,0,0,1,1,1,1,1,0,0},
            {0,1,1,1,1,1,1,0,1,1,1,1,1,1,0,0},
            {0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0},
            {0,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0},
            {0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0},
            {0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0},
            {0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0},
            {0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0},
            {0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0},
            {0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0},
            {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},
            {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},
            {0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0}
        };

        for (int y = 0; y < 16; y++)
        {
            for (int x = 0; x < 16; x++)
            {
                int gridVal = heartGrid[15 - y, x];
                tex.SetPixel(x, y, gridVal == 1 ? Color.red : Color.clear);
            }
        }
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, 16, 16), new Vector2(0.5f, 0.5f), 16f);
    }
}
