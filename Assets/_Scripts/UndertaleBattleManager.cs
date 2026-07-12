using UnityEngine;
using System.Collections;
using System.Collections.Generic;
using TMPro;

public class UndertaleBattleManager : MonoBehaviour
{
    public static UndertaleBattleManager Instance;

    public enum BattleState
    {
        PlayerMenu,      // Selecting FIGHT, ACT, ITEM, MERCY buttons
        SubMenu,         // Selecting options inside the box (targets, acts, items, mercy)
        Dialogue,        // Text typing out inside the box
        FightTarget,     // Combat slider minigame active
        FightExecute,    // Slice animation & damage floating numbers showing
        EnemyAttack,     // Dodge phase inside the box
        Victory,         // Win battle
        GameOver         // Player died
    }

    [Header("State")]
    public BattleState currentState = BattleState.PlayerMenu;
    public int currentMenuCol = 0; // 0=FIGHT, 1=ACT, 2=ITEM, 3=MERCY
    public int subMenuRow = 0;
    public int subMenuCol = 0; // for 2x2 grid selection in sub-menu

    [Header("References")]
    public PlayerSoul playerSoul;
    public BattleBox battleBox;
    public Phase1Spawner bulletSpawner;
    public TextMeshProUGUI dialogueText;
    public GameObject statsTextGo; // Reference to name/LV/HP UI
    public Transform enemyTransform; // Enemy visual sprite representation
    public SpriteRenderer enemySpriteRenderer;

    [Header("UI Snapping Coordinates")]
    // Local coordinates of the buttons
    public Vector3[] buttonHeartPositions = new Vector3[4]; // Snap positions for FIGHT, ACT, ITEM, MERCY
    // Sub-menu coordinates for soul heart relative to the BattleBox center
    public Vector2 subMenuHeartOffsetTopLeft = new Vector2(-3.2f, 0.4f);
    public Vector2 subMenuHeartOffsetTopRight = new Vector2(0.8f, 0.4f);
    public Vector2 subMenuHeartOffsetBottomLeft = new Vector2(-3.2f, -0.4f);
    public Vector2 subMenuHeartOffsetBottomRight = new Vector2(0.8f, -0.4f);

    [Header("FIGHT Target Slider UI")]
    public GameObject fightTargetPanel;
    public RectTransform sliderBar;
    public float sliderSpeed = 10f;
    private bool sliderMovingRight = true;
    private float sliderProgress = 0f; // 0.0 to 1.0

    [Header("Gameplay State")]
    public int enemyHP = 30;
    public int enemyMaxHP = 30;
    public bool enemyIsSpareable = false;
    public float typeSpeed = 0.03f;
    private bool isTyping = false;
    private string fullTypingText = "";
    private Coroutine typingCoroutine;

    // Sub-menu item lists
    private List<string> activeSubMenuOptions = new List<string>();
    private string selectedCategory = ""; // "FIGHT", "ACT", "ITEM", "MERCY"

    void Awake()
    {
        Instance = this;
    }

    void Start()
    {
        // Define button heart coordinates (world coords for soul placement under the box)
        if (battleBox != null)
        {
            Vector2 boxCenter = battleBox.transform.position;
            buttonHeartPositions[0] = new Vector3(boxCenter.x - 3.2f, boxCenter.y - 1.9f, 0); // FIGHT
            buttonHeartPositions[1] = new Vector3(boxCenter.x - 1.1f, boxCenter.y - 1.9f, 0); // ACT
            buttonHeartPositions[2] = new Vector3(boxCenter.x + 1.0f, boxCenter.y - 1.9f, 0); // ITEM
            buttonHeartPositions[3] = new Vector3(boxCenter.x + 3.1f, boxCenter.y - 1.9f, 0); // MERCY
        }

        // Setup default screen state
        if (fightTargetPanel != null) fightTargetPanel.SetActive(false);
        StartPlayerMenu("* Froggit blocks the way!");
    }

