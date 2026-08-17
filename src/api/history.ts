import { requestJson } from "../request/http.js";

export interface ChatSessionDto {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersistedChatMessageDto {
  messageId: string;
  sessionId: string;
  role: "user" | "agent";
  content: string;
  runId?: string;
  runStatus?: "running" | "completed" | "failed" | "stopped";
  createdAt: string;
}

export interface AgentRunDto {
  runId: string;
  sessionId: string;
  userMessageId: string;
  agentMessageId: string | null;
  status: "running" | "completed" | "failed" | "stopped";
  prompt: string;
  model: string;
  startedAt: string;
  endedAt: string | null;
  errorMessage: string | null;
}

export interface StoredRunEventDto {
  eventId: string;
  runId: string;
  sequence: number;
  eventType: string;
  payload: unknown;
  createdAt: string;
}

export interface RunTraceDto {
  run: AgentRunDto;
  events: StoredRunEventDto[];
}

export interface StreamChatBody {
  userId: string;
  sessionId: string;
  message: string;
}

export function createSessionRequest(
  userId: string,
): { path: string; method: "POST" } {
  return {
    path: `/users/${encodeURIComponent(userId)}/sessions`,
    method: "POST",
  };
}

export function deleteSessionRequest(
  userId: string,
  sessionId: string,
): { path: string; method: "DELETE" } {
  return {
    path: `/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}`,
    method: "DELETE",
  };
}

export function toStreamChatBody(body: StreamChatBody): StreamChatBody {
  return body;
}

export function listSessions(userId: string): Promise<ChatSessionDto[]> {
  return requestJson<ChatSessionDto[]>(
    `/users/${encodeURIComponent(userId)}/sessions`,
  );
}

export function createSession(userId: string): Promise<ChatSessionDto> {
  const request = createSessionRequest(userId);
  return requestJson<ChatSessionDto>(request.path, { method: request.method });
}

export async function deleteSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const request = deleteSessionRequest(userId, sessionId);
  await requestJson<void>(request.path, { method: request.method });
}

export function listMessages(
  userId: string,
  sessionId: string,
): Promise<PersistedChatMessageDto[]> {
  return requestJson<PersistedChatMessageDto[]>(
    `/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}/messages`,
  );
}

export function getRunDetail(
  userId: string,
  runId: string,
): Promise<RunTraceDto> {
  return requestJson<RunTraceDto>(
    `/users/${encodeURIComponent(userId)}/runs/${encodeURIComponent(runId)}`,
  );
}
