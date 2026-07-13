using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI; // For UI elements like Button, Text, etc.
using TMPro; // Import the TextMeshPro namespace

public class UFOController : MonoBehaviour
{
    public static UFOController Instance;

    //private float speed = 10;
    public float speed = 10;
    Rigidbody2D Rigidbody;

    public TextMeshProUGUI Status_Message; // Status of the game
    int Qty_Pickup = 6; // Initial numbers of Pickup
    public TextMeshProUGUI Disp_Win; // Message for mission complete

    public GameObject TrackTarget; // Pickup(2)

    // Keep compatibility for other systems
    [Header("Compatibility Settings")]
    public int maxHP = 20;
    public int currentHP;
    public float invulnDuration = 1.0f;
    private bool isInvulnerable = false;
    private SpriteRenderer spriteRenderer;

    void Awake()
    {
        Instance = this;
    }

    // Start is called before the first frame update
    void Start()
    {
        Rigidbody = GetComponent<Rigidbody2D>();
        spriteRenderer = GetComponent<SpriteRenderer>();
        currentHP = maxHP;
        Qty_Pickup = 6; // Initial numbers of Pickup

        // Initialize HP Bar UI if it exists in the scene
        if (HPBar.Instance != null)
        {
            HPBar.Instance.OnDamageTaken(currentHP, maxHP);
        }
    }

    // Update is called once per frame
    void Update()
    {
        float X_Move = Input.GetAxis("Horizontal");
        float Y_Move = Input.GetAxis("Vertical");

        Vector2 Movement = new Vector2(X_Move, Y_Move);

        //Rigidbody.AddForce(Movement*speed*Time.deltaTime*5);
        Rigidbody.AddForce(Movement * speed);

        //transform.position = TrackTarget.transform.position;
    }

    private void OnCollisionEnter2D(Collision2D BeHit)
    {
        HandlePickupCollision(BeHit.gameObject);
    }

    private void OnTriggerEnter2D(Collider2D other)
    {
        HandlePickupCollision(other.gameObject);
    }

    private void HandlePickupCollision(GameObject go)
    {
        if (go.CompareTag("Pickup"))
        {
            Destroy(go);
            //BeHit.gameObject.SetActive(false);
            Qty_Pickup = Qty_Pickup - 1;
            
            if (Status_Message != null)
            {
                Status_Message.text = Qty_Pickup.ToString();
            }

            if (SoundManager.Instance != null)
            {
                SoundManager.Instance.PlaySelect();
            }

            if (Qty_Pickup == 0) // Mission complete
            {
                if (Disp_Win != null)
                {
                    Disp_Win.text = "You Win!";
                }
            }
        }
    }

    public void TakeDamage(int dmg)
    {
        if (Qty_Pickup == 0 || isInvulnerable) return;

        currentHP -= dmg;
        if (HPBar.Instance != null)
        {
            HPBar.Instance.OnDamageTaken(currentHP, maxHP);
        }

        if (SoundManager.Instance != null)
        {
            SoundManager.Instance.PlayHurt();
        }

        if (currentHP <= 0)
        {
            currentHP = 0;
            PlayerDied();
        }
        else
        {
            StartCoroutine(FlashInvulnerableRoutine());
        }
    }

    private System.Collections.IEnumerator FlashInvulnerableRoutine()
    {
        isInvulnerable = true;
        float elapsed = 0f;
        bool visible = true;

        while (elapsed < invulnDuration)
        {
            visible = !visible;
            if (spriteRenderer != null)
            {
                spriteRenderer.color = visible ? Color.white : new Color(1f, 1f, 1f, 0.2f);
            }
            yield return new WaitForSeconds(0.08f);
            elapsed += 0.08f;
        }

        if (spriteRenderer != null)
        {
            spriteRenderer.color = Color.white;
        }
        isInvulnerable = false;
    }

    public void PlayerDied()
    {
        if (Rigidbody != null)
        {
            Rigidbody.linearVelocity = Vector2.zero;
        }
        if (Disp_Win != null)
        {
            Disp_Win.text = "You Died!";
        }
    }
}