    void Update()
    {
        if (currentState == BattleState.GameOver) return;

        switch (currentState)
        {
            case BattleState.PlayerMenu:
                HandlePlayerMenuInput();
                break;
            case BattleState.SubMenu:
                HandleSubMenuInput();
                break;
            case BattleState.Dialogue:
                HandleDialogueInput();
                break;
            case BattleState.FightTarget:
                HandleFightTargetInput();
                break;
            case BattleState.FightExecute:
                HandleFightExecuteInput();
                break;
            case BattleState.EnemyAttack:
                // Bullet dodge is active, managed by spawner timer
                break;
            case BattleState.Victory:
                if (Input.GetKeyDown(KeyCode.Z) || Input.GetKeyDown(KeyCode.Return))
                {
                    // Reload scene to restart
                    UnityEngine.SceneManagement.SceneManager.LoadScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene().name);
                }
                break;
        }
    }

    #region Menu State Starters

    public void StartPlayerMenu(string startText)
    {
        currentState = BattleState.PlayerMenu;
        
        // Morph box to WIDE size
        if (battleBox != null)
        {
            battleBox.targetSize = new Vector2(8.5f, 2.5f);
        }

        // Position PlayerSoul at selected button
        if (playerSoul != null)
        {
            playerSoul.transform.position = buttonHeartPositions[currentMenuCol];
            playerSoul.SetMenuSnappingMode(true);
        }

        // Type out default text
        StartTypewriterText(startText);
    }

    private void StartSubMenu(string category, List<string> options)
    {
        selectedCategory = category;
        activeSubMenuOptions = options;
        subMenuRow = 0;
        subMenuCol = 0;
        currentState = BattleState.SubMenu;

        // Position soul next to the top-left option
        UpdateSubMenuSoulPosition();

        // Print option list text inside box
        FormatSubMenuText();
    }

    #endregion

    #region Input Handlers

    private void HandlePlayerMenuInput()
    {
        int prevCol = currentMenuCol;
        if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A))
        {
            currentMenuCol = (currentMenuCol - 1 + 4) % 4;
        }
        else if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D))
        {
            currentMenuCol = (currentMenuCol + 1) % 4;
        }

        if (currentMenuCol != prevCol)
        {
            if (playerSoul != null)
            {
                playerSoul.transform.position = buttonHeartPositions[currentMenuCol];
            }
            if (RetroSoundGenerator.Instance != null)
            {
                RetroSoundGenerator.Instance.PlaySelect();
            }
        }

        if (Input.GetKeyDown(KeyCode.Z) || Input.GetKeyDown(KeyCode.Return))
        {
            if (RetroSoundGenerator.Instance != null)
            {
                RetroSoundGenerator.Instance.PlaySelect();
            }
            
            // Advance to submenu depending on category chosen
            switch (currentMenuCol)
            {
                case 0: // FIGHT
                    StartSubMenu("FIGHT", new List<string> { "* Froggit" });
                    break;
                case 1: // ACT
                    StartSubMenu("ACT", new List<string> { "* Check", "* Joke", "* Talk" });
                    break;
                case 2: // ITEM
                    StartSubMenu("ITEM", new List<string> { "* Candy", "* Pie" });
                    break;
                case 3: // MERCY
                    string spareLabel = enemyIsSpareable ? "* Spare (Spareable)" : "* Spare";
                    StartSubMenu("MERCY", new List<string> { spareLabel, "* Flee" });
                    break;
            }
        }
    }

    private void HandleSubMenuInput()
    {
        int prevRow = subMenuRow;
        int prevCol = subMenuCol;

        int totalOptions = activeSubMenuOptions.Count;

        if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A))
        {
            if (subMenuCol > 0) subMenuCol = 0;
        }
        else if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D))
        {
            if (subMenuCol == 0 && totalOptions > (subMenuRow * 2 + 1)) subMenuCol = 1;
        }
        else if (Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W))
        {
            if (subMenuRow > 0) subMenuRow = 0;
        }
        else if (Input.GetKeyDown(KeyCode.DownArrow) || Input.GetKeyDown(KeyCode.S))
        {
            int nextIndex = (subMenuRow + 1) * 2 + subMenuCol;
            if (nextIndex < totalOptions) subMenuRow = 1;
        }

        if (subMenuRow != prevRow || subMenuCol != prevCol)
        {
            UpdateSubMenuSoulPosition();
            if (RetroSoundGenerator.Instance != null)
            {
                RetroSoundGenerator.Instance.PlaySelect();
            }
        }

        // Cancel and go back to main menu
        if (Input.GetKeyDown(KeyCode.X) || Input.GetKeyDown(KeyCode.LeftShift) || Input.GetKeyDown(KeyCode.RightShift))
        {
            if (RetroSoundGenerator.Instance != null)
            {
                RetroSoundGenerator.Instance.PlaySelect();
            }
            StartPlayerMenu("* Froggit waits patiently.");
            return;
        }

        // Confirm selection
        if (Input.GetKeyDown(KeyCode.Z) || Input.GetKeyDown(KeyCode.Return))
        {
            int selectedIndex = subMenuRow * 2 + subMenuCol;
            if (selectedIndex >= totalOptions) selectedIndex = totalOptions - 1;

            if (RetroSoundGenerator.Instance != null)
            {
                RetroSoundGenerator.Instance.PlaySelect();
            }

            ExecuteSubMenuSelection(selectedCategory, selectedIndex);
        }
    }

    private void HandleDialogueInput()
    {
        if (Input.GetKeyDown(KeyCode.Z) || Input.GetKeyDown(KeyCode.Return))
        {
            if (isTyping)
            {
                // Instant complete typing
                isTyping = false;
                if (typingCoroutine != null) StopCoroutine(typingCoroutine);
                dialogueText.text = fullTypingText;
            }
            else
            {
                // Advance to enemy attack or next turn
                StartEnemyAttackPhase();
            }
        }
    }

    private void HandleFightTargetInput()
    {
        // Ping-pong slider bar UI
        if (sliderBar != null)
        {
            float rate = sliderSpeed * Time.deltaTime;
            if (sliderMovingRight)
            {
                sliderProgress += rate;
                if (sliderProgress >= 1f)
                {
                    sliderProgress = 1f;
                    sliderMovingRight = false;
                }
            }
            else
            {
                sliderProgress -= rate;
                if (sliderProgress <= 0f)
                {
                    sliderProgress = 0f;
                    sliderMovingRight = true;
                }
            }

            // Map progress onto target panel (from x=-240 to x=240, center is 0)
            sliderBar.anchoredPosition = new Vector2(Mathf.Lerp(-240f, 240f, sliderProgress), 0);
        }

        if (Input.GetKeyDown(KeyCode.Z) || Input.GetKeyDown(KeyCode.Return))
        {
            // Execute slash
            StartCoroutine(RunSlashMiniGame());
        }
    }

    private void HandleFightExecuteInput()
    {
        if (Input.GetKeyDown(KeyCode.Z) || Input.GetKeyDown(KeyCode.Return))
        {
            // After slash is completed, transition to next phase
            if (enemyHP <= 0)
            {
                StartVictoryPhase();
            }
            else
            {
                StartEnemyAttackPhase();
            }
        }
    }

    #endregion

    #region Sub-Menu Logic

    private void UpdateSubMenuSoulPosition()
    {
        if (playerSoul == null || battleBox == null) return;

        Vector2 baseCenter = battleBox.transform.position;
        Vector2 finalPos = baseCenter;

        if (subMenuRow == 0 && subMenuCol == 0) finalPos += subMenuHeartOffsetTopLeft;
        else if (subMenuRow == 0 && subMenuCol == 1) finalPos += subMenuHeartOffsetTopRight;
        else if (subMenuRow == 1 && subMenuCol == 0) finalPos += subMenuHeartOffsetBottomLeft;
        else if (subMenuRow == 1 && subMenuCol == 1) finalPos += subMenuHeartOffsetBottomRight;

        playerSoul.transform.position = finalPos;
    }

    private void FormatSubMenuText()
    {
        if (dialogueText == null) return;

        string display = "";
        for (int i = 0; i < activeSubMenuOptions.Count; i++)
        {
            // Display in standard Undertale 2-column menu layout
            string option = activeSubMenuOptions[i];
            
            // Pad spaces so the columns line up nicely
            string cleanOpt = option.Replace("*", " ").Trim();
            
            if (i % 2 == 0)
            {
                display += $"* {cleanOpt,-20}";
            }
            else
            {
                display += $"* {cleanOpt}\n";
            }
        }
        dialogueText.text = display;
    }

    private void ExecuteSubMenuSelection(string category, int index)
    {
        if (category == "FIGHT")
        {
            StartFightTargetGame();
        }
        else if (category == "ACT")
        {
            if (index == 0) // Check
            {
                StartDialogue("* Froggit - ATK 4 DEF 2.\n* Life is difficult for this enemy.\n* (Its name glows yellow when spareable.)");
            }
            else if (index == 1) // Joke
            {
                enemyIsSpareable = true;
                StartDialogue("* You told a pun about frogs.\n* Froggit ribbits in amusement.\n* Froggit seems ready to SPARE.");
            }
            else // Talk
            {
                enemyIsSpareable = true;
                StartDialogue("* You croak at Froggit.\n* Froggit tilts its head with a friendly ribbit.\n* Froggit seems ready to SPARE.");
            }
        }
        else if (category == "ITEM")
        {
            if (index == 0) // Candy
            {
                if (playerSoul != null) playerSoul.Heal(10);
                StartDialogue("* You ate the Monster Candy.\n* You recovered 10 HP!");
            }
            else // Pie
            {
                if (playerSoul != null) playerSoul.Heal(99);
                StartDialogue("* You ate the Butterscotch Pie.\n* Your HP was maxed out!");
            }
        }
        else if (category == "MERCY")
        {
            if (index == 0) // Spare
            {
                if (enemyIsSpareable)
                {
                    StartVictoryPhase();
                }
                else
                {
                    StartDialogue("* You tried to SPARE Froggit.\n* But its name is not yellow yet!");
                }
            }
            else // Flee
            {
                StartDialogue("* You escaped from battle!");
                StartCoroutine(FleeRoutine());
            }
        }
    }

    private IEnumerator FleeRoutine()
    {
        yield return new WaitForSeconds(1.5f);
        // Reload scene
        UnityEngine.SceneManagement.SceneManager.LoadScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene().name);
    }

    #endregion

    #region Text Typewriter Effect

    public void StartDialogue(string text)
    {
        currentState = BattleState.Dialogue;
        if (playerSoul != null) playerSoul.SetMenuSnappingMode(false); // Hide or hide controls
        StartTypewriterText(text);
    }

    private void StartTypewriterText(string text)
    {
        fullTypingText = text;
        if (typingCoroutine != null) StopCoroutine(typingCoroutine);
        typingCoroutine = StartCoroutine(TypeTextRoutine());
    }

    private IEnumerator TypeTextRoutine()
    {
        isTyping = true;
        dialogueText.text = "";
        
        for (int i = 0; i < fullTypingText.Length; i++)
        {
            dialogueText.text += fullTypingText[i];
            
            // Play procedural retro blip sound
            if (fullTypingText[i] != ' ' && fullTypingText[i] != '\n')
            {
                if (RetroSoundGenerator.Instance != null && i % 2 == 0) // play every 2 characters for pacing
                {
                    RetroSoundGenerator.Instance.PlayTextBlip();
                }
            }

            yield return new WaitForSeconds(typeSpeed);
        }

        isTyping = false;
    }

    #endregion

    #region FIGHT Mini-Game

    private void StartFightTargetGame()
    {
        currentState = BattleState.FightTarget;
        if (dialogueText != null) dialogueText.text = ""; // clear dialogue text
        if (playerSoul != null) playerSoul.transform.position = new Vector3(-999, -999, 0); // hide soul
        if (fightTargetPanel != null) fightTargetPanel.SetActive(true);
        sliderProgress = 0f;
        sliderMovingRight = true;
    }

    private IEnumerator RunSlashMiniGame()
    {
        currentState = BattleState.FightExecute;
        if (fightTargetPanel != null) fightTargetPanel.SetActive(false);

        // Calculate precision (closeness to center)
        float score = 1f - Mathf.Abs(sliderProgress - 0.5f) * 2f; // 0.0 to 1.0 (1.0 is dead-center)
        int damage = Mathf.RoundToInt(score * 15f + 2f); // 2 to 17 damage

        // Play procedural attack sweep sound
        if (RetroSoundGenerator.Instance != null)
        {
            RetroSoundGenerator.Instance.PlaySlash();
        }

        // Draw Slash visual overlay line dynamically using LineRenderer at enemy position
        GameObject slashGo = new GameObject("SlashLine");
        LineRenderer lr = slashGo.AddComponent<LineRenderer>();
        lr.startWidth = 0.15f;
        lr.endWidth = 0.15f;
        lr.material = new Material(Shader.Find("Sprites/Default"));
        lr.startColor = Color.white;
        lr.endColor = Color.white;
        lr.positionCount = 2;

        if (enemyTransform != null)
        {
            Vector3 enemyPos = enemyTransform.position;
            lr.SetPosition(0, new Vector3(enemyPos.x - 1f, enemyPos.y + 1f, 0));
            lr.SetPosition(1, new Vector3(enemyPos.x + 1f, enemyPos.y - 1f, 0));
        }

        // Flash enemy sprite
        bool originalEnabled = true;
        if (enemySpriteRenderer != null) originalEnabled = enemySpriteRenderer.enabled;
        
        for (int i = 0; i < 4; i++)
        {
            if (enemySpriteRenderer != null) enemySpriteRenderer.enabled = !enemySpriteRenderer.enabled;
            yield return new WaitForSeconds(0.05f);
        }
        if (enemySpriteRenderer != null) enemySpriteRenderer.enabled = originalEnabled;
        Destroy(slashGo);

        // Apply Damage
        enemyHP -= damage;
        if (enemyHP < 0) enemyHP = 0;

        // Floating red damage text using a temporary GameObject
        GameObject damageGo = new GameObject("DamageText");
        damageGo.transform.position = enemyTransform != null ? enemyTransform.position + Vector3.up * 1f : Vector3.up * 3f;
        
        Canvas canvas = FindFirstObjectByType<Canvas>();
        if (canvas != null)
        {
            damageGo.transform.SetParent(canvas.transform, true);
        }

        TextMeshProUGUI dmgText = damageGo.AddComponent<TextMeshProUGUI>();
        dmgText.text = damage.ToString();
        dmgText.color = Color.red;
        dmgText.fontSize = 32;
        dmgText.alignment = TextAlignmentOptions.Center;
        
        RectTransform rt = damageGo.GetComponent<RectTransform>();
        if (rt != null)
        {
            rt.sizeDelta = new Vector2(200, 50);
        }

        // Float up and fade
        float duration = 1.0f;
        float elapsed = 0f;
        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            damageGo.transform.position += Vector3.up * Time.deltaTime * 0.8f;
            dmgText.color = new Color(1, 0, 0, 1f - (elapsed / duration));
            yield return null;
        }
        Destroy(damageGo);

        // Report result in dialogue text
        if (enemyHP <= 0)
        {
            dialogueText.text = $"* Froggit took {damage} damage.\n* Enemy defeated!\n* Press Z to exit.";
        }
        else
        {
            string spareTip = enemyIsSpareable ? " (Glowing yellow!)" : "";
            dialogueText.text = $"* Froggit took {damage} damage.\n* HP: {enemyHP} / {enemyMaxHP}{spareTip}.\n* Press Z to continue.";
        }
    }

    #endregion

    #region Enemy Attack Phase

    private void StartEnemyAttackPhase()
    {
        currentState = BattleState.EnemyAttack;

        // 1. Morph BattleBox to SMALL size
        if (battleBox != null)
        {
            battleBox.targetSize = new Vector2(4.0f, 4.0f);
        }

        // 2. Clear menu dialogue text
        if (dialogueText != null) dialogueText.text = "";

        // 3. Teleport soul to box center and enable dodge mode
        if (playerSoul != null)
        {
            playerSoul.transform.position = battleBox != null ? (Vector3)battleBox.transform.position : new Vector3(315, 2.5f, 0);
            playerSoul.SetMenuSnappingMode(false);
        }

        // 4. Start spawning bullets after morph completes (or instantly)
        if (bulletSpawner != null)
        {
            bulletSpawner.StartSpawning();
        }

        // 5. Run timer coroutine for attack phase duration
        StartCoroutine(EnemyAttackTimerRoutine(6f));
    }

    private IEnumerator EnemyAttackTimerRoutine(float duration)
    {
        float timer = duration;
        while (timer > 0f)
        {
            timer -= Time.deltaTime;
            // Update HUD text if necessary
            yield return null;
        }

        // Stop attack
        if (bulletSpawner != null)
        {
            bulletSpawner.StopSpawning();
        }

        // Return bullets to pool
        ClearAllActiveBullets();

        // Check if player died during attack
        if (currentState == BattleState.GameOver) yield break;

        // Choose random battle description for next turn
        string[] battleDescriptions = new string[] {
            "* Froggit looks nervous.",
            "* Smells like pond water.",
            "* Froggit hop-hops in place.",
            "* Ribbit, ribbit.",
            "* Froggit is meditating."
        };
        string nextText = battleDescriptions[Random.Range(0, battleDescriptions.Length)];
        if (enemyIsSpareable)
        {
            nextText = "* Froggit's name is glowing yellow!\n* (Go to MERCY to SPARE it.)";
        }

        // Morph box back and return to Player Menu
        StartPlayerMenu(nextText);
    }

    private void ClearAllActiveBullets()
    {
        Bullet[] activeBullets = FindObjectsByType<Bullet>(FindObjectsSortMode.None);
        foreach (Bullet b in activeBullets)
        {
            if (BulletPool.Instance != null)
            {
                BulletPool.Instance.Return(b.gameObject);
            }
            else
            {
                Destroy(b.gameObject);
            }
        }
    }

    #endregion

    #region Win / Loss States

    private void StartVictoryPhase()
    {
        currentState = BattleState.Victory;
        if (playerSoul != null) playerSoul.transform.position = new Vector3(-999, -999, 0); // Hide soul

        // If enemy was spared or killed, fade visual out
        StartCoroutine(FadeEnemyVisualOut());

        if (enemyHP <= 0)
        {
            dialogueText.text = "* YOU WIN!\n* You got 0 EXP and 0 gold.\n* Press Z to restart.";
        }
        else
        {
            dialogueText.text = "* YOU WIN!\n* You spared Froggit.\n* Press Z to restart.";
        }
    }

    private IEnumerator FadeEnemyVisualOut()
    {
        float duration = 1.0f;
        float elapsed = 0f;
        if (enemySpriteRenderer != null)
        {
            Color originalColor = enemySpriteRenderer.color;
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                enemySpriteRenderer.color = new Color(originalColor.r, originalColor.g, originalColor.b, 1f - (elapsed / duration));
                yield return null;
            }
            enemySpriteRenderer.color = new Color(originalColor.r, originalColor.g, originalColor.b, 0f);
        }
    }

    public void TriggerGameOver()
    {
        currentState = BattleState.GameOver;
        if (bulletSpawner != null) bulletSpawner.StopSpawning();
        ClearAllActiveBullets();
        dialogueText.text = "* It seems you have met your end.\n* Stay determined...\n* Press R to reload scene.";
    }

    #endregion
}
