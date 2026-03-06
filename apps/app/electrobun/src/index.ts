/**
 * Milady Desktop App — Electrobun Main Entry
 *
 * Creates the main BrowserWindow, wires up RPC handlers,
 * sets up system tray, application menu, and starts the agent.
 */

import fs from "node:fs";
import path from "node:path";
import Electrobun, {
  ApplicationMenu,
  BrowserWindow,
  Updater,
  Utils,
} from "electrobun/bun";
import { pushApiBaseToRenderer, resolveExternalApiBase } from "./api-base";
import { getAgentManager } from "./native/agent";
import { getDesktopManager } from "./native/desktop";
import { disposeNativeModules, initializeNativeModules } from "./native/index";
import {
  enableVibrancy,
  ensureShadow,
  setNativeDragRegion,
  setTrafficLightsPosition,
} from "./native/mac-window-effects";
import { registerRpcHandlers } from "./rpc-handlers";
import { PUSH_CHANNEL_TO_RPC_MESSAGE } from "./rpc-schema";

// ============================================================================
// App Menu
// ============================================================================

function setupApplicationMenu(): void {
  ApplicationMenu.setApplicationMenu([
    {
      label: "Milady",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ]);
}

// ============================================================================
// macOS Native Window Effects (vibrancy, shadow, traffic lights, drag region)
// ============================================================================

const MAC_TRAFFIC_LIGHTS_X = 14;
const MAC_TRAFFIC_LIGHTS_Y = 12;
const MAC_NATIVE_DRAG_REGION_X = 92;
const MAC_NATIVE_DRAG_REGION_HEIGHT = 40;

function applyMacOSWindowEffects(win: BrowserWindow): void {
  if (process.platform !== "darwin") return;

  const ptr = (win as { ptr?: unknown }).ptr;
  if (!ptr) {
    console.warn("[MacEffects] win.ptr unavailable — skipping native effects");
    return;
  }

  enableVibrancy(ptr as Parameters<typeof enableVibrancy>[0]);
  ensureShadow(ptr as Parameters<typeof ensureShadow>[0]);

  const alignButtons = () =>
    setTrafficLightsPosition(
      ptr as Parameters<typeof setTrafficLightsPosition>[0],
      MAC_TRAFFIC_LIGHTS_X,
      MAC_TRAFFIC_LIGHTS_Y,
    );
  const alignDragRegion = () =>
    setNativeDragRegion(
      ptr as Parameters<typeof setNativeDragRegion>[0],
      MAC_NATIVE_DRAG_REGION_X,
      MAC_NATIVE_DRAG_REGION_HEIGHT,
    );

  alignButtons();
  alignDragRegion();
  setTimeout(() => {
    alignButtons();
    alignDragRegion();
  }, 120);

  win.on("resize", () => {
    alignButtons();
    alignDragRegion();
  });

  console.log("[MacEffects] Native macOS window effects applied");
}

// ============================================================================
// Window State Persistence
// ============================================================================

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_WINDOW_STATE: WindowState = {
  x: 100,
  y: 100,
  width: 1200,
  height: 800,
};

function loadWindowState(statePath: string): WindowState {
  try {
    if (fs.existsSync(statePath)) {
      const data = JSON.parse(fs.readFileSync(statePath, "utf8"));
      if (typeof data.width === "number" && typeof data.height === "number") {
        return { ...DEFAULT_WINDOW_STATE, ...data };
      }
    }
  } catch {
    // Ignore parse/read errors — return default
  }
  return DEFAULT_WINDOW_STATE;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleStateSave(statePath: string, win: BrowserWindow): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const { x, y } = win.getPosition();
      const { width, height } = win.getSize();
      const dir = path.dirname(statePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        statePath,
        JSON.stringify({ x, y, width, height }),
        "utf8",
      );
    } catch {
      // Ignore save errors
    }
  }, 500);
}

// ============================================================================
// Main Window
// ============================================================================

