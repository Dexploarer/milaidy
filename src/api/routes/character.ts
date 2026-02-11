import http from "node:http";
import { logger } from "@elizaos/core";
import { type ServerState } from "../types.js";
import { readJsonBody, json, error } from "../utils.js";
import { CharacterSchema } from "../../config/zod-schema.js";
import { pickRandomNames } from "../../runtime/onboarding-names.js";

export async function handleCharacterRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState
): Promise<boolean> {
  // ── GET /api/character ──────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/character") {
    // Character data lives in the runtime / database, not the config file.
    const rt = state.runtime;
    const merged: Record<string, unknown> = {};
    if (rt) {
      const c = rt.character;
      if (c.name) merged.name = c.name;
      if (c.bio) merged.bio = c.bio;
      if (c.system) merged.system = c.system;
      if (c.adjectives) merged.adjectives = c.adjectives;
      if (c.topics) merged.topics = c.topics;
      if (c.style) merged.style = c.style;
      if (c.postExamples) merged.postExamples = c.postExamples;
    }

    json(res, { character: merged, agentName: state.agentName });
    return true;
  }

  // ── PUT /api/character ──────────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/character") {
    const body = await readJsonBody(req, res);
    if (!body) return true;

    const result = CharacterSchema.safeParse(body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      json(res, { ok: false, validationErrors: issues }, 422);
      return true;
    }

    // Character data lives in the runtime (backed by DB), not the config file.
    if (state.runtime) {
      const c = state.runtime.character;
      if (body.name != null) c.name = body.name as string;
      if (body.bio != null)
        c.bio = Array.isArray(body.bio)
          ? (body.bio as string[])
          : [String(body.bio)];
      if (body.system != null) c.system = body.system as string;
      if (body.adjectives != null) c.adjectives = body.adjectives as string[];
      if (body.topics != null) c.topics = body.topics as string[];
      if (body.style != null)
        c.style = body.style as NonNullable<typeof c.style>;
      if (body.postExamples != null)
        c.postExamples = body.postExamples as string[];
    }
    if (body.name) {
      state.agentName = body.name as string;
    }
    json(res, { ok: true, character: body, agentName: state.agentName });
    return true;
  }

  // ── GET /api/character/random-name ────────────────────────────────────
  if (method === "GET" && pathname === "/api/character/random-name") {
    const names = pickRandomNames(1);
    json(res, { name: names[0] ?? "Reimu" });
    return true;
  }

  // ── POST /api/character/generate ────────────────────────────────────
  if (method === "POST" && pathname === "/api/character/generate") {
    const body = await readJsonBody<{
      field: string;
      context: {
        name?: string;
        system?: string;
        bio?: string;
        style?: { all?: string[]; chat?: string[]; post?: string[] };
        postExamples?: string[];
      };
      mode?: "append" | "replace";
    }>(req, res);
    if (!body) return true;

    const { field, context: ctx, mode } = body;
    if (!field || !ctx) {
      error(res, "field and context are required", 400);
      return true;
    }

    const rt = state.runtime;
    if (!rt) {
      error(res, "Agent runtime not available. Start the agent first.", 503);
      return true;
    }

    const charSummary = [
      ctx.name ? `Name: ${ctx.name}` : "",
      ctx.system ? `System prompt: ${ctx.system}` : "",
      ctx.bio ? `Bio: ${ctx.bio}` : "",
      ctx.style?.all?.length ? `Style rules: ${ctx.style.all.join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let prompt = "";

    if (field === "bio") {
      prompt = `Given this character:\n${charSummary}\n\nWrite a concise, compelling bio for this character (3-4 short paragraphs, one per line). Just output the bio lines, nothing else. Match the character's voice and personality.`;
    } else if (field === "style") {
      const existing =
        mode === "append" && ctx.style?.all?.length
          ? `\nExisting style rules (add to these, don't repeat):\n${ctx.style.all.join("\n")}`
          : "";
      prompt = `Given this character:\n${charSummary}${existing}\n\nGenerate 4-6 communication style rules for this character. Output a JSON object with keys "all", "chat", "post", each containing an array of short rule strings. Just output the JSON, nothing else.`;
    } else if (field === "chatExamples") {
      prompt = `Given this character:\n${charSummary}\n\nGenerate 3 example chat conversations showing how this character responds. Output a JSON array where each element is an array of message objects like [{"user":"{{user1}}","content":{"text":"..."}},{"user":"{{agentName}}","content":{"text":"..."}}]. Just output the JSON array, nothing else.`;
    } else if (field === "postExamples") {
      const existing =
        mode === "append" && ctx.postExamples?.length
          ? `\nExisting posts (add new ones, don't repeat):\n${ctx.postExamples.join("\n")}`
          : "";
      prompt = `Given this character:\n${charSummary}${existing}\n\nGenerate 3-5 example social media posts this character would write. Output a JSON array of strings. Just output the JSON array, nothing else.`;
    } else {
      error(res, `Unknown field: ${field}`, 400);
      return true;
    }

    try {
      const { ModelType } = await import("@elizaos/core");
      const result = await rt.useModel(ModelType.TEXT_SMALL, {
        prompt,
        temperature: 0.8,
        maxTokens: 1500,
      });
      json(res, { generated: String(result) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "generation failed";
      logger.error(`[character-generate] ${msg}`);
      error(res, msg, 500);
    }
    return true;
  }

  // ── GET /api/character/schema ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/character/schema") {
    json(res, {
      fields: [
        {
          key: "name",
          type: "string",
          label: "Name",
          description: "Agent display name",
          maxLength: 100,
        },
        {
          key: "username",
          type: "string",
          label: "Username",
          description: "Agent username for platforms",
          maxLength: 50,
        },
        {
          key: "bio",
          type: "string | string[]",
          label: "Bio",
          description: "Biography — single string or array of points",
        },
        {
          key: "system",
          type: "string",
          label: "System Prompt",
          description: "System prompt defining core behavior",
          maxLength: 10000,
        },
        {
          key: "adjectives",
          type: "string[]",
          label: "Adjectives",
          description: "Personality adjectives (e.g. curious, witty)",
        },
        {
          key: "topics",
          type: "string[]",
          label: "Topics",
          description: "Topics the agent is knowledgeable about",
        },
        {
          key: "style",
          type: "object",
          label: "Style",
          description: "Communication style guides",
          children: [
            {
              key: "all",
              type: "string[]",
              label: "All",
              description: "Style guidelines for all responses",
            },
            {
              key: "chat",
              type: "string[]",
              label: "Chat",
              description: "Style guidelines for chat responses",
            },
            {
              key: "post",
              type: "string[]",
              label: "Post",
              description: "Style guidelines for social media posts",
            },
          ],
        },
        {
          key: "messageExamples",
          type: "array",
          label: "Message Examples",
          description: "Example conversations demonstrating the agent's voice",
        },
        {
          key: "postExamples",
          type: "string[]",
          label: "Post Examples",
          description: "Example social media posts",
        },
      ],
    });
    return true;
  }

  return false;
}
