import type { ConversationView } from "@rootward/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { assetUrl } from "../assets/AssetRegistry.ts";

const CHARS_PER_TICK = 2;
const TICK_MS = 16;
/** Typed-out text snaps to fully shown with this, and starts that way for players who asked for less motion. */
const ALL = Number.MAX_SAFE_INTEGER;

const prefersLessMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface DialogueBoxProps {
  conversation: ConversationView;
  busy: boolean;
  onChoose: (index: number) => void;
  onClose: () => void;
}

/**
 * The conversation panel: portrait, name plate, and a line typed out page by page (blank lines split pages), then the
 * choices. The parent keys it on the line, so every new line starts on its first page. E, Enter, or Space finish the
 * typing, turn the page, or close a line with no choices; 1-9 or the arrows pick a choice; Escape walks away.
 */
export function DialogueBox({ conversation, busy, onChoose, onClose }: DialogueBoxProps) {
  const pages = useMemo(() => conversation.text.split(/\n\s*\n/), [conversation.text]);
  const [page, setPage] = useState(0);
  const [typed, setTyped] = useState(() => (prefersLessMotion() ? ALL : 0));
  const [selected, setSelected] = useState(0);
  const text = pages[page] ?? "";
  const pageDone = typed >= text.length;
  const lastPage = page >= pages.length - 1;
  const { choices } = conversation;
  const choosing = lastPage && pageDone && choices.length > 0;

  useEffect(() => {
    if (pageDone) return;
    const timer = window.setInterval(() => {
      setTyped((count) => count + CHARS_PER_TICK);
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [pageDone]);

  const advance = useCallback(() => {
    if (!pageDone) setTyped(ALL);
    else if (!lastPage) {
      setPage((current) => current + 1);
      setTyped(prefersLessMotion() ? ALL : 0);
    } else if (choices.length === 0) onClose();
  }, [pageDone, lastPage, choices.length, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const confirm = key === "Enter" || key === " " || key === "e";
      if (key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (busy) return;
      if (!choosing) {
        if (confirm) {
          event.preventDefault();
          if (!event.repeat) advance();
        }
        return;
      }
      const digit = Number.parseInt(key, 10);
      const picked = Number.isInteger(digit) ? choices[digit - 1] : undefined;
      if (picked) {
        event.preventDefault();
        onChoose(picked.index);
      } else if (key === "ArrowDown" || key === "s" || key === "j") {
        event.preventDefault();
        setSelected((current) => (current + 1) % choices.length);
      } else if (key === "ArrowUp" || key === "w" || key === "k") {
        event.preventDefault();
        setSelected((current) => (current - 1 + choices.length) % choices.length);
      } else if (confirm && !event.repeat) {
        event.preventDefault();
        const choice = choices[selected];
        if (choice) onChoose(choice.index);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [advance, busy, choices, choosing, onChoose, onClose, selected]);

  const portrait = conversation.portrait !== undefined ? assetUrl("portraits", conversation.portrait) : undefined;
  // Teal is reserved for Lint and the Machine talking back (tokens.css).
  const familiar = conversation.portrait === "lint";

  return (
    <section className={familiar ? "dialogue familiar" : "dialogue"} role="dialog" aria-label={`${conversation.speakerName} speaks`}>
      <div className="dialogue-portrait">
        {portrait ? (
          <img src={portrait} alt="" draggable={false} />
        ) : (
          <span aria-hidden="true">{conversation.speakerName.slice(0, 1)}</span>
        )}
      </div>
      <div className="dialogue-body">
        <div className="dialogue-name">
          {conversation.speakerName}
          {conversation.speakerTitle !== undefined && <small>{conversation.speakerTitle}</small>}
        </div>
        <p className="dialogue-text" onClick={advance}>
          <span aria-hidden="true">{text.slice(0, typed)}</span>
          <span className="dialogue-rest" aria-hidden="true">
            {text.slice(typed)}
          </span>
          <span className="sr-only">{text}</span>
        </p>
        {choosing ? (
          <ol className="dialogue-choices">
            {choices.map((choice, position) => (
              <li key={choice.index}>
                <button
                  type="button"
                  className={position === selected ? "selected" : undefined}
                  disabled={busy}
                  onMouseEnter={() => {
                    setSelected(position);
                  }}
                  onClick={() => {
                    onChoose(choice.index);
                  }}
                >
                  <kbd>{position + 1}</kbd>
                  {choice.text}
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <button type="button" className="dialogue-more" onClick={advance}>
            {!pageDone ? "…" : lastPage ? "close" : "more"} <kbd>E</kbd>
          </button>
        )}
      </div>
    </section>
  );
}
