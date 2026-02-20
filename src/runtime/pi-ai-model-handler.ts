import {
  type IAgentRuntime,
  type JsonValue,
  ModelType,
  type ObjectGenerationParams,
} from "@elizaos/core";
import {
  type Api,
  getProviders,
  type Model,
  stream,
} from "@mariozechner/pi-ai";
import { createPiAiHandler } from "./pi-ai-model-handler-stream.js";
import type {
  PiAiConfig,
  PiAiHandlerConfig,
  PiAiModelHandlerController,
} from "./pi-ai-model-handler-types.js";

export type {
  PiAiConfig,
  PiAiModelHandlerController,
  StreamEvent,
  StreamEventCallback,
} from "./pi-ai-model-handler-types.js";

/**
 * Register pi-ai as the model provider for an ElizaOS runtime.
 *
 * Returns a controller that can be used to switch models without re-registering handlers.
 */
export function registerPiAiModelHandler(
  runtime: IAgentRuntime,
  config: PiAiConfig,
): PiAiModelHandlerController {
  let largeModel = config.largeModel;
  let smallModel = config.smallModel;

  const providerName = config.providerName ?? "pi-ai";
  const priority = config.priority ?? 1000;

  const handlerConfig = {
    onStreamEvent: config.onStreamEvent,
    getAbortSignal: config.getAbortSignal,
    getApiKey: config.getApiKey,
    returnTextStreamResult: config.returnTextStreamResult,
    forceStreaming: config.forceStreaming,
  };

  const largeHandler = createPiAiHandler(() => largeModel, handlerConfig);
  const smallHandler = createPiAiHandler(() => smallModel, handlerConfig);
  const largeObjectHandler = createPiAiObjectHandler(
    () => largeModel,
    handlerConfig,
  );
  const smallObjectHandler = createPiAiObjectHandler(
    () => smallModel,
    handlerConfig,
  );

  const aliases = new Set<string>([
    providerName,
    ...(config.providerAliases ?? []),
    // Also register under all known pi-ai provider names so ElizaOS calls like
    // runtime.useModel(..., provider="anthropic") still route through pi-ai.
    ...getProviders(),
  ]);

  for (const alias of aliases) {
    runtime.registerModel(ModelType.TEXT_LARGE, largeHandler, alias, priority);
    runtime.registerModel(ModelType.TEXT_SMALL, smallHandler, alias, priority);
    runtime.registerModel(
      ModelType.OBJECT_LARGE,
      largeObjectHandler,
      alias,
      priority,
    );
    runtime.registerModel(
      ModelType.OBJECT_SMALL,
      smallObjectHandler,
      alias,
      priority,
    );

    // Also cover reasoning model types used by some prompt pipelines.
    runtime.registerModel(
      ModelType.TEXT_REASONING_LARGE,
      largeHandler,
      alias,
      priority,
    );
    runtime.registerModel(
      ModelType.TEXT_REASONING_SMALL,
      smallHandler,
      alias,
      priority,
    );
  }

  // ── IMAGE_DESCRIPTION ──────────────────────────────────────
  // Use the large model with multimodal content (text + image).
  // pi-ai supports { type: "image", data: "<base64>", mimeType } natively.
  const imageDescriptionHandler = createPiAiImageDescriptionHandler(
    () => largeModel,
    handlerConfig,
  );

  for (const alias of aliases) {
    runtime.registerModel(
      ModelType.IMAGE_DESCRIPTION,
      imageDescriptionHandler,
      alias,
      priority,
    );
  }

  return {
    getLargeModel: () => largeModel,
    setLargeModel: (model) => {
      largeModel = model;
    },
    getSmallModel: () => smallModel,
    setSmallModel: (model) => {
      smallModel = model;
    },
  };
}

/**
 * Parse a data URL into { data, mimeType }.
 * Handles: "data:image/png;base64,iVBOR..." → { data: "iVBOR...", mimeType: "image/png" }
 * Also handles bare base64 strings and http(s) URLs (fetched and converted).
 */
function parseImageUrl(imageUrl: string): {
  data: string;
  mimeType: string;
} {
  if (imageUrl.startsWith("data:")) {
    const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], data: match[2] };
    }
  }
  // Bare base64 — assume PNG
  return { data: imageUrl, mimeType: "image/png" };
}

/**
 * Create an IMAGE_DESCRIPTION handler that sends a screenshot + prompt
 * to a vision-capable model via pi-ai's multimodal content.
 *
 * Accepts the same param shapes as ElizaOS IMAGE_DESCRIPTION:
 *   - string → treated as imageUrl, uses default prompt
 *   - { imageUrl: string, prompt?: string } → image + custom prompt
 *
 * Returns { title: string, description: string } to match ElizaOS convention.
 */
