using UnityEngine;
using TMPro;

public class UFOController : MonoBehaviour
{
    public float speed = 10;
    public int score = 0;
    public TextMeshProUGUI scoreText;
    
    // 1. Add this slot so the UFO can hold a link to the GameManager script directly
    public GameManager gameManager; 
    
    private Rigidbody2D rb;

    void Start()
    {
        rb = GetComponent<Rigidbody2D>();
    }

    void Update()
    {
        float h = Input.GetAxis("Horizontal");
        float v = Input.GetAxis("Vertical");
        Vector2 move = new Vector2(h, v);
        rb.AddForce(move * speed);
    }

void OnTriggerEnter2D(Collider2D other)
{
    if (other.CompareTag("Pickup")) 
    {
        other.gameObject.SetActive(false); 
        score++;
        scoreText.text = "Score: " + score;

        if (score >= 6)
        {
            scoreText.text = "Score: " + score + "\nYOU WIN!";
        }
    }
}
}

