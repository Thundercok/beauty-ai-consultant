#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;
using TMPro;

public static class FontAssetGenerator
{
    [MenuItem("Tools/Generate Orange Juice Font Asset")]
    public static void GenerateFontAsset()
    {
        string fontPath = "Assets/Fonts/orange juice 2.0.ttf";
        Font sourceFont = AssetDatabase.LoadAssetAtPath<Font>(fontPath);
        if (sourceFont == null)
        {
            Debug.LogError("Source font not found at: " + fontPath);
            return;
        }

        string assetPath = "Assets/Fonts/orange juice 2.0 SDF.asset";

        // Create the Font Asset using the standard TMP API
        TMP_FontAsset fontAsset = TMP_FontAsset.CreateFontAsset(
            sourceFont, 
            90, 
            9, 
            UnityEngine.TextCore.LowLevel.GlyphRenderMode.SDFAA, 
            512, 
            512, 
            AtlasPopulationMode.Dynamic
        );

        if (fontAsset != null)
        {
            // First save the main asset
            AssetDatabase.CreateAsset(fontAsset, assetPath);

            // Add the generated atlas textures as sub-assets so they serialize correctly
            if (fontAsset.atlasTextures != null)
            {
                foreach (var tex in fontAsset.atlasTextures)
                {
                    if (tex != null)
                    {
                        tex.name = fontAsset.name + " Atlas";
                        AssetDatabase.AddObjectToAsset(tex, fontAsset);
                    }
                }
            }

            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
            Debug.Log("Successfully created font asset at: " + assetPath);
        }
        else
        {
            Debug.LogError("Failed to create font asset.");
        }
    }
}
#endif
