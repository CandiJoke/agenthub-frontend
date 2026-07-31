import { streamChat, type ChatStreamEvent } from "./chat";
import { API_BASE_URL } from "../config/env";

const event: ChatStreamEvent = { type: "text", content: "hello" };

const controller = streamChat({
  message: "hello",
  sessionId: "session_contract",
  onEvent: (streamEvent) => {
    const eventType: ChatStreamEvent["type"] = streamEvent.type;
    void eventType;
  },
  onDone: () => {},
  onError: (errorMessage) => {
    const message: string = errorMessage;
    void message;
  },
});

controller.abort();

void event;
void API_BASE_URL;
