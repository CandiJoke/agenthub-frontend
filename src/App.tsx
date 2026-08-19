import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import "./App.css";
import {
  listCapabilities,
  type CapabilityCatalogDto,
} from "./api/capabilities";
import { streamChat, type ChatStreamEvent } from "./api/chat";
import {
  getDefaultChildProfile,
  listDefaultChildWeaknesses,
  type ChildProfileDto,
  type LearningWeaknessDto,
} from "./api/learning";
import {
  createSession,
  deleteSession,
  getRunDetail,
  listMessages,
  listSessions,
  type ChatSessionDto,
  type RunTraceDto,
} from "./api/history";
import { MarkdownMessage } from "./chat/MarkdownMessage";
import { RunTracePanel } from "./chat/RunTracePanel";
import { SessionHistoryDialog } from "./chat/SessionHistoryDialog";
import { ThinkingMessage } from "./chat/ThinkingMessage";
import { Timeline } from "./chat/Timeline";
import {
  CHAT_DEFAULT_WIDTH,
  CHAT_MIN_WIDTH,
  clampChatWidth,
  getDefaultChatWidth,
  getChatWidthBounds,
  type ChatWidthBounds,
} from "./chat/chatLayout";
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
import { CapabilityPanel } from "./chat/CapabilityPanel";
import { LearningProfilePanel } from "./chat/LearningProfilePanel";
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

