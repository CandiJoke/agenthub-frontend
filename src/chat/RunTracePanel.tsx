import type { RunTraceDto } from "../api/history.js";
import { replayRunEvents } from "./historyMapping.js";
import { Timeline } from "./Timeline.js";

interface RunTracePanelProps {
  trace?: RunTraceDto;
  loading: boolean;
  error?: string;
  onClose: () => void;
}

export function RunTracePanel({
  trace,
  loading,
  error,
  onClose,
}: RunTracePanelProps) {
  const replayed = trace
    ? replayRunEvents(trace.run.runId, trace.events, trace.run.status)
    : undefined;

  return (
    <aside className="run-trace-panel" aria-label="执行详情">
      <div className="run-trace-header">
        <span>执行详情</span>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </div>
      {loading && <div className="run-trace-state">加载中...</div>}
      {error && <div className="run-trace-error">{error}</div>}
      {trace && replayed && (
        <div className="run-trace-content">
          <div className={`run-status run-status-${trace.run.status}`}>
            <span>{trace.run.status}</span>
            <span>{trace.run.model}</span>
          </div>
          <Timeline message={replayed} />
        </div>
      )}
    </aside>
  );
}
