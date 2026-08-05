export interface ThinkingMessageProps {
  label?: string;
}

export function ThinkingMessage({ label = "正在思考" }: ThinkingMessageProps) {
  return (
    <div className="thinking-message" role="status" aria-live="polite">
      <span>{label}</span>
      <span className="thinking-dots" aria-hidden="true">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
    </div>
  );
}
