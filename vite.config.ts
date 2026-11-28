import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Ensures MediaPipe WASM runtimes from node_modules are copied into dist/mediapipe/wasm/
 * during static production builds (e.g., GitHub Pages) so no Express backend is needed.
 */
function copyMediaPipeWasmPlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "copy-mediapipe-wasm",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const srcDir = path.resolve(
        process.cwd(),
        "node_modules/@mediapipe/tasks-vision/wasm"
      );
      if (!fs.existsSync(srcDir)) return;
      const destDir = path.resolve(process.cwd(), outDir, "mediapipe/wasm");
      fs.mkdirSync(destDir, { recursive: true });
      for (const entry of fs.readdirSync(srcDir)) {
        if (!entry.endsWith(".wasm") && !entry.endsWith(".js")) continue;
        fs.copyFileSync(path.join(srcDir, entry), path.join(destDir, entry));
      }
    },
  };
}

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  // GitHub Pages serves the site from /<repo>/; the Pages workflow sets BASE_PATH to match.
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    copyMediaPipeWasmPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        id: basePath,
        name: "Beauty AI Consultant",
        short_name: "Beauty AI",
        description:
          "Phân tích tông da CIELAB trên trình duyệt, thử màu son Kubelka–Munk và chọn mỹ phẩm hợp da.",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: basePath,
        scope: basePath,
        lang: "vi",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache app shell and bundled UI assets; keep large MediaPipe WASM/model lazy-cached on demand
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2}"],
        globIgnores: ["**/mediapipe/**", "**/assets/aistudio/**"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: `${basePath}index.html`,
        runtimeCaching: [
          {
            urlPattern: /\/mediapipe\/.*\.(?:wasm|task|js)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "beauty-ai-mediapipe-v1",
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "beauty-ai-google-fonts-css",
              expiration: {
                maxEntries: 6,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "beauty-ai-google-fonts-files",
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
});
