export const CHAT_MIN_WIDTH = 600;
export const CHAT_DEFAULT_WIDTH = 860;
export const RIGHT_RAIL_MIN_WIDTH = 300;
export const RIGHT_RAIL_DEFAULT_WIDTH = 420;
export const APP_SHELL_GAP = 16;

export interface ChatWidthBounds {
  min: number;
  max: number;
}

export function getChatWidthBounds(availableWidth: number): ChatWidthBounds {
  return {
    min: CHAT_MIN_WIDTH,
    max: Math.max(
      CHAT_MIN_WIDTH,
      availableWidth - RIGHT_RAIL_MIN_WIDTH - APP_SHELL_GAP,
    ),
  };
}

export function getDefaultChatWidth(availableWidth: number): number {
  return clampChatWidth(
    availableWidth - RIGHT_RAIL_DEFAULT_WIDTH - APP_SHELL_GAP,
    availableWidth,
  );
}

export function clampChatWidth(width: number, availableWidth: number): number {
  const bounds = getChatWidthBounds(availableWidth);
  return Math.min(Math.max(width, bounds.min), bounds.max);
}
