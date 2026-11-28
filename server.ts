import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import express from "express";
import { createServer as createViteServer } from "vite";
import { parseProductCatalogCsv } from "./src/lib/beauty/productCatalog";
import type { CatalogProduct } from "./src/lib/beauty/types";

function loadProductsCsv(csvPath: string): CatalogProduct[] {
  return parseProductCatalogCsv(fs.readFileSync(csvPath, "utf-8"));
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);
  const rootDir = process.cwd();
  const dbPath = path.join(rootDir, "data", "product_database.csv");
  const sampleFacePath = path.join(rootDir, "data", "sample_face.jpg");

  app.use(express.json({ limit: "2mb" }));

  let cachedProducts: CatalogProduct[] = [];
  if (fs.existsSync(dbPath)) {
    cachedProducts = loadProductsCsv(dbPath);
  }

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", products: cachedProducts.length });
  });

  app.get("/api/products", (req, res) => {
    const productType = typeof req.query.type === "string" ? req.query.type : "";
    const filtered = productType
      ? cachedProducts.filter((p) => p.product_type === productType)
      : cachedProducts;
    res.json({ products: filtered, total: filtered.length });
  });

  app.get("/api/sample-face", (_req, res) => {
    if (!fs.existsSync(sampleFacePath)) {
      res.status(404).json({ error: "Sample portrait not found." });
      return;
    }
    res.sendFile(sampleFacePath);
  });

  const mediapipeWasmDir = path.join(
    rootDir,
    "node_modules",
    "@mediapipe",
    "tasks-vision",
    "wasm"
  );
  if (fs.existsSync(mediapipeWasmDir)) {
    app.use(
      "/mediapipe/wasm",
      express.static(mediapipeWasmDir, {
        maxAge: "1d",
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".wasm")) {
            res.setHeader("Content-Type", "application/wasm");
          } else if (filePath.endsWith(".js")) {
            res.setHeader("Content-Type", "application/javascript; charset=utf-8");
          }
        },
      })
    );
    app.use("/mediapipe/wasm", (_req, res) => {
      res.status(404).json({ error: "MediaPipe WASM asset not found." });
    });
  }

  const mediapipeTaskPath = path.join(rootDir, "public", "mediapipe", "face_landmarker.task");
  app.get("/mediapipe/face_landmarker.task", (_req, res) => {
    if (!fs.existsSync(mediapipeTaskPath)) {
      res.status(404).json({ error: "MediaPipe task model not found." });
      return;
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.sendFile(mediapipeTaskPath);
  });

  const httpServer = http.createServer(app);
  const distDir = path.join(rootDir, "dist");
  const isProd = process.env.NODE_ENV === "production" && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  } else {
    const disableHmr = process.env.DISABLE_HMR === "true";
    if (disableHmr) {
      const NOOP_VITE_CLIENT_JS = `
const sheetsMap = new Map();
export function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement("style");
    style.setAttribute("type", "text/css");
    style.setAttribute("data-vite-dev-id", id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    document.head.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const hot = {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
  };
  return hot;
}
export function injectQuery(url, queryToInject) {
  if (!url || !queryToInject) return url;
  return url.includes("?") ? url + "&" + queryToInject : url + "?" + queryToInject;
}
export class ErrorOverlay extends HTMLElement {
  close() {
    this.remove();
  }
}
`;
      app.get("/@vite/client", (_req, res) => {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.send(NOOP_VITE_CLIENT_JS);
      });
    }

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: disableHmr ? false : { server: httpServer },
        ws: disableHmr ? false : undefined,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Beauty AI Consultant listening on http://0.0.0.0:${port}`);
  });
}

startServer();
