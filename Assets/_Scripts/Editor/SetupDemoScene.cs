#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.IO;

public static class SetupDemoScene
{
    [MenuItem("Tools/Setup UFO Demo Scene")]
    public static void CreateUFODemoScene()
    {
        // 0. Open the Scene or create it if missing
        string scenePath = "Assets/_Scenes/00_Scene.unity";
        if (!System.IO.File.Exists(scenePath))
        {
            UnityEngine.SceneManagement.Scene newScene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            EditorSceneManager.SaveScene(newScene, scenePath);
        }
        UnityEngine.SceneManagement.Scene activeScene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);

        // Remove default Directional Light since we want an ambient retro look
        GameObject dirLight = GameObject.Find("Directional Light");
        if (dirLight != null)
        {
            Object.DestroyImmediate(dirLight);
        }

        // 1. Setup Camera
        Camera mainCam = GameObject.FindFirstObjectByType<Camera>();
        if (mainCam == null)
        {
            GameObject camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
            camGo.tag = "MainCamera";
            mainCam = camGo.GetComponent<Camera>();
            Debug.Log("Main Camera not found. Created a new Main Camera.");
        }

        if (mainCam != null)
        {
            mainCam.transform.position = new Vector3(0, 0, -10);
            mainCam.orthographic = true;
            mainCam.orthographicSize = 10f; // Perfect size to view the boundaries
            mainCam.backgroundColor = Color.black;
            mainCam.clearFlags = CameraClearFlags.SolidColor;
            if (mainCam.GetComponent<CameraFollow>() == null)
            {
                mainCam.gameObject.AddComponent<CameraFollow>();
            }
        }

        // 2. Setup Background
        GameObject bg = GameObject.Find("Background_0");
        if (bg == null)
        {
            bg = new GameObject("Background_0");
        }
        SpriteRenderer bgSr = bg.GetComponent<SpriteRenderer>();
        if (bgSr == null) bgSr = bg.AddComponent<SpriteRenderer>();
        Sprite bgSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Background.png");
        if (bgSprite != null)
        {
            bgSr.sprite = bgSprite;
        }
        bgSr.sortingOrder = -10; // Render behind everything

        // 3. Create Boundary Colliders (solid box colliders surrounding the play area)
        GameObject boundariesGo = GameObject.Find("Boundaries");
        if (boundariesGo == null)
        {
            boundariesGo = new GameObject("Boundaries");
            
            // Top wall
            GameObject wallTop = new GameObject("Wall_Top");
            wallTop.transform.SetParent(boundariesGo.transform);
            wallTop.transform.position = new Vector3(0f, 13f, 0f);
            BoxCollider2D colTop = wallTop.AddComponent<BoxCollider2D>();
            colTop.size = new Vector2(27f, 1f);

            // Bottom wall
            GameObject wallBottom = new GameObject("Wall_Bottom");
            wallBottom.transform.SetParent(boundariesGo.transform);
            wallBottom.transform.position = new Vector3(0f, -13f, 0f);
            BoxCollider2D colBottom = wallBottom.AddComponent<BoxCollider2D>();
            colBottom.size = new Vector2(27f, 1f);

            // Left wall
            GameObject wallLeft = new GameObject("Wall_Left");
            wallLeft.transform.SetParent(boundariesGo.transform);
            wallLeft.transform.position = new Vector3(-13f, 0f, 0f);
            BoxCollider2D colLeft = wallLeft.AddComponent<BoxCollider2D>();
            colLeft.size = new Vector2(1f, 27f);

            // Right wall
            GameObject wallRight = new GameObject("Wall_Right");
            wallRight.transform.SetParent(boundariesGo.transform);
            wallRight.transform.position = new Vector3(13f, 0f, 0f);
            BoxCollider2D colRight = wallRight.AddComponent<BoxCollider2D>();
            colRight.size = new Vector2(1f, 27f);
            
            Debug.Log("Created solid boundary BoxColliders.");
        }

        // 4. Create UFO player
        GameObject ufo = GameObject.Find("UFO");
        if (ufo == null)
        {
            ufo = new GameObject("UFO");
        }
        ufo.tag = "Player";
        
        SpriteRenderer sr = ufo.GetComponent<SpriteRenderer>();
        if (sr == null) sr = ufo.AddComponent<SpriteRenderer>();
        Sprite ufoSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/UFO.png");
        if (ufoSprite != null)
        {
            sr.sprite = ufoSprite;
        }

        CircleCollider2D ufoCol = ufo.GetComponent<CircleCollider2D>();
        if (ufoCol == null) ufoCol = ufo.AddComponent<CircleCollider2D>();
        ufoCol.isTrigger = false;

        Rigidbody2D rb = ufo.GetComponent<Rigidbody2D>();
        if (rb == null) rb = ufo.AddComponent<Rigidbody2D>();
        rb.gravityScale = 0f;
        rb.linearDamping = 1.5f; // drag
        
