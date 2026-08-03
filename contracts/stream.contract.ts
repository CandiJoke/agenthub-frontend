import assert from "node:assert/strict";

import { postSseStream } from "../src/request/stream.js";

const encoder = new TextEncoder();
const originalFetch = globalThis.fetch;

function createResponse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

async function runStream(chunks: string[]) {
  globalThis.fetch = async () => createResponse(chunks);

  const events: unknown[] = [];
  let doneCalls = 0;
  let errorMessage: string | undefined;

  await new Promise<void>((resolve) => {
    postSseStream({
      path: "/contract",
      body: {},
      onEvent: (event) => events.push(event),
      onDone: () => {
        doneCalls += 1;
        resolve();
      },
      onError: (message) => {
        errorMessage = message;
        resolve();
      },
    });
  });

  return { events, doneCalls, errorMessage };
}

try {
  const prematureEof = await runStream([
    'data: {"type":"text","content":"partial"}\n\n',
  ]);
  assert.deepEqual(prematureEof.events, [{ type: "text", content: "partial" }]);
  assert.equal(prematureEof.doneCalls, 0);
  assert.equal(
    prematureEof.errorMessage,
    "连接提前结束",
    "EOF before [DONE] must report an error",
  );

  const completed = await runStream([
    'data: {"type":"text","content":"complete"}\n\n',
    "data: [DONE]\n\n",
  ]);
  assert.deepEqual(completed.events, [{ type: "text", content: "complete" }]);
  assert.equal(completed.doneCalls, 1);
  assert.equal(completed.errorMessage, undefined);
} finally {
  globalThis.fetch = originalFetch;
}

console.log("stream contracts passed");
