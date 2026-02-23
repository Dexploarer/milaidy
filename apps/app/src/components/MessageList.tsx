import { memo } from "react";
import type { ConversationMessage } from "../api-client";
import { MessageContent } from "./MessageContent";

interface MessageItemProps {
  msg: ConversationMessage;
  grouped: boolean;
  agentName: string;
  agentAvatarSrc: string | null;
  agentInitial: string;
}

const MessageItem = memo(
  ({
    msg,
    grouped,
    agentName,
    agentAvatarSrc,
    agentInitial,
  }: MessageItemProps) => {
    const isUser = msg.role === "user";

    return (
      <div
        className={`flex items-start gap-1.5 sm:gap-2 ${
          isUser ? "justify-end" : "justify-start"
        } ${grouped ? "mt-1" : "mt-3"}`}
        data-testid="chat-message"
        data-role={msg.role}
      >
        {!isUser &&
          (grouped ? (
            <div className="w-7 h-7 shrink-0" aria-hidden />
          ) : (
            <div className="w-7 h-7 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover">
              {agentAvatarSrc ? (
                <img
                  src={agentAvatarSrc}
                  alt={`${agentName} avatar`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-muted">
                  {agentInitial}
                </div>
              )}
            </div>
          ))}
        <div
          className={`max-w-[92%] sm:max-w-[85%] min-w-0 px-0 py-1 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isUser ? "mr-1 sm:mr-2" : ""
          }`}
        >
          {!grouped && (
            <div className="font-bold text-[12px] mb-1 text-accent">
              {isUser ? "You" : agentName}
              {!isUser &&
                typeof msg.source === "string" &&
                msg.source &&
                msg.source !== "client_chat" && (
                  <span className="ml-1.5 text-[10px] font-normal text-muted opacity-40">
                    via {msg.source}
                  </span>
                )}
            </div>
          )}
          <div>
            <MessageContent message={msg} />
          </div>
        </div>
      </div>
    );
  },
);
MessageItem.displayName = "MessageItem";

export interface MessageListProps {
  messages: ConversationMessage[];
  agentName: string;
  agentAvatarSrc: string | null;
  agentInitial: string;
  chatSending: boolean;
  chatFirstTokenReceived: boolean;
}

export const MessageList = memo(
  ({
    messages,
    agentName,
    agentAvatarSrc,
    agentInitial,
    chatSending,
    chatFirstTokenReceived,
  }: MessageListProps) => {
    return (
      <div className="w-full pr-2 sm:pr-3">
        {messages.map((msg, i) => {
          const prev = i > 0 ? messages[i - 1] : null;
          const grouped = prev?.role === msg.role;
          return (
            <MessageItem
              key={msg.id}
              msg={msg}
              grouped={grouped}
              agentName={agentName}
              agentAvatarSrc={agentAvatarSrc}
              agentInitial={agentInitial}
            />
          );
        })}

        {chatSending && !chatFirstTokenReceived && (
          <div className="mt-3 flex items-start gap-2 justify-start">
            <div className="w-7 h-7 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover">
              {agentAvatarSrc ? (
                <img
                  src={agentAvatarSrc}
                  alt={`${agentName} avatar`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-muted">
                  {agentInitial}
                </div>
              )}
            </div>
            <div className="max-w-[92%] sm:max-w-[85%] min-w-0 px-0 py-1 pr-1 sm:pr-2 text-sm leading-relaxed">
              <div className="font-bold text-[12px] mb-1 text-accent">
                {agentName}
              </div>
              <div className="flex gap-1 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite_0.2s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite_0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);
MessageList.displayName = "MessageList";
