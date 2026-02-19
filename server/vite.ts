import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger, type ServerOptions } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { injectMetaTags } from "./seoMiddleware";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions: ServerOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      let page = await vite.transformIndexHtml(url, template);
      // Inject SEO meta tags for social media crawlers
      const requestPath = req.originalUrl.split('?')[0]; // Strip query params
      page = injectMetaTags(page, requestPath);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve static files but exclude index.html (we handle it with meta tag injection)
  app.use(express.static(distPath, { index: false }));

  // Cache the base HTML template for performance
  const htmlPath = path.resolve(distPath, "index.html");
  let cachedHtml: string | null = null;

  // fall through to index.html if the file doesn't exist
  app.use("*", (req, res) => {
    try {
      // Read HTML from cache or disk
      if (!cachedHtml) {
        cachedHtml = fs.readFileSync(htmlPath, 'utf-8');
      }
      // Inject SEO meta tags for social media crawlers
      const requestPath = req.originalUrl.split('?')[0]; // Strip query params
      const processed = injectMetaTags(cachedHtml, requestPath);
      res.status(200).set({ "Content-Type": "text/html" }).end(processed);
    } catch (error) {
      res.status(500).send('Internal Server Error');
    }
  });
}
