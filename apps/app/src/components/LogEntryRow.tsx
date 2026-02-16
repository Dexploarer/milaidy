import { memo } from "react";
import type { LogEntry } from "../api-client";

/** Per-tag badge colour map. */
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  agent: { bg: "rgba(99, 102, 241, 0.15)", fg: "rgb(99, 102, 241)" },
  server: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  system: { bg: "rgba(156, 163, 175, 0.15)", fg: "rgb(156, 163, 175)" },
  cloud: { bg: "rgba(59, 130, 246, 0.15)", fg: "rgb(59, 130, 246)" },
  plugins: { bg: "rgba(168, 85, 247, 0.15)", fg: "rgb(168, 85, 247)" },
  autonomy: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  websocket: { bg: "rgba(20, 184, 166, 0.15)", fg: "rgb(20, 184, 166)" },
};

interface LogEntryRowProps {
  entry: LogEntry;
}

function LogEntryRowComponent({ entry }: LogEntryRowProps) {
  return (
    <div
      className="font-mono text-xs px-2 py-1 border-b border-border flex gap-2 items-baseline"
      data-testid="log-entry"
    >
      {/* Timestamp */}
      <span className="text-muted whitespace-nowrap">
        {new Date(entry.timestamp).toLocaleTimeString()}
      </span>

      {/* Level */}
      <span
        className={`font-semibold w-[44px] uppercase text-[11px] ${
          entry.level === "error"
            ? "text-danger"
            : entry.level === "warn"
              ? "text-warn"
              : "text-muted"
        }`}
      >
        {entry.level}
      </span>

      {/* Source */}
      <span className="text-muted w-16 overflow-hidden text-ellipsis whitespace-nowrap text-[11px]">
        [{entry.source}]
      </span>

      {/* Tag badges */}
      <span className="inline-flex gap-0.5 shrink-0">
        {(entry.tags ?? []).map((t: string, ti: number) => {
          const c = TAG_COLORS[t];
          return (
            <span
              key={ti}
              className="inline-block text-[10px] px-1.5 py-px rounded-lg mr-0.5"
              style={{
                background: c ? c.bg : "var(--bg-muted)",
                color: c ? c.fg : "var(--muted)",
                fontFamily: "var(--font-body, sans-serif)",
              }}
            >
              {t}
            </span>
          );
        })}
      </span>

      {/* Message */}
      <span className="flex-1 break-all">{entry.message}</span>
    </div>
  );
}

function areTagsEqual(a: string[], b: string[]) {
  if (a === b) return true;
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function areLogEntriesEqual(
  prevProps: LogEntryRowProps,
  nextProps: LogEntryRowProps,
) {
  const p = prevProps.entry;
  const n = nextProps.entry;

  // Fast path: reference equality
  if (p === n) return true;

  return (
    p.timestamp === n.timestamp &&
    p.message === n.message &&
    p.level === n.level &&
    p.source === n.source &&
    areTagsEqual(p.tags, n.tags)
  );
}

export const LogEntryRow = memo(LogEntryRowComponent, areLogEntriesEqual);
