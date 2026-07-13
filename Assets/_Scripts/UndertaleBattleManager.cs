using UnityEngine;
using System.Collections;
using System.Collections.Generic;
using TMPro;

public class UndertaleBattleManager : MonoBehaviour
{
    public static UndertaleBattleManager Instance { get; private set; }

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

    [Header("State Settings")]
    [SerializeField] private BattleState _currentState = BattleState.PlayerMenu;
    [SerializeField] private int _currentMenuCol = 0; // 0=FIGHT, 1=ACT, 2=ITEM, 3=MERCY
    [SerializeField] private int _subMenuRow = 0;
    [SerializeField] private int _subMenuCol = 0; // for 2x2 grid selection in sub-menu

    [Header("References")]
    [SerializeField] private PlayerSoul _playerSoul;
    [SerializeField] private BattleBox _battleBox;
    [SerializeField] private Phase1Spawner _bulletSpawner;
    [SerializeField] private TextMeshProUGUI _dialogueText;
    [SerializeField] private GameObject _statsTextGo; // Reference to name/LV/HP UI
    [SerializeField] private Transform _enemyTransform; // Enemy visual sprite representation
    [SerializeField] private SpriteRenderer _enemySpriteRenderer;

    [Header("Mr. Oshino Sprites")]
    [SerializeField] private Sprite _oshinoStand;
    [SerializeField] private Sprite _oshinoBreathe1;
    [SerializeField] private Sprite _oshinoBreathe2;
    [SerializeField] private Sprite _oshinoWounded;
    [SerializeField] private Sprite _oshinoDefeated;

    [Header("BGM Settings")]
    [SerializeField] private AudioClip _bgmClip;
    [SerializeField] private AudioSource _bgmSource;

    [Header("UI Snapping Coordinates")]
    [SerializeField] private Vector3[] _buttonHeartPositions = new Vector3[4]; // Snap positions for FIGHT, ACT, ITEM, MERCY
    [SerializeField] private Vector2 _subMenuHeartOffsetTopLeft = new Vector2(-3.2f, 0.4f);
    [SerializeField] private Vector2 _subMenuHeartOffsetTopRight = new Vector2(0.8f, 0.4f);
    [SerializeField] private Vector2 _subMenuHeartOffsetBottomLeft = new Vector2(-3.2f, -0.4f);
    [SerializeField] private Vector2 _subMenuHeartOffsetBottomRight = new Vector2(0.8f, -0.4f);

    [Header("FIGHT Target Slider UI")]
    [SerializeField] private GameObject _fightTargetPanel;
    [SerializeField] private RectTransform _sliderBar;
    [SerializeField] private float _sliderSpeed = 10f;
    private bool _sliderMovingRight = true;
    private float _sliderProgress = 0f; // 0.0 to 1.0

    [Header("Gameplay State Settings")]
    [SerializeField] private int _enemyHP = 30;
    [SerializeField] private int _enemyMaxHP = 30;
    [SerializeField] private float _typeSpeed = 0.03f;

    private bool _enemyIsSpareable = false;
    private bool _isTyping = false;
    private string _fullTypingText = "";
    private Coroutine _typingCoroutine;

    // Sub-menu item lists
    private List<string> _activeSubMenuOptions = new List<string>();
    private string _selectedCategory = ""; // "FIGHT", "ACT", "ITEM", "MERCY"

    // Public Properties
    public BattleState CurrentState => _currentState;
    public int CurrentMenuCol => _currentMenuCol;
    public int SubMenuRow => _subMenuRow;
    public int SubMenuCol => _subMenuCol;
    public int EnemyHP => _enemyHP;
    public int EnemyMaxHP => _enemyMaxHP;
    public bool EnemyIsSpareable => _enemyIsSpareable;

