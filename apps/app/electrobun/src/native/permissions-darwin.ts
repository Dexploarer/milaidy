/**
 * macOS Permission Checks via osascript/TCC
 *
 * Uses AppleScript and system_profiler to check TCC permission status.
 */

import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  PermissionCheckResult,
  SystemPermissionId,
} from "./permissions-shared";

const APP_BUNDLE_ID = "com.miladyai.milady";

async function runCommand(cmd: string): Promise<string> {
  try {
    const proc = Bun.spawn(["sh", "-c", cmd], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    return output.trim();
  } catch {
    return "";
  }
}

type PermissionStatus = "granted" | "denied" | "not-determined";

async function checkMicrophonePermission(): Promise<PermissionStatus> {
  // Query the user TCC database for microphone permission.
  // Service name: kTCCServiceMicrophone
  // auth_value: 0 = denied, 2 = granted, absent = not-determined
  try {
    const tccDb = path.join(
      os.homedir(),
      "Library/Application Support/com.apple.TCC/TCC.db",
    );
    if (!existsSync(tccDb)) return "not-determined";

    const proc = Bun.spawn(
      [
        "sqlite3",
        tccDb,
        `SELECT auth_value FROM access WHERE service='kTCCServiceMicrophone' AND client='${APP_BUNDLE_ID}'`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    const val = stdout.trim();
    if (val === "2") return "granted";
    if (val === "0") return "denied";
    return "not-determined";
  } catch {
    // If TCC DB is unreadable (sandboxed or locked), return not-determined
    return "not-determined";
  }
}

async function checkScreenRecordingPermission(): Promise<PermissionStatus> {
  // Query the user TCC database for screen capture permission.
  // Service name: kTCCServiceScreenCapture
  // auth_value: 0 = denied, 2 = granted, absent = not-determined
  // This is more reliable than the screencapture file-size heuristic which
  // breaks on macOS 15+ (watermark images inflate denied-capture file sizes).
  try {
    const tccDb = path.join(
      os.homedir(),
      "Library/Application Support/com.apple.TCC/TCC.db",
    );
    if (!existsSync(tccDb)) return "not-determined";

    const proc = Bun.spawn(
      [
        "sqlite3",
        tccDb,
        `SELECT auth_value FROM access WHERE service='kTCCServiceScreenCapture' AND client='${APP_BUNDLE_ID}'`,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const [stdout] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    const val = stdout.trim();
    if (val === "2") return "granted";
    if (val === "0") return "denied";
    return "not-determined";
  } catch {
    return "not-determined";
  }
}

export async function checkPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  switch (id) {
    case "accessibility": {
      const result = await runCommand(
        "osascript -e 'tell application \"System Events\" to return name of first process' 2>&1",
      );
      const granted = !result.includes("error") && result.length > 0;
      return { status: granted ? "granted" : "denied", canRequest: true };
    }

    case "screen-recording": {
      const status = await checkScreenRecordingPermission();
      return { status, canRequest: true };
    }

    case "microphone": {
      const status = await checkMicrophonePermission();
      return { status, canRequest: true };
    }

    case "camera": {
      // Camera permission is managed by the WebView at runtime via getUserMedia
      return { status: "not-determined", canRequest: true };
    }

    case "shell": {
      return { status: "granted", canRequest: false };
    }

    default:
      return { status: "not-applicable", canRequest: false };
  }
}

export async function requestPermission(
  id: SystemPermissionId,
): Promise<PermissionCheckResult> {
  // On macOS, requesting permissions typically triggers system dialogs
  // We can open System Preferences to the right pane
  switch (id) {
    case "accessibility":
    case "screen-recording":
    case "microphone":
    case "camera":
      await openPrivacySettings(id);
      // Re-check after user interaction
      return checkPermission(id);

    case "shell":
      return { status: "granted", canRequest: false };

    default:
      return { status: "not-applicable", canRequest: false };
  }
}

export async function openPrivacySettings(
  id: SystemPermissionId,
): Promise<void> {
  const paneMap: Record<string, string> = {
    accessibility:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "screen-recording":
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    microphone:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    camera:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
  };

  const url = paneMap[id];
  if (url) {
    const proc = Bun.spawn(["open", url], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
  }
}