        UFOController ufoCtrl = ufo.GetComponent<UFOController>();
        if (ufoCtrl == null) ufoCtrl = ufo.AddComponent<UFOController>();
        
        // Good default settings
        ufoCtrl.speed = 15f;
        ufoCtrl.requiredCoinsToWin = 15;
        ufoCtrl.timeRemaining = 60f;
        ufoCtrl.maxHP = 20;

        // 5. Create Canvas and UI
        GameObject canvasGo = GameObject.Find("Canvas");
        if (canvasGo == null)
        {
            canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        }
        Canvas canvas = canvasGo.GetComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;

        // Create Score Text (TMP)
        GameObject scoreTextGo = GameObject.Find("ScoreText");
        if (scoreTextGo == null)
        {
            scoreTextGo = new GameObject("ScoreText", typeof(RectTransform));
            scoreTextGo.transform.SetParent(canvasGo.transform, false);
        }
        TextMeshProUGUI scoreTmp = scoreTextGo.GetComponent<TextMeshProUGUI>();
        if (scoreTmp == null) scoreTmp = scoreTextGo.AddComponent<TextMeshProUGUI>();
        scoreTmp.fontSize = 24;
        scoreTmp.color = Color.white;
        scoreTmp.alignment = TextAlignmentOptions.TopLeft;
        scoreTmp.text = "Coins: 0 / 15";
        
        RectTransform scoreRect = scoreTextGo.GetComponent<RectTransform>();
        scoreRect.anchorMin = new Vector2(0, 1);
        scoreRect.anchorMax = new Vector2(0, 1);
        scoreRect.pivot = new Vector2(0, 1);
        scoreRect.anchoredPosition = new Vector2(20, -20);
        scoreRect.sizeDelta = new Vector2(300, 50);

        if (ufoCtrl != null)
        {
            ufoCtrl.scoreText = scoreTmp;
        }

        // Create Timer Text (TMP)
        GameObject timerTextGo = GameObject.Find("TimerText");
        if (timerTextGo == null)
        {
            timerTextGo = new GameObject("TimerText", typeof(RectTransform));
            timerTextGo.transform.SetParent(canvasGo.transform, false);
        }
        TextMeshProUGUI timerTmp = timerTextGo.GetComponent<TextMeshProUGUI>();
        if (timerTmp == null) timerTmp = timerTextGo.AddComponent<TextMeshProUGUI>();
        timerTmp.fontSize = 24;
        timerTmp.color = Color.white;
        timerTmp.alignment = TextAlignmentOptions.TopRight;
        timerTmp.text = "Time: 60s";

        RectTransform timerRect = timerTextGo.GetComponent<RectTransform>();
        timerRect.anchorMin = new Vector2(1, 1);
        timerRect.anchorMax = new Vector2(1, 1);
        timerRect.pivot = new Vector2(1, 1);
        timerRect.anchoredPosition = new Vector2(-20, -20);
        timerRect.sizeDelta = new Vector2(300, 50);

        if (ufoCtrl != null)
        {
            ufoCtrl.timerText = timerTmp;
        }

        // Create HPBar UI under Canvas
        GameObject hpBarGo = GameObject.Find("HPBar");
        if (hpBarGo == null)
        {
            hpBarGo = new GameObject("HPBar", typeof(RectTransform));
            hpBarGo.transform.SetParent(canvasGo.transform, false);
        }
        HPBar hpBarScript = hpBarGo.GetComponent<HPBar>();
        if (hpBarScript == null) hpBarScript = hpBarGo.AddComponent<HPBar>();

        RectTransform hpBarRect = hpBarGo.GetComponent<RectTransform>();
        hpBarRect.anchorMin = new Vector2(0.5f, 0);
        hpBarRect.anchorMax = new Vector2(0.5f, 0);
        hpBarRect.pivot = new Vector2(0.5f, 0);
        hpBarRect.anchoredPosition = new Vector2(0, 30);
        hpBarRect.sizeDelta = new Vector2(200, 20);

        Image hpBarBgImg = hpBarGo.GetComponent<Image>();
        if (hpBarBgImg == null) hpBarBgImg = hpBarGo.AddComponent<Image>();
        hpBarBgImg.color = Color.gray;

        // Find or create Fill child GameObject
        GameObject fillGo = null;
        Transform fillTransform = hpBarGo.transform.Find("Fill");
        if (fillTransform != null) fillGo = fillTransform.gameObject;
        if (fillGo == null)
        {
            fillGo = new GameObject("Fill", typeof(RectTransform));
            fillGo.transform.SetParent(hpBarGo.transform, false);
        }
        Image fillImg = fillGo.GetComponent<Image>();
        if (fillImg == null) fillImg = fillGo.AddComponent<Image>();
        fillImg.color = Color.green;
        fillImg.type = Image.Type.Filled;
        fillImg.fillMethod = Image.FillMethod.Horizontal;
        fillImg.fillOrigin = (int)Image.OriginHorizontal.Left;

