/**
 * WebGL context-loss resilience helper for @react-three/fiber Canvas mounts.
 *
 * Without `event.preventDefault()` on the `webglcontextlost` event the browser
 * will NOT restore the WebGL context — even if the underlying GPU recovers.
 * The result is a silently frozen 3D scene that only un-freezes on full page
 * reload. See:
 *   - https://developer.mozilla.org/en-US/docs/Web/API/WebGLContextEvent
 *   - https://www.khronos.org/webgl/wiki/HandlingContextLost
 *
 * Usage with R3F:
 *
 *   <Canvas onCreated={attachWebglResilience}>
 *     ...
 *   </Canvas>
 *
 * R3F re-uploads its own GPU resources (geometries, materials, textures it
 * created) when the context is restored, so for the common case no extra
 * work is required after preventDefault(). App-managed GPU resources held
 * outside R3F's reconciler would still need manual re-upload.
 */
import type { RootState } from '@react-three/fiber';

const ATTACHED_FLAG = '__webglResilienceAttached';

interface FlaggedCanvas extends HTMLCanvasElement {
  [ATTACHED_FLAG]?: boolean;
}

export interface WebglResilienceOptions {
  /** Optional callback fired when the GL context is lost (after preventDefault). */
  onLost?: (event: WebGLContextEvent) => void;
  /** Optional callback fired when the GL context is restored. */
  onRestored?: () => void;
}

/**
 * Attach `webglcontextlost`/`webglcontextrestored` handlers to the Canvas's
 * underlying DOM element. Safe to call multiple times — listeners are only
 * attached once per canvas element.
 *
 * Designed to be used directly as a Canvas `onCreated` prop:
 *
 *   <Canvas onCreated={attachWebglResilience} />
 *
 * Or wrapped to pass custom callbacks:
 *
 *   <Canvas onCreated={(state) => attachWebglResilience(state, { onLost })} />
 */
export function attachWebglResilience(
  state: RootState,
  options: WebglResilienceOptions = {},
): void {
  const canvas = state.gl.domElement as FlaggedCanvas;
  if (canvas[ATTACHED_FLAG]) return;
  canvas[ATTACHED_FLAG] = true;

  // Track loss/restore pairs so the telemetry counter can report whether
  // the context actually came back vs. stayed dead. Bound to this canvas.
  let outstandingLoss = false;

  canvas.addEventListener('webglcontextlost', (event) => {
    // Critical: tells the browser we want to recover. Without this the
    // context will NEVER be restored by the UA.
    event.preventDefault();
    outstandingLoss = true;
    // eslint-disable-next-line no-console
    console.warn('[webgl] context lost — recovery requested');
    options.onLost?.(event as WebGLContextEvent);
    // Fire-and-forget telemetry: increments
    // scrumquest_webgl_context_loss_total{recovered="false"}. The
    // counterpart restored=true ping fires from the restore handler.
    reportContextLoss({ recovered: false });
  });

  canvas.addEventListener('webglcontextrestored', () => {
    // eslint-disable-next-line no-console
    console.info('[webgl] context restored');
    // R3F re-uploads its managed resources automatically. App-managed
    // GPU resources (raw textures/buffers held outside the reconciler)
    // would need to be re-created here.
    options.onRestored?.();
    if (outstandingLoss) {
      outstandingLoss = false;
      reportContextLoss({ recovered: true });
    }
  });
}

/**
 * Fire-and-forget POST to /api/telemetry/webgl-context-loss. Failures
 * are swallowed deliberately — telemetry must never throw into render.
 */
function reportContextLoss(body: { recovered: boolean }): void {
  try {
    fetch('/api/telemetry/webgl-context-loss', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: 'omit',
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* swallow */
  }
}
