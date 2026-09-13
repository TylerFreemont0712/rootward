import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { useEffect, useRef, useState } from "react";

export interface CodeEditorProps {
  value: string;
  language: string;
  label: string;
  readOnly?: boolean;
  onChange: (value: string) => void;
  onCast: () => void;
  onProbe: () => void;
}

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--amber)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--pass)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--warn)" },
  { tag: tags.comment, color: "var(--muted)", fontStyle: "italic" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "var(--teal)" },
  { tag: tags.operator, color: "var(--muted)" },
]);

const crtTheme = EditorView.theme(
  {
    "&": { color: "var(--text)", backgroundColor: "var(--panel-2)", fontSize: "13px", height: "100%" },
    ".cm-scroller": { fontFamily: "var(--font-ui)", lineHeight: "1.5" },
    ".cm-content": { caretColor: "var(--amber)" },
    ".cm-gutters": { backgroundColor: "var(--panel)", color: "var(--muted)", borderRight: "1px solid var(--line-soft)" },
    ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--amber) 6%, transparent)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--amber)" },
    "&.cm-focused .cm-cursor": { borderLeftColor: "var(--amber)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
      backgroundColor: "color-mix(in srgb, var(--amber-dim) 45%, transparent)",
    },
  },
  { dark: true },
);

function languageSupport(language: string): Extension {
  switch (language) {
    case "javascript":
      return javascript();
    case "python":
      return python();
    default:
      return [];
  }
}

/**
 * CodeMirror 6 in React. The editor is created once; later prop changes are pushed in as transactions.
 * LEARN: CodeMirror owns its DOM and document, so React must not re-render inside it. A Compartment is a slot in the
 * editor's configuration that can be swapped at runtime (language, read-only) without recreating the editor.
 */
export function CodeEditor({ value, language, label, readOnly = false, onChange, onCast, onProbe }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const initial = useRef({ value, language, label, readOnly });
  const callbacks = useRef({ onChange, onCast, onProbe });
  const [languageSlot] = useState(() => new Compartment());
  const [readOnlySlot] = useState(() => new Compartment());

  useEffect(() => {
    callbacks.current = { onChange, onCast, onProbe };
  });

  useEffect(() => {
    if (!host.current) return;
    const start = initial.current;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: start.value,
        extensions: [
          // Highest precedence so Ctrl+Enter casts instead of inserting a line.
          Prec.highest(
            keymap.of([
              { key: "Mod-Enter", run: () => (callbacks.current.onCast(), true) },
              { key: "Mod-Shift-Enter", run: () => (callbacks.current.onProbe(), true) },
            ]),
          ),
          basicSetup,
          crtTheme,
          syntaxHighlighting(highlightStyle),
          languageSlot.of(languageSupport(start.language)),
          readOnlySlot.of(EditorState.readOnly.of(start.readOnly)),
          EditorView.contentAttributes.of({ "aria-label": start.label }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      view.destroy();
      editor.current = null;
    };
  }, [languageSlot, readOnlySlot]);

  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  useEffect(() => {
    editor.current?.dispatch({ effects: languageSlot.reconfigure(languageSupport(language)) });
  }, [language, languageSlot]);

  useEffect(() => {
    editor.current?.dispatch({ effects: readOnlySlot.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly, readOnlySlot]);

  return <div className="code-editor" ref={host} />;
}
