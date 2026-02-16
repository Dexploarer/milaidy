/**
 * Logs view component — logs viewer with filtering.
 */

import { useEffect } from "react";
import { useApp } from "../AppContext.js";
import type { LogEntry } from "../api-client";
import { LogEntryRow } from "./LogEntryRow";

export function LogsView() {
  const {
    logs,
    logSources,
    logTags,
    logTagFilter,
    logLevelFilter,
    logSourceFilter,
    loadLogs,
    setState,
  } = useApp();

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const handleLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("logLevelFilter", e.target.value);
    void loadLogs();
  };

  const handleSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("logSourceFilter", e.target.value);
    void loadLogs();
  };

  const handleClearFilters = () => {
    setState("logTagFilter", "");
    setState("logLevelFilter", "");
    setState("logSourceFilter", "");
    void loadLogs();
  };

  const hasActiveFilters =
    logTagFilter !== "" || logLevelFilter !== "" || logSourceFilter !== "";

  const handleTagChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setState("logTagFilter", e.target.value);
    void loadLogs();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filters row — filters left, refresh right */}
      <div className="flex flex-wrap gap-1.5 mb-2.5 items-center">
        <select
          className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer"
          value={logLevelFilter}
          onChange={handleLevelChange}
        >
          <option value="">All levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>

        <select
          className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer"
          value={logSourceFilter}
          onChange={handleSourceChange}
        >
          <option value="">All sources</option>
          {logSources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {logTags.length > 0 && (
          <select
            className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer"
            value={logTagFilter}
            onChange={handleTagChange}
          >
            <option value="">All tags</option>
            {logTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}

        {hasActiveFilters && (
          <button
            className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer hover:border-accent hover:text-accent"
            onClick={handleClearFilters}
          >
            Clear filters
          </button>
        )}

        <button
          className="text-xs px-3 py-1.5 border border-border bg-card text-txt cursor-pointer hover:border-accent hover:text-accent ml-auto"
          onClick={() => void loadLogs()}
        >
          Refresh
        </button>
      </div>

      {/* Log entries — full remaining height */}
      <div className="font-mono text-xs flex-1 min-h-0 overflow-y-auto border border-border p-2 bg-card">
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted">
            No log entries
            {hasActiveFilters ? " matching filters" : " yet"}.
          </div>
        ) : (
          logs.map((entry: LogEntry, idx: number) => (
            <LogEntryRow
              key={`${entry.timestamp}-${entry.level}-${entry.source}-${entry.message}-${idx}`}
              entry={entry}
            />
          ))
        )}
      </div>
    </div>
  );
}
