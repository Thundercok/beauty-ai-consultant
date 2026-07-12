#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.IO;

public static class SetupDemoScene
{
    [MenuItem("Tools/Setup UFO Demo Scene")]
    public static void CreateUFODemoScene()
    {
        // 1. Setup Camera (create if completely deleted)
        Camera mainCam = Camera.main;
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
            if (mainCam.GetComponent<CameraFollow>() == null)
            {
                mainCam.gameObject.AddComponent<CameraFollow>();
            }
        }

        // 2. Setup Background (create if completely deleted)
        GameObject bg = GameObject.Find("Background_0");
        if (bg == null)
        {
            bg = new GameObject("Background_0");
            SpriteRenderer bgSr = bg.AddComponent<SpriteRenderer>();
            Sprite bgSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Background.png");
            if (bgSprite != null)
            {
                bgSr.sprite = bgSprite;
            }
            bgSr.sortingOrder = -10; // Render behind everything
            Debug.Log("Background_0 not found. Created a new Background_0.");
        }

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
            ufo.tag = "Player";
            
            // Add SpriteRenderer
            SpriteRenderer sr = ufo.AddComponent<SpriteRenderer>();
            Sprite ufoSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/UFO.png");
            if (ufoSprite != null)
            {
                sr.sprite = ufoSprite;
            }

            // Add Collider & Rigidbody
            ufo.AddComponent<CircleCollider2D>();
            Rigidbody2D rb = ufo.AddComponent<Rigidbody2D>();
            rb.gravityScale = 0f;
            rb.linearDamping = 1.5f; // drag
            
