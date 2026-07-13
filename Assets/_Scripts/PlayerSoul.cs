using UnityEngine;
using UnityEngine.SceneManagement;
using System.Collections;

public class PlayerSoul : MonoBehaviour
{
    public static PlayerSoul Instance { get; private set; }
    
    [Header("Movement Settings")]
    [SerializeField] private float _speed = 4f;
    [SerializeField] private float _invulnDuration = 1.0f;

    [Header("Stats Settings")]
    [SerializeField] private int _maxHP = 20;

    private int _currentHP;
    private bool _isMenuSnappingMode = true;
    private bool _isInvulnerable = false;
    private SpriteRenderer _spriteRenderer;

    // Public Properties
    public float Speed => _speed;
    public int MaxHP => _maxHP;
    public int CurrentHP => _currentHP;
    public bool IsMenuSnappingMode => _isMenuSnappingMode;

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

        _currentHP = _maxHP;

        // Automatically assign tag
        gameObject.tag = "Player";

        _spriteRenderer = GetComponent<SpriteRenderer>();
        if (_spriteRenderer == null)
        {
            _spriteRenderer = gameObject.AddComponent<SpriteRenderer>();
        }
        _spriteRenderer.sortingOrder = 100; // Draw on top of box and Canvas UI
    }

    private void Start()
    {
        UpdateHPUI();
    }

    private void Update()
    {
        // In GameOver or Victory states, ignore free movement
        if (UndertaleBattleManager.Instance != null && 
            (UndertaleBattleManager.Instance.CurrentState == UndertaleBattleManager.BattleState.GameOver ||
             UndertaleBattleManager.Instance.CurrentState == UndertaleBattleManager.BattleState.Victory))
        {
            // If Game Over, check for manual reload key 'R'
            if (UndertaleBattleManager.Instance.CurrentState == UndertaleBattleManager.BattleState.GameOver)
            {
                if (Input.GetKeyDown(KeyCode.R))
                {
                    SceneManager.LoadScene(SceneManager.GetActiveScene().name);
                }
            }
            return;
        }

        // If in menu mode, input is handled by UndertaleBattleManager snapping
        if (_isMenuSnappingMode) return;

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
            Vector2 nextPos = (Vector2)transform.position + direction * _speed * Time.deltaTime;

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
        _isMenuSnappingMode = enabled;
        // Make soul heart color red (normal) or transparent if hidden (e.g. FightExecute)
        if (_spriteRenderer != null)
        {
            _spriteRenderer.enabled = true;
            _spriteRenderer.color = Color.red;
        }
    }

    public void TakeDamage(int dmg)
    {
        if (_isInvulnerable) return;
        
        // If in victory/game over, ignore
        if (UndertaleBattleManager.Instance != null && 
            (UndertaleBattleManager.Instance.CurrentState == UndertaleBattleManager.BattleState.Victory ||
             UndertaleBattleManager.Instance.CurrentState == UndertaleBattleManager.BattleState.GameOver))
        {
            return;
        }

        _currentHP -= dmg;
        if (_currentHP < 0) _currentHP = 0;

        UpdateHPUI();

        // Play hurt audio
        if (SoundManager.Instance != null)
        {
            SoundManager.Instance.PlayHurt();
        }

        if (_currentHP <= 0)
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
        _currentHP += amt;
        if (_currentHP > _maxHP) _currentHP = _maxHP;
        UpdateHPUI();
    }

    private void UpdateHPUI()
    {
        if (HPBar.Instance != null)
        {
            HPBar.Instance.OnDamageTaken(_currentHP, _maxHP);
        }
    }

    private void Die()
    {
        if (UndertaleBattleManager.Instance != null)
        {
            UndertaleBattleManager.Instance.TriggerGameOver();
        }
        // Change color to fractured grey or disable renderer
        if (_spriteRenderer != null)
        {
            _spriteRenderer.color = Color.gray;
        }
    }

    private IEnumerator FlashInvulnerableRoutine()
    {
        _isInvulnerable = true;
        float elapsed = 0f;
        bool visible = true;

        while (elapsed < _invulnDuration)
        {
            visible = !visible;
            if (_spriteRenderer != null)
            {
                _spriteRenderer.color = visible ? Color.red : new Color(1, 0, 0, 0.2f);
            }
            yield return new WaitForSeconds(0.08f);
            elapsed += 0.08f;
        }

        if (_spriteRenderer != null)
        {
            _spriteRenderer.color = Color.red;
        }
        _isInvulnerable = false;
    }

    public void TriggerShield(float duration)
    {
        StartCoroutine(ShieldRoutine(duration));
    }

    private IEnumerator ShieldRoutine(float duration)
    {
        _isInvulnerable = true;
        float elapsed = 0f;
        bool toggle = true;

        while (elapsed < duration)
        {
            toggle = !toggle;
            if (_spriteRenderer != null)
            {
                _spriteRenderer.color = toggle ? Color.yellow : new Color(1f, 0.92f, 0.016f, 0.3f);
            }
            yield return new WaitForSeconds(0.1f);
            elapsed += 0.1f;
        }

        if (_spriteRenderer != null)
        {
            _spriteRenderer.color = Color.red;
        }
        _isInvulnerable = false;
    }
}
