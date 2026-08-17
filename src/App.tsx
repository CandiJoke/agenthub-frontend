import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { streamChat, type ChatStreamEvent } from "./api/chat";
import {
  createSession,
  getRunDetail,
  listMessages,
  listSessions,
  type ChatSessionDto,
  type RunTraceDto,
} from "./api/history";
import { MarkdownMessage } from "./chat/MarkdownMessage";
import { RunTracePanel } from "./chat/RunTracePanel";
import { SessionSidebar } from "./chat/SessionSidebar";
import { ThinkingMessage } from "./chat/ThinkingMessage";
import { Timeline } from "./chat/Timeline";
import { mapPersistedMessages } from "./chat/historyMapping";
import {
  appendChatStreamEvent,
  createPendingAgentMessage,
  createUserMessage,
  finishAgentMessage,
  type AgentChatMessage,
  type ChatMessage,
} from "./chat/workTimeline";
import { API_BASE_URL } from "./config/env";
import { getOrCreateUserId } from "./session/userIdentity";

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

export default function App() {
  const [userId] = useState(() => getOrCreateUserId());
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSessionDto[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string>();
  const [runTrace, setRunTrace] = useState<RunTraceDto>();
  const [runTraceLoading, setRunTraceLoading] = useState(false);
  const [runTraceError, setRunTraceError] = useState<string>();
  const messagesPanelRef = useRef<HTMLDivElement>(null);
  const autoScrollPinnedRef = useRef(true);
  const historyRequestIdRef = useRef(0);
  const runTraceRequestIdRef = useRef(0);

  const loadSessionMessages = useCallback(async (
    sessionId: string,
    requestId = ++historyRequestIdRef.current,
  ) => {
    runTraceRequestIdRef.current += 1;
    const persistedMessages = await listMessages(userId, sessionId);
    if (historyRequestIdRef.current !== requestId) return false;

    autoScrollPinnedRef.current = true;
    setRunTrace(undefined);
    setRunTraceError(undefined);
    setRunTraceLoading(false);
    setMessages(mapPersistedMessages(persistedMessages));
    setActiveSessionId(sessionId);
    return true;
  }, [userId]);

  const loadSessions = useCallback(async () => {
    const requestId = ++historyRequestIdRef.current;
    setHistoryLoading(true);
    setHistoryError(undefined);
    try {
      const loadedSessions = await listSessions(userId);
      if (historyRequestIdRef.current !== requestId) return;

      if (loadedSessions.length === 0) {
        const created = await createSession(userId);
        if (historyRequestIdRef.current !== requestId) return;

        setSessions([created]);
        setMessages([]);
        setActiveSessionId(created.sessionId);
        return;
      }

      setSessions(loadedSessions);
      await loadSessionMessages(loadedSessions[0].sessionId, requestId);
    } catch {
      if (historyRequestIdRef.current === requestId) {
        setHistoryError("聊天记录加载失败");
      }
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setHistoryLoading(false);
      }
    }
  }, [loadSessionMessages, userId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

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

  const handleCreateSession = async () => {
    if (loading) return;

    const requestId = ++historyRequestIdRef.current;
    setHistoryLoading(true);
    setHistoryError(undefined);
    try {
      const created = await createSession(userId);
      if (historyRequestIdRef.current !== requestId) return;

      setSessions((currentSessions) => [
        created,
        ...currentSessions.filter(
          (session) => session.sessionId !== created.sessionId,
        ),
      ]);
      autoScrollPinnedRef.current = true;
      setMessages([]);
      setActiveSessionId(created.sessionId);
      setRunTrace(undefined);
      setRunTraceError(undefined);
    } catch {
      if (historyRequestIdRef.current === requestId) {
        setHistoryError("新建会话失败");
      }
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setHistoryLoading(false);
      }
    }
  };

  const handleSelectSession = async (sessionId: string) => {
    if (loading || sessionId === activeSessionId) return;

    const requestId = ++historyRequestIdRef.current;
    setHistoryLoading(true);
    setHistoryError(undefined);
    try {
      await loadSessionMessages(sessionId, requestId);
    } catch {
      if (historyRequestIdRef.current === requestId) {
        setHistoryError("聊天记录加载失败");
      }
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setHistoryLoading(false);
      }
    }
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
    if (!text || loading || !activeSessionId) return;

    const createdAt = Date.now();
    const userMessage = createUserMessage(`user-${createdAt}`, text);
    const agentId = `agent-${createdAt}`;
    const agentMessage = createPendingAgentMessage(agentId);

    autoScrollPinnedRef.current = true;
    setInput("");
    setLoading(true);
    setMessages((currentMessages) => [...currentMessages, userMessage, agentMessage]);

    streamChat({
      userId,
      sessionId: activeSessionId,
      message: text,
      onEvent: (event) => handleStreamEvent(agentId, event),
      onDone: () => {
        setLoading(false);
        setMessages((currentMessages) =>
          updateAgentMessage(currentMessages, agentId, finishAgentMessage),
        );
        void listSessions(userId).then(setSessions).catch(() => undefined);
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

  const handleOpenRunTrace = async (runId: string) => {
    const requestId = ++runTraceRequestIdRef.current;
    setRunTrace(undefined);
    setRunTraceError(undefined);
    setRunTraceLoading(true);
    try {
      const trace = await getRunDetail(userId, runId);
      if (runTraceRequestIdRef.current === requestId) {
        setRunTrace(trace);
      }
    } catch {
      if (runTraceRequestIdRef.current === requestId) {
        setRunTraceError("执行详情加载失败");
      }
    } finally {
      if (runTraceRequestIdRef.current === requestId) {
        setRunTraceLoading(false);
      }
    }
  };

  const handleCloseRunTrace = () => {
    runTraceRequestIdRef.current += 1;
    setRunTrace(undefined);
    setRunTraceError(undefined);
    setRunTraceLoading(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <main className="app-shell">
      <SessionSidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        loading={historyLoading}
        actionsDisabled={loading}
        error={historyError}
        onCreateSession={() => void handleCreateSession()}
        onSelectSession={(sessionId) => void handleSelectSession(sessionId)}
        onRetry={() => void loadSessions()}
      />

      <section className="chat-surface" aria-label="Agent Hub chat">
        <header className="app-header">
          <div>
            <h1>Agent Hub</h1>
            <p>实时查看 Agent 的可观察工作过程</p>
          </div>
          <div className="session-pill" title={activeSessionId}>
            {(activeSessionId ?? "no-session").slice(-8)}
          </div>
        </header>

        <div
          className="messages-panel"
          ref={messagesPanelRef}
          onScroll={handleMessagesScroll}
        >
          {messages.length === 0 && (
            <div className="empty-state">
              <strong>{historyLoading ? "正在加载聊天记录" : "输入一个问题开始"}</strong>
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
                  <div className="message-bubble agent-bubble">
                    {message.content ? (
                      <MarkdownMessage content={message.content} />
                    ) : message.loading ? (
                      <ThinkingMessage />
                    ) : (
                      message.error ? "未能生成回答。" : "等待输出..."
                    )}
                  </div>
                  {message.runId && (
                    <button
                      className="run-detail-button"
                      type="button"
                      onClick={() => {
                        const runId = message.runId;
                        if (runId) void handleOpenRunTrace(runId);
                      }}
                    >
                      查看执行详情
                    </button>
                  )}
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
            disabled={loading || !activeSessionId}
            rows={2}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim() || !activeSessionId}
          >
            {loading ? "运行中" : "发送"}
          </button>
        </footer>

        <div className="backend-line">后端：{API_BASE_URL}</div>
      </section>

      {(runTrace || runTraceLoading || runTraceError) && (
        <RunTracePanel
          trace={runTrace}
          loading={runTraceLoading}
          error={runTraceError}
          onClose={handleCloseRunTrace}
        />
      )}
    </main>
  );
}
