# Editor and terminal integration

## Editor: CodeMirror 6
- Packages: `codemirror` (bundle of basics) or compose `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/search`, `@codemirror/autocomplete`, `@codemirror/lint`; languages `@codemirror/lang-python`, `lang-javascript` (TS via `typescript: true`), `lang-sql`, `lang-rust`, `lang-cpp`, `lang-go` (community), `lang-markdown`, `lang-yaml`; shell via `@codemirror/legacy-modes` (`shell`).
- Theme: `@codemirror/theme-one-dark` as a base or a custom `EditorView.theme` using the game palette; CSS variables for realm tinting.
- Vim: `@replit/codemirror-vim` toggled by a setting.
- Useful extensions to write: banned-token decorations (from constraints), read-only ranges for harness stubs, line count status bar (vs `max_lines`), "cast on Ctrl+Enter / probe on Ctrl+Shift+Enter" keymap, gutter markers for failing test locations when a trace points at a line, ghost text for hints (level 4).
- Multi-file: a `Compartment` per file with a tabs bar; keep a `Map<path, EditorState>`; the server receives the whole file map on Cast.
- Linting: run the project's linters in the sandbox on Probe and show diagnostics via `@codemirror/lint` (deterministic style hints for the Linter's Monocle artifact).
- Accessibility: CodeMirror handles screen readers reasonably; ensure focus management between panes.
- Monaco alternative: only if the user wants IntelliSense; costs 5-10MB and complicates theming. Not recommended.

## Terminal: xterm.js
- Packages: `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links`, optional `@xterm/addon-webgl` for speed, `addon-search`.
- Transport: one WebSocket per terminal session; binary frames for data; JSON control frames for `resize` and `signal`.
- Server side, two options:
  1. `node-pty` spawning `docker exec -it -u player <container> bash -l` (needs native build; prebuilt binaries usually available for Node 22 on Linux). Handles resize via `pty.resize`.
  2. dockerode `container.exec({Cmd, Tty: true, AttachStdin/out/err})` then `exec.start({hijack: true, stdin: true})` and `exec.resize`. No native module. Prefer this to avoid node-pty build issues.
- Session lifecycle: created on entering a terminal room; killed on leaving, on run end, and after an idle timeout; reconnect on WS drop re-attaches to the same exec if still alive.
- Transcript capture: tee the output stream to a bounded buffer for debrief and error tagging (strip ANSI for analysis).
- Snapshots: `docker commit` of the container to a temp image; restore = replace the container (keep the same volume for `/work` if the challenge wants persistence across snapshot restore, else include it).
- Colors/fonts: match the game theme; font from the optional assets or `monospace`.

## Layout and input
- `react-resizable-panels` for the three panes; persist sizes in localStorage.
- Command palette: `cmdk` or a small custom component; every action registered in a command registry with id, title, shortcut, and `when` clause (e.g. only in encounters).
- Global shortcut manager with a single listener and scoped contexts (editor focused vs not).
- Focus rules: entering a room focuses the primary input (editor or terminal); results panel is reachable with a shortcut; the Tutor panel never steals focus.

## Streaming AI into the UI
- WS messages `{type: "ai.delta", role, requestId, text}` and `{type: "ai.done"}`; render with a markdown renderer that supports code blocks and links to Library nodes (`[node.id]` syntax).
