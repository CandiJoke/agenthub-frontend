# Chat Stream API Request Split Design

## Goal

Split the current `chat/stream` frontend integration into separate `config`, `request`, and `api` layers so backend API details are maintained outside React views.

## Scope

- Move environment configuration into `src/config/env.ts`.
- Move generic SSE POST streaming logic into `src/request/stream.ts`.
- Move chat-specific endpoint and payload mapping into `src/api/chat.ts`.
- Update `src/App.tsx` to call only the chat API layer.
- Add `.env.example` with `VITE_API_BASE_URL=http://localhost:8001`.

## Architecture

`src/config/env.ts` owns `VITE_API_BASE_URL` and defaults to `http://localhost:8001`. It normalizes the API base URL by removing trailing slashes.

`src/request/stream.ts` owns generic streaming transport. It accepts a path, JSON body, and callbacks, then performs `fetch`, parses SSE `data:` chunks, handles `[DONE]`, and returns an `AbortController`.

`src/api/chat.ts` owns the chat business API. It exports `streamChat` and `ChatStreamEvent`, maps `sessionId` to backend `session_id`, and calls `/chat/stream` through the request layer.

`src/App.tsx` remains a UI component. It imports `streamChat` from `src/api/chat` and imports the normalized API base URL only for display.

## Data Flow

1. User sends text from `App.tsx`.
2. `App.tsx` calls `streamChat({ message, sessionId }, callbacks)`.
3. `src/api/chat.ts` posts `{ message, session_id }` to `/chat/stream`.
4. `src/request/stream.ts` streams SSE events back into the UI callbacks.

## Error Handling

The request layer reports non-OK HTTP responses, missing response bodies, fetch failures, and non-abort errors through `onError`. Invalid SSE JSON chunks are ignored to preserve the current behavior.

## Testing

This refactor should be verified with:

- TypeScript build.
- Oxlint.
- Vite production build.

No separate test runner exists in the current project, so type checking and build verification are the practical automated checks for this change.
