using UnityEngine;
using TMPro;
using UnityEngine.SceneManagement;

public class UFOController : MonoBehaviour
{
    public static UFOController Instance;

    [Header("Movement Settings")]
    public float speed = 10;
    private Rigidbody2D rb;

    [Header("Gameplay Variables")]
    public int score = 0;
    public int requiredCoinsToWin = 15;
    public float timeRemaining = 60f;
    private bool isGameOver = false;

    [Header("Health Settings")]
    public int maxHP = 20;
    public int currentHP;

    [Header("UI References")]
    public TextMeshProUGUI scoreText;
    public TextMeshProUGUI timerText;

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
        currentHP = maxHP;
        UpdateUI();

        // Initialize HP Bar UI if it exists in the scene
        if (HPBar.Instance != null)
        {
            HPBar.Instance.OnDamageTaken(currentHP, maxHP);
        }
    }

    void Update()
    {
        if (isGameOver)
        {
            if (Input.GetKeyDown(KeyCode.R))
                SceneManager.LoadScene(SceneManager.GetActiveScene().name);
            return;
        }

        float h = Input.GetAxis("Horizontal");
        float v = Input.GetAxis("Vertical");
        rb.AddForce(new Vector2(h, v) * speed);

        CalculateTimer();
    }

    void CalculateTimer()
    {
        if (timeRemaining > 0)
        {
            timeRemaining -= Time.deltaTime;
            UpdateUI();
        }
        else
        {
            timeRemaining = 0;
            CheckEndGameConditions();
        }
    }

    void UpdateUI()
    {
        if (scoreText != null)
        {
            scoreText.text = "Coins: " + score + " / " + requiredCoinsToWin;
        }
        if (timerText != null)
        {
            timerText.text = "Time: " + Mathf.CeilToInt(timeRemaining) + "s";
        }
    }

    public void TakeDamage(int dmg)
    {
        if (isGameOver) return;

        currentHP -= dmg;
        if (HPBar.Instance != null)
        {
            HPBar.Instance.OnDamageTaken(currentHP, maxHP);
        }

        if (currentHP <= 0)
        {
            currentHP = 0;
            PlayerDied();
        }
    }

    void OnTriggerEnter2D(Collider2D other)
    {
        if (isGameOver) return;

        if (other.CompareTag("Pickup"))
        {
            float randomX = Random.Range(-12f, 12f);
            float randomY = Random.Range(-12f, 12f);
            other.transform.position = new Vector3(randomX, randomY, 0f);

            score++;
            UpdateUI();
        }

        if (other.CompareTag("Enemy"))
        {
            TakeDamage(5); // Deduct 5 HP on contact with an enemy
        }
    }

    void CheckEndGameConditions()
    {
        isGameOver = true;
        if (rb != null)
        {
            rb.linearVelocity = Vector2.zero;
        }

        if (score >= requiredCoinsToWin)
        {
            if (scoreText != null) scoreText.text = "VICTORY! Clean run.";
            if (timerText != null) timerText.text = "Press R to Restart";
        }
        else
        {
            if (scoreText != null) scoreText.text = "FAILED! Not enough coins.";
            if (timerText != null) timerText.text = "Press R to Retry";
        }
    }

    public void PlayerDied()
    {
        isGameOver = true;
        if (rb != null)
        {
            rb.linearVelocity = Vector2.zero;
        }
        if (scoreText != null) scoreText.text = "WASTED! You died.";
        if (timerText != null) timerText.text = "Press R to Retry";
    }
}
