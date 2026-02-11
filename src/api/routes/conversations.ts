import http from "node:http";
import crypto from "node:crypto";
import {
  ChannelType,
  type Content,
  createMessageMemory,
  stringToUuid,
  type UUID,
  logger,
} from "@elizaos/core";
import { type ServerState, type ConversationMeta } from "../types.js";
import { readJsonBody, json, error, decodePathComponent } from "../utils.js";

// Helper: ensure a persistent chat user exists.
const ensureChatUser = async (state: ServerState): Promise<UUID> => {
  if (!state.chatUserId) {
    state.chatUserId = crypto.randomUUID() as UUID;
  }
  return state.chatUserId;
};

// Helper: ensure the room for a conversation is set up.
const ensureConversationRoom = async (
  state: ServerState,
  conv: ConversationMeta,
): Promise<void> => {
  if (!state.runtime) return;
  const runtime = state.runtime;
  const agentName = runtime.character.name ?? "Milaidy";
  const userId = await ensureChatUser(state);
  const worldId = stringToUuid(`${agentName}-web-chat-world`);
  const messageServerId = stringToUuid(`${agentName}-web-server`) as UUID;
  await runtime.ensureConnection({
    entityId: userId,
    roomId: conv.roomId,
    worldId,
    userName: "User",
    source: "client_chat",
    channelId: `web-conv-${conv.id}`,
    type: ChannelType.DM,
    messageServerId,
    metadata: { ownership: { ownerId: userId } },
  });

  const world = await runtime.getWorld(worldId);
  if (world) {
    let needsUpdate = false;
    if (!world.metadata) {
      world.metadata = {};
      needsUpdate = true;
    }
    if (
      !world.metadata.ownership ||
      typeof world.metadata.ownership !== "object" ||
      (world.metadata.ownership as { ownerId: string }).ownerId !== userId
    ) {
      world.metadata.ownership = { ownerId: userId };
      needsUpdate = true;
    }
    if (needsUpdate) {
      await runtime.updateWorld(world);
    }
  }
};

