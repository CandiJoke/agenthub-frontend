import type { ChatStage, ChatStreamEvent } from "../api/chat.js";

export type TimelineStatus = "running" | "completed" | "failed";

export type TimelineItem =
  | {
      id: string;
      kind: "stage";
      stage: ChatStage;
      message: string;
      status: TimelineStatus;
    }
  | {
      id: string;
      kind: "tool";
      tool: string;
      runId?: string;
      input: string;
      output?: string;
      elapsedMs?: number;
      status: TimelineStatus;
    }
  | {
      id: string;
      kind: "answer";
      message: string;
      status: TimelineStatus;
    }
  | {
      id: string;
      kind: "error";
      message: string;
      status: "failed";
    };

export type TimelinePhase =
  | "received"
  | "thinking"
  | "tooling"
  | "answering"
  | "completed"
  | "failed";

export interface TimelineSummaryItem {
  id: string;
  label: string;
  status: TimelineStatus;
}

export interface TimelineSummary {
  currentLabel: string;
  phase: TimelinePhase;
  toolCount: number;
  stageCount: number;
  elapsedMs?: number;
  primaryItems: TimelineSummaryItem[];
  detailItems: TimelineItem[];
  detailLabel: string;
  shouldCollapseDetails: boolean;
  shouldExpandDetails: boolean;
}

export interface UserChatMessage {
  id: string;
  role: "user";
  content: string;
}

export interface AgentChatMessage {
  id: string;
  role: "agent";
  content: string;
  timeline: TimelineItem[];
  currentStatus: string;
  loading: boolean;
  error?: string;
}

export type ChatMessage = UserChatMessage | AgentChatMessage;

export function createUserMessage(id: string, content: string): UserChatMessage {
  return {
    id,
    role: "user",
    content,
  };
}

export function createPendingAgentMessage(id: string): AgentChatMessage {
  return {
    id,
    role: "agent",
    content: "",
    timeline: [],
    currentStatus: "准备连接 Agent",
    loading: true,
  };
}

export function appendChatStreamEvent(
  message: AgentChatMessage,
  event: ChatStreamEvent,
): AgentChatMessage {
  if (event.type === "stage") {
    return appendStageEvent(message, event.stage, event.message);
  }

  if (event.type === "tool_start") {
    return {
      ...message,
      timeline: [
        ...message.timeline,
        {
          id: nextTimelineId("tool", message.timeline),
          kind: "tool",
          tool: event.tool,
          runId: event.run_id,
          input: event.input,
          status: "running",
        },
      ],
      currentStatus: `正在调用 ${event.tool}`,
    };
  }

  if (event.type === "tool_end") {
    const timeline = completeLatestTool(
      message.timeline,
      event.tool,
      event.output,
      event.elapsed_ms,
      event.run_id,
    );
    return {
      ...message,
      timeline,
      currentStatus: `${event.tool} 已返回结果`,
    };
  }

  if (event.type === "text") {
    const timeline = ensureAnswerItem(message.timeline);
    return {
      ...message,
      content: `${message.content}${event.content}`,
      timeline,
      currentStatus: "正在生成回答",
    };
  }

  return {
    ...message,
    timeline: [
      ...completeRunningItems(message.timeline, "failed"),
      {
        id: nextTimelineId("error", message.timeline),
        kind: "error",
        message: event.message,
        status: "failed",
      },
    ],
    currentStatus: "请求失败",
    loading: false,
    error: event.message,
  };
}

export function finishAgentMessage(message: AgentChatMessage): AgentChatMessage {
  if (message.error) {
    return {
      ...message,
      loading: false,
    };
  }

  return {
    ...message,
    timeline: completeRunningItems(message.timeline),
    currentStatus: "完成",
    loading: false,
  };
}

export function summarizeAgentMessage(message: AgentChatMessage): TimelineSummary {
  const tools = message.timeline.filter((item) => item.kind === "tool");
  const stages = message.timeline.filter((item) => item.kind === "stage");
  const elapsedMs = tools.reduce<number | undefined>((total, item) => {
    if (item.elapsedMs === undefined) return total;
    return (total ?? 0) + item.elapsedMs;
  }, undefined);
  const phase = resolveSummaryPhase(message);
  const primaryItems = buildSummaryItems(message.timeline, phase);
  const shouldExpandDetails = phase === "failed";
  const shouldCollapseDetails = phase === "completed";

  return {
    currentLabel: resolveSummaryLabel(message, phase),
    phase,
    toolCount: tools.length,
    stageCount: stages.length,
    elapsedMs,
    primaryItems,
    detailItems: message.timeline,
    detailLabel: buildDetailLabel(stages.length, tools.length, elapsedMs),
    shouldCollapseDetails,
    shouldExpandDetails,
  };
}

function appendStageEvent(
  message: AgentChatMessage,
  stage: ChatStage,
  stageMessage: string,
): AgentChatMessage {
  const status: TimelineStatus = stage === "completed" ? "completed" : "running";
  const timeline = stage === "completed"
    ? completeRunningItems(message.timeline)
    : completeRunningNonToolItems(message.timeline);
  return {
    ...message,
    timeline: [
      ...timeline,
      {
        id: nextTimelineId("stage", timeline),
        kind: "stage",
        stage,
        message: stageMessage,
        status,
      },
    ],
    currentStatus: stageMessage,
    loading: stage !== "completed",
  };
}