async function createMainWindow(): Promise<BrowserWindow> {
  // Resolve the renderer URL
  const rendererUrl =
    process.env.MILADY_RENDERER_URL ??
    process.env.VITE_DEV_SERVER_URL ??
    `file://${path.resolve(import.meta.dir, "../renderer/index.html")}`;

  // Load persisted window state
  const statePath = path.join(Utils.paths.userData, "window-state.json");
  const state = loadWindowState(statePath);

  // Read the pre-built webview bridge preload (built by `bun run build:preload`).
  // The preload runs in the webview context after Electrobun's built-in preload,
  // setting up window.electron as a compatibility shim over the Electrobun RPC.
  const preloadPath = path.join(import.meta.dir, "preload.js");
  const preload = fs.existsSync(preloadPath)
    ? fs.readFileSync(preloadPath, "utf8")
    : null;

  if (!preload) {
    console.warn(
      "[Main] preload.js not found — run `bun run build:preload` first. window.electron will be unavailable.",
    );
  }

  const win = new BrowserWindow({
    title: "Milady",
    url: rendererUrl,
    preload,
    frame: {
      width: state.width,
      height: state.height,
      x: state.x,
      y: state.y,
    },
    titleBarStyle: "hiddenInset", // Hides title bar, shows traffic lights inset into content
    transparent: true, // Allows the window background to be transparent
  });

  // Apply native macOS vibrancy, shadow, and traffic light positioning
  applyMacOSWindowEffects(win);

  // Persist window state on resize and move
  win.on("resize", () => scheduleStateSave(statePath, win));
  win.on("move", () => scheduleStateSave(statePath, win));

  return win;
}

// ============================================================================
// RPC + Native Module Wiring
// ============================================================================

// Type alias for the untyped rpc send proxy (used at runtime for push messages)
type RpcSendProxy = Record<string, ((payload: unknown) => void) | undefined>;

/**
 * Structural type for the Electrobun RPC instance.
 * The actual runtime object returned by createRPC exposes `send` and
 * `setRequestHandler`, but the base RPCWithTransport interface only has
 * `setTransport`. We use a structural type to avoid casts.
 *
 * `(params: never) => unknown` for handler values: any typed handler
 * `(p: T) => R` satisfies this via TypeScript's function contravariance
 * (`never extends T` is always true).
 */
type ElectrobunRpcInstance = {
  send?: RpcSendProxy;
  setRequestHandler?: (
    handlers: Record<string, (params: never) => unknown>,
  ) => void;
};

function wireRpcAndModules(
  win: BrowserWindow,
): (message: string, payload?: unknown) => void {
  // Access the rpc instance from the webview (set during window creation)
  const rpc = win.webview.rpc as unknown as ElectrobunRpcInstance | undefined;

  // Create the sendToWebview callback that native modules use to push events.
  // Uses typed RPC push messages instead of JS evaluation.
  const sendToWebview = (message: string, payload?: unknown): void => {
    // Resolve via map (Electron-style colon format) or use message directly
    // as the RPC method name (Electrobun camelCase format).
    const rpcMessage = PUSH_CHANNEL_TO_RPC_MESSAGE[message] ?? message;
    if (rpc?.send) {
      const sender = rpc?.send?.[rpcMessage];
      if (sender) {
        sender(payload ?? null);
        return;
      }
    }
    console.warn(`[sendToWebview] No RPC method for message: ${message}`);
  };

  // Initialize native modules with window + sendToWebview
  initializeNativeModules(win, sendToWebview);

  // Register RPC handlers
  registerRpcHandlers(rpc, sendToWebview);

  return sendToWebview;
}

// ============================================================================
// API Base Injection
// ============================================================================

function injectApiBase(win: BrowserWindow): void {
  const resolution = resolveExternalApiBase(
    process.env as Record<string, string | undefined>,
  );

  if (resolution.invalidSources.length > 0) {
    console.warn(
      `[Main] Invalid API base env vars: ${resolution.invalidSources.join(", ")}`,
    );
  }

  // If we have an external API base, push it to the renderer.
  if (resolution.base) {
    pushApiBaseToRenderer(win, resolution.base, process.env.MILADY_API_TOKEN);
    return;
  }

  // Otherwise fall back to the agent's local server URL.
  const agent = getAgentManager();
  const port = agent.getPort();
  if (port) {
    pushApiBaseToRenderer(win, `http://localhost:${port}`);
  }
}

// ============================================================================
// Agent Startup
// ============================================================================

