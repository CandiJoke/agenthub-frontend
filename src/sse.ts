// SSE 客户端 —— 连接 Agent 后端，实时接收流式事件
const API_BASE = "http://localhost:8001";

export type SSEEvent =
  | { type: "tool_start"; tool: string; input: string }
  | { type: "tool_end"; tool: string; output: string }
  | { type: "text"; content: string };

/**
 * 发起 SSE 流式请求
 * @param message 用户输入
 * @param sessionId 会话 ID（用于多轮对话记忆）
 * @param onEvent 每收到一个事件就回调
 */
export function streamChat(
  message: string,
  sessionId: string,
  onEvent: (event: SSEEvent) => void,
  onDone: () => void,
  onError: (err: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 按 \n\n 分割
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              onDone();
              return;
            }
            try {
              onEvent(JSON.parse(data) as SSEEvent);
            } catch {
              // 忽略解析失败的数据块
            }
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err.message);
      }
    });

  return controller;
}