        RectTransform fillRect = fillGo.GetComponent<RectTransform>();
        fillRect.anchorMin = Vector2.zero;
        fillRect.anchorMax = Vector2.one;
        fillRect.sizeDelta = Vector2.zero;

        hpBarScript.FillBar = fillImg;

        // 6. Setup SoundManager in scene
        GameObject soundGo = GameObject.Find("SoundManager");
        if (soundGo == null)
        {
            soundGo = new GameObject("SoundManager");
        }
        SoundManager soundManager = soundGo.GetComponent<SoundManager>();
        if (soundManager == null) soundManager = soundGo.AddComponent<SoundManager>();
        
        AudioSource sfxSource = soundGo.GetComponent<AudioSource>();
        if (sfxSource == null) sfxSource = soundGo.AddComponent<AudioSource>();
        soundManager.AudioSource = sfxSource;

        soundManager.SelectClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Assets/Undertale/SFX/snd_select.wav");
        soundManager.TextClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Assets/Undertale/SFX/snd_text.wav");
        soundManager.SlashClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Assets/Undertale/SFX/snd_slash.wav");
        soundManager.HurtClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Assets/Undertale/SFX/snd_hurt.wav");

        // 7. Setup Background Music (BGMPlayer) in scene
        GameObject bgmGo = GameObject.Find("BGMPlayer");
        if (bgmGo == null)
        {
            bgmGo = new GameObject("BGMPlayer");
        }
        AudioSource bgmSource = bgmGo.GetComponent<AudioSource>();
        if (bgmSource == null) bgmSource = bgmGo.AddComponent<AudioSource>();
        bgmSource.clip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Assets/Undertale/ScatteredAndLost.mp3");
        bgmSource.loop = true;
        bgmSource.playOnAwake = true;
        bgmSource.volume = 0.5f;

        // 8. Create GameManager
        GameObject gm = GameObject.Find("GameManager");
        if (gm == null)
        {
            gm = new GameObject("GameManager");
        }
        GameManager gmScript = gm.GetComponent<GameManager>();
        if (gmScript == null) gmScript = gm.AddComponent<GameManager>();
        gmScript.pickupPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/pickupPrefab.prefab");
        gmScript.enemyPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/EnemyPrefab.prefab");

        // 9. Clean up redundant Phase1Spawner if it exists in UFO Scene
        GameObject spawner = GameObject.Find("Phase1Spawner");
        if (spawner != null)
        {
            Object.DestroyImmediate(spawner);
            Debug.Log("Removed redundant Phase1Spawner from UFO scene.");
        }

