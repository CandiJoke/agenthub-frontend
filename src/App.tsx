import { useEffect, useRef, useState } from "react";
import "./App.css";
import { streamChat, type ChatStreamEvent } from "./api/chat";
import {
  appendChatStreamEvent,
  createPendingAgentMessage,
  createUserMessage,
  finishAgentMessage,
  type AgentChatMessage,
  type ChatMessage,
  type TimelineItem,
} from "./chat/workTimeline";
import { API_BASE_URL } from "./config/env";

function updateAgentMessage(
  messages: ChatMessage[],
  agentId: string,
  updater: (message: AgentChatMessage) => AgentChatMessage,
): ChatMessage[] {
  return messages.map((message) => {
    if (message.role === "agent" && message.id === agentId) {
      return updater(message);
    }
    return message;
  });
}

function statusLabel(status: TimelineItem["status"]): string {
  if (status === "running") return "进行中";
  if (status === "failed") return "失败";
  return "完成";
}

function timelineTitle(item: TimelineItem): string {
  if (item.kind === "stage") return item.message;
  if (item.kind === "tool") {
    if (item.status === "running") return `调用 ${item.tool}`;
    if (item.status === "failed") return `${item.tool} 调用失败`;
    const elapsed = item.elapsedMs === undefined ? "" : ` · ${item.elapsedMs} ms`;
    return `${item.tool} 已返回${elapsed}`;
  }
  if (item.kind === "answer") return item.message;
  return item.message;
}

function TimelineDetails({ item }: { item: TimelineItem }) {
  if (item.kind !== "tool") return null;

  return (
    <details className="timeline-details">
      <summary>查看工具输入和输出</summary>
      <div className="tool-detail-block">
        <span>Input</span>
        <pre>{item.input || "无输入内容"}</pre>
      </div>
      <div className="tool-detail-block">
        <span>Output</span>
        <pre>{item.output || "等待工具返回"}</pre>
      </div>
    </details>
  );
}

function Timeline({ message }: { message: AgentChatMessage }) {
  if (message.timeline.length === 0) {
    return (
      <div className="timeline-empty">
        <span className="pulse-dot" />
        {message.currentStatus}
      </div>
    );
  }

  return (
    <ol className="timeline">
      {message.timeline.map((item) => (
        <li className={`timeline-item timeline-item-${item.status}`} key={item.id}>
          <div className="timeline-marker" />
          <div className="timeline-body">
            <div className="timeline-row">
              <span className="timeline-title">{timelineTitle(item)}</span>
              <span className="timeline-status">{statusLabel(item.status)}</span>
            </div>
            <TimelineDetails item={item} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesPanelRef = useRef<HTMLDivElement>(null);
  const autoScrollPinnedRef = useRef(true);
  const sessionId = useRef(`session_${Date.now()}`).current;

  useEffect(() => {
    const panel = messagesPanelRef.current;
    if (panel && autoScrollPinnedRef.current) {
      panel.scrollTop = panel.scrollHeight;
    }
  }, [messages]);

  const handleMessagesScroll = () => {
    const panel = messagesPanelRef.current;
    if (!panel) return;
    const distanceFromBottom = panel.scrollHeight - panel.scrollTop - panel.clientHeight;
    autoScrollPinnedRef.current = distanceFromBottom <= 48;
  };

  const handleStreamEvent = (agentId: string, event: ChatStreamEvent) => {
    setMessages((currentMessages) =>
      updateAgentMessage(currentMessages, agentId, (agentMessage) =>
        appendChatStreamEvent(agentMessage, event),
      ),
    );

    if (event.type === "error") {
      setLoading(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;

    const createdAt = Date.now();
    const userMessage = createUserMessage(`user-${createdAt}`, text);
    const agentId = `agent-${createdAt}`;
    const agentMessage = createPendingAgentMessage(agentId);

    autoScrollPinnedRef.current = true;
    setInput("");
    setLoading(true);
    setMessages((currentMessages) => [...currentMessages, userMessage, agentMessage]);

    streamChat({
      message: text,
      sessionId,
      onEvent: (event) => handleStreamEvent(agentId, event),
      onDone: () => {
        setLoading(false);
        setMessages((currentMessages) =>
          updateAgentMessage(currentMessages, agentId, finishAgentMessage),
        );
      },
      onError: (errorMessage) => {
        setLoading(false);
        setMessages((currentMessages) =>
          updateAgentMessage(currentMessages, agentId, (agent) =>
            appendChatStreamEvent(agent, {
              type: "error",
              message: errorMessage,
            }),
          ),
        );
      },
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <main className="app-shell">
      <section className="chat-surface" aria-label="Agent Hub chat">
        <header className="app-header">
          <div>
            <h1>Agent Hub</h1>
            <p>实时查看 Agent 的可观察工作过程</p>
          </div>
          <div className="session-pill" title={sessionId}>
            {sessionId.slice(-8)}
          </div>
        </header>

        <div
          className="messages-panel"
          ref={messagesPanelRef}
          onScroll={handleMessagesScroll}
        >
          {messages.length === 0 && (
            <div className="empty-state">
              <strong>输入一个问题开始</strong>
              <span>例如：帮我算 123*456，或者问什么是 LangChain。</span>
            </div>
          )}

          {messages.map((message) => (
            <article className={`message message-${message.role}`} key={message.id}>
              {message.role === "user" ? (
                <div className="message-bubble user-bubble">{message.content}</div>
              ) : (
                <div className="agent-response">
                  <Timeline message={message} />
                  <div className="agent-status">
                    <span
                      className={
                        message.loading
                          ? "pulse-dot"
                          : message.error
                            ? "error-dot"
                            : "steady-dot"
                      }
                    />
                    {message.currentStatus}
                  </div>
                  <div className="message-bubble agent-bubble">
                    {message.content || (message.error ? "未能生成回答。" : "等待输出...")}
                  </div>
                  {message.error && (
                    <div className="agent-error-banner" role="alert">
                      出错了：{message.error}
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>

        <footer className="composer">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="输入问题"
            disabled={loading}
            rows={2}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()}>
            {loading ? "运行中" : "发送"}
          </button>
        </footer>

        <div className="backend-line">后端：{API_BASE_URL}</div>
      </section>
    </main>
  );
}
