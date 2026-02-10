import { logger } from "@elizaos/core";
import { Markup } from "telegraf";
// @ts-expect-error - plugin package currently ships without type declarations
import { MessageManager } from "@elizaos/plugin-telegram";
import { smartChunkTelegramText } from "./chunking.js";

const TYPING_INTERVAL_MS = 4000;
const RECEIPT_REACTIONS = ["👀", "⏳"] as const;

function toTelegramButtons(buttons: any[] | undefined) {
  if (!Array.isArray(buttons)) return [];

  const rows: any[] = [];
  for (const button of buttons) {
    if (!button || !button.text || !button.url) continue;

    if (button.kind === "login") {
      rows.push(Markup.button.login(button.text, button.url));
      continue;
    }

    rows.push(Markup.button.url(button.text, button.url));
  }

  return rows;
}

export class EnhancedTelegramMessageManager extends MessageManager {
  async sendMessageInChunks(ctx: any, content: any, replyToMessageId?: number) {
    if (content?.attachments?.length) {
      return super.sendMessageInChunks(ctx, content, replyToMessageId);
    }

    const chunks = smartChunkTelegramText(content?.text ?? "");
    if (!ctx?.chat || chunks.length === 0) {
      return [];
    }

    const telegramButtons = toTelegramButtons(content?.buttons);
    const sentMessages: any[] = [];

    for (let i = 0; i < chunks.length; i += 1) {
      const chunk = chunks[i];
      const sent = await ctx.telegram.sendMessage(ctx.chat.id, chunk.html, {
        parse_mode: "HTML",
        reply_parameters:
          i === 0 && replyToMessageId
            ? { message_id: replyToMessageId }
            : undefined,
        ...(telegramButtons.length
          ? Markup.inlineKeyboard(telegramButtons)
          : {}),
      });
      sentMessages.push(sent);
    }

    return sentMessages;
  }

  async handleMessage(ctx: any) {
    if (!ctx?.message || !ctx?.from || !ctx?.chat) {
      return;
    }

    const chatId = ctx.chat.id;
    const reactionEmoji =
      RECEIPT_REACTIONS[Math.floor(Math.random() * RECEIPT_REACTIONS.length)];

    try {
      if (ctx.message?.message_id && typeof ctx.telegram?.setMessageReaction === "function") {
        await ctx.telegram.setMessageReaction(chatId, ctx.message.message_id, [
          { type: "emoji", emoji: reactionEmoji },
        ]);
      }
    } catch {
      // Best-effort acknowledgment only.
    }

    let stopped = false;
    const sendTyping = async () => {
      if (stopped) return;
      try {
        await ctx.telegram.sendChatAction(chatId, "typing");
      } catch {
        // Ignore transient typing failures.
      }
    };

    await sendTyping();
    const interval = setInterval(() => {
      void sendTyping();
    }, TYPING_INTERVAL_MS);

    try {
      await super.handleMessage(ctx);
    } catch (error) {
      logger.error(
        { error },
        "[telegram-enhanced] Failed to handle telegram message",
      );

      const fallbackText =
        "Sorry — I hit an error while generating that response. Please try again in a moment.";

      try {
        await ctx.telegram.sendMessage(chatId, fallbackText, {
          reply_parameters: ctx.message?.message_id
            ? { message_id: ctx.message.message_id }
            : undefined,
        });
      } catch {
        // Nothing else we can do.
      }
    } finally {
      stopped = true;
      clearInterval(interval);
    }
  }
}
