using UnityEngine;
using UnityEngine.SceneManagement;
using System.Collections;

public class PlayerSoul : MonoBehaviour
{
    public static PlayerSoul Instance;
    
    [Header("Movement")]
    public float speed = 4f;
    private bool isMenuSnappingMode = true;

    [Header("Stats")]
    public int maxHP = 20;
    public int currentHP;

    private SpriteRenderer spriteRenderer;
    private bool isInvulnerable = false;
    public float invulnDuration = 1.0f;

    void Awake()
    {
        Instance = this;
        currentHP = maxHP;

        // Automatically assign tag
        gameObject.tag = "Player";

        spriteRenderer = GetComponent<SpriteRenderer>();
        if (spriteRenderer == null)
        {
            spriteRenderer = gameObject.AddComponent<SpriteRenderer>();
            spriteRenderer.sprite = CreateHeartSprite();
            spriteRenderer.sortingOrder = 10; // Draw on top of box
        }
    }

    void Start()
    {
        UpdateHPUI();
    }

    void Update()
    {
        // In GameOver or Victory states, ignore free movement
        if (UndertaleBattleManager.Instance != null && 
            (UndertaleBattleManager.Instance.currentState == UndertaleBattleManager.BattleState.GameOver ||
             UndertaleBattleManager.Instance.currentState == UndertaleBattleManager.BattleState.Victory))
        {
            // If Game Over, check for manual reload key 'R'
            if (UndertaleBattleManager.Instance.currentState == UndertaleBattleManager.BattleState.GameOver)
            {
                if (Input.GetKeyDown(KeyCode.R))
                {
                    SceneManager.LoadScene(SceneManager.GetActiveScene().name);
                }
            }
            return;
        }

        // If in menu mode, input is handled by UndertaleBattleManager snapping
        if (isMenuSnappingMode) return;

        // Free movement in Dodge Mode (Arrow keys & WASD)
        float moveX = 0f;
        float moveY = 0f;

        if (Input.GetKey(KeyCode.LeftArrow) || Input.GetKey(KeyCode.A)) moveX = -1f;
        else if (Input.GetKey(KeyCode.RightArrow) || Input.GetKey(KeyCode.D)) moveX = 1f;

        if (Input.GetKey(KeyCode.UpArrow) || Input.GetKey(KeyCode.W)) moveY = 1f;
        else if (Input.GetKey(KeyCode.DownArrow) || Input.GetKey(KeyCode.S)) moveY = -1f;

        Vector2 direction = new Vector2(moveX, moveY);
        if (direction.magnitude > 0.01f)
        {
            // Snappy movement (constant speed, even diagonally)
            direction.Normalize();
            Vector2 nextPos = (Vector2)transform.position + direction * speed * Time.deltaTime;

            if (BattleBox.Instance != null)
            {
                transform.position = BattleBox.Instance.ClampToBox(nextPos);
            }
            else
            {
                transform.position = nextPos;
            }
        }
    }

    public void SetMenuSnappingMode(bool enabled)
    {
        isMenuSnappingMode = enabled;
        // Make soul heart color red (normal) or transparent if hidden (e.g. FightExecute)
        if (spriteRenderer != null)
        {
            spriteRenderer.enabled = true;
            spriteRenderer.color = Color.red;
        }
    }

    public void TakeDamage(int dmg)
    {
        if (isInvulnerable) return;
        
        // If in victory/game over, ignore
        if (UndertaleBattleManager.Instance != null && 
            (UndertaleBattleManager.Instance.currentState == UndertaleBattleManager.BattleState.Victory ||
             UndertaleBattleManager.Instance.currentState == UndertaleBattleManager.BattleState.GameOver))
        {
            return;
        }

        currentHP -= dmg;
        if (currentHP < 0) currentHP = 0;

        UpdateHPUI();

        // Play procedural hurt audio
        if (RetroSoundGenerator.Instance != null)
        {
            RetroSoundGenerator.Instance.PlayHurt();
        }

        if (currentHP <= 0)
        {
            Die();
        }
        else
        {
            StartCoroutine(FlashInvulnerableRoutine());
        }
    }

    public void Heal(int amt)
    {
        currentHP += amt;
        if (currentHP > maxHP) currentHP = maxHP;
        UpdateHPUI();
    }

    private void UpdateHPUI()
    {
        if (HPBar.Instance != null)
        {
            HPBar.Instance.OnDamageTaken(currentHP, maxHP);
        }
    }

    private void Die()
    {
        if (UndertaleBattleManager.Instance != null)
        {
            UndertaleBattleManager.Instance.TriggerGameOver();
        }
        // Change color to fractured grey or disable renderer
        if (spriteRenderer != null)
        {
            spriteRenderer.color = Color.gray;
        }
    }

    private IEnumerator FlashInvulnerableRoutine()
    {
        isInvulnerable = true;
        float elapsed = 0f;
        bool visible = true;

        while (elapsed < invulnDuration)
        {
            visible = !visible;
            if (spriteRenderer != null)
            {
                spriteRenderer.color = visible ? Color.red : new Color(1, 0, 0, 0.2f);
            }
            yield return new WaitForSeconds(0.08f);
            elapsed += 0.08f;
        }

        if (spriteRenderer != null)
        {
            spriteRenderer.color = Color.red;
        }
        isInvulnerable = false;
    }

    Sprite CreateHeartSprite()
    {
        Texture2D tex = new Texture2D(16, 16);
        tex.filterMode = FilterMode.Point;
        
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
                tex.SetPixel(x, y, gridVal == 1 ? Color.white : Color.clear); // Create white texture so sprite color is easily tinted
            }
        }
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, 16, 16), new Vector2(0.5f, 0.5f), 16f);
    }
}
