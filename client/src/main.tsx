import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import "./index.css";

// Filter a known-noisy THREE deprecation warning. three@0.184 deprecated
// `THREE.Clock` in favour of `THREE.Timer`, but @react-three/fiber@8.x
// still uses Clock internally — the warning is unactionable from app code.
// Drop this filter when we upgrade to R3F v9 (which requires React 19).
const _origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const first = args[0];
  if (
    typeof first === 'string' &&
    first.includes('THREE.Clock: This module has been deprecated')
  ) {
    return;
  }
  _origWarn(...args);
};

// After a deploy, tabs that loaded the previous index.html still reference
// the previous build's content-hashed chunk URLs (e.g. Lobby-BgWLffiv.js).
// Those chunks no longer exist on the server, so the next lazy-loaded
// route navigation throws "Failed to fetch dynamically imported module".
// Vite emits a `vite:preloadError` event for exactly this case — listen
// and reload once so the tab grabs the new index.html + new chunk hashes.
// Guard against reload loops with sessionStorage (only auto-reload once
// per tab session; if the second attempt also fails, fall through to the
// route's errorElement so the user sees a friendly error rather than loop).
window.addEventListener("vite:preloadError", (event) => {
  const RELOAD_KEY = "scrum-monsters:chunk-reload-attempted";
  if (sessionStorage.getItem(RELOAD_KEY)) return;
  sessionStorage.setItem(RELOAD_KEY, "1");
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