        // 10. Create EventSystem if missing
        if (GameObject.FindFirstObjectByType<UnityEngine.EventSystems.EventSystem>() == null)
        {
            new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem), typeof(UnityEngine.EventSystems.StandaloneInputModule));
        }

        // 11. Save the Scene
        EditorSceneManager.MarkSceneDirty(activeScene);
        EditorSceneManager.SaveScene(activeScene);

        Debug.Log("UFO Demo Scene setup completed successfully and saved!");
    }

    [MenuItem("Tools/Setup Undertale Demo Scene")]
    public static void CreateUndertaleDemoScene()
    {
        // 0. Ensure assets and directory structure exist
        EnsureUndertaleAssetsAndPrefabsExist();

        // 1. Open the Scene or create it if missing
        string scenePath = "Assets/_Scenes/01_Underta.unity";
        if (!System.IO.File.Exists(scenePath))
        {
            UnityEngine.SceneManagement.Scene newScene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            EditorSceneManager.SaveScene(newScene, scenePath);
        }
        UnityEngine.SceneManagement.Scene activeScene = EditorSceneManager.OpenScene(scenePath, OpenSceneMode.Single);

        // Remove default Directional Light since Undertale is ambient-dark
        GameObject dirLight = GameObject.Find("Directional Light");
        if (dirLight != null)
        {
            Object.DestroyImmediate(dirLight);
        }

        // Deep clean the scene from any broken references, ScoreManager, and RetroSoundGenerator
        var allObjects = new System.Collections.Generic.List<GameObject>();
        foreach (GameObject root in activeScene.GetRootGameObjects())
        {
            GetChildGameObjectsRecursively(root, allObjects);
        }

        foreach (GameObject go in allObjects)
        {
            if (go == null) continue;

            bool isBrokenPrefab = PrefabUtility.IsPartOfPrefabInstance(go) && PrefabUtility.GetCorrespondingObjectFromSource(go) == null;
            bool isWrongObject = go.name == "ScoreManager" || go.name == "RetroSoundGenerator";

            if (isBrokenPrefab || isWrongObject)
            {
                Debug.Log($"[Cleanup] Destroying invalid/broken object in scene: {go.name}");
                Object.DestroyImmediate(go);
            }
        }

        // CRITICAL CLEAR: Destroy old setup components to enforce clean prefab connections and correct SpriteRenderers!
        string[] objectsToClear = { "PlayerSoul", "BattleBox", "SoundManager", "MrOshino", "Canvas", "Phase1Spawner", "UndertaleBattleManager", "ScoreManager" };
        foreach (string objName in objectsToClear)
        {
            GameObject existingGo = GameObject.Find(objName);
            if (existingGo != null)
            {
                Object.DestroyImmediate(existingGo);
            }
        }

        // 2. Setup Camera
        Camera mainCam = GameObject.FindFirstObjectByType<Camera>();
        if (mainCam == null)
        {
            GameObject camGo = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener));
            camGo.tag = "MainCamera";
            mainCam = camGo.GetComponent<Camera>();
            Debug.Log("Created Main Camera.");
        }

        if (mainCam != null)
        {
            mainCam.transform.position = new Vector3(315, 2.5f, -10);
            mainCam.orthographic = true;
            mainCam.orthographicSize = 3.5f;
            mainCam.backgroundColor = Color.black;
            mainCam.clearFlags = CameraClearFlags.SolidColor;
            mainCam.cullingMask = -1; // Render everything
            
            // Remove CameraFollow since the camera is static for the battle
            CameraFollow follow = mainCam.GetComponent<CameraFollow>();
            if (follow != null)
            {
                Object.DestroyImmediate(follow);
            }
        }

        // 3. Setup SoundManager
        GameObject soundGo = new GameObject("SoundManager");
        SoundManager soundManager = soundGo.AddComponent<SoundManager>();

        AudioSource sfxSource = soundGo.AddComponent<AudioSource>();
        soundManager.AudioSource = sfxSource;

        // Assign standard WAV audio clips
        soundManager.SelectClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Assets/Undertale/SFX/snd_select.wav");
        soundManager.TextClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Assets/Undertale/SFX/snd_text.wav");
        soundManager.SlashClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Assets/Undertale/SFX/snd_slash.wav");
        soundManager.HurtClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Assets/Undertale/SFX/snd_hurt.wav");

        // 4. Create BattleBox from Prefab
        GameObject boxGo;
        GameObject prefabBox = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/Undertale/BattleBox.prefab");
        if (prefabBox != null)
        {
            boxGo = PrefabUtility.InstantiatePrefab(prefabBox) as GameObject;
            boxGo.name = "BattleBox";
            boxGo.transform.position = new Vector3(315, 2.5f, 0);
        }
        else
        {
            boxGo = new GameObject("BattleBox", typeof(BattleBox));
            boxGo.transform.position = new Vector3(315, 2.5f, 0);
        }
        BattleBox box = boxGo.GetComponent<BattleBox>();
        box.Size = new Vector2(8.5f, 2.5f);
        box.TargetSize = new Vector2(8.5f, 2.5f);

        // 5. Create PlayerSoul from Prefab (Ensures correct fresh SpriteRenderer settings!)
        GameObject soulGo;
        GameObject prefabSoul = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/Undertale/PlayerSoul.prefab");
        if (prefabSoul != null)
        {
            soulGo = PrefabUtility.InstantiatePrefab(prefabSoul) as GameObject;
            soulGo.name = "PlayerSoul";
            soulGo.transform.position = new Vector3(315, 2.5f, 0);
        }
        else
        {
            soulGo = new GameObject("PlayerSoul", typeof(PlayerSoul));
            soulGo.transform.position = new Vector3(315, 2.5f, 0);
        }
        PlayerSoul soul = soulGo.GetComponent<PlayerSoul>();

        // 6. Create Enemy "MrOshino" Visual Representation
        GameObject enemyGo;
        GameObject prefabEnemy = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/Undertale/Froggit.prefab");
        if (prefabEnemy != null)
        {
            enemyGo = PrefabUtility.InstantiatePrefab(prefabEnemy) as GameObject;
            enemyGo.name = "MrOshino";
            enemyGo.transform.position = new Vector3(315, 4.0f, 0);
        }
        else
        {
            enemyGo = new GameObject("MrOshino", typeof(SpriteRenderer));
            enemyGo.transform.position = new Vector3(315, 4.0f, 0);
        }
        SpriteRenderer enemySr = enemyGo.GetComponent<SpriteRenderer>();

        // Load the customized sliced Oshino sprite assets
        Sprite standSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Undertale/Oshino/Oshino_Stand.png");
        Sprite breathe1Sprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Undertale/Oshino/Oshino_Breathe_1.png");
        Sprite breathe2Sprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Undertale/Oshino/Oshino_Breathe_2.png");
        Sprite woundedSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Undertale/Oshino/Oshino_Wounded.png");
        Sprite defeatedSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Undertale/Oshino/Oshino_Defeated.png");

        if (enemySr != null && standSprite != null)
        {
            enemySr.sprite = standSprite;
        }

        // 7. Create Canvas & UI Elements
        GameObject canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
        Canvas canvas = canvasGo.GetComponent<Canvas>();
        
        // Set RenderMode to ScreenSpaceCamera and wire camera
        canvas.renderMode = RenderMode.ScreenSpaceCamera;
        canvas.worldCamera = mainCam;
        canvas.planeDistance = 15f; // Canvas at Z = 5 (safely behind sprites at Z = 0)
        canvas.sortingOrder = -10; // Renders behind sprites

        CanvasScaler scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(640, 480);
        scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
        scaler.matchWidthOrHeight = 0.5f;

        // Create UIRoot
        GameObject uiRootGo = new GameObject("UndertaleUIRoot", typeof(RectTransform));
        uiRootGo.transform.SetParent(canvasGo.transform, false);
        RectTransform uiRootRt = uiRootGo.GetComponent<RectTransform>();
        uiRootRt.anchorMin = Vector2.zero;
        uiRootRt.anchorMax = Vector2.one;
        uiRootRt.sizeDelta = Vector2.zero;

        // Create Dialogue Text Area
        GameObject dialogueGo = new GameObject("DialogueText", typeof(RectTransform));
        dialogueGo.transform.SetParent(uiRootGo.transform, false);
        TextMeshProUGUI dialogueText = dialogueGo.AddComponent<TextMeshProUGUI>();
        dialogueText.fontSize = 20;
        dialogueText.color = Color.white;
        dialogueText.fontStyle = FontStyles.Bold;
        dialogueText.alignment = TextAlignmentOptions.TopLeft;
        dialogueText.text = "* Mr. Oshino blocks the way!";
        
        RectTransform dialogueRt = dialogueGo.GetComponent<RectTransform>();
        dialogueRt.anchorMin = new Vector2(0.5f, 0.5f);
        dialogueRt.anchorMax = new Vector2(0.5f, 0.5f);
        dialogueRt.pivot = new Vector2(0.5f, 0.5f);
        dialogueRt.anchoredPosition = new Vector2(15f, 5f);
        dialogueRt.sizeDelta = new Vector2(480f, 110f);

        // Create Buttons: FIGHT, ACT, ITEM, MERCY
        string[] btnNames = { "FIGHT", "ACT", "ITEM", "MERCY" };
        Color[] btnColors = { Color.orange, Color.yellow, Color.green, Color.cyan };
        float[] btnXCoords = { -210f, -70f, 70f, 210f };

        for (int i = 0; i < 4; i++)
        {
            string bName = "Button_" + btnNames[i];
            GameObject btnGo = new GameObject(bName, typeof(RectTransform), typeof(Image));
            btnGo.transform.SetParent(uiRootGo.transform, false);
            
            RectTransform btnRt = btnGo.GetComponent<RectTransform>();
            btnRt.anchorMin = new Vector2(0.5f, 0.5f);
            btnRt.anchorMax = new Vector2(0.5f, 0.5f);
            btnRt.pivot = new Vector2(0.5f, 0.5f);
            btnRt.anchoredPosition = new Vector2(btnXCoords[i], -165f);
            btnRt.sizeDelta = new Vector2(115f, 40f);

            Image img = btnGo.GetComponent<Image>();
            img.color = Color.clear;
            
            Outline outline = btnGo.AddComponent<Outline>();
            outline.effectColor = btnColors[i];
            outline.effectDistance = new Vector2(2, 2);

            GameObject lblGo = new GameObject(bName + "_Label", typeof(RectTransform));
            lblGo.transform.SetParent(btnGo.transform, false);
            TextMeshProUGUI label = lblGo.AddComponent<TextMeshProUGUI>();
            label.text = btnNames[i];
            label.color = btnColors[i];
            label.fontSize = 22;
            label.alignment = TextAlignmentOptions.Center;
            label.fontStyle = FontStyles.Bold;

            RectTransform lblRt = lblGo.GetComponent<RectTransform>();
            lblRt.anchorMin = Vector2.zero;
            lblRt.anchorMax = Vector2.one;
            lblRt.sizeDelta = Vector2.zero;
        }

        // Setup Stats Row
        GameObject statsRowGo = new GameObject("StatsRow", typeof(RectTransform));
        statsRowGo.transform.SetParent(uiRootGo.transform, false);
        RectTransform statsRowRt = statsRowGo.GetComponent<RectTransform>();
        statsRowRt.anchorMin = new Vector2(0.5f, 0.5f);
        statsRowRt.anchorMax = new Vector2(0.5f, 0.5f);
        statsRowRt.pivot = new Vector2(0.5f, 0.5f);
        statsRowRt.anchoredPosition = new Vector2(0, -115f);
        statsRowRt.sizeDelta = new Vector2(540f, 30f);

        GameObject statsTextGo = new GameObject("StatsText", typeof(RectTransform));
        statsTextGo.transform.SetParent(statsRowGo.transform, false);
        TextMeshProUGUI statsText = statsTextGo.AddComponent<TextMeshProUGUI>();
        statsText.text = "CHARA   LV 1      HP";
        statsText.fontSize = 18;
        statsText.color = Color.white;
        statsText.fontStyle = FontStyles.Bold;
        
        RectTransform statsTextRt = statsTextGo.GetComponent<RectTransform>();
        statsTextRt.anchorMin = new Vector2(0, 0.5f);
        statsTextRt.anchorMax = new Vector2(0, 0.5f);
        statsTextRt.pivot = new Vector2(0, 0.5f);
        statsTextRt.anchoredPosition = new Vector2(10f, 0);
        statsTextRt.sizeDelta = new Vector2(250f, 30f);

        GameObject hpBarGo = new GameObject("HPBar", typeof(RectTransform), typeof(Image));
        hpBarGo.transform.SetParent(statsRowGo.transform, false);
        RectTransform hpBarRt = hpBarGo.GetComponent<RectTransform>();
        hpBarRt.anchorMin = new Vector2(0.5f, 0.5f);
        hpBarRt.anchorMax = new Vector2(0.5f, 0.5f);
        hpBarRt.pivot = new Vector2(0.5f, 0.5f);
        hpBarRt.anchoredPosition = new Vector2(30f, 0);
        hpBarRt.sizeDelta = new Vector2(50f, 16f);

        Image bgImg = hpBarGo.GetComponent<Image>();
        bgImg.color = new Color(0.7f, 0f, 0f);

        HPBar hpBar = hpBarGo.AddComponent<HPBar>();
        hpBar.StatsText = statsText;

        GameObject fillGo = new GameObject("HPBar_Fill", typeof(RectTransform), typeof(Image));
        fillGo.transform.SetParent(hpBarGo.transform, false);
        RectTransform fillRt = fillGo.GetComponent<RectTransform>();
        fillRt.anchorMin = Vector2.zero;
        fillRt.anchorMax = Vector2.one;
        fillRt.sizeDelta = Vector2.zero;

        Image fillImg = fillGo.GetComponent<Image>();
        fillImg.color = Color.yellow;
        fillImg.type = Image.Type.Filled;
        fillImg.fillMethod = Image.FillMethod.Horizontal;
        fillImg.fillOrigin = (int)Image.OriginHorizontal.Left;
        
        hpBar.FillBar = fillImg;

        GameObject hpNumsGo = new GameObject("HPNumbersText", typeof(RectTransform));
        hpNumsGo.transform.SetParent(statsRowGo.transform, false);
        TextMeshProUGUI hpNumsText = hpNumsGo.AddComponent<TextMeshProUGUI>();
        hpNumsText.text = "20 / 20";
        hpNumsText.fontSize = 18;
        hpNumsText.color = Color.white;
        hpNumsText.fontStyle = FontStyles.Bold;

        RectTransform hpNumsRt = hpNumsGo.GetComponent<RectTransform>();
        hpNumsRt.anchorMin = new Vector2(1f, 0.5f);
        hpNumsRt.anchorMax = new Vector2(1f, 0.5f);
        hpNumsRt.pivot = new Vector2(1f, 0.5f);
        hpNumsRt.anchoredPosition = new Vector2(-10f, 0);
        hpNumsRt.sizeDelta = new Vector2(100f, 30f);

        hpBar.HPNumbersText = hpNumsText;

        // 8. Create FIGHT Target Slider Panel
        GameObject sliderPanelGo = new GameObject("FightTargetPanel", typeof(RectTransform), typeof(Image));
        sliderPanelGo.transform.SetParent(uiRootGo.transform, false);
        RectTransform sliderPanelRt = sliderPanelGo.GetComponent<RectTransform>();
        sliderPanelRt.anchorMin = new Vector2(0.5f, 0.5f);
        sliderPanelRt.anchorMax = new Vector2(0.5f, 0.5f);
        sliderPanelRt.pivot = new Vector2(0.5f, 0.5f);
        sliderPanelRt.anchoredPosition = new Vector2(15f, 5f);
        sliderPanelRt.sizeDelta = new Vector2(470f, 100f);

        Image sliderPanelImg = sliderPanelGo.GetComponent<Image>();
        sliderPanelImg.color = Color.black;
        
        Outline sliderOutline = sliderPanelGo.AddComponent<Outline>();
        sliderOutline.effectColor = Color.white;
        sliderOutline.effectDistance = new Vector2(2, 2);

        GameObject targetMarkerGo = new GameObject("TargetMarker", typeof(RectTransform), typeof(Image));
        targetMarkerGo.transform.SetParent(sliderPanelGo.transform, false);
        RectTransform markerRt = targetMarkerGo.GetComponent<RectTransform>();
        markerRt.anchorMin = new Vector2(0.5f, 0.5f);
        markerRt.anchorMax = new Vector2(0.5f, 0.5f);
        markerRt.pivot = new Vector2(0.5f, 0.5f);
        markerRt.anchoredPosition = Vector2.zero;
        markerRt.sizeDelta = new Vector2(6f, 96f);
        targetMarkerGo.GetComponent<Image>().color = Color.red;

        GameObject sliderBarGo = new GameObject("SliderBar", typeof(RectTransform), typeof(Image));
        sliderBarGo.transform.SetParent(sliderPanelGo.transform, false);
        RectTransform sliderBarRt = sliderBarGo.GetComponent<RectTransform>();
        sliderBarRt.anchorMin = new Vector2(0.5f, 0.5f);
        sliderBarRt.anchorMax = new Vector2(0.5f, 0.5f);
        sliderBarRt.pivot = new Vector2(0.5f, 0.5f);
        sliderBarRt.anchoredPosition = new Vector2(-230f, 0);
        sliderBarRt.sizeDelta = new Vector2(12f, 94f);
        sliderBarGo.GetComponent<Image>().color = Color.white;

        // 9. Create Phase1Spawner
        GameObject spawnerGo = new GameObject("Phase1Spawner");
        Phase1Spawner spawner = spawnerGo.AddComponent<Phase1Spawner>();
        
        GameObject pickupPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/pickupPrefab.prefab");
        if (pickupPrefab != null)
        {
            spawner.PickupPrefab = pickupPrefab;
        }
        else
        {
            Debug.LogWarning("UFO pickupPrefab not found at Assets/_Prefabs/pickupPrefab.prefab");
        }

        // 10. Setup UndertaleBattleManager GameObject
        GameObject managerGo = new GameObject("UndertaleBattleManager");
        UndertaleBattleManager manager = managerGo.AddComponent<UndertaleBattleManager>();
        
        // WIRE THE SERIALIZED INSPECTOR REFERENCES DIRECTLY (Industry Standard Practice)
        manager.PlayerSoul = soul;
        manager.BattleBox = box;
        manager.BulletSpawner = spawner;
        manager.DialogueText = dialogueText;
        manager.StatsTextGo = statsRowGo;
        manager.EnemyTransform = enemyGo.transform;
        manager.EnemySpriteRenderer = enemySr;
        manager.FightTargetPanel = sliderPanelGo;
        manager.SliderBar = sliderBarRt;

        // Wire Mr. Oshino specific sprites
        manager.OshinoStand = standSprite;
        manager.OshinoBreathe1 = breathe1Sprite;
        manager.OshinoBreathe2 = breathe2Sprite;
        manager.OshinoWounded = woundedSprite;
        manager.OshinoDefeated = defeatedSprite;

        // Wire BGM clip
        AudioSource bgmSource = managerGo.AddComponent<AudioSource>();
        AudioClip bgmClip = AssetDatabase.LoadAssetAtPath<AudioClip>("Assets/_Assets/Undertale/ScatteredAndLost.mp3");
        manager.BGMSource = bgmSource;
        manager.BGMClip = bgmClip;

        // 11. EventSystem
        if (GameObject.FindFirstObjectByType<UnityEngine.EventSystems.EventSystem>() == null)
        {
            new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem), typeof(UnityEngine.EventSystems.StandaloneInputModule));
        }

        // 12. Save the scene file directly to serialize everything in Unity
        EditorSceneManager.MarkSceneDirty(activeScene);
        EditorSceneManager.SaveScene(activeScene);

        Debug.Log("Undertale turn-based battle scene setup completed and pre-saved successfully!");
    }

    private static void EnsureUndertaleAssetsAndPrefabsExist()
    {
        // 1. Create directories
        if (!System.IO.Directory.Exists("Assets/_Assets/Undertale"))
        {
            System.IO.Directory.CreateDirectory("Assets/_Assets/Undertale");
        }
        if (!System.IO.Directory.Exists("Assets/_Prefabs/Undertale"))
        {
            System.IO.Directory.CreateDirectory("Assets/_Prefabs/Undertale");
        }

        // 2. Generate and save textures (Heart and Bullet)
        EnsureTexture("Assets/_Assets/Undertale/HeartSprite.png", 16, 16, (x, y) => {
            int[,] grid = new int[16, 16] {
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
            return grid[15 - y, x] == 1 ? Color.white : Color.clear;
        }, 48f);

        EnsureTexture("Assets/_Assets/Undertale/BulletSprite.png", 16, 16, (x, y) => {
            float dist = Vector2.Distance(new Vector2(x, y), new Vector2(7.5f, 7.5f));
            return dist <= 7.5f ? Color.white : Color.clear;
        }, 48f);

        AssetDatabase.Refresh();

        // 3. Ensure Prefabs exist
        Sprite heartSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Undertale/HeartSprite.png");
        Sprite bulletSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Undertale/BulletSprite.png");

        // PlayerSoul Prefab
        string soulPath = "Assets/_Prefabs/Undertale/PlayerSoul.prefab";
        if (AssetDatabase.LoadAssetAtPath<GameObject>(soulPath) == null)
        {
            GameObject go = new GameObject("PlayerSoul_Temp");
            SpriteRenderer sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = heartSprite;
            sr.color = Color.red;
            sr.sortingOrder = 100; // Force high sorting order on the prefab directly
            go.AddComponent<CircleCollider2D>().isTrigger = true;
            Rigidbody2D rb = go.AddComponent<Rigidbody2D>();
            rb.bodyType = RigidbodyType2D.Kinematic;
            go.AddComponent<PlayerSoul>();
            
            PrefabUtility.SaveAsPrefabAsset(go, soulPath);
            Object.DestroyImmediate(go);
            Debug.Log("Created PlayerSoul prefab.");
        }

        // BattleBox Prefab
        string boxPath = "Assets/_Prefabs/Undertale/BattleBox.prefab";
        if (AssetDatabase.LoadAssetAtPath<GameObject>(boxPath) == null)
        {
            GameObject go = new GameObject("BattleBox_Temp");
            go.AddComponent<LineRenderer>();
            go.AddComponent<BattleBox>();
            
            PrefabUtility.SaveAsPrefabAsset(go, boxPath);
            Object.DestroyImmediate(go);
            Debug.Log("Created BattleBox prefab.");
        }

        // UndertaleBullet Prefab (WHITE color to match Undertale style)
        string bulletPath = "Assets/_Prefabs/Undertale/UndertaleBullet.prefab";
        if (AssetDatabase.LoadAssetAtPath<GameObject>(bulletPath) == null)
        {
            GameObject go = new GameObject("UndertaleBullet_Temp");
            SpriteRenderer sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = bulletSprite;
            sr.color = Color.white; // White bullet color
            sr.sortingOrder = 5;
            go.AddComponent<CircleCollider2D>().isTrigger = true;
            go.AddComponent<Bullet>();
            
            PrefabUtility.SaveAsPrefabAsset(go, bulletPath);
            Object.DestroyImmediate(go);
            Debug.Log("Created UndertaleBullet prefab.");
        }

        // Froggit/Enemy Prefab (used as MrOshino visual shell)
        string froggitPath = "Assets/_Prefabs/Undertale/Froggit.prefab";
        if (AssetDatabase.LoadAssetAtPath<GameObject>(froggitPath) == null)
        {
            GameObject go = new GameObject("Froggit_Temp");
            SpriteRenderer sr = go.AddComponent<SpriteRenderer>();
            sr.color = Color.white;
            sr.sortingOrder = 3;
            
            PrefabUtility.SaveAsPrefabAsset(go, froggitPath);
            Object.DestroyImmediate(go);
            Debug.Log("Created Froggit prefab.");
        }
    }

    private static void EnsureTexture(string path, int width, int height, System.Func<int, int, Color> colorFunc, float ppu)
    {
        if (!System.IO.File.Exists(path))
        {
            Texture2D tex = new Texture2D(width, height);
            tex.filterMode = FilterMode.Point;
            for (int y = 0; y < height; y++)
            {
                for (int x = 0; x < width; x++)
                {
                    tex.SetPixel(x, y, colorFunc(x, y));
                }
            }
            tex.Apply();
            byte[] bytes = tex.EncodeToPNG();
            System.IO.File.WriteAllBytes(path, bytes);
            AssetDatabase.ImportAsset(path);
        }

        TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
        if (importer != null && importer.spritePixelsPerUnit != ppu)
        {
            importer.textureType = TextureImporterType.Sprite;
            importer.spritePixelsPerUnit = ppu;
            importer.filterMode = FilterMode.Point;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.SaveAndReimport();
        }
    }

    private static void GetChildGameObjectsRecursively(GameObject go, System.Collections.Generic.List<GameObject> list)
    {
        if (go == null) return;
        list.Add(go);
        for (int i = 0; i < go.transform.childCount; i++)
        {
            Transform child = go.transform.GetChild(i);
            if (child != null && child.gameObject != null)
            {
                GetChildGameObjectsRecursively(child.gameObject, list);
            }
        }
    }
}
#endif
