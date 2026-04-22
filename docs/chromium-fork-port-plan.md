# Chromium Fork Port Plan

Status:
- Fork created: `https://github.com/Cheggin/chromium`
- Upstream source: `https://github.com/chromium/chromium`
- Chromium explicitly says not to use `git clone` for local checkout; use `depot_tools` + `fetch chromium` instead (`README.md`, `docs/get_the_code.md`).

This document is the dense migration plan for moving this browser from the current Electron app into a Chromium fork without blindly rebuilding the entire product from scratch.

## Executive stance

Do not treat this as "port the Electron app into Chromium."

Treat it as:
1. Preserve product behavior, workflows, and data contracts.
2. Rebuild browser-native surfaces in Chromium where Electron is currently faking them.
3. Keep the current repo as the spec/reference implementation until Chromium reaches feature parity on the flows that matter.

The current repo should become:
- product-spec reference
- behavior oracle
- UX acceptance reference
- temporary shipping branch only for critical fixes

The Chromium fork should become:
- native browser shell
- browser process integration layer
- long-term performance and platform foundation

## Upstream evidence and target Chromium surfaces

Relevant Chromium directories confirmed from the fork/upstream mirror:

- Native browser UI / Views:
  - `chrome/browser/ui`
  - `chrome/browser/ui/views`
  - `chrome/browser/ui/views/frame`
  - `chrome/browser/ui/views/location_bar`
  - `chrome/browser/ui/views/download`
  - `chrome/browser/ui/views/find_bar`
  - `chrome/browser/ui/views/extensions`
  - `chrome/browser/ui/views/importer`

- WebUI / internal pages:
  - `chrome/browser/resources/settings`
  - `chrome/browser/resources/history`
  - `chrome/browser/resources/downloads`
  - `chrome/browser/resources/bookmarks`
  - `chrome/browser/resources/extensions`
  - `chrome/browser/resources/print_preview`
  - `chrome/browser/resources/new_tab_page*`
  - `chrome/browser/resources/intro`
  - `chrome/browser/resources/profile_internals`
  - `chrome/browser/resources/tab_search`
  - `chrome/browser/resources/side_panel`

- Profiles:
  - `chrome/browser/profiles`

- Extensions:
  - `chrome/browser/extensions`

- Importer:
  - `chrome/browser/importer`

This means the migration naturally splits into:
- `Views` for browser chrome and browser-native controls
- `WebUI` for settings/history/downloads/extensions/onboarding-like pages
- browser-process services for profiles, navigation, permissions, importer, extensions, downloads

## Do this first: bootstrap the local Chromium workspace correctly

Do not clone the GitHub mirror directly.

### Recommended workspace bootstrap

```bash
mkdir -p ~/src
cd ~/src
git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git
export PATH="$HOME/src/depot_tools:$PATH"
fetch --nohooks chromium
cd chromium/src
git remote add cheggin https://github.com/Cheggin/chromium.git
git fetch cheggin
git checkout -b cheggin-main cheggin/main
gclient sync
```

### First build target

Use a light development target first:

```bash
gn gen out/Companion --args='is_debug=true is_component_build=true symbol_level=1'
autoninja -C out/Companion chrome
```

Do not start by modifying GN args aggressively. First goal is a reproducible local build and launch.

## Migration doctrine

### Rule 1: port behavior, not implementation

The Electron codebase is mostly TypeScript + React + preload IPC + `BrowserWindow` glue. Chromium is not.

What ports:
- product behavior
- acceptance criteria
- data models
- state semantics
- ranking/matching/import heuristics
- copy, strings, flow order

What does not port directly:
- preload bridges
- `BrowserWindow` orchestration
- Electron IPC handlers
- most shell React components as code
- Electron-specific downloads/permissions/session plumbing

### Rule 2: freeze Electron to spec mode

Once Chromium port work begins:
- only fix severe bugs in Electron
- do not build new Electron-only shell behavior
- do not deepen preload/main-process coupling
- any new product behavior must be written as a portable spec first

