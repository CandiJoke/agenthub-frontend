import {
  formatTimelineDetailText,
  summarizeAgentMessage,
  type AgentChatMessage,
  type TimelineItem,
  type TimelineSummaryItem,
} from "./workTimeline.js";

function statusLabel(status: TimelineItem["status"]): string {
  if (status === "running") return "进行中";
  if (status === "failed") return "失败";
  if (status === "stopped") return "已停止";
  return "完成";
}

function timelineTitle(item: TimelineItem): string {
  if (item.kind === "stage") return item.message;
  if (item.kind === "tool") {
    if (item.status === "running") return `调用 ${item.tool}`;
    if (item.status === "failed") return `${item.tool} 调用失败`;
    if (item.status === "stopped") return `${item.tool} 已停止`;
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
        <pre>{formatTimelineDetailText(item.input, "无输入内容")}</pre>
      </div>
      <div className="tool-detail-block">
        <span>Output</span>
        <pre>{formatTimelineDetailText(item.output, "等待工具返回")}</pre>
      </div>
    </details>
  );
}

function SummaryStatus({ item }: { item: TimelineSummaryItem }) {
  return (
    <li className={`summary-item summary-item-${item.status}`}>
      <span className="summary-marker" />
      <span className="summary-label">{item.label}</span>
      <span className="summary-status">{statusLabel(item.status)}</span>
    </li>
  );
}

function ExecutionDetails({ item }: { item: TimelineItem }) {
  return (
    <li className={`detail-item detail-item-${item.status}`}>
      <div className="detail-row">
        <span>{timelineTitle(item)}</span>
        <span>{statusLabel(item.status)}</span>
      </div>
      <TimelineDetails item={item} />
    </li>
  );
}

export function Timeline({ message }: { message: AgentChatMessage }) {
  const summary = summarizeAgentMessage(message);
  const detailOpen = summary.shouldExpandDetails && !summary.shouldCollapseDetails;

  if (summary.primaryItems.length === 0) {
    return (
      <div className="work-summary-empty">
        <span className="pulse-dot" />
        {summary.currentLabel}
      </div>
    );
  }

  return (
    <section className={`work-summary work-summary-${summary.phase}`}>
      <div className="work-current">
        <span
          className={
            summary.phase === "failed"
              ? "error-dot"
              : summary.phase === "completed"
                ? "steady-dot"
                : summary.phase === "stopped"
                  ? "stopped-dot"
                  : "pulse-dot"
          }
        />
        <span>{summary.currentLabel}</span>
      </div>
      {!summary.shouldCollapseDetails && (
        <ol className="summary-list">
          {summary.primaryItems.map((item) => (
            <SummaryStatus item={item} key={item.id} />
          ))}
        </ol>
      )}
      <details className="execution-details" open={detailOpen}>
        <summary>{summary.detailLabel}</summary>
        <ol className="detail-list">
          {summary.detailItems.map((item) => (
            <ExecutionDetails item={item} key={item.id} />
          ))}
        </ol>
      </details>
    </section>
  );
}
