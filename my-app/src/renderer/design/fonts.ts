/**
 * fonts.ts — Font loading declarations for Geist, Söhne, Berkeley Mono, JetBrains Mono.
 *
 * Strategy: @font-face declarations are injected into the document <head> as a
 * <style> tag at renderer boot. Font files are NOT bundled in this session —
 * see assets/character/README.md for the list of required font files.
 *
 * Fallback chain:
 *   UI:   Geist → Söhne → system-ui → sans-serif
 *   Mono: Berkeley Mono → JetBrains Mono → ui-monospace → monospace
 *
 * NEVER references Inter in any fallback or comment.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FONT_FAMILY_UI   = 'Geist';
const FONT_FAMILY_UI_ALT = 'Söhne';
const FONT_FAMILY_MONO = 'Berkeley Mono';
const FONT_FAMILY_MONO_ALT = 'JetBrains Mono';

const FONT_DISPLAY = 'swap';

/**
 * Expected font asset paths relative to the Vite public directory.
 * Place font files at my-app/public/fonts/<family>/<file>.
 * These paths are documented in assets/character/README.md.
 */
const FONT_PATHS = {
  geistRegular:      '/fonts/Geist/Geist-Regular.woff2',
  geistMedium:       '/fonts/Geist/Geist-Medium.woff2',
  geistSemiBold:     '/fonts/Geist/Geist-SemiBold.woff2',
  geistBold:         '/fonts/Geist/Geist-Bold.woff2',
  berkleyMonoRegular: '/fonts/BerkeleyMono/BerkeleyMono-Regular.woff2',
  berkleyMonoBold:    '/fonts/BerkeleyMono/BerkeleyMono-Bold.woff2',
  jetbrainsMonoRegular: '/fonts/JetBrainsMono/JetBrainsMono-Regular.woff2',
  jetbrainsMonoMedium:  '/fonts/JetBrainsMono/JetBrainsMono-Medium.woff2',
} as const;

// ---------------------------------------------------------------------------
// @font-face declarations
// ---------------------------------------------------------------------------

/**
 * Geist Sans — primary UI font.
 * Download from https://vercel.com/font (OFL license, free).
 */
const GEIST_DECLARATIONS = `
@font-face {
  font-family: '${FONT_FAMILY_UI}';
  src: url('${FONT_PATHS.geistRegular}') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: ${FONT_DISPLAY};
}
@font-face {
  font-family: '${FONT_FAMILY_UI}';
  src: url('${FONT_PATHS.geistMedium}') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: ${FONT_DISPLAY};
}
@font-face {
  font-family: '${FONT_FAMILY_UI}';
  src: url('${FONT_PATHS.geistSemiBold}') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: ${FONT_DISPLAY};
}
@font-face {
  font-family: '${FONT_FAMILY_UI}';
  src: url('${FONT_PATHS.geistBold}') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: ${FONT_DISPLAY};
}
`.trim();

/**
 * Berkeley Mono — primary monospace font for URL bar, code display.
 * Commercial license required — see https://berkeleygraphics.com/typefaces/berkeley-mono/
 * Falls back to JetBrains Mono (free, OFL).
 */
const BERKELEY_MONO_DECLARATIONS = `
@font-face {
  font-family: '${FONT_FAMILY_MONO}';
  src: url('${FONT_PATHS.berkleyMonoRegular}') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: ${FONT_DISPLAY};
}
@font-face {
  font-family: '${FONT_FAMILY_MONO}';
  src: url('${FONT_PATHS.berkleyMonoBold}') format('woff2');
  font-weight: 700;
  font-style: normal;
  font-display: ${FONT_DISPLAY};
}
`.trim();

/**
 * JetBrains Mono — free fallback monospace (OFL license).
 * Download from https://www.jetbrains.com/lp/mono/
 */
const JETBRAINS_MONO_DECLARATIONS = `
@font-face {
  font-family: '${FONT_FAMILY_MONO_ALT}';
  src: url('${FONT_PATHS.jetbrainsMonoRegular}') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: ${FONT_DISPLAY};
}
@font-face {
  font-family: '${FONT_FAMILY_MONO_ALT}';
  src: url('${FONT_PATHS.jetbrainsMonoMedium}') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: ${FONT_DISPLAY};
}
`.trim();

// ---------------------------------------------------------------------------
// CSS custom property declarations for font stacks
// ---------------------------------------------------------------------------

const FONT_STACK_DECLARATIONS = `
:root {
  --font-ui:   '${FONT_FAMILY_UI}', '${FONT_FAMILY_UI_ALT}', system-ui, sans-serif;
  --font-mono: '${FONT_FAMILY_MONO}', '${FONT_FAMILY_MONO_ALT}', ui-monospace, monospace;
}
`.trim();

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Injects all @font-face declarations + CSS custom property stacks into
 * a single <style> tag in document.head.
 *
 * Call once at renderer entry before mounting the React tree:
 *   import { loadFonts } from './design/fonts';
 *   loadFonts();
 */
export function loadFonts(): void {
  if (typeof document === 'undefined') {
    console.warn('[fonts] loadFonts called outside of browser context — skipping');
    return;
  }

  const existingTag = document.getElementById('agb-font-declarations');
  if (existingTag) {
    console.debug('[fonts] font declarations already injected — skipping duplicate');
    return;
  }

  const style = document.createElement('style');
  style.id = 'agb-font-declarations';
  style.textContent = [
    FONT_STACK_DECLARATIONS,
    GEIST_DECLARATIONS,
    BERKELEY_MONO_DECLARATIONS,
    JETBRAINS_MONO_DECLARATIONS,
  ].join('\n\n');

  document.head.appendChild(style);
  console.debug('[fonts] font declarations injected', {
    families: [FONT_FAMILY_UI, FONT_FAMILY_MONO, FONT_FAMILY_MONO_ALT],
  });
}

/**
 * Returns the CSS font-family value for a given role.
 * Use in inline styles when CSS vars are not available.
 */
export function getFontStack(role: 'ui' | 'mono'): string {
  if (role === 'mono') {
    return `'${FONT_FAMILY_MONO}', '${FONT_FAMILY_MONO_ALT}', ui-monospace, monospace`;
  }
  return `'${FONT_FAMILY_UI}', '${FONT_FAMILY_UI_ALT}', system-ui, sans-serif`;
}

/**
 * Exported font family name constants — for use in JS/TS contexts
 * where CSS vars are not available (e.g. canvas drawing, PDF export).
 */
export const FONT_FAMILIES = {
  ui:      FONT_FAMILY_UI,
  uiAlt:   FONT_FAMILY_UI_ALT,
  mono:    FONT_FAMILY_MONO,
  monoAlt: FONT_FAMILY_MONO_ALT,
} as const;
