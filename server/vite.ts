import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import type { ServerOptions } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import { injectMetaTags } from "./seoMiddleware";
import { httpLogger } from './logger.js';
import { htmlLimiter } from "./middleware/rateLimiter.js";

export function log(message: string, source = "express") {
  // Strip CR/LF/control chars before logging to neutralize log-injection
  // payloads in user-controlled paths (e.g. /api/foo%0aFAKE_LOG_LINE).
  // Pino JSON logging escapes these anyway, but defense-in-depth and
  // silences CodeQL js/log-injection.
  // eslint-disable-next-line no-control-regex
  const safe = message.replace(/[\r\n\t\x00-\x1f\x7f]/g, ' ');
  httpLogger.info({ source }, safe);
}

export async function setupVite(app: Express, server: Server) {
  // Lazy-load Vite and the Vite config ONLY in development. Both are
  // devDependencies, stripped from the production image by `npm ci --omit=dev`.
  // A top-level static import would be hoisted into dist/index.js and crash
  // `node dist/index.js` on startup with ERR_MODULE_NOT_FOUND. setupVite is
  // never invoked in production (server/index.ts guards on NODE_ENV).
  const { createServer: createViteServer, createLogger } = await import("vite");
  const { default: viteConfig } = await import("../vite.config");
  const { nanoid } = await import("nanoid");
  const viteLogger = createLogger();

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
  app.use("*", htmlLimiter, async (req, res, next) => {
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
  app.use(htmlLimiter, express.static(distPath, { index: false }));

  // Cache the base HTML template for performance
  const htmlPath = path.resolve(distPath, "index.html");
  let cachedHtml: string | null = null;

  // fall through to index.html if the file doesn't exist
  app.use("*", htmlLimiter, (req, res) => {
    try {
      // Read HTML from cache or disk
      if (!cachedHtml) {
        cachedHtml = fs.readFileSync(htmlPath, 'utf-8');
      }
      // Inject SEO meta tags for social media crawlers
      const requestPath = req.originalUrl.split('?')[0]; // Strip query params
      const processed = injectMetaTags(cachedHtml, requestPath);
      // The entry HTML references hashed chunk filenames that change every
      // deploy. It MUST NOT be cached: a stale index.html points at chunk
      // hashes that 404 after a deploy, which fires Vite's `vite:preloadError`
      // and traps users on the "Scrum Monsters was updated / Reload" screen —
      // reload just re-serves the cached stale HTML. `no-store` forces every
      // navigation/reload to fetch fresh HTML with the current hashes. (Hashed
      // assets under /assets are immutable and stay long-cached.)
      res.status(200).set({
        "Content-Type": "text/html",
        "Cache-Control": "no-store, must-revalidate",
      }).end(processed);
    } catch (_error) {
      res.status(500).send('Internal Server Error');
    }
  });
}
