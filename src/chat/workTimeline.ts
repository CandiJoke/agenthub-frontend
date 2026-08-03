import type { ChatStage, ChatStreamEvent } from "../api/chat";

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
    const timeline = completeRunningItems(message.timeline);
    return {
      ...message,
      timeline: [
        ...timeline,
        {
          id: nextTimelineId("tool", timeline),
          kind: "tool",
          tool: event.tool,
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

function appendStageEvent(
  message: AgentChatMessage,
  stage: ChatStage,
  stageMessage: string,
): AgentChatMessage {
  const status: TimelineStatus = stage === "completed" ? "completed" : "running";
  const timeline = completeRunningItems(message.timeline);
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
): TimelineItem[] {
  let matched = false;
  const updated = [...timeline].reverse().map((item) => {
    if (!matched && item.kind === "tool" && item.tool === tool && item.status === "running") {
      matched = true;
      return {
        ...item,
        output,
        elapsedMs,
        status: "completed" as const,
      };
    }
    return item;
  }).reverse();

  if (matched) return updated;

  return [
    ...completeRunningItems(timeline),
    {
      id: nextTimelineId("tool", timeline),
      kind: "tool",
      tool,
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

  const completed = completeRunningItems(timeline);
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
