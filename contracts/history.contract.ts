import assert from "node:assert/strict";

import { createSessionRequest, toStreamChatBody } from "../src/api/history.js";
import { getOrCreateUserId } from "../src/session/userIdentity.js";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
const firstUserId = getOrCreateUserId(storage);
const secondUserId = getOrCreateUserId(storage);

assert.match(firstUserId, /^anon_user_/);
assert.equal(secondUserId, firstUserId);

assert.deepEqual(createSessionRequest("user-a"), {
  path: "/users/user-a/sessions",
  method: "POST",
});

assert.deepEqual(
  toStreamChatBody({
    userId: "user-a",
    sessionId: "session-a",
    message: "hello",
  }),
  {
    userId: "user-a",
    sessionId: "session-a",
    message: "hello",
  },
);

console.log("history contracts passed");