### Rule 3: build the Chromium fork in vertical slices

Do not port by subsystem alone. Port by user flow:
- startup
- profile selection
- first run
- browse
- search
- tab management
- settings
- history
- downloads
- extensions
- import

Each slice should end in a runnable user-visible milestone.

## Current repo classification

The current repo is not all throwaway. It splits into four buckets.

### A. Portable core logic worth preserving

These modules contain product/data logic that can be translated into Chromium services rather than discarded.

- Profile/account/state
  - `my-app/src/main/profiles/ProfileStore.ts`
  - `my-app/src/main/profiles/ProfileContext.ts`
  - `my-app/src/main/identity/AccountStore.ts`
  - `my-app/src/main/identity/SignOutController.ts`
  - `my-app/src/main/privacy/ClearDataController.ts`

- Search/omnibox data and ranking logic
  - `my-app/src/main/search/SearchEngineStore.ts`
  - `my-app/src/main/omnibox/providers.ts`
  - `my-app/src/main/omnibox/ShortcutsStore.ts`

- Data stores
  - `my-app/src/main/bookmarks/BookmarkStore.ts`
  - `my-app/src/main/history/HistoryStore.ts`
  - `my-app/src/main/autofill/AutofillStore.ts`
  - `my-app/src/main/devices/DeviceStore.ts`
  - `my-app/src/main/permissions/PermissionStore.ts`
  - `my-app/src/main/permissions/ProtocolHandlerStore.ts`
  - `my-app/src/main/ntp/NtpCustomizationStore.ts`
  - `my-app/src/main/tabs/SessionStore.ts`
  - `my-app/src/main/tabs/TabGroupStore.ts`
  - `my-app/src/main/tabs/MutedSitesStore.ts`
  - `my-app/src/main/tabs/ZoomStore.ts`

- Import and migration logic/specs
  - `my-app/src/main/chrome-import/ChromeProfileReader.ts`
  - `my-app/src/main/chrome-import/ChromeCookieImporter.ts`
  - `my-app/src/main/chrome-import/ChromeBookmarkImporter.ts`

- Policy / business logic
  - `my-app/src/main/content-categories/ContentPolicyEnforcer.ts`
  - `my-app/src/main/content-categories/ContentCategoryStore.ts`
  - `my-app/src/main/permissions/PermissionAutoRevoker.ts`

- Shared schemas
  - `my-app/src/shared/types.ts`
  - `my-app/src/shared/printTypes.ts`

Porting note:
- These should become Chromium-side keyed services, pref-backed services, or browser-process logic.
- Do not port them line-for-line blindly; port their semantics and tests.

### B. Chromium WebUI rewrite targets

These are user-facing pages that should become WebUI, not native Views.

- Onboarding / first-run / profile selection
  - `my-app/src/renderer/onboarding/*`
  - `my-app/src/renderer/profile-picker/*`

- Settings
  - `my-app/src/renderer/settings/*`
  - `my-app/src/preload/settings.ts` only as behavior reference, not code to keep

- History / journeys
  - `my-app/src/renderer/history/*`

- Downloads page
  - `my-app/src/renderer/downloads/*`

- Bookmarks manager
  - `my-app/src/renderer/bookmarks/*`

- Extensions page
  - `my-app/src/renderer/extensions/*`

- Internal pages / chrome pages
  - `my-app/src/renderer/chrome/*`

- Print preview
  - `my-app/src/renderer/print-preview/*`

- New tab page
  - `my-app/src/renderer/newtab/*`

Recommended Chromium homes:
- `chrome/browser/resources/intro` or a new product-specific first-run WebUI
- `chrome/browser/resources/settings`
- `chrome/browser/resources/history`
- `chrome/browser/resources/downloads`
- `chrome/browser/resources/bookmarks`
- `chrome/browser/resources/extensions`
- `chrome/browser/resources/print_preview`
- `chrome/browser/resources/new_tab_page*`

### C. Chromium Views / native browser shell rewrite targets