    // Properties for Editor Scene Setup Configuration
    public PlayerSoul PlayerSoul { get => _playerSoul; set => _playerSoul = value; }
    public BattleBox BattleBox { get => _battleBox; set => _battleBox = value; }
    public Phase1Spawner BulletSpawner { get => _bulletSpawner; set => _bulletSpawner = value; }
    public TextMeshProUGUI DialogueText { get => _dialogueText; set => _dialogueText = value; }
    public GameObject StatsTextGo { get => _statsTextGo; set => _statsTextGo = value; }
    public Transform EnemyTransform { get => _enemyTransform; set => _enemyTransform = value; }
    public SpriteRenderer EnemySpriteRenderer { get => _enemySpriteRenderer; set => _enemySpriteRenderer = value; }
    public GameObject FightTargetPanel { get => _fightTargetPanel; set => _fightTargetPanel = value; }
    public RectTransform SliderBar { get => _sliderBar; set => _sliderBar = value; }

    // Mr. Oshino Sprites Setup properties
    public Sprite OshinoStand { get => _oshinoStand; set => _oshinoStand = value; }
    public Sprite OshinoBreathe1 { get => _oshinoBreathe1; set => _oshinoBreathe1 = value; }
    public Sprite OshinoBreathe2 { get => _oshinoBreathe2; set => _oshinoBreathe2 = value; }
    public Sprite OshinoWounded { get => _oshinoWounded; set => _oshinoWounded = value; }
    public Sprite OshinoDefeated { get => _oshinoDefeated; set => _oshinoDefeated = value; }
    public AudioClip BGMClip { get => _bgmClip; set => _bgmClip = value; }
    public AudioSource BGMSource { get => _bgmSource; set => _bgmSource = value; }

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
    }

    private void Start()
    {
        // Define button heart coordinates (world coords for soul placement under the box)
        if (_battleBox != null)
        {
            Vector2 boxCenter = _battleBox.transform.position;
            _buttonHeartPositions[0] = new Vector3(boxCenter.x - 3.2f, boxCenter.y - 2.41f, 0); // FIGHT
            _buttonHeartPositions[1] = new Vector3(boxCenter.x - 1.1f, boxCenter.y - 2.41f, 0); // ACT
            _buttonHeartPositions[2] = new Vector3(boxCenter.x + 1.0f, boxCenter.y - 2.41f, 0); // ITEM
            _buttonHeartPositions[3] = new Vector3(boxCenter.x + 3.1f, boxCenter.y - 2.41f, 0); // MERCY
        }

        // Setup default screen state
        if (_fightTargetPanel != null) _fightTargetPanel.SetActive(false);

        // Play BGM Scattered and Lost
        if (_bgmSource != null && _bgmClip != null)
        {
            _bgmSource.clip = _bgmClip;
            _bgmSource.loop = true;
            _bgmSource.volume = 0.4f;
            _bgmSource.Play();
        }

        // Start breathing animation loop
        StartCoroutine(BreatheAnimationRoutine());

        StartPlayerMenu("* Mr. Oshino blocks the way!");
    }

    private void Update()
    {
        if (_currentState == BattleState.GameOver) return;

        switch (_currentState)
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

    private IEnumerator BreatheAnimationRoutine()
    {
        bool useFrame1 = true;
        while (true)
        {
            if (_currentState == BattleState.PlayerMenu || _currentState == BattleState.Dialogue || _currentState == BattleState.EnemyAttack)
            {
                if (_enemySpriteRenderer != null && _enemyHP > 0)
                {
                    _enemySpriteRenderer.sprite = useFrame1 ? _oshinoBreathe1 : _oshinoBreathe2;
                }
                useFrame1 = !useFrame1;
            }
            yield return new WaitForSeconds(0.6f);
        }
    }

    #region Menu State Starters

    public void StartPlayerMenu(string startText)
    {
        _currentState = BattleState.PlayerMenu;
        
        // Morph box to WIDE size
        if (_battleBox != null)
        {
            _battleBox.TargetSize = new Vector2(8.5f, 2.5f);
        }

        // Position PlayerSoul at selected button
        if (_playerSoul != null)
        {
            _playerSoul.transform.position = _buttonHeartPositions[_currentMenuCol];
            _playerSoul.SetMenuSnappingMode(true);
        }

        // Type out default text
        StartTypewriterText(startText);
    }

    private void StartSubMenu(string category, List<string> options)
    {
        _selectedCategory = category;
        _activeSubMenuOptions = options;
        _subMenuRow = 0;
        _subMenuCol = 0;
        _currentState = BattleState.SubMenu;

        // Position soul next to the top-left option
        UpdateSubMenuSoulPosition();

        // Print option list text inside box
        FormatSubMenuText();
    }

    #endregion

    #region Input Handlers

    private void HandlePlayerMenuInput()
    {
        int prevCol = _currentMenuCol;
        if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A))
        {
            _currentMenuCol = (_currentMenuCol - 1 + 4) % 4;
        }
        else if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D))
        {
            _currentMenuCol = (_currentMenuCol + 1) % 4;
        }

        if (_currentMenuCol != prevCol)
        {
            if (_playerSoul != null)
            {
                _playerSoul.transform.position = _buttonHeartPositions[_currentMenuCol];
            }
            if (SoundManager.Instance != null)
            {
                SoundManager.Instance.PlaySelect();
            }
        }

        if (Input.GetKeyDown(KeyCode.Z) || Input.GetKeyDown(KeyCode.Return))
        {
            if (SoundManager.Instance != null)
            {
                SoundManager.Instance.PlaySelect();
            }
            
            // Advance to submenu depending on category chosen
            switch (_currentMenuCol)
            {
                case 0: // FIGHT
                    StartSubMenu("FIGHT", new List<string> { "* Mr. Oshino" });
                    break;
                case 1: // ACT
                    StartSubMenu("ACT", new List<string> { "* Check", "* Joke", "* Talk" });
                    break;
                case 2: // ITEM
                    StartSubMenu("ITEM", new List<string> { "* Candy", "* Pie" });
                    break;
                case 3: // MERCY
                    string spareLabel = _enemyIsSpareable ? "* Spare (Spareable)" : "* Spare";
                    StartSubMenu("MERCY", new List<string> { spareLabel, "* Flee" });
                    break;
            }
        }
    }

    private void HandleSubMenuInput()
    {
        int prevRow = _subMenuRow;
        int prevCol = _subMenuCol;

        int totalOptions = _activeSubMenuOptions.Count;

        if (Input.GetKeyDown(KeyCode.LeftArrow) || Input.GetKeyDown(KeyCode.A))
        {
            if (_subMenuCol > 0) _subMenuCol = 0;
        }
        else if (Input.GetKeyDown(KeyCode.RightArrow) || Input.GetKeyDown(KeyCode.D))
        {
            if (_subMenuCol == 0 && totalOptions > (_subMenuRow * 2 + 1)) _subMenuCol = 1;
        }
        else if (Input.GetKeyDown(KeyCode.UpArrow) || Input.GetKeyDown(KeyCode.W))
        {
            if (_subMenuRow > 0) _subMenuRow = 0;
        }
        else if (Input.GetKeyDown(KeyCode.DownArrow) || Input.GetKeyDown(KeyCode.S))
        {
            int nextIndex = (_subMenuRow + 1) * 2 + _subMenuCol;
            if (nextIndex < totalOptions) _subMenuRow = 1;
        }

        if (_subMenuRow != prevRow || _subMenuCol != prevCol)
        {
            UpdateSubMenuSoulPosition();
            if (SoundManager.Instance != null)
            {
                SoundManager.Instance.PlaySelect();
            }
        }

        // Cancel and go back to main menu
        if (Input.GetKeyDown(KeyCode.X) || Input.GetKeyDown(KeyCode.LeftShift) || Input.GetKeyDown(KeyCode.RightShift))
        {
            if (SoundManager.Instance != null)
            {
                SoundManager.Instance.PlaySelect();
            }
            StartPlayerMenu("* Mr. Oshino waits patiently.");
            return;
        }

        // Confirm selection
        if (Input.GetKeyDown(KeyCode.Z) || Input.GetKeyDown(KeyCode.Return))
        {
            int selectedIndex = _subMenuRow * 2 + _subMenuCol;
            if (selectedIndex >= totalOptions) selectedIndex = totalOptions - 1;

            if (SoundManager.Instance != null)
            {
                SoundManager.Instance.PlaySelect();
            }

            ExecuteSubMenuSelection(_selectedCategory, selectedIndex);
        }
    }

    private void HandleDialogueInput()
    {
        if (Input.GetKeyDown(KeyCode.Z) || Input.GetKeyDown(KeyCode.Return))
        {
            if (_isTyping)
            {
                // Instant complete typing
                _isTyping = false;
                if (_typingCoroutine != null) StopCoroutine(_typingCoroutine);
                _dialogueText.text = _fullTypingText;
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
        if (_sliderBar != null)
        {
            float rate = _sliderSpeed * Time.deltaTime;
            if (_sliderMovingRight)
            {
                _sliderProgress += rate;
                if (_sliderProgress >= 1f)
                {
                    _sliderProgress = 1f;
                    _sliderMovingRight = false;
                }
            }
            else
            {
                _sliderProgress -= rate;
                if (_sliderProgress <= 0f)
                {
                    _sliderProgress = 0f;
                    _sliderMovingRight = true;
                }
            }

            // Map progress onto target panel (from x=-240 to x=240, center is 0)
            _sliderBar.anchoredPosition = new Vector2(Mathf.Lerp(-240f, 240f, _sliderProgress), 0);
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
            if (_enemyHP <= 0)
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
        if (_playerSoul == null || _battleBox == null) return;

        Vector2 baseCenter = _battleBox.transform.position;
        Vector2 finalPos = baseCenter;

        if (_subMenuRow == 0 && _subMenuCol == 0) finalPos += _subMenuHeartOffsetTopLeft;
        else if (_subMenuRow == 0 && _subMenuCol == 1) finalPos += _subMenuHeartOffsetTopRight;
        else if (_subMenuRow == 1 && _subMenuCol == 0) finalPos += _subMenuHeartOffsetBottomLeft;
        else if (_subMenuRow == 1 && _subMenuCol == 1) finalPos += _subMenuHeartOffsetBottomRight;

        _playerSoul.transform.position = finalPos;
    }

    private void FormatSubMenuText()
    {
        if (_dialogueText == null) return;

        string display = "";
        for (int i = 0; i < _activeSubMenuOptions.Count; i++)
        {
            // Display in standard Undertale 2-column menu layout
            string option = _activeSubMenuOptions[i];
            
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
        _dialogueText.text = display;
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
                StartDialogue("* Mr. Oshino - ATK 6 DEF 4.\n* A legendary coding master.\n* (His name glows yellow when spareable.)");
            }
            else if (index == 1) // Joke
            {
                _enemyIsSpareable = true;
                StartDialogue("* You told a joke about coding bugs.\n* Mr. Oshino smiles and nods in approval.\n* Mr. Oshino seems ready to SPARE.");
            }
            else // Talk
            {
                _enemyIsSpareable = true;
                StartDialogue("* You ask Mr. Oshino for feedback.\n* He gives you a helpful review.\n* Mr. Oshino seems ready to SPARE.");
            }
        }
        else if (category == "ITEM")
        {
            if (index == 0) // Candy
            {
                if (_playerSoul != null) _playerSoul.Heal(10);
                StartDialogue("* You ate the Monster Candy.\n* You recovered 10 HP!");
            }
            else // Pie
            {
                if (_playerSoul != null) _playerSoul.Heal(99);
                StartDialogue("* You ate the Butterscotch Pie.\n* Your HP was maxed out!");
            }
        }
        else if (category == "MERCY")
        {
            if (index == 0) // Spare
            {
                // Spares immediately for clean demo gameplay!
                StartVictoryPhase();
            }
            else // Flee
            {
                // Fails to escape, returning to battle box turn!
                StartDialogue("* Escaping... but you couldn't escape!\n* Mr. Oshino blocks your path.");
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
        _currentState = BattleState.Dialogue;
        if (_playerSoul != null) _playerSoul.SetMenuSnappingMode(false); // Hide or hide controls
        StartTypewriterText(text);
    }

    private void StartTypewriterText(string text)
    {
        _fullTypingText = text;
        if (_typingCoroutine != null) StopCoroutine(_typingCoroutine);
        _typingCoroutine = StartCoroutine(TypeTextRoutine());
    }

    private IEnumerator TypeTextRoutine()
    {
        _isTyping = true;
        _dialogueText.text = "";
        
        for (int i = 0; i < _fullTypingText.Length; i++)
        {
            _dialogueText.text += _fullTypingText[i];
            
            // Play procedural retro blip sound
            if (_fullTypingText[i] != ' ' && _fullTypingText[i] != '\n')
            {
                if (SoundManager.Instance != null && i % 2 == 0) // play every 2 characters for pacing
                {
                    SoundManager.Instance.PlayTextBlip();
                }
            }

            yield return new WaitForSeconds(_typeSpeed);
        }

        _isTyping = false;
    }

    #endregion

    #region FIGHT Mini-Game

    private void StartFightTargetGame()
    {
        _currentState = BattleState.FightTarget;
        if (_dialogueText != null) _dialogueText.text = ""; // clear dialogue text
        if (_playerSoul != null) _playerSoul.transform.position = new Vector3(-999, -999, 0); // hide soul
        if (_fightTargetPanel != null) _fightTargetPanel.SetActive(true);
        _sliderProgress = 0f;
        _sliderMovingRight = true;
    }

    private IEnumerator RunSlashMiniGame()
    {
        _currentState = BattleState.FightExecute;
        if (_fightTargetPanel != null) _fightTargetPanel.SetActive(false);

        // Calculate precision (closeness to center)
        float score = 1f - Mathf.Abs(_sliderProgress - 0.5f) * 2f; // 0.0 to 1.0 (1.0 is dead-center)
        int damage = Mathf.RoundToInt(score * 15f + 2f); // 2 to 17 damage

        // Play procedural attack sweep sound
        if (SoundManager.Instance != null)
        {
            SoundManager.Instance.PlaySlash();
        }

        // Set to wounded sprite
        if (_enemySpriteRenderer != null && _oshinoWounded != null)
        {
            _enemySpriteRenderer.sprite = _oshinoWounded;
        }

        // Draw Slash visual overlay line dynamically using LineRenderer at enemy position
        GameObject slashGo = new GameObject("SlashLine");
        LineRenderer lr = slashGo.AddComponent<LineRenderer>();
        lr.startWidth = 0.15f;
        lr.endWidth = 0.15f;
        Shader slashShader = Shader.Find("Universal Render Pipeline/2D/Sprite-Unlit-Default");
        if (slashShader == null) slashShader = Shader.Find("Sprites/Default");
        lr.material = new Material(slashShader);
        lr.startColor = Color.white;
        lr.endColor = Color.white;
        lr.positionCount = 2;

        if (_enemyTransform != null)
        {
            Vector3 enemyPos = _enemyTransform.position;
            lr.SetPosition(0, new Vector3(enemyPos.x - 1f, enemyPos.y + 1f, 0));
            lr.SetPosition(1, new Vector3(enemyPos.x + 1f, enemyPos.y - 1f, 0));
        }

        // Flash enemy sprite
        bool originalEnabled = true;
        if (_enemySpriteRenderer != null) originalEnabled = _enemySpriteRenderer.enabled;
        
        for (int i = 0; i < 4; i++)
        {
            if (_enemySpriteRenderer != null) _enemySpriteRenderer.enabled = !_enemySpriteRenderer.enabled;
            yield return new WaitForSeconds(0.05f);
        }
        if (_enemySpriteRenderer != null) _enemySpriteRenderer.enabled = originalEnabled;
        Destroy(slashGo);

        // Apply Damage
        _enemyHP -= damage;
        if (_enemyHP < 0) _enemyHP = 0;

        if (_enemyHP <= 0 && _enemySpriteRenderer != null && _oshinoDefeated != null)
        {
            _enemySpriteRenderer.sprite = _oshinoDefeated;
        }

        // Floating red damage text using a temporary GameObject
        GameObject damageGo = new GameObject("DamageText");
        damageGo.transform.position = _enemyTransform != null ? _enemyTransform.position + Vector3.up * 1f : Vector3.up * 3f;
        
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
        if (_enemyHP <= 0)
        {
            _dialogueText.text = $"* Mr. Oshino took {damage} damage.\n* Enemy defeated!\n* Press Z to exit.";
        }
        else
        {
            string spareTip = _enemyIsSpareable ? " (Glowing yellow!)" : "";
            _dialogueText.text = $"* Mr. Oshino took {damage} damage.\n* HP: {_enemyHP} / {_enemyMaxHP}{spareTip}.\n* Press Z to continue.";
        }
    }

    #endregion

    #region Enemy Attack Phase

    private void StartEnemyAttackPhase()
    {
        _currentState = BattleState.EnemyAttack;

        // 1. Morph BattleBox to SMALL size
        if (_battleBox != null)
        {
            _battleBox.TargetSize = new Vector2(4.0f, 4.0f);
        }

        // 2. Clear menu dialogue text
        if (_dialogueText != null) _dialogueText.text = "";

        // 3. Teleport soul to box center and enable dodge mode
        if (_playerSoul != null)
        {
            _playerSoul.transform.position = _battleBox != null ? (Vector3)_battleBox.Center : new Vector3(315, 2.5f, 0);
            _playerSoul.SetMenuSnappingMode(false);
        }

        // 4. Start spawning bullets after morph completes (or instantly)
        if (_bulletSpawner != null)
        {
            _bulletSpawner.StartSpawning();
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
            yield return null;
        }

        // Stop attack
        if (_bulletSpawner != null)
        {
            _bulletSpawner.StopSpawning();
        }

        // Return bullets to pool
        ClearAllActiveBullets();

        // Check if player died during attack
        if (_currentState == BattleState.GameOver) yield break;

        // Choose random battle description for next turn
        string[] battleDescriptions = new string[] {
            "* Mr. Oshino watches your moves.",
            "* Smells like green tea and retro code.",
            "* Mr. Oshino is reviewing a pull request.",
            "* Mr. Oshino looks pleased with your clean naming.",
            "* Mr. Oshino is meditating quietly."
        };
        string nextText = battleDescriptions[Random.Range(0, battleDescriptions.Length)];
        if (_enemyIsSpareable)
        {
            nextText = "* Mr. Oshino's name is glowing yellow!\n* (Go to MERCY to SPARE him.)";
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
        _currentState = BattleState.Victory;
        if (_playerSoul != null) _playerSoul.transform.position = new Vector3(-999, -999, 0); // Hide soul

        // If enemy was spared or killed, fade visual out
        StartCoroutine(FadeEnemyVisualOut());

        if (_enemyHP <= 0)
        {
            _dialogueText.text = "* YOU WIN!\n* You got 0 EXP and 0 gold.\n* Press Z to restart.";
        }
        else
        {
            _dialogueText.text = "* YOU WIN!\n* You spared Mr. Oshino.\n* Press Z to restart.";
        }
    }

    private IEnumerator FadeEnemyVisualOut()
    {
        float duration = 1.0f;
        float elapsed = 0f;
        if (_enemySpriteRenderer != null)
        {
            Color originalColor = _enemySpriteRenderer.color;
            while (elapsed < duration)
            {
                elapsed += Time.deltaTime;
                _enemySpriteRenderer.color = new Color(originalColor.r, originalColor.g, originalColor.b, 1f - (elapsed / duration));
                yield return null;
            }
            _enemySpriteRenderer.color = new Color(originalColor.r, originalColor.g, originalColor.b, 0f);
        }
    }

    public void TriggerGameOver()
    {
        _currentState = BattleState.GameOver;
        if (_bulletSpawner != null) _bulletSpawner.StopSpawning();
        ClearAllActiveBullets();
        _dialogueText.text = "* It seems you have met your end.\n* Stay determined...\n* Press R to reload scene.";
    }

    #endregion
}