function createPiAiImageDescriptionHandler(
  getModel: () => Model<Api>,
  config: PiAiHandlerConfig,
): (
  runtime: IAgentRuntime,
  params: Record<string, JsonValue | object>,
) => Promise<JsonValue | object> {
  return async (
    _runtime: IAgentRuntime,
    params: Record<string, JsonValue | object>,
  ): Promise<JsonValue | object> => {
    const model = getModel();

    // Extract imageUrl and prompt from params
    let imageUrl: string;
    let prompt: string;

    if (typeof params === "string") {
      imageUrl = params;
      prompt = "Analyze this image and describe what you see.";
    } else {
      const p = params as Record<string, unknown>;
      imageUrl = (p.imageUrl ?? p.image_url ?? "") as string;
      prompt = (p.prompt ??
        "Analyze this image and describe what you see.") as string;
    }

    if (!imageUrl) {
      throw new Error("IMAGE_DESCRIPTION requires an imageUrl");
    }

    // Parse the image URL into base64 data + mime type
    let imgData: { data: string; mimeType: string };

    if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
      // Fetch remote image
      const resp = await fetch(imageUrl);
      if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
      const buf = Buffer.from(await resp.arrayBuffer());
      const ct = resp.headers.get("content-type") ?? "image/png";
      imgData = { data: buf.toString("base64"), mimeType: ct };
    } else {
      imgData = parseImageUrl(imageUrl);
    }

    // Build multimodal context
    const context = {
      systemPrompt: "",
      messages: [
        {
          role: "user" as const,
          content: [
            { type: "text" as const, text: prompt },
            {
              type: "image" as const,
              data: imgData.data,
              mimeType: imgData.mimeType,
            },
          ],
          timestamp: Date.now(),
        },
      ],
    };

    const apiKey = await config.getApiKey?.(model.provider);

    // Stream and collect the response
    let fullText = "";
    try {
      for await (const event of stream(model, context, {
        maxTokens: 4096,
        ...(apiKey ? { apiKey } : {}),
      })) {
        switch (event.type) {
          case "text_delta":
            fullText += event.delta;
            break;
          case "error":
            if (event.reason !== "aborted") {
              throw new Error(
                event.error.errorMessage ?? "Vision model stream error",
              );
            }
            break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `pi-ai IMAGE_DESCRIPTION failed (provider=${model.provider}, model=${model.id}): ${msg}`,
      );
    }

    // Return in ElizaOS-compatible format.
    // Some callers (like CUA) parse the description as JSON,
    // others expect { title, description }.
    return {
      title: "Image Analysis",
      description: fullText,
    };
  };
}

function createPiAiObjectHandler(
  getModel: () => Model<Api>,
  config: PiAiHandlerConfig,
): (
  runtime: IAgentRuntime,
  params: Record<string, JsonValue | object>,
) => Promise<JsonValue | object> {
  return async (
    _runtime: IAgentRuntime,
    params: Record<string, JsonValue | object>,
  ): Promise<JsonValue | object> => {
    const model = getModel();
    const p = params as unknown as ObjectGenerationParams;

    if (!p.prompt || p.prompt.trim().length === 0) {
      throw new Error("Object generation requires a non-empty prompt");
    }

    const prompt = `${p.prompt}\n\nReturn ONLY valid JSON with no markdown code fences or extra commentary.`;

    const context = {
      systemPrompt: "",
      messages: [
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: prompt }],
          timestamp: Date.now(),
        },
      ],
    };

    const apiKey = await config.getApiKey?.(model.provider);

    let fullText = "";
    try {
      for await (const event of stream(model, context, {
        temperature: p.temperature,
        maxTokens: p.maxTokens,
        ...(apiKey ? { apiKey } : {}),
      })) {
        switch (event.type) {
          case "text_delta":
            fullText += event.delta;
            break;
          case "error":
            if (event.reason !== "aborted") {
              throw new Error(event.error.errorMessage ?? "Model stream error");
            }
            break;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `pi-ai OBJECT generation failed (provider=${model.provider}, model=${model.id}): ${msg}`,
      );
    }

    return parseJsonObjectResponse(fullText);
  };
}

function parseJsonObjectResponse(raw: string): JsonValue | object {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Object generation returned empty response");
  }

  const candidates: string[] = [trimmed];

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fence?.trim()) {
    candidates.push(fence.trim());
  }

  const firstObject = trimmed.indexOf("{");
  const lastObject = trimmed.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    candidates.push(trimmed.slice(firstObject, lastObject + 1));
  }

  const firstArray = trimmed.indexOf("[");
  const lastArray = trimmed.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    candidates.push(trimmed.slice(firstArray, lastArray + 1));
  }

  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    try {
      const parsed = JSON.parse(normalized) as unknown;
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as JsonValue | object;
      }
    } catch {
      // Continue trying alternate candidate slices.
    }
  }

  throw new Error(
    `Object generation returned non-JSON content: ${trimmed.slice(0, 300)}`,
  );
}
