import type { ChatSessionDto } from "../api/history.js";

interface SessionSidebarProps {
  sessions: ChatSessionDto[];
  activeSessionId?: string;
  loading: boolean;
  error?: string;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onRetry: () => void;
}

function formatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionSidebar({
  sessions,
  activeSessionId,
  loading,
  error,
  onCreateSession,
  onSelectSession,
  onRetry,
}: SessionSidebarProps) {
  return (
    <aside className="session-sidebar" aria-label="聊天历史">
      <div className="session-sidebar-header">
        <span>聊天记录</span>
        <button type="button" onClick={onCreateSession}>
          新建
        </button>
      </div>
      {error && (
        <div className="session-error">
          <span>{error}</span>
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </div>
      )}
      {loading && <div className="session-loading">加载中...</div>}
      <ol className="session-list">
        {sessions.map((session) => (
          <li key={session.sessionId}>
            <button
              type="button"
              className={
                session.sessionId === activeSessionId
                  ? "session-row session-row-active"
                  : "session-row"
              }
              onClick={() => onSelectSession(session.sessionId)}
            >
              <span className="session-title">{session.title}</span>
              <span className="session-time">
                {formatSessionTime(session.updatedAt)}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
