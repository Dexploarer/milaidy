import http from "node:http";
import crypto from "node:crypto";
import { type ServerState, type ShareIngestItem } from "../types.js";
import { readJsonBody, json, error } from "../utils.js";

export async function handleIngestRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState
): Promise<boolean> {
  const url = new URL(
    req.url ?? "/",
    `http://${req.headers.host ?? "localhost"}`,
  );

  // ── POST /api/ingest/share ───────────────────────────────────────────
  if (method === "POST" && pathname === "/api/ingest/share") {
    const body = await readJsonBody<{
      source?: string;
      title?: string;
      url?: string;
      text?: string;
    }>(req, res);
    if (!body) return true;

    const item: ShareIngestItem = {
      id: crypto.randomUUID(),
      source: (body.source as string) ?? "unknown",
      title: body.title as string | undefined,
      url: body.url as string | undefined,
      text: body.text as string | undefined,
      suggestedPrompt: body.title
        ? `What do you think about "${body.title}"?`
        : body.url
          ? `Can you analyze this: ${body.url}`
          : body.text
            ? `What are your thoughts on: ${(body.text as string).slice(0, 100)}`
            : "What do you think about this shared content?",
      receivedAt: Date.now(),
    };
    state.shareIngestQueue.push(item);
    json(res, { ok: true, item });
    return true;
  }

  // ── GET /api/ingest/share ────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/ingest/share") {
    const consume = url.searchParams.get("consume") === "1";
    if (consume) {
      const items = [...state.shareIngestQueue];
      state.shareIngestQueue.length = 0;
      json(res, { items });
    } else {
      json(res, { items: state.shareIngestQueue });
    }
    return true;
  }

  return false;
}