            // Add UFOController
            ufo.AddComponent<UFOController>();
            Debug.Log("Created UFO Player ship.");
        }

        // 5. Create Canvas and UI
        GameObject canvasGo = GameObject.Find("Canvas");
        if (canvasGo == null)
        {
            canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            Canvas canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            Debug.Log("Canvas not found. Created a new Canvas.");
        }

        // Create Score Text (TMP)
        GameObject scoreTextGo = GameObject.Find("ScoreText");
        if (scoreTextGo == null)
        {
            scoreTextGo = new GameObject("ScoreText", typeof(RectTransform));
            scoreTextGo.transform.SetParent(canvasGo.transform, false);
            TextMeshProUGUI tmp = scoreTextGo.AddComponent<TextMeshProUGUI>();
            tmp.fontSize = 24;
            tmp.color = Color.white;
            tmp.alignment = TextAlignmentOptions.TopLeft;
            tmp.text = "Coins: 0 / 15";
            
            RectTransform rect = scoreTextGo.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0, 1);
            rect.anchorMax = new Vector2(0, 1);
            rect.pivot = new Vector2(0, 1);
            rect.anchoredPosition = new Vector2(20, -20);
            rect.sizeDelta = new Vector2(300, 50);

            // Hook up reference to UFOController
            UFOController ufoCtrl = ufo.GetComponent<UFOController>();
            if (ufoCtrl != null)
            {
                ufoCtrl.scoreText = tmp;
            }
        }

        // Create Timer Text (TMP)
        GameObject timerTextGo = GameObject.Find("TimerText");
        if (timerTextGo == null)
        {
            timerTextGo = new GameObject("TimerText", typeof(RectTransform));
            timerTextGo.transform.SetParent(canvasGo.transform, false);
            TextMeshProUGUI tmp = timerTextGo.AddComponent<TextMeshProUGUI>();
            tmp.fontSize = 24;
            tmp.color = Color.white;
            tmp.alignment = TextAlignmentOptions.TopRight;
            tmp.text = "Time: 60s";

            RectTransform rect = timerTextGo.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(1, 1);
            rect.anchorMax = new Vector2(1, 1);
            rect.pivot = new Vector2(1, 1);
            rect.anchoredPosition = new Vector2(-20, -20);
            rect.sizeDelta = new Vector2(300, 50);

            UFOController ufoCtrl = ufo.GetComponent<UFOController>();
            if (ufoCtrl != null)
            {
                ufoCtrl.timerText = tmp;
            }
        }

        // Create HPBar UI under Canvas
        GameObject hpBarGo = GameObject.Find("HPBar");
        if (hpBarGo == null)
        {
            hpBarGo = new GameObject("HPBar", typeof(RectTransform));
            hpBarGo.transform.SetParent(canvasGo.transform, false);
            HPBar hpBarScript = hpBarGo.AddComponent<HPBar>();

            RectTransform rect = hpBarGo.GetComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.5f, 0);
            rect.anchorMax = new Vector2(0.5f, 0);
            rect.pivot = new Vector2(0.5f, 0);
            rect.anchoredPosition = new Vector2(0, 30);
            rect.sizeDelta = new Vector2(200, 20);

            // Add background Image
            Image bgImg = hpBarGo.AddComponent<Image>();
            bgImg.color = Color.gray;

            // Add fill Image
            GameObject fillGo = new GameObject("Fill", typeof(RectTransform));
            fillGo.transform.SetParent(hpBarGo.transform, false);
            Image fillImg = fillGo.AddComponent<Image>();
            fillImg.color = Color.green;
            fillImg.type = Image.Type.Filled;
            fillImg.fillMethod = Image.FillMethod.Horizontal;
            fillImg.fillOrigin = (int)Image.OriginHorizontal.Left;

            RectTransform fillRect = fillGo.GetComponent<RectTransform>();
            fillRect.anchorMin = Vector2.zero;
            fillRect.anchorMax = Vector2.one;
            fillRect.sizeDelta = Vector2.zero;

            hpBarScript.fillBar = fillImg;
        }

        // 6. Create GameManager
        GameObject gm = GameObject.Find("GameManager");
        if (gm == null)
        {
            gm = new GameObject("GameManager");
            GameManager gmScript = gm.AddComponent<GameManager>();
            gmScript.pickupPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/pickupPrefab.prefab");
            gmScript.enemyPrefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/EnemyPrefab.prefab");
            Debug.Log("Created GameManager.");
        }

        // 7. Create Phase1Spawner
        GameObject spawner = GameObject.Find("Phase1Spawner");
        if (spawner == null)
        {
            spawner = new GameObject("Phase1Spawner");
            spawner.AddComponent<Phase1Spawner>();
        }

        // 8. Create EventSystem if missing
        if (GameObject.FindFirstObjectByType<UnityEngine.EventSystems.EventSystem>() == null)
        {
            new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem), typeof(UnityEngine.EventSystems.StandaloneInputModule));
        }

        Debug.Log("UFO Demo Scene setup completed successfully!");
    }

    [MenuItem("Tools/Setup Undertale Demo Scene")]
    public static void CreateUndertaleDemoScene()
    {
        // 0. Ensure physical PNG assets and Prefab assets exist in project directories
        EnsureUndertaleAssetsAndPrefabsExist();

        // 1. Setup Camera
        Camera mainCam = Camera.main;
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
            
            // Remove CameraFollow since the camera is static for the battle
            CameraFollow follow = mainCam.GetComponent<CameraFollow>();
            if (follow != null)
            {
                Object.DestroyImmediate(follow);
            }
        }

        // 2. Setup RetroSoundGenerator from Prefab
        GameObject soundGo = GameObject.Find("RetroSoundGenerator");
        if (soundGo == null)
        {
            GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/Undertale/RetroSoundGenerator.prefab");
            if (prefab != null)
            {
                soundGo = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
                soundGo.name = "RetroSoundGenerator";
            }
            else
            {
                soundGo = new GameObject("RetroSoundGenerator", typeof(RetroSoundGenerator));
            }
            Debug.Log("Instantiated RetroSoundGenerator.");
        }

        // 3. Create BattleBox from Prefab
        GameObject boxGo = GameObject.Find("BattleBox");
        if (boxGo == null)
        {
            GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/Undertale/BattleBox.prefab");
            if (prefab != null)
            {
                boxGo = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
                boxGo.name = "BattleBox";
                boxGo.transform.position = new Vector3(315, 2.5f, 0);
            }
            else
            {
                boxGo = new GameObject("BattleBox", typeof(BattleBox));
                boxGo.transform.position = new Vector3(315, 2.5f, 0);
            }
            Debug.Log("Instantiated BattleBox Prefab.");
        }
        BattleBox box = boxGo.GetComponent<BattleBox>();
        box.size = new Vector2(8.5f, 2.5f);
        box.targetSize = new Vector2(8.5f, 2.5f);

        // 4. Create PlayerSoul from Prefab
        GameObject soulGo = GameObject.Find("PlayerSoul");
        if (soulGo == null)
        {
            GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/Undertale/PlayerSoul.prefab");
            if (prefab != null)
            {
                soulGo = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
                soulGo.name = "PlayerSoul";
                soulGo.transform.position = new Vector3(315, 2.5f, 0);
            }
            else
            {
                soulGo = new GameObject("PlayerSoul", typeof(PlayerSoul));
                soulGo.transform.position = new Vector3(315, 2.5f, 0);
            }
            Debug.Log("Instantiated PlayerSoul Prefab.");
        }
        PlayerSoul soul = soulGo.GetComponent<PlayerSoul>();

        // 5. Create Enemy "Froggit" from Prefab
        GameObject enemyGo = GameObject.Find("Froggit");
        if (enemyGo == null)
        {
            GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>("Assets/_Prefabs/Undertale/Froggit.prefab");
            if (prefab != null)
            {
                enemyGo = PrefabUtility.InstantiatePrefab(prefab) as GameObject;
                enemyGo.name = "Froggit";
                enemyGo.transform.position = new Vector3(315, 4.3f, 0);
            }
            else
            {
                enemyGo = new GameObject("Froggit", typeof(SpriteRenderer));
                enemyGo.transform.position = new Vector3(315, 4.3f, 0);
            }
            Debug.Log("Instantiated Froggit Prefab.");
        }
        SpriteRenderer enemySr = enemyGo.GetComponent<SpriteRenderer>();

        // 6. Create Canvas & UI Elements
        GameObject canvasGo = GameObject.Find("Canvas");
        if (canvasGo == null)
        {
            canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            Debug.Log("Created Canvas.");
        }
        Canvas canvas = canvasGo.GetComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;

        CanvasScaler scaler = canvasGo.GetComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(640, 480);
        scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
        scaler.matchWidthOrHeight = 0.5f;

        // Create UIRoot
        GameObject uiRootGo = GameObject.Find("UndertaleUIRoot");
        if (uiRootGo == null)
        {
            uiRootGo = new GameObject("UndertaleUIRoot", typeof(RectTransform));
            uiRootGo.transform.SetParent(canvasGo.transform, false);
        }
        RectTransform uiRootRt = uiRootGo.GetComponent<RectTransform>();
        uiRootRt.anchorMin = Vector2.zero;
        uiRootRt.anchorMax = Vector2.one;
        uiRootRt.sizeDelta = Vector2.zero;

        // Create Dialogue Text Area
        GameObject dialogueGo = GameObject.Find("DialogueText");
        if (dialogueGo == null)
        {
            dialogueGo = new GameObject("DialogueText", typeof(RectTransform));
            dialogueGo.transform.SetParent(uiRootGo.transform, false);
        }
        TextMeshProUGUI dialogueText = dialogueGo.GetComponent<TextMeshProUGUI>();
        if (dialogueText == null) dialogueText = dialogueGo.AddComponent<TextMeshProUGUI>();
        dialogueText.fontSize = 20;
        dialogueText.color = Color.white;
        dialogueText.fontStyle = FontStyles.Bold;
        dialogueText.alignment = TextAlignmentOptions.TopLeft;
        dialogueText.text = "* Froggit blocks the way!";
        
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
            GameObject btnGo = GameObject.Find(bName);
            if (btnGo == null)
            {
                btnGo = new GameObject(bName, typeof(RectTransform), typeof(Image));
                btnGo.transform.SetParent(uiRootGo.transform, false);
            }
            
            RectTransform btnRt = btnGo.GetComponent<RectTransform>();
            btnRt.anchorMin = new Vector2(0.5f, 0.5f);
            btnRt.anchorMax = new Vector2(0.5f, 0.5f);
            btnRt.pivot = new Vector2(0.5f, 0.5f);
            btnRt.anchoredPosition = new Vector2(btnXCoords[i], -165f);
            btnRt.sizeDelta = new Vector2(115f, 40f);

            Image img = btnGo.GetComponent<Image>();
            img.color = Color.black;
            
            Outline outline = btnGo.GetComponent<Outline>();
            if (outline == null) outline = btnGo.AddComponent<Outline>();
            outline.effectColor = btnColors[i];
            outline.effectDistance = new Vector2(2, 2);

            GameObject lblGo = GameObject.Find(bName + "_Label");
            if (lblGo == null)
            {
                lblGo = new GameObject(bName + "_Label", typeof(RectTransform));
                lblGo.transform.SetParent(btnGo.transform, false);
            }
            TextMeshProUGUI label = lblGo.GetComponent<TextMeshProUGUI>();
            if (label == null) label = lblGo.AddComponent<TextMeshProUGUI>();
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
        GameObject statsRowGo = GameObject.Find("StatsRow");
        if (statsRowGo == null)
        {
            statsRowGo = new GameObject("StatsRow", typeof(RectTransform));
            statsRowGo.transform.SetParent(uiRootGo.transform, false);
        }
        RectTransform statsRowRt = statsRowGo.GetComponent<RectTransform>();
        statsRowRt.anchorMin = new Vector2(0.5f, 0.5f);
        statsRowRt.anchorMax = new Vector2(0.5f, 0.5f);
        statsRowRt.pivot = new Vector2(0.5f, 0.5f);
        statsRowRt.anchoredPosition = new Vector2(0, -115f);
        statsRowRt.sizeDelta = new Vector2(540f, 30f);

        GameObject statsTextGo = GameObject.Find("StatsText");
        if (statsTextGo == null)
        {
            statsTextGo = new GameObject("StatsText", typeof(RectTransform));
            statsTextGo.transform.SetParent(statsRowGo.transform, false);
        }
        TextMeshProUGUI statsText = statsTextGo.GetComponent<TextMeshProUGUI>();
        if (statsText == null) statsText = statsTextGo.AddComponent<TextMeshProUGUI>();
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

        GameObject hpBarGo = GameObject.Find("HPBar");
        if (hpBarGo == null)
        {
            hpBarGo = new GameObject("HPBar", typeof(RectTransform), typeof(Image));
            hpBarGo.transform.SetParent(statsRowGo.transform, false);
        }
        RectTransform hpBarRt = hpBarGo.GetComponent<RectTransform>();
        hpBarRt.anchorMin = new Vector2(0.5f, 0.5f);
        hpBarRt.anchorMax = new Vector2(0.5f, 0.5f);
        hpBarRt.pivot = new Vector2(0.5f, 0.5f);
        hpBarRt.anchoredPosition = new Vector2(30f, 0);
        hpBarRt.sizeDelta = new Vector2(50f, 16f);

        Image bgImg = hpBarGo.GetComponent<Image>();
        bgImg.color = new Color(0.7f, 0f, 0f);

        HPBar hpBar = hpBarGo.GetComponent<HPBar>();
        if (hpBar == null) hpBar = hpBarGo.AddComponent<HPBar>();
        hpBar.statsText = statsText;

        GameObject fillGo = GameObject.Find("HPBar_Fill");
        if (fillGo == null)
        {
            fillGo = new GameObject("HPBar_Fill", typeof(RectTransform), typeof(Image));
            fillGo.transform.SetParent(hpBarGo.transform, false);
        }
        RectTransform fillRt = fillGo.GetComponent<RectTransform>();
        fillRt.anchorMin = Vector2.zero;
        fillRt.anchorMax = Vector2.one;
        fillRt.sizeDelta = Vector2.zero;

        Image fillImg = fillGo.GetComponent<Image>();
        fillImg.color = Color.yellow;
        fillImg.type = Image.Type.Filled;
        fillImg.fillMethod = Image.FillMethod.Horizontal;
        fillImg.fillOrigin = (int)Image.OriginHorizontal.Left;
        
        hpBar.fillBar = fillImg;

        GameObject hpNumsGo = GameObject.Find("HPNumbersText");
        if (hpNumsGo == null)
        {
            hpNumsGo = new GameObject("HPNumbersText", typeof(RectTransform));
            hpNumsGo.transform.SetParent(statsRowGo.transform, false);
        }
        TextMeshProUGUI hpNumsText = hpNumsGo.GetComponent<TextMeshProUGUI>();
        if (hpNumsText == null) hpNumsText = hpNumsGo.AddComponent<TextMeshProUGUI>();
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

        hpBar.hpNumbersText = hpNumsText;

        // 7. Create FIGHT Target Slider Panel
        GameObject sliderPanelGo = GameObject.Find("FightTargetPanel");
        if (sliderPanelGo == null)
        {
            sliderPanelGo = new GameObject("FightTargetPanel", typeof(RectTransform), typeof(Image));
            sliderPanelGo.transform.SetParent(uiRootGo.transform, false);
        }
        RectTransform sliderPanelRt = sliderPanelGo.GetComponent<RectTransform>();
        sliderPanelRt.anchorMin = new Vector2(0.5f, 0.5f);
        sliderPanelRt.anchorMax = new Vector2(0.5f, 0.5f);
        sliderPanelRt.pivot = new Vector2(0.5f, 0.5f);
        sliderPanelRt.anchoredPosition = new Vector2(15f, 5f);
        sliderPanelRt.sizeDelta = new Vector2(470f, 100f);

        Image sliderPanelImg = sliderPanelGo.GetComponent<Image>();
        sliderPanelImg.color = Color.black;
        
        Outline sliderOutline = sliderPanelGo.GetComponent<Outline>();
        if (sliderOutline == null) sliderOutline = sliderPanelGo.AddComponent<Outline>();
        sliderOutline.effectColor = Color.white;
        sliderOutline.effectDistance = new Vector2(2, 2);

        GameObject targetMarkerGo = GameObject.Find("TargetMarker");
        if (targetMarkerGo == null)
        {
            targetMarkerGo = new GameObject("TargetMarker", typeof(RectTransform), typeof(Image));
            targetMarkerGo.transform.SetParent(sliderPanelGo.transform, false);
        }
        RectTransform markerRt = targetMarkerGo.GetComponent<RectTransform>();
        markerRt.anchorMin = new Vector2(0.5f, 0.5f);
        markerRt.anchorMax = new Vector2(0.5f, 0.5f);
        markerRt.pivot = new Vector2(0.5f, 0.5f);
        markerRt.anchoredPosition = Vector2.zero;
        markerRt.sizeDelta = new Vector2(6f, 96f);
        targetMarkerGo.GetComponent<Image>().color = Color.red;

        GameObject sliderBarGo = GameObject.Find("SliderBar");
        if (sliderBarGo == null)
        {
            sliderBarGo = new GameObject("SliderBar", typeof(RectTransform), typeof(Image));
            sliderBarGo.transform.SetParent(sliderPanelGo.transform, false);
        }
        RectTransform sliderBarRt = sliderBarGo.GetComponent<RectTransform>();
        sliderBarRt.anchorMin = new Vector2(0.5f, 0.5f);
        sliderBarRt.anchorMax = new Vector2(0.5f, 0.5f);
        sliderBarRt.pivot = new Vector2(0.5f, 0.5f);
        sliderBarRt.anchoredPosition = new Vector2(-230f, 0);
        sliderBarRt.sizeDelta = new Vector2(12f, 94f);
        sliderBarGo.GetComponent<Image>().color = Color.white;

        // 8. Create Phase1Spawner
        GameObject spawnerGo = GameObject.Find("Phase1Spawner");
        if (spawnerGo == null)
        {
            spawnerGo = new GameObject("Phase1Spawner");
            Debug.Log("Created Phase1Spawner.");
        }
        Phase1Spawner spawner = spawnerGo.GetComponent<Phase1Spawner>();
        if (spawner == null) spawner = spawnerGo.AddComponent<Phase1Spawner>();

        // 9. Setup UndertaleBattleManager GameObject
        GameObject managerGo = GameObject.Find("UndertaleBattleManager");
        if (managerGo == null)
        {
            managerGo = new GameObject("UndertaleBattleManager");
            Debug.Log("Created UndertaleBattleManager.");
        }
        UndertaleBattleManager manager = managerGo.GetComponent<UndertaleBattleManager>();
        if (manager == null) manager = managerGo.AddComponent<UndertaleBattleManager>();
        
        manager.playerSoul = soul;
        manager.battleBox = box;
        manager.bulletSpawner = spawner;
        manager.dialogueText = dialogueText;
        manager.statsTextGo = statsRowGo;
        manager.enemyTransform = enemyGo.transform;
        manager.enemySpriteRenderer = enemySr;
        manager.fightTargetPanel = sliderPanelGo;
        manager.sliderBar = sliderBarRt;

        // 10. EventSystem
        if (GameObject.FindFirstObjectByType<UnityEngine.EventSystems.EventSystem>() == null)
        {
            new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem), typeof(UnityEngine.EventSystems.StandaloneInputModule));
        }

        Debug.Log("Undertale turn-based battle scene setup completed successfully!");
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

        // 2. Generate and save textures
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
        }, 16f);

        EnsureTexture("Assets/_Assets/Undertale/BulletSprite.png", 16, 16, (x, y) => {
            float dist = Vector2.Distance(new Vector2(x, y), new Vector2(7.5f, 7.5f));
            return dist <= 7.5f ? Color.white : Color.clear;
        }, 16f);

        EnsureTexture("Assets/_Assets/Undertale/FroggitSprite.png", 32, 32, (x, y) => {
            bool isFrog = false;
            // Head
            if (y >= 14 && y <= 24 && x >= 8 && x <= 24) isFrog = true;
            // Eyes
            if (y >= 22 && y <= 26 && ((x >= 9 && x <= 13) || (x >= 19 && x <= 23))) isFrog = true;
            // Body
            if (y >= 4 && y <= 15 && x >= 6 && x <= 26) isFrog = true;
            // Legs
            if (y >= 2 && y <= 8 && ((x >= 4 && x <= 8) || (x >= 24 && x <= 28))) isFrog = true;
            
            // Pupils (black dots on eyes)
            if (y >= 23 && y <= 25 && (x == 11 || x == 21)) isFrog = false;
            // Mouth (black line)
            if (y == 18 && x >= 12 && x <= 20) isFrog = false;
            
            return isFrog ? Color.white : Color.clear;
        }, 8f);

        AssetDatabase.Refresh();

        // 3. Ensure Prefabs exist
        Sprite heartSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Undertale/HeartSprite.png");
        Sprite bulletSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Undertale/BulletSprite.png");
        Sprite froggitSprite = AssetDatabase.LoadAssetAtPath<Sprite>("Assets/_Assets/Undertale/FroggitSprite.png");

        // PlayerSoul Prefab
        string soulPath = "Assets/_Prefabs/Undertale/PlayerSoul.prefab";
        if (AssetDatabase.LoadAssetAtPath<GameObject>(soulPath) == null)
        {
            GameObject go = new GameObject("PlayerSoul_Temp");
            SpriteRenderer sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = heartSprite;
            sr.color = Color.red;
            sr.sortingOrder = 10;
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

        // RetroSoundGenerator Prefab
        string soundPath = "Assets/_Prefabs/Undertale/RetroSoundGenerator.prefab";
        if (AssetDatabase.LoadAssetAtPath<GameObject>(soundPath) == null)
        {
            GameObject go = new GameObject("RetroSoundGenerator_Temp");
            go.AddComponent<RetroSoundGenerator>();
            
            PrefabUtility.SaveAsPrefabAsset(go, soundPath);
            Object.DestroyImmediate(go);
            Debug.Log("Created RetroSoundGenerator prefab.");
        }

        // UndertaleBullet Prefab
        string bulletPath = "Assets/_Prefabs/Undertale/UndertaleBullet.prefab";
        if (AssetDatabase.LoadAssetAtPath<GameObject>(bulletPath) == null)
        {
            GameObject go = new GameObject("UndertaleBullet_Temp");
            SpriteRenderer sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = bulletSprite;
            sr.color = Color.red;
            sr.sortingOrder = 5;
            go.AddComponent<CircleCollider2D>().isTrigger = true;
            go.AddComponent<Bullet>();
            
            PrefabUtility.SaveAsPrefabAsset(go, bulletPath);
            Object.DestroyImmediate(go);
            Debug.Log("Created UndertaleBullet prefab.");
        }

        // Froggit Prefab
        string froggitPath = "Assets/_Prefabs/Undertale/Froggit.prefab";
        if (AssetDatabase.LoadAssetAtPath<GameObject>(froggitPath) == null)
        {
            GameObject go = new GameObject("Froggit_Temp");
            SpriteRenderer sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = froggitSprite;
            sr.color = Color.white;
            sr.sortingOrder = 3;
            
            PrefabUtility.SaveAsPrefabAsset(go, froggitPath);
            Object.DestroyImmediate(go);
            Debug.Log("Created Froggit prefab.");
        }
    }

    private static void EnsureTexture(string path, int width, int height, System.Func<int, int, Color> colorFunc, float ppu)
    {
        if (System.IO.File.Exists(path)) return;

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

        TextureImporter importer = AssetImporter.GetAtPath(path) as TextureImporter;
        if (importer != null)
        {
            importer.textureType = TextureImporterType.Sprite;
            importer.spritePixelsPerUnit = ppu;
            importer.filterMode = FilterMode.Point;
            importer.textureCompression = TextureImporterCompression.Uncompressed;
            importer.SaveAndReimport();
        }
    }
}
#endif