export async function handleConversationsRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  state: ServerState
): Promise<boolean> {
  // ── GET /api/conversations ──────────────────────────────────────────
  if (method === "GET" && pathname === "/api/conversations") {
    const convos = Array.from(state.conversations.values()).sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    json(res, { conversations: convos });
    return true;
  }

  // ── POST /api/conversations ─────────────────────────────────────────
  if (method === "POST" && pathname === "/api/conversations") {
    const body = await readJsonBody<{ title?: string }>(req, res);
    if (!body) return true;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const roomId = stringToUuid(`web-conv-${id}`);
    const conv: ConversationMeta = {
      id,
      title: body.title?.trim() || "New Chat",
      roomId,
      createdAt: now,
      updatedAt: now,
    };
    state.conversations.set(id, conv);
    if (state.runtime) {
      await ensureConversationRoom(state, conv);
    }
    json(res, { conversation: conv });
    return true;
  }

  // ── GET /api/conversations/:id/messages ─────────────────────────────
  if (
    method === "GET" &&
    /^\/api\/conversations\/[^/]+\/messages$/.test(pathname)
  ) {
    const convId = decodePathComponent(
      pathname.split("/")[3],
      res,
      "conversation ID",
    );
    if (convId === null) return true;
    const conv = state.conversations.get(convId);
    if (!conv) {
      error(res, "Conversation not found", 404);
      return true;
    }
    if (!state.runtime || state.agentState !== "running") {
      json(res, { messages: [] });
      return true;
    }
    try {
      const memories = await state.runtime.getMemories({
        roomId: conv.roomId,
        tableName: "messages",
        count: 200,
      });
      // Sort by createdAt ascending
      memories.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
      const agentId = state.runtime.agentId;
      const messages = memories.map((m) => ({
        id: m.id ?? "",
        role: m.entityId === agentId ? "assistant" : "user",
        text: (m.content as { text?: string })?.text ?? "",
        timestamp: m.createdAt ?? 0,
      }));
      json(res, { messages });
    } catch (err) {
      logger.warn(
        `[conversations] Failed to fetch messages: ${err instanceof Error ? err.message : String(err)}`,
      );
      json(res, { error: "Failed to fetch messages" }, 500);
    }
    return true;
  }

  // ── POST /api/conversations/:id/messages ────────────────────────────
  if (
    method === "POST" &&
    /^\/api\/conversations\/[^/]+\/messages$/.test(pathname)
  ) {
    const convId = decodePathComponent(
      pathname.split("/")[3],
      res,
      "conversation ID",
    );
    if (convId === null) return true;
    const conv = state.conversations.get(convId);
    if (!conv) {
      error(res, "Conversation not found", 404);
      return true;
    }
    const body = await readJsonBody<{ text?: string }>(req, res);
    if (!body) return true;
    if (!body.text?.trim()) {
      error(res, "text is required");
      return true;
    }
    if (!state.runtime) {
      error(res, "Agent is not running", 503);
      return true;
    }

    // Cloud proxy path
    const proxy = state.cloudManager?.getProxy();
    if (proxy) {
      const responseText = await proxy.handleChatMessage(body.text.trim());
      conv.updatedAt = new Date().toISOString();
      json(res, { text: responseText, agentName: proxy.agentName });
      return true;
    }

    try {
      const runtime = state.runtime;
      const userId = await ensureChatUser(state);
      await ensureConversationRoom(state, conv);

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: userId,
        roomId: conv.roomId,
        content: {
          text: body.text.trim(),
          source: "client_chat",
          channelType: ChannelType.DM,
        },
      });

      let responseText = "";
      const result = await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content) => {
          if (content?.text) {
            responseText += content.text;
          }
          return [];
        },
      );

      if (!responseText && result?.responseContent?.text) {
        responseText = result.responseContent.text;
      }

      conv.updatedAt = new Date().toISOString();
      json(res, {
        text: responseText || "(no response)",
        agentName: state.agentName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "generation failed";
      error(res, msg, 500);
    }
    return true;
  }

  // ── POST /api/conversations/:id/greeting ───────────────────────────
  if (
    method === "POST" &&
    /^\/api\/conversations\/[^/]+\/greeting$/.test(pathname)
  ) {
    const convId = decodePathComponent(
      pathname.split("/")[3],
      res,
      "conversation ID",
    );
    if (convId === null) return true;
    const conv = state.conversations.get(convId);
    if (!conv) {
      error(res, "Conversation not found", 404);
      return true;
    }

    const runtime = state.runtime;
    const charName = runtime?.character.name ?? state.agentName ?? "Milaidy";
    const FALLBACK_MSG = `Hey! I'm ${charName}. What's on your mind?`;

    const postExamples = runtime?.character.postExamples ?? [];
    const greeting =
      postExamples.length > 0
        ? postExamples[Math.floor(Math.random() * postExamples.length)]
        : FALLBACK_MSG;

    if (runtime && state.agentState === "running") {
      try {
        await ensureConversationRoom(state, conv);
        const agentMemory = createMessageMemory({
          id: crypto.randomUUID() as UUID,
          entityId: runtime.agentId,
          roomId: conv.roomId,
          content: {
            text: greeting,
            source: "agent_greeting",
            channelType: ChannelType.DM,
          },
        });
        await runtime.createMemory(agentMemory, "messages");
      } catch (memErr) {
        logger.debug(
          `[greeting] Failed to store greeting memory: ${memErr instanceof Error ? memErr.message : String(memErr)}`,
        );
      }
    }

    conv.updatedAt = new Date().toISOString();
    json(res, {
      text: greeting,
      agentName: charName,
      generated: postExamples.length > 0,
    });
    return true;
  }

  // ── PATCH /api/conversations/:id ────────────────────────────────────
  if (
    method === "PATCH" &&
    /^\/api\/conversations\/[^/]+$/.test(pathname) &&
    !pathname.endsWith("/messages")
  ) {
    const convId = decodePathComponent(
      pathname.split("/")[3],
      res,
      "conversation ID",
    );
    if (convId === null) return true;
    const conv = state.conversations.get(convId);
    if (!conv) {
      error(res, "Conversation not found", 404);
      return true;
    }
    const body = await readJsonBody<{ title?: string }>(req, res);
    if (!body) return true;
    if (body.title?.trim()) {
      conv.title = body.title.trim();
      conv.updatedAt = new Date().toISOString();
    }
    json(res, { conversation: conv });
    return true;
  }

  // ── DELETE /api/conversations/:id ───────────────────────────────────
  if (
    method === "DELETE" &&
    /^\/api\/conversations\/[^/]+$/.test(pathname) &&
    !pathname.endsWith("/messages")
  ) {
    const convId = decodePathComponent(
      pathname.split("/")[3],
      res,
      "conversation ID",
    );
    if (convId === null) return true;
    state.conversations.delete(convId);
    json(res, { ok: true });
    return true;
  }

  // ── POST /api/chat (legacy) ───────────────────────────────────────
  if (method === "POST" && pathname === "/api/chat") {
    // ── Cloud proxy path ───────────────────────────────────────────────
    const proxy = state.cloudManager?.getProxy();
    if (proxy) {
      const body = await readJsonBody<{ text?: string }>(req, res);
      if (!body) return true;
      if (!body.text?.trim()) {
        error(res, "text is required");
        return true;
      }

      const wantsStream = (req.headers.accept ?? "").includes(
        "text/event-stream",
      );

      if (wantsStream) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });

        for await (const chunk of proxy.handleChatMessageStream(
          body.text.trim(),
        )) {
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        }
        res.write(`event: done\ndata: {}\n\n`);
        res.end();
      } else {
        const responseText = await proxy.handleChatMessage(body.text.trim());
        json(res, { text: responseText, agentName: proxy.agentName });
      }
      return true;
    }

    // ── Local runtime path ─────────────────────────────────────────────
    const body = await readJsonBody<{ text?: string }>(req, res);
    if (!body) return true;
    if (!body.text?.trim()) {
      error(res, "text is required");
      return true;
    }

    if (!state.runtime) {
      error(res, "Agent is not running", 503);
      return true;
    }

    try {
      const runtime = state.runtime;
      const agentName = runtime.character.name ?? "Milaidy";

      if (!state.chatUserId || !state.chatRoomId) {
        state.chatUserId = crypto.randomUUID() as UUID;
        state.chatRoomId = stringToUuid(`${agentName}-web-chat-room`);
        const worldId = stringToUuid(`${agentName}-web-chat-world`);
        const messageServerId = stringToUuid(`${agentName}-web-server`) as UUID;
        await runtime.ensureConnection({
          entityId: state.chatUserId,
          roomId: state.chatRoomId,
          worldId,
          userName: "User",
          source: "client_chat",
          channelId: `${agentName}-web-chat`,
          type: ChannelType.DM,
          messageServerId,
          metadata: { ownership: { ownerId: state.chatUserId } },
        });

        const world = await runtime.getWorld(worldId);
        if (world) {
          let needsUpdate = false;
          if (!world.metadata) {
            world.metadata = {};
            needsUpdate = true;
          }
          if (
            !world.metadata.ownership ||
            typeof world.metadata.ownership !== "object" ||
            (world.metadata.ownership as { ownerId: string }).ownerId !==
              state.chatUserId
          ) {
            world.metadata.ownership = {
              ownerId: state.chatUserId ?? "",
            };
            needsUpdate = true;
          }
          if (needsUpdate) {
            await runtime.updateWorld(world);
          }
        }
      }

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: state.chatUserId,
        roomId: state.chatRoomId,
        content: {
          text: body.text.trim(),
          source: "client_chat",
          channelType: ChannelType.DM,
        },
      });

      let responseText = "";

      const result = await runtime.messageService?.handleMessage(
        runtime,
        message,
        async (content: Content) => {
          if (content?.text) {
            responseText += content.text;
          }
          return [];
        },
      );

      if (!responseText && result?.responseContent?.text) {
        responseText = result.responseContent.text;
      }

      json(res, {
        text: responseText || "(no response)",
        agentName: state.agentName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "generation failed";
      error(res, msg, 500);
    }
    return true;
  }

  return false;
}
