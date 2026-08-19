import { useEffect, useRef } from "react";

import {
  SessionSidebar,
  type SessionSidebarProps,
} from "./SessionSidebar.js";

interface SessionHistoryDialogProps extends SessionSidebarProps {
  open: boolean;
  onClose: () => void;
}

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => element.offsetParent !== null);
}

export function SessionHistoryDialog({
  open,
  onClose,
  ...sidebarProps
}: SessionHistoryDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const previousFocusedElementRef = useRef<HTMLElement | undefined>(undefined);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    previousFocusedElementRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : undefined;

    const initialFocus =
      dialogRef.current?.querySelector<HTMLElement>("[data-history-initial-focus]") ??
      dialogRef.current?.querySelector<HTMLElement>(focusableSelector);
    initialFocus?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }

      if (event.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusableElements = getFocusableElements(dialog);
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        if (!firstElement || !lastElement) {
          event.preventDefault();
          dialog.focus();
          return;
        }

        if (!dialog.contains(document.activeElement)) {
          event.preventDefault();
          if (event.shiftKey) lastElement.focus();
          else firstElement.focus();
          return;
        }

        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
          return;
        }

        if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusedElementRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="session-history-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={dialogRef}
        className="session-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="聊天记录"
        tabIndex={-1}
      >
        <SessionSidebar {...sidebarProps} onClose={onClose} />
      </div>
    </div>
  );
}