function findPromptBeforeAgent(
  messages: ChatMessage[],
  agentId: string,
): string | undefined {
  const agentIndex = messages.findIndex(
    (message) => message.role === "agent" && message.id === agentId,
  );
  if (agentIndex === -1) return undefined;

  for (let index = agentIndex - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user") return message.content;
  }

  return undefined;
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
  const [capabilityCatalog, setCapabilityCatalog] = useState<CapabilityCatalogDto>();
  const [capabilityLoading, setCapabilityLoading] = useState(true);
  const [capabilityError, setCapabilityError] = useState<string>();
  const [childProfile, setChildProfile] = useState<ChildProfileDto>();
  const [learningWeaknesses, setLearningWeaknesses] = useState<LearningWeaknessDto[]>([]);
  const [learningLoading, setLearningLoading] = useState(true);
  const [learningError, setLearningError] = useState<string>();
  const [deletingSessionId, setDeletingSessionId] = useState<string>();
  const [runTrace, setRunTrace] = useState<RunTraceDto>();
  const [runTraceLoading, setRunTraceLoading] = useState(false);
  const [runTraceError, setRunTraceError] = useState<string>();
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(CHAT_DEFAULT_WIDTH);
  const [chatWidthBounds, setChatWidthBounds] = useState<ChatWidthBounds>({
    min: CHAT_MIN_WIDTH,
    max: CHAT_DEFAULT_WIDTH,
  });
  const [chatResizing, setChatResizing] = useState(false);
  const appShellRef = useRef<HTMLElement>(null);
  const messagesPanelRef = useRef<HTMLDivElement>(null);
  const autoScrollPinnedRef = useRef(true);
  const historyRequestIdRef = useRef(0);
  const runTraceRequestIdRef = useRef(0);
  const activeStreamRef = useRef<AbortController | undefined>(undefined);
  const activeAgentIdRef = useRef<string | undefined>(undefined);
  const capabilityRequestIdRef = useRef(0);
  const learningRequestIdRef = useRef(0);
  const chatWidthRef = useRef(chatWidth);
  const chatWidthInitializedRef = useRef(false);
  const chatResizeCleanupRef = useRef<(() => void) | undefined>(undefined);

  const getAvailableShellWidth = useCallback(() => {
    const shell = appShellRef.current;
    if (!shell) return window.innerWidth;

    const shellStyle = window.getComputedStyle(shell);
    const horizontalPadding =
      Number.parseFloat(shellStyle.paddingLeft) +
      Number.parseFloat(shellStyle.paddingRight);
    return shell.clientWidth - horizontalPadding;
  }, []);

  const updateChatWidth = useCallback((width: number) => {
    const availableWidth = getAvailableShellWidth();
    setChatWidthBounds(getChatWidthBounds(availableWidth));
    setChatWidth(clampChatWidth(width, availableWidth));
  }, [getAvailableShellWidth]);

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

  const loadCapabilityCatalog = useCallback(async () => {
    const requestId = ++capabilityRequestIdRef.current;
    setCapabilityLoading(true);
    setCapabilityError(undefined);
    try {
      const catalog = await listCapabilities();
      if (capabilityRequestIdRef.current === requestId) {
        setCapabilityCatalog(catalog);
      }
    } catch {
      if (capabilityRequestIdRef.current === requestId) {
        setCapabilityError("能力目录加载失败");
      }
    } finally {
      if (capabilityRequestIdRef.current === requestId) {
        setCapabilityLoading(false);
      }
    }
  }, []);

  const loadLearningProfile = useCallback(async () => {
    const requestId = ++learningRequestIdRef.current;
    setLearningLoading(true);
    setLearningError(undefined);
    try {
      const [profile, weaknesses] = await Promise.all([
        getDefaultChildProfile(userId),
        listDefaultChildWeaknesses(userId),
      ]);
      if (learningRequestIdRef.current === requestId) {
        setChildProfile(profile);
        setLearningWeaknesses(weaknesses);
      }
    } catch {
      if (learningRequestIdRef.current === requestId) {
        setLearningError("学习画像加载失败");
      }
    } finally {
      if (learningRequestIdRef.current === requestId) {
        setLearningLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void loadCapabilityCatalog();
  }, [loadCapabilityCatalog]);

  useEffect(() => {
    void loadLearningProfile();
  }, [loadLearningProfile]);

  useEffect(() => {
    chatWidthRef.current = chatWidth;
  }, [chatWidth]);

  useEffect(() => {
    const handleWindowResize = () => {
      const availableWidth = getAvailableShellWidth();
      setChatWidthBounds(getChatWidthBounds(availableWidth));

      if (!chatWidthInitializedRef.current) {
        const defaultWidth = getDefaultChatWidth(availableWidth);
        chatWidthRef.current = defaultWidth;
        setChatWidth(defaultWidth);
        chatWidthInitializedRef.current = true;
        return;
      }

      const clampedWidth = clampChatWidth(chatWidthRef.current, availableWidth);
      chatWidthRef.current = clampedWidth;
      setChatWidth(clampedWidth);
    };
    handleWindowResize();
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [getAvailableShellWidth]);

  useEffect(() => () => {
    activeStreamRef.current?.abort();
    chatResizeCleanupRef.current?.();
  }, []);

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

  const handleCreateSession = async (): Promise<boolean> => {
    if (loading) return false;

    const requestId = ++historyRequestIdRef.current;
    setHistoryLoading(true);
    setHistoryError(undefined);
    try {
      const created = await createSession(userId);
      if (historyRequestIdRef.current !== requestId) return false;

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
      return true;
    } catch {
      if (historyRequestIdRef.current === requestId) {
        setHistoryError("新建会话失败");
      }
      return false;
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setHistoryLoading(false);
      }
    }
  };

  const handleSelectSession = async (sessionId: string): Promise<boolean> => {
    if (loading) return false;
    if (sessionId === activeSessionId) return true;

    const requestId = ++historyRequestIdRef.current;
    setHistoryLoading(true);
    setHistoryError(undefined);
    try {
      return await loadSessionMessages(sessionId, requestId);
    } catch {
      if (historyRequestIdRef.current === requestId) {
        setHistoryError("聊天记录加载失败");
      }
      return false;
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setHistoryLoading(false);
      }
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (loading || deletingSessionId) return;
    if (!window.confirm("删除这段聊天记录？")) return;

    const requestId = ++historyRequestIdRef.current;
    runTraceRequestIdRef.current += 1;
    setDeletingSessionId(sessionId);
    setHistoryLoading(true);
    setHistoryError(undefined);
    try {
      await deleteSession(userId, sessionId);
      if (historyRequestIdRef.current !== requestId) return;

      const remainingSessions = sessions.filter(
        (session) => session.sessionId !== sessionId,
      );
      setSessions(remainingSessions);

      if (runTrace?.run.sessionId === sessionId) {
        setRunTrace(undefined);
        setRunTraceError(undefined);
        setRunTraceLoading(false);
      }

      if (sessionId !== activeSessionId) return;

      if (remainingSessions.length === 0) {
        autoScrollPinnedRef.current = true;
        setMessages([]);
        setActiveSessionId(undefined);
        setRunTrace(undefined);
        setRunTraceError(undefined);
        setRunTraceLoading(false);

        const created = await createSession(userId);
        if (historyRequestIdRef.current !== requestId) return;

        setSessions([created]);
        setActiveSessionId(created.sessionId);
        return;
      }

      await loadSessionMessages(remainingSessions[0].sessionId, requestId);
    } catch {
      if (historyRequestIdRef.current === requestId) {
        setHistoryError("删除会话失败");
      }
    } finally {
      if (historyRequestIdRef.current === requestId) {
        setHistoryLoading(false);
        setDeletingSessionId(undefined);
      }
    }
  };

  const handleStreamEvent = (agentId: string, event: ChatStreamEvent) => {
    setMessages((currentMessages) =>
      updateAgentMessage(currentMessages, agentId, (agentMessage) =>
        appendChatStreamEvent(agentMessage, event),
      ),
    );

    if (
      event.type === "tool_end" &&
      (event.tool === "update_child_profile" ||
        event.tool === "record_chinese_literacy_weakness" ||
        event.tool === "record_learning_weakness")
    ) {
      void loadLearningProfile();
    }

    if (event.type === "error" || event.type === "stopped") {
      if (activeAgentIdRef.current === agentId) {
        activeStreamRef.current = undefined;
        activeAgentIdRef.current = undefined;
      }
      setLoading(false);
    }
  };

  const startChatRun = (text: string): boolean => {
    if (!text || loading || !activeSessionId) return false;

    const createdAt = Date.now();
    const userMessage = createUserMessage(`user-${createdAt}`, text);
    const agentId = `agent-${createdAt}`;
    const agentMessage = createPendingAgentMessage(agentId);

    autoScrollPinnedRef.current = true;
    setLoading(true);
    setMessages((currentMessages) => [...currentMessages, userMessage, agentMessage]);

    const controller = streamChat({
      userId,
      sessionId: activeSessionId,
      message: text,
      onEvent: (event) => handleStreamEvent(agentId, event),
      onDone: () => {
        if (activeAgentIdRef.current === agentId) {
          activeStreamRef.current = undefined;
          activeAgentIdRef.current = undefined;
        }
        setLoading(false);
        setMessages((currentMessages) =>
          updateAgentMessage(currentMessages, agentId, finishAgentMessage),
        );
        void listSessions(userId).then(setSessions).catch(() => undefined);
        void loadLearningProfile();
      },
      onError: (errorMessage) => {
        if (activeAgentIdRef.current === agentId) {
          activeStreamRef.current = undefined;
          activeAgentIdRef.current = undefined;
        }
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

    activeStreamRef.current = controller;
    activeAgentIdRef.current = agentId;
    return true;
  };

  const handleSend = () => {
    const text = input.trim();
    if (startChatRun(text)) {
      setInput("");
    }
  };

  const handleStopAgent = (agentId: string) => {
    if (activeAgentIdRef.current !== agentId) return;

    activeStreamRef.current?.abort();
    activeStreamRef.current = undefined;
    activeAgentIdRef.current = undefined;
    setLoading(false);
    setMessages((currentMessages) =>
      updateAgentMessage(currentMessages, agentId, (agent) =>
        appendChatStreamEvent(agent, {
          type: "stopped",
          message: "已停止本次回答",
        }),
      ),
    );
    void listSessions(userId).then(setSessions).catch(() => undefined);
  };

  const handleReplayAgent = (agentId: string) => {
    const prompt = findPromptBeforeAgent(messages, agentId);
    if (!prompt) return;
    startChatRun(prompt);
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

  const resizeChatBy = (delta: number) => {
    updateChatWidth(chatWidthRef.current + delta);
  };

  const handleChatResizePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;

    event.preventDefault();
    chatResizeCleanupRef.current?.();

    const startX = event.clientX;
    const startWidth = chatWidthRef.current;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      updateChatWidth(startWidth + moveEvent.clientX - startX);
    };

    const stopResize = () => {
      setChatResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      chatResizeCleanupRef.current = undefined;
    };

    setChatResizing(true);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    chatResizeCleanupRef.current = stopResize;
  };

  const handleChatResizeKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeChatBy(-40);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeChatBy(40);
    }
  };

  const appShellStyle = {
    "--chat-panel-width": `${chatWidth}px`,
  } as CSSProperties;

  return (
    <main
      className={chatResizing ? "app-shell app-shell-resizing" : "app-shell"}
      ref={appShellRef}
      style={appShellStyle}
    >
      <SessionHistoryDialog
        open={historyDialogOpen}
        sessions={sessions}
        activeSessionId={activeSessionId}
        loading={historyLoading}
        actionsDisabled={loading || deletingSessionId !== undefined}
        deletingSessionId={deletingSessionId}
        error={historyError}
        onCreateSession={() => {
          void handleCreateSession().then((created) => {
            if (created) setHistoryDialogOpen(false);
          });
        }}
        onSelectSession={(sessionId) => {
          void handleSelectSession(sessionId).then((selected) => {
            if (selected) setHistoryDialogOpen(false);
          });
        }}
        onDeleteSession={(sessionId) => void handleDeleteSession(sessionId)}
        onRetry={() => void loadSessions()}
        onClose={() => setHistoryDialogOpen(false)}
      />

      <section className="chat-surface" aria-label="Agent Hub chat">
        <header className="app-header">
          <div className="app-title-group">
            <button
              type="button"
              className="history-entry-button"
              aria-label="打开聊天记录"
              title="聊天记录"
              onClick={() => setHistoryDialogOpen(true)}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 6h14" />
                <path d="M5 12h14" />
                <path d="M5 18h10" />
              </svg>
            </button>
            <div>
              <h1>Agent Hub</h1>
              <p>实时查看 Agent 的可观察工作过程</p>
            </div>
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

          {messages.map((message) => {
            const replayPrompt = message.role === "agent"
              ? findPromptBeforeAgent(messages, message.id)
              : undefined;
            const canReplay = Boolean(replayPrompt && !loading && activeSessionId);

            return (
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
                        message.stopped
                          ? "已停止输出。"
                          : message.error
                            ? "未能生成回答。"
                            : "等待输出..."
                      )}
                    </div>
                    <div className="agent-actions" aria-label="回答操作">
                      {message.runId && (
                        <button
                          className="agent-action-button run-detail-button"
                          type="button"
                          onClick={() => {
                            const runId = message.runId;
                            if (runId) void handleOpenRunTrace(runId);
                          }}
                        >
                          查看执行详情
                        </button>
                      )}
                      {message.loading && activeAgentIdRef.current === message.id && message.runId && (
                        <button
                          className="agent-action-button agent-action-stop"
                          type="button"
                          onClick={() => handleStopAgent(message.id)}
                        >
                          停止
                        </button>
                      )}
                      {!message.loading && (message.error || message.stopped) && (
                        <button
                          className="agent-action-button"
                          type="button"
                          disabled={!canReplay}
                          onClick={() => handleReplayAgent(message.id)}
                        >
                          重试
                        </button>
                      )}
                      {!message.loading && !message.error && !message.stopped && message.content && (
                        <button
                          className="agent-action-button"
                          type="button"
                          disabled={!canReplay}
                          onClick={() => handleReplayAgent(message.id)}
                        >
                          重新生成
                        </button>
                      )}
                    </div>
                    {message.error && (
                      <div className="agent-error-banner" role="alert">
                        出错了：{message.error}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
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

        <div
          className="chat-resize-handle"
          role="separator"
          aria-label="拖动调整对话宽度"
          aria-orientation="vertical"
          aria-valuemin={CHAT_MIN_WIDTH}
          aria-valuemax={chatWidthBounds.max}
          aria-valuenow={chatWidth}
          aria-valuetext={`${chatWidth}px`}
          tabIndex={0}
          onPointerDown={handleChatResizePointerDown}
          onKeyDown={handleChatResizeKeyDown}
        />
      </section>

      {(runTrace || runTraceLoading || runTraceError) && (
        <RunTracePanel
          trace={runTrace}
          loading={runTraceLoading}
          error={runTraceError}
          onClose={handleCloseRunTrace}
        />
      )}

      <aside className="right-insight-rail" aria-label="学习和能力面板">
        <LearningProfilePanel
          profile={childProfile}
          weaknesses={learningWeaknesses}
          loading={learningLoading}
          error={learningError}
          onRetry={() => void loadLearningProfile()}
        />
        <CapabilityPanel
          catalog={capabilityCatalog}
          loading={capabilityLoading}
          error={capabilityError}
          onRetry={() => void loadCapabilityCatalog()}
        />
      </aside>
    </main>
  );
}
