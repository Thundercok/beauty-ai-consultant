#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;
using TMPro;

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
            mainCam.transform.position = new Vector3(315, 2.5f, -10);
            if (mainCam.GetComponent<CameraFollow>() == null)
            {
                mainCam.gameObject.AddComponent<CameraFollow>();
            }
        }

        // 2. Create BattleBox
        GameObject box = GameObject.Find("BattleBox");
        if (box == null)
        {
            box = new GameObject("BattleBox");
            box.transform.position = new Vector3(315, 2.5f, 0);
            box.AddComponent<BattleBox>();
            Debug.Log("Created BattleBox.");
        }

        // 3. Create PlayerSoul
        GameObject soul = GameObject.Find("PlayerSoul");
        if (soul == null)
        {
            soul = new GameObject("PlayerSoul");
            soul.transform.position = new Vector3(315, 2.5f, 0);
            soul.AddComponent<PlayerSoul>();
            Debug.Log("Created PlayerSoul.");
        }

        // 4. Create Canvas and UIManager
        GameObject canvasGo = GameObject.Find("Canvas");
        if (canvasGo == null)
        {
            canvasGo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            Canvas canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            Debug.Log("Canvas not found. Created a new Canvas.");
        }

        GameObject uiManagerGo = GameObject.Find("UIManager");
        if (uiManagerGo == null)
        {
            uiManagerGo = new GameObject("UIManager");
            UIManager uiMgr = uiManagerGo.AddComponent<UIManager>();

            // Create Graze Text under Canvas
            GameObject grazeTextGo = GameObject.Find("GrazeText");
            if (grazeTextGo == null)
            {
                grazeTextGo = new GameObject("GrazeText", typeof(RectTransform));
                grazeTextGo.transform.SetParent(canvasGo.transform, false);
                TextMeshProUGUI tmp = grazeTextGo.AddComponent<TextMeshProUGUI>();
                tmp.fontSize = 24;
                tmp.color = Color.yellow;
                tmp.alignment = TextAlignmentOptions.Center;
                tmp.text = "Graze: 0 | Survive: 20s";

                RectTransform rect = grazeTextGo.GetComponent<RectTransform>();
                rect.anchorMin = new Vector2(0.5f, 1);
                rect.anchorMax = new Vector2(0.5f, 1);
                rect.pivot = new Vector2(0.5f, 1);
                rect.anchoredPosition = new Vector2(0, -20);
                rect.sizeDelta = new Vector2(500, 50);

                uiMgr.grazeText = tmp;
            }
        }

        // 5. Create HPBar UI under Canvas if missing
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

            Image bgImg = hpBarGo.AddComponent<Image>();
            bgImg.color = Color.gray;

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

        // 6. Create Phase1Spawner
        GameObject spawner = GameObject.Find("Phase1Spawner");
        if (spawner == null)
        {
            spawner = new GameObject("Phase1Spawner");
            spawner.AddComponent<Phase1Spawner>();
        }

        // 7. EventSystem
        if (GameObject.FindFirstObjectByType<UnityEngine.EventSystems.EventSystem>() == null)
        {
            new GameObject("EventSystem", typeof(UnityEngine.EventSystems.EventSystem), typeof(UnityEngine.EventSystems.StandaloneInputModule));
        }

        Debug.Log("Undertale Demo Scene setup completed successfully!");
    }
}
#endif
