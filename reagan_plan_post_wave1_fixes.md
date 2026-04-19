# Post-wave1 bug triage + fix plan

## Bugs confirmed

1. **Star click doesn't open BookmarkDialog** — tracer (a50eb288c8e518b01) found the cause: the modal scrim in `BookmarkDialog.tsx` uses `onMouseDown` for click-outside. React 18 flushes the `setBookmarkDialogOpen(true)` synchronously inside the star's click handler, so the scrim mounts mid-click, then the same interaction's mouseup/click bubbles up and the scrim's `e.target===e.currentTarget` check fires `onClose()`. Net: open-then-immediately-close in one frame. The "bar darkens briefly" symptom confirms it mounts.
2. **Bookmarks bar renders empty** — WindowChrome.tsx:384 renders `<BookmarksBar />` whenever `barVisible && bookmarksTree`. It doesn't check if there are any children. Default visibility is `'always'`, so fresh install → bar shows with zero bookmarks.
3. **Cmd+K does nothing** — tracer (ac7a3a042149b3b5e) found it: `hotkeys.ts` is a no-op (correctly per memory note). The only Cmd+K path is the app menu accelerator. On macOS with a WebContentsView focused, Chromium's renderer can intercept Cmd+K before NSMenu sees it. Fix: add a `before-input-event` listener on each WebContentsView webContents that forwards Cmd+K to `togglePill()`.
4. **Favicons not rendering on tabs** — needs investigation. `page-favicon-updated` listener is attached in TabManager, state carried on `(view as any)._favicon`, rendered in TabStrip.
5. **URL bar not auto-focused on new tab** — should work from earlier commit (`TabManager.createTab` sends `focus-url-bar` IPC when `url===undefined`). Regression possibly.
6. **No custom new-tab page** — currently a dark `data:` URL stub. Chrome has `chrome://newtab` with search + shortcuts.
7. **History dropdown in toolbar** — the RecentlyClosedDropdown button in the toolbar is NOT Chrome-parity. Chrome hides this; the History menu in the menubar is enough. Remove the toolbar button.
8. **No Taskfile.yml** — user asked. npm scripts exist (`start:fresh`, `start:onboarding`, `start:reset-onboarding`) but no single-entry Taskfile. Add one.

## Plan

Two parallel subagents + me on trivia.

### Subagent A — shell renderer bugs (1 branch: `fix/post-wave1-shell`)
Scope: bookmarks star race, bookmarks bar empty, remove toolbar history dropdown, new-tab URL bar focus, favicon check, new-tab page.
Does NOT touch `main/` process. Multi-commit.

### Subagent B — Cmd+K main-process fix (1 branch: `fix/post-wave1-cmdk`)
Scope: `main/pill.ts` and `main/tabs/TabManager.ts`. Attach `before-input-event` to every webContents, forward Cmd+K to `togglePill()`. Also delete the stale "Cmd+K is still a globalShortcut" comment in `main/index.ts` registerKeyboardShortcuts.
Does NOT touch renderer.

### Me — Taskfile.yml + dev docs
- `Taskfile.yml` at repo root with `task start`, `task start:fresh`, `task start:onboarding`, `task reset:onboarding`, `task lint`, `task typecheck`, `task test`, `task qa`.
- Update README or create `my-app/docs/DEV.md` listing the commands.

## Verification gate (after both subagents merge)

- `npm run start:fresh` — launch, Cmd+K opens pill, new tab auto-focuses URL bar, no empty bookmarks bar.
- Click star, dialog opens and stays open.
- Close dialog with ESC, scrim disappears.
- Navigate to http site, favicon appears in tab.
- `task start` works.

All three run in parallel — they don't touch overlapping files.