async function startAgent(win: BrowserWindow): Promise<void> {
  const agent = getAgentManager();

  try {
    const status = await agent.start();

    // If agent started and no external API base is configured,
    // push the agent's local API base to the renderer.
    if (status.state === "running" && status.port) {
      const resolution = resolveExternalApiBase(
        process.env as Record<string, string | undefined>,
      );
      if (!resolution.base) {
        pushApiBaseToRenderer(win, `http://localhost:${status.port}`);
      }
    }
  } catch (err) {
    console.error("[Main] Agent start failed:", err);
  }
}

// ============================================================================
// Auto-Updater
// ============================================================================

async function setupUpdater(
  sendToWebview: (message: string, payload?: unknown) => void,
): Promise<void> {
  try {
    // Subscribe to update status changes so we can notify the renderer
    // at the right lifecycle points.
    Updater.onStatusChange((entry: { status: string; message?: string }) => {
      if (entry.status === "update-available") {
        // checkForUpdate found a new version — notify renderer
        const info = Updater.updateInfo();
        sendToWebview("desktopUpdateAvailable", { version: info.version });
      } else if (entry.status === "download-complete") {
        // downloadUpdate finished — update is ready to apply
        const info = Updater.updateInfo();
        sendToWebview("desktopUpdateReady", { version: info.version });
        Utils.showNotification({
          title: "Milady Update Ready",
          body: `Version ${info.version} is ready. Restart to apply.`,
        });
      }
    });

    // Check for update (emits "update-available" via onStatusChange if found)
    const updateResult = await Updater.checkForUpdate();
    if (updateResult?.updateAvailable) {
      // Auto-download in the background
      Updater.downloadUpdate().catch((err: unknown) => {
        console.warn("[Updater] Download failed:", err);
      });
    }
  } catch (err) {
    console.warn("[Updater] Update check failed:", err);
  }
}

// ============================================================================
// Deep Link Handling
// ============================================================================

function setupDeepLinks(
  _win: BrowserWindow,
  sendToWebview: (message: string, payload?: unknown) => void,
): void {
  // Electrobun handles urlSchemes from config automatically.
  // Listen for open-url events to route deep links to the renderer.
  Electrobun.events.on("open-url", (url: string) => {
    sendToWebview("shareTargetReceived", { url });
  });
}

// ============================================================================
// Shutdown
// ============================================================================

function setupShutdown(apiBaseInterval: ReturnType<typeof setInterval>): void {
  Electrobun.events.on("before-quit", () => {
    console.log("[Main] App quitting, disposing native modules...");
    clearInterval(apiBaseInterval);
    disposeNativeModules();
  });
}

// ============================================================================
// Bootstrap
// ============================================================================

async function main(): Promise<void> {
  console.log("[Main] Starting Milady (Electrobun)...");

  // Set up app menu
  setupApplicationMenu();

  // Create main window
  const win = await createMainWindow();

  // Wire RPC handlers and native modules
  const sendToWebview = wireRpcAndModules(win);

  // Set up deep link handling
  setupDeepLinks(win, sendToWebview);

  // Inject API base on dom-ready and re-inject periodically so reloads
  // always receive the current value (the push message is idempotent).
  win.webview.on("dom-ready", () => {
    injectApiBase(win);
  });

  const apiBaseInterval = setInterval(() => {
    injectApiBase(win);
  }, 5_000);

  // Set up system tray with default icon
  const desktop = getDesktopManager();
  try {
    await desktop.createTray({
      icon: path.join(import.meta.dir, "../assets/appIcon.png"),
      tooltip: "Milady",
      title: "Milady",
      menu: [
        { id: "show", label: "Show Milady", type: "normal" },
        { id: "sep1", type: "separator" },
        { id: "quit", label: "Quit", type: "normal" },
      ],
    });
  } catch (err) {
    console.warn("[Main] Tray creation failed:", err);
  }

  // Start agent in background
  startAgent(win);

  // Check for updates
  setupUpdater(sendToWebview);

  // Set up clean shutdown
  setupShutdown(apiBaseInterval);

  console.log("[Main] Milady started successfully");
}

main().catch((err) => {
  console.error("[Main] Fatal error during startup:", err);
  process.exit(1);
});