These are not "pages"; they are browser chrome and must be rebuilt in Chromium native UI surfaces.

- Shell controls
  - `my-app/src/renderer/shell/WindowChrome.tsx`
  - `my-app/src/renderer/shell/TabStrip.tsx`
  - `my-app/src/renderer/shell/URLBar.tsx`
  - `my-app/src/renderer/shell/NavButtons.tsx`
  - `my-app/src/renderer/shell/AppMenuButton.tsx`
  - `my-app/src/renderer/shell/BookmarksBar.tsx`
  - `my-app/src/renderer/shell/FindBar.tsx`
  - `my-app/src/renderer/shell/StatusBar.tsx`
  - `my-app/src/renderer/shell/SidePanel.tsx`
  - `my-app/src/renderer/shell/ProfileMenu.tsx`
  - `my-app/src/renderer/shell/PermissionBar.tsx`
  - `my-app/src/renderer/shell/DownloadBubble.tsx`
  - `my-app/src/renderer/shell/DevicePickerBar.tsx`
  - `my-app/src/renderer/shell/TabHoverCard.tsx`
  - `my-app/src/renderer/shell/TabSearchModal.tsx`
  - `my-app/src/renderer/shell/RecentlyClosedDropdown.tsx`
  - `my-app/src/renderer/shell/ZoomBadge.tsx`

Recommended Chromium homes:
- `chrome/browser/ui`
- `chrome/browser/ui/views`
- `chrome/browser/ui/views/frame`
- `chrome/browser/ui/views/location_bar`
- `chrome/browser/ui/views/download`
- `chrome/browser/ui/views/find_bar`
- `chrome/browser/ui/views/extensions`

### D. Throwaway / adapter-only Electron glue

These should not be ported directly. Rebuild them natively or discard them.

- Entire preload layer
  - `my-app/src/preload/*`

- BrowserWindow wrappers and local HTML boot
  - `my-app/src/main/window.ts`
  - `my-app/src/main/localRendererHtml.ts`
  - `my-app/src/main/settings/SettingsWindow.ts`
  - `my-app/src/main/profiles/ProfilePickerWindow.ts`
  - `my-app/src/main/print/PrintPreviewWindow.ts`
  - `my-app/src/main/devtools/DevToolsWindow.ts`
  - `my-app/src/main/extensions/ExtensionsWindow.ts`
  - `my-app/src/main/identity/onboardingWindow.ts`

- IPC fanout and Electron orchestration
  - `my-app/src/main/index.ts`
  - most `src/main/**/ipc.ts`

- Electron-specific session/window plumbing
  - `my-app/src/main/tabs/TabManager.ts`
  - `my-app/src/main/tabs/NavigationController.ts`
  - `my-app/src/main/contextMenu/ContextMenuController.ts`
  - `my-app/src/main/downloads/DownloadManager.ts`
  - `my-app/src/main/pip/PictureInPictureManager.ts`

These files are useful as behavior references only.

## Program structure

### Repo strategy

Use two repos in parallel:

1. `Cheggin/browser`
   - behavior/spec reference
   - issue archive
   - acceptance oracle
   - temporary shipping branch only for critical fixes

2. `Cheggin/chromium`
   - real implementation target
   - branch for browser fork work

### Branch strategy in Chromium fork

- `main`: mirror/upstream sync line
- `companion/base`: minimal product bootstrap branch
- `companion/m1-shell`
- `companion/m2-profiles-first-run`
- `companion/m3-browsing-core`
- `companion/m4-settings-history-downloads`
- `companion/m5-import-sync`
- `companion/m6-extensions`

Do not pile the entire port onto one infinite branch.

## Phased migration plan

## Phase 0: Fork discipline and bootstrap

Goal:
- prove we can build, branch, patch, and run the fork locally

Tasks:
- create local Chromium checkout via `fetch chromium`
- add `cheggin` remote pointing to `Cheggin/chromium`
- build `chrome`
- launch a local binary
- apply one trivial, visible product patch

