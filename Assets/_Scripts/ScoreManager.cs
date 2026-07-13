using UnityEngine;

// ScoreManager.cs
public class ScoreManager {
    public static ScoreManager Instance = new ScoreManager();
    public int grazeCount = 0;

    public void AddGraze() {
        grazeCount++;
        UIManager.Instance?.UpdateGrazeText(grazeCount); // push to UFO UI
        
        // Push to Undertale HPBar UI too!
        if (HPBar.Instance != null && PlayerSoul.Instance != null)
        {
            HPBar.Instance.OnDamageTaken(PlayerSoul.Instance.CurrentHP, PlayerSoul.Instance.MaxHP);
        }
    }
}
