using UnityEngine;

// UIManager.cs — MonoBehaviour, lives in scene, holds TMP references
public class UIManager : MonoBehaviour {
    public static UIManager Instance;
    public TMPro.TextMeshProUGUI grazeText;

    void Awake() { Instance = this; }

    public void UpdateGrazeText(int count) {
        grazeText.text = $"Graze: {count}";
    }
}