Acceptance gate:
- local Chromium build succeeds
- patch visible in running browser
- documented branch workflow works end-to-end

Suggested trivial patch:
- temporary title/branding string in a debug-only surface

Do not start product port work before this gate is green.

## Phase 1: Product skeleton inside Chromium

Goal:
- create the minimal app-specific shell identity without replacing the entire browser

Tasks:
- define product naming/branding patch points
- decide whether the product remains branded Chromium or becomes a distinct channel
- identify all first-run entry points
- choose where onboarding/profile picker live:
  - existing intro/first-run WebUI modified
  - or new app-specific WebUI surface

Deliverables:
- first-run page entrypoint selected
- profile bootstrap path selected
- branding patch list

Acceptance gate:
- custom first-run experience opens in Chromium build
- no Electron app required to see the new entrypoint

## Phase 2: Profiles and first-run

Goal:
- replace Electron onboarding/profile bootstrap with Chromium-native equivalents

Tasks:
- map current profile model onto Chromium `ProfileManager` / `ProfileAttributesStorage`
- port profile metadata semantics from:
  - `ProfileStore.ts`
  - `AccountStore.ts`
- define pref keys / local state storage for:
  - agent name
  - onboarding completion
  - selected account identity
  - product-specific profile metadata
- rebuild onboarding/profile picker as WebUI
- implement native browser startup gate:
  - no completed onboarding -> first-run flow
  - completed onboarding -> normal browser window

Acceptance gate:
- fresh profile enters first-run flow
- completed profile skips first-run
- profile selection works at startup

## Phase 3: Browser shell and navigation core

Goal:
- port the actual browser chrome that currently feels "fake native" in Electron

Tasks:
- map current shell UX to Chromium `Views`
- implement or customize:
  - tab strip behavior
  - omnibox behavior
  - navigation buttons
  - app menu integration
  - bookmarks bar visibility/state
  - find bar behavior
  - side panel strategy
  - hover cards / tab search / recently closed menus
- move custom ranking logic from `omnibox/providers.ts` into Chromium-adjacent provider logic rather than keeping it renderer-local

Acceptance gate:
- open tab / close tab / duplicate tab / restore tab
- omnibox navigation and suggestions
- bookmarks bar visible and functional
- find-in-page works

Do not port shell React code. Rebuild behavior in `Views`.

## Phase 4: Settings, history, downloads, bookmarks

Goal:
- move page-like product surfaces into Chromium WebUI

Tasks:
- rebuild settings sections on top of `chrome://settings` or adjacent product WebUI
- port history/journeys semantics into `chrome://history`
- port downloads semantics into `chrome://downloads`
- port bookmarks manager behaviors into bookmarks WebUI
- reuse current TS state/contract ideas, but move implementation behind browser-process handlers and WebUI data providers

Current repo inputs:
- `renderer/settings/*`
- `renderer/history/*`
- `renderer/downloads/*`
- `renderer/bookmarks/*`
- related stores/controllers in `src/main`

Acceptance gate:
- each page opens inside Chromium
- page actions mutate real browser state
- parity against current core flows is documented

## Phase 5: Import, profile migration, and local sync/import

Goal:
- land the import architecture in Chromium where it belongs

Tasks:
- decide whether to extend Chromium importer machinery in:
  - `chrome/browser/importer`
  - `chrome/browser/ui/views/importer`
- port the newly built `profile-use`-style detector/importer semantics
- support browser detection across Chromium-family installs
- use browser/profile migration flow that is native to Chromium startup or settings
- import:
  - cookies if product policy allows
  - bookmarks
  - profile metadata
  - optional passwords/history later

Important:
- current TS implementation is the semantic reference, not the final code
- Chromium may already have importer primitives worth extending instead of bypassing

Acceptance gate:
- import flow runs from first-run or settings
- at least one Chromium-family browser profile imports successfully end-to-end

## Phase 6: Permissions, content settings, downloads, protocol handlers

Goal:
- replace Electron permission/download/session glue with Chromium-native policy and browser-process integration

