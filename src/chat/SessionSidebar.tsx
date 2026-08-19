import { useRef, useState } from "react";

import type { ChatSessionDto } from "../api/history.js";

export interface SessionSidebarProps {
  sessions: ChatSessionDto[];
  activeSessionId?: string;
  loading: boolean;
  actionsDisabled?: boolean;
  deletingSessionId?: string;
  error?: string;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRetry: () => void;
  onClose?: () => void;
}

interface TouchPoint {
  x: number;
  y: number;
  sessionId: string;
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
  actionsDisabled = false,
  deletingSessionId,
  error,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onRetry,
  onClose,
}: SessionSidebarProps) {
  const [openDeleteSessionId, setOpenDeleteSessionId] = useState<string>();
  const touchStartRef = useRef<TouchPoint | undefined>(undefined);
  const ignoreClickSessionIdRef = useRef<string | undefined>(undefined);

  const handleTouchStart = (
    sessionId: string,
    event: React.TouchEvent<HTMLLIElement>,
  ) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, sessionId };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLLIElement>) => {
    const started = touchStartRef.current;
    touchStartRef.current = undefined;
    if (!started) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - started.x;
    const deltaY = touch.clientY - started.y;
    if (Math.abs(deltaX) < 42 || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    ignoreClickSessionIdRef.current = started.sessionId;
    setOpenDeleteSessionId(deltaX < 0 ? started.sessionId : undefined);
  };

  return (
    <aside className="session-sidebar" aria-label="聊天历史">
      <div className="session-sidebar-header">
        <span>聊天记录</span>
        <div className="session-sidebar-actions">
          <button
            type="button"
            className="session-create-button"
            onClick={onCreateSession}
            disabled={actionsDisabled}
          >
            新建
          </button>
          {onClose && (
            <button
              type="button"
              className="session-close-button"
              aria-label="关闭聊天记录"
              data-history-initial-focus=""
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="session-error">
          <span>{error}</span>
          <button type="button" onClick={onRetry} disabled={actionsDisabled}>
            重试
          </button>
        </div>
      )}
      {loading && <div className="session-loading">加载中...</div>}
      <ol className="session-list">
        {sessions.map((session) => (
          <li
            className={
              session.sessionId === openDeleteSessionId
                ? "session-list-item session-list-item-delete-open"
                : "session-list-item"
            }
            key={session.sessionId}
            onTouchStart={(event) => handleTouchStart(session.sessionId, event)}
            onTouchEnd={handleTouchEnd}
          >
            <button
              type="button"
              className={
                session.sessionId === activeSessionId
                  ? "session-row session-row-active"
                  : "session-row"
              }
              disabled={actionsDisabled}
              onClick={() => {
                if (ignoreClickSessionIdRef.current === session.sessionId) {
                  ignoreClickSessionIdRef.current = undefined;
                  return;
                }
                if (openDeleteSessionId === session.sessionId) {
                  setOpenDeleteSessionId(undefined);
                  return;
                }
                onSelectSession(session.sessionId);
              }}
            >
              <span className="session-title">{session.title}</span>
              <span className="session-time">
                {formatSessionTime(session.updatedAt)}
              </span>
            </button>
            <button
              type="button"
              className="session-delete-action"
              disabled={actionsDisabled}
              onClick={(event) => {
                event.stopPropagation();
                setOpenDeleteSessionId(undefined);
                onDeleteSession(session.sessionId);
              }}
            >
              {deletingSessionId === session.sessionId ? "删除中" : "删除"}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}
