using UnityEngine;

// ScoreManager.cs
public class ScoreManager {
    public static ScoreManager Instance = new ScoreManager();
    public int grazeCount = 0;

    public void AddGraze() {
        grazeCount++;
        UIManager.Instance?.UpdateGrazeText(grazeCount); // push
    }
}