function completeRunningNonToolItems(timeline: TimelineItem[]): TimelineItem[] {
  return timeline.map((item) => {
    if (item.kind === "tool" || item.status !== "running") return item;
    return { ...item, status: "completed" };
  });
}

function completeRunningItems(
  timeline: TimelineItem[],
  status: TimelineStatus = "completed",
): TimelineItem[] {
  return timeline.map((item) => {
    if (item.status !== "running") return item;
    return { ...item, status };
  });
}

function completeLatestTool(
  timeline: TimelineItem[],
  tool: string,
  output: string,
  elapsedMs?: number,
  runId?: string,
): TimelineItem[] {
  let matchIndex = -1;

  if (runId !== undefined) {
    for (let index = timeline.length - 1; index >= 0; index -= 1) {
      const item = timeline[index];
      if (item.kind === "tool" && item.runId === runId && item.status === "running") {
        matchIndex = index;
        break;
      }
    }
  }

  if (runId === undefined && matchIndex === -1) {
    for (let index = timeline.length - 1; index >= 0; index -= 1) {
      const item = timeline[index];
      if (item.kind === "tool" && item.tool === tool && item.status === "running") {
        matchIndex = index;
        break;
      }
    }
  }

  if (matchIndex !== -1) {
    return timeline.map((item, index) => {
      if (index !== matchIndex || item.kind !== "tool") return item;
      return {
        ...item,
        output,
        elapsedMs,
        status: "completed",
      };
    });
  }

  return [
    ...timeline,
    {
      id: nextTimelineId("tool", timeline),
      kind: "tool",
      tool,
      runId,
      input: "",
      output,
      elapsedMs,
      status: "completed",
    },
  ];
}

function ensureAnswerItem(timeline: TimelineItem[]): TimelineItem[] {
  if (timeline.some((item) => item.kind === "answer")) {
    return timeline;
  }

  const completed = completeRunningNonToolItems(timeline);
  return [
    ...completed,
    {
      id: nextTimelineId("answer", completed),
      kind: "answer",
      message: "最终回答开始输出",
      status: "running",
    },
  ];
}

function nextTimelineId(prefix: string, timeline: TimelineItem[]): string {
  return `${prefix}-${timeline.length + 1}`;
}

function resolveSummaryPhase(message: AgentChatMessage): TimelinePhase {
  if (message.error) return "failed";
  if (!message.loading) return "completed";
  if (message.timeline.some((item) => item.kind === "answer")) return "answering";
  if (message.timeline.some((item) => item.kind === "tool")) return "tooling";

  const latestStage = [...message.timeline]
    .reverse()
    .find((item) => item.kind === "stage");
  if (!latestStage || latestStage.kind !== "stage") return "received";
  if (latestStage.stage === "received") return "received";
  return "thinking";
}

function resolveSummaryLabel(
  message: AgentChatMessage,
  phase: TimelinePhase,
): string {
  if (phase === "failed") return "请求失败";
  if (phase === "completed") return "回答完成";
  if (phase === "answering") return "已拿到结果，正在整理回答";

  const runningTool = [...message.timeline]
    .reverse()
    .find((item) => item.kind === "tool" && item.status === "running");
  if (runningTool && runningTool.kind === "tool") return `正在使用 ${runningTool.tool}`;

  if (phase === "tooling") return "工具结果已返回";
  if (phase === "thinking") return "正在判断下一步";
  return "已收到问题";
}

function buildSummaryItems(
  timeline: TimelineItem[],
  phase: TimelinePhase,
): TimelineSummaryItem[] {
  const items: TimelineSummaryItem[] = [];
  if (timeline.some((item) => item.kind === "stage")) {
    items.push({
      id: "summary-understanding",
      label: "理解问题",
      status: phase === "failed" ? "failed" : "completed",
    });
  }

  for (const item of timeline) {
    if (item.kind !== "tool") continue;
    items.push({
      id: `summary-${item.id}`,
      label: summarizeToolItem(item),
      status: item.status,
    });
  }

  if (timeline.some((item) => item.kind === "answer")) {
    items.push({
      id: "summary-answer",
      label: "整理回答",
      status: resolveAnswerSummaryStatus(phase),
    });
  }

  return items;
}

function resolveAnswerSummaryStatus(phase: TimelinePhase): TimelineStatus {
  if (phase === "failed") return "failed";
  if (phase === "answering") return "running";
  return "completed";
}

function summarizeToolItem(item: Extract<TimelineItem, { kind: "tool" }>): string {
  if (item.status === "running") return `正在使用 ${item.tool}`;
  if (item.status === "failed") return `${item.tool} 调用失败`;
  const elapsed = item.elapsedMs === undefined ? "" : ` · ${item.elapsedMs} ms`;
  return `${item.tool} 已返回结果${elapsed}`;
}

function buildDetailLabel(
  stageCount: number,
  toolCount: number,
  elapsedMs?: number,
): string {
  const elapsed = elapsedMs === undefined ? "" : ` · ${elapsedMs} ms`;
  return `查看执行详情 · ${stageCount} 个阶段 · ${toolCount} 个工具${elapsed}`;
}
