import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path, { dirname } from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { fileURLToPath } from "url";
import glsl from "vite-plugin-glsl";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Shim removed three.js exports that three-stdlib still imports.
 * LuminanceFormat was removed in three.js v0.166+ — replaced by RedFormat.
 * Handles both Rollup (production build) and esbuild (dev pre-bundling).
 */
function patchLuminanceFormat(code: string): string {
  // Remove LuminanceFormat from import specifiers, then replace any usage
  let patched = code.replace(/,\s*LuminanceFormat\b/g, "");
  patched = patched.replace(/\bLuminanceFormat\s*,\s*/g, "");
  patched = patched.replace(/\bLuminanceFormat\b/g, "RedFormat");
  return patched;
}

function threeCompatShim(): Plugin {
  return {
    name: "three-compat-shim",
    // Rollup transform (production build + dev serve)
    transform(code, id) {
      if (id.includes("three-stdlib") && code.includes("LuminanceFormat")) {
        return patchLuminanceFormat(code);
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    threeCompatShim(),
    react(),
    runtimeErrorOverlay(),
    glsl(), // Add GLSL shader support
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  // Exclude three-stdlib from esbuild pre-bundling so the Vite transform plugin
  // can patch the removed LuminanceFormat import before it's processed.
  optimizeDeps: {
    exclude: ["three-stdlib"],
  },
  // Add support for large models and audio files
  assetsInclude: ["**/*.gltf", "**/*.glb", "**/*.mp3", "**/*.ogg", "**/*.wav"],
});