Tasks:
- map current permission stores and category policies to Chromium content settings / prefs / permission delegates
- port:
  - content categories
  - per-site overrides
  - protocol handlers
  - download folder / ask-before-save behaviors
  - auto-revocation policies
- eliminate Electron-only assumptions from these flows

Acceptance gate:
- site permissions mutate native browser behavior
- content settings persist by profile
- download behavior is native and stable

## Phase 7: Extensions

Goal:
- stop simulating extension management in Electron and move to Chromium-native extension surfaces

Tasks:
- map current extension product requirements to Chromium extension surfaces
- rebuild extensions management UX in `chrome://extensions` or adjacent WebUI
- port policy decisions:
  - dev mode
  - unpacked load flow
  - action state
  - host access semantics
  - MV3 runtime expectations

Important:
- most of `ExtensionManager.ts` and MV3 runtime glue are throwaway as implementation
- the product requirements are still portable

Acceptance gate:
- load/unload/manage extensions natively in the fork
- host access/product constraints are enforced by real browser architecture

## Phase 8: Non-core product features

Only after core browsing is stable:
- devtools custom surfaces
- pill / agent overlays
- safe browsing customizations
- updater/distribution specifics
- QR/share/special dialogs
- device chooser custom UX
- picture-in-picture custom affordances

These should not block the shell/profile/settings/history/downloads/import port.

## Testing migration plan

The current test suite should become migration input, not something abandoned.

### Map current tests to Chromium equivalents

- Current Vitest unit tests:
  - become:
    - retained reference tests in `Cheggin/browser`
    - plus new Chromium unit/browser tests for ported logic

- Current Playwright Electron E2E:
  - become:
    - Chromium `browser_tests`
    - Chromium `interactive_ui_tests`
    - WebUI tests where page-local behavior is enough

- Current visual tests:
  - become:
    - browser screenshots / interaction baselines for selected flows

### Required migration acceptance suite

Before declaring the Chromium fork viable, the following user journeys must pass:

1. Fresh install -> first run -> onboarding complete
2. Relaunch -> skips onboarding
3. Profile picker -> create/select/remove flow
4. New tab -> omnibox -> navigate -> back/forward/reload
5. Multi-tab open/close/duplicate/recently closed
6. Settings mutation persists and affects behavior
7. History view and downloads view work
8. Bookmark add/edit/open works
9. Import from an existing Chromium-family profile works
10. Extension install/enable/disable/remove works for target extension classes

## Recommended engineering order

This is the recommended actual order of execution:

1. Bootstrap local Chromium workspace and build
2. Land minimal branding / product branch discipline
3. Port profile bootstrap + first-run
4. Port shell/navigation core
5. Port settings/history/downloads/bookmarks WebUI
6. Port import flow
7. Port permissions/content settings
8. Port extensions
9. Port non-core product affordances

If you do extensions or advanced sync before shell/profile bootstrap, you will burn time on unstable foundations.

## Immediate concrete next actions

1. Create the local Chromium workspace using `depot_tools` and `fetch chromium`
2. Add `cheggin` remote to the local checkout
3. Produce a successful local `chrome` build
4. Create `companion/base` branch
5. Land one visible product patch
6. Write a first-run architecture note:
   - where onboarding will live
   - where profile metadata will persist
   - how startup gating works
7. Freeze Electron feature development except critical fixes
8. Start Phase 2 vertical slice: profiles + first-run

## What not to do

- Do not try to transplant React shell components into Chromium `Views`
- Do not keep adding new Electron-only browser chrome
- Do not clone the GitHub mirror directly and call that the Chromium workspace
- Do not start with extensions or advanced agent features
- Do not attempt a total "big bang" rewrite without milestone gates

## Bottom line

Yes, the Chromium fork is the right place to go if the goal is a real browser product.

But the safe way to do it is:
- keep this repo as the behavior oracle
- bootstrap Chromium correctly
- port by vertical slice
- treat Electron glue as disposable
- treat product semantics and test scenarios as the real asset
