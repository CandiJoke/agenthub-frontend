import { API_BASE_URL } from "../config/env.js";

export interface PostSseStreamOptions<TEvent> {
  path: string;
  body: unknown;
  onEvent: (event: TEvent) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function postSseStream<TEvent>({
  path,
  body,
  onEvent,
  onDone,
  onError,
}: PostSseStreamOptions<TEvent>): AbortController {
  const controller = new AbortController();

  fetch(buildUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
              onEvent(JSON.parse(data) as TEvent);
            } catch {
              // Preserve existing behavior: ignore malformed chunks.
            }
          }
        }
      }
      throw new Error("连接提前结束");
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err.message);
      }
    });

  return controller;
}
