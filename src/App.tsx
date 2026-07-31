import { useState, useRef, useEffect } from "react";
import { streamChat, type ChatStreamEvent } from "./api/chat";
import { API_BASE_URL } from "./config/env";

interface Step {
  id: number;
  type: "tool_start" | "tool_end";
  tool: string;
  content: string;
}

export default function App() {
  const [input, setInput] = useState("");
  const [replies, setReplies] = useState<{ role: "user" | "agent"; content: string; steps: Step[] }[]>([]);
  const [loading, setLoading] = useState(false);
  const [toolStatus, setToolStatus] = useState(""); // 底部状态栏
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef("session_" + Date.now()).current;

  // 自动滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setLoading(true);
    setToolStatus("");

    // 添加用户消息
    const userMsg = { role: "user" as const, content: text, steps: [] };
    const steps: Step[] = [];
    let agentContent = "";

    setReplies((prev) => [...prev, userMsg]);

    streamChat({
      message: text,
      sessionId,
      onEvent: (event: ChatStreamEvent) => {
        if (event.type === "tool_start") {
          steps.push({ id: Date.now(), type: "tool_start", tool: event.tool, content: event.input });
          setToolStatus(`🔧 调用 ${event.tool}...`);
          // 更新当前 agent 消息的步骤
          setReplies((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "agent") {
              last.steps = [...steps];
            }
            return updated;
          });
        } else if (event.type === "tool_end") {
          steps.push({ id: Date.now(), type: "tool_end", tool: event.tool, content: event.output });
          setToolStatus("");
          setReplies((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "agent") {
              last.steps = [...steps];
            }
            return updated;
          });
        } else if (event.type === "text") {
          agentContent += event.content;
          setReplies((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === "agent") {
              return [...updated.slice(0, -1), { ...last, content: agentContent, steps: [...steps] }];
            } else {
              return [...updated, { role: "agent", content: agentContent, steps: [...steps] }];
            }
          });
        }
      },
      onDone: () => {
        setLoading(false);
        setToolStatus("");
      },
      onError: (err) => {
        setLoading(false);
        setToolStatus("");
        setReplies((prev) => [
          ...prev,
          { role: "agent", content: `❌ 出错了：${err}`, steps: [] },
        ]);
      },
    });

    // 先插入空的 agent 占位
    setReplies((prev) => [...prev, { role: "agent", content: "", steps: [] }]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ maxWidth: 780, margin: "0 auto", padding: "20px", fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ textAlign: "center", marginBottom: 24 }}>🤖 Agent Hub</h1>

      {/* 对话区 */}
      <div style={{
        border: "1px solid #e0e0e0",
        borderRadius: 12,
        padding: "16px 20px",
        minHeight: 400,
        maxHeight: "60vh",
        overflowY: "auto",
        background: "#fafafa",
        marginBottom: 16,
      }}>
        {replies.length === 0 && (
          <div style={{ textAlign: "center", color: "#999", paddingTop: 120 }}>
            💡 试试问：帮我算 123*456、什么是 LangChain？
          </div>
        )}
        {replies.map((msg, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            {/* 用户消息 */}
            {msg.role === "user" && (
              <div style={{ textAlign: "right" }}>
                <span style={{
                  display: "inline-block",
                  background: "#1677ff",
                  color: "#fff",
                  padding: "8px 14px",
                  borderRadius: 14,
                  maxWidth: "80%",
                  textAlign: "left",
                }}>
                  {msg.content}
                </span>
              </div>
            )}

            {/* Agent 消息 */}
            {msg.role === "agent" && (
              <div>
                {/* 工具调用步骤 */}
                {msg.steps.map((step) => (
                  <div key={step.id} style={{
                    fontSize: 12,
                    color: "#666",
                    background: "#fff",
                    border: "1px solid #e8e8e8",
                    borderRadius: 8,
                    padding: "6px 12px",
                    marginBottom: 6,
                  }}>
                    {step.type === "tool_start" ? (
                      <span>🔧 <b>{step.tool}</b> ← <code style={{ fontSize: 11 }}>{step.content}</code></span>
                    ) : (
                      <span>📋 <b>{step.tool}</b> → {step.content.slice(0, 120)}</span>
                    )}
                  </div>
                ))}

                {/* 回答内容，支持换行 */}
                <div style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                }}>
                  {msg.content || (loading && i === replies.length - 1 && !msg.steps.length ? "思考中..." : "")}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 状态栏 */}
      {toolStatus && (
        <div style={{
          fontSize: 12,
          color: "#1677ff",
          marginBottom: 8,
          padding: "4px 0",
        }}>
          {toolStatus}
        </div>
      )}

      {/* 输入区 */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入问题，Enter 发送..."
          disabled={loading}
          style={{
            flex: 1,
            padding: "10px 14px",
            fontSize: 15,
            border: "1px solid #d9d9d9",
            borderRadius: 8,
            outline: "none",
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            padding: "10px 24px",
            fontSize: 15,
            background: loading ? "#91caff" : "#1677ff",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "⏳" : "发送"}
        </button>
      </div>

      <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "#bbb" }}>
        后端: {API_BASE_URL} | 会话: {sessionId.slice(-8)}
      </div>
    </div>
  );
}
