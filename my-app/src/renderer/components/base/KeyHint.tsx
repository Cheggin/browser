/**
 * KeyHint.tsx — keyboard shortcut chip component
 * Renders ⌘K, ⌘⇧P, Esc, etc. as styled chips.
 * forwardRef, accessible via aria-label, no !important, no Inter references.
 *
 * Usage:
 *   <KeyHint keys={['⌘', 'K']} />
 *   <KeyHint keys={['Esc']} />
 *   <KeyHint keys={['⌘', '⇧', 'P']} label="Command palette" />
 */

import React, { forwardRef, HTMLAttributes } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCK = 'agb-keyhint' as const;

/** Map common key names to display symbols */
const KEY_SYMBOLS: Record<string, string> = {
  cmd:     '⌘',
  command: '⌘',
  meta:    '⌘',
  ctrl:    '⌃',
  control: '⌃',
  alt:     '⌥',
  option:  '⌥',
  shift:   '⇧',
  enter:   '↵',
  return:  '↵',
  escape:  'Esc',
  esc:     'Esc',
  tab:     '⇥',
  up:      '↑',
  down:    '↓',
  left:    '←',
  right:   '→',
  delete:  '⌫',
  backspace: '⌫',
  space:   '␣',
} as const;

const SIZE_CLASSES = {
  xs: `${BLOCK}--xs`,
  sm: `${BLOCK}--sm`,
  md: `${BLOCK}--md`,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type KeyHintSize = keyof typeof SIZE_CLASSES;

export interface KeyHintProps extends HTMLAttributes<HTMLSpanElement> {
  /** Array of key strings. Each entry becomes a separate <kbd>. */
  keys: string[];
  size?: KeyHintSize;
  /** Accessible label for the whole shortcut. Defaults to keys.join('+') */
  label?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveKeySymbol(key: string): string {
  return KEY_SYMBOLS[key.toLowerCase()] ?? key;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const KeyHint = forwardRef<HTMLSpanElement, KeyHintProps>(
  function KeyHint(
    {
      keys,
      size = 'sm',
      label,
      className = '',
      ...rest
    },
    ref,
  ) {
    const ariaLabel = label ?? keys.map(resolveKeySymbol).join('+');

    const classes = [
      BLOCK,
      SIZE_CLASSES[size],
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <span
        ref={ref}
        className={classes}
        aria-label={ariaLabel}
        title={ariaLabel}
        {...rest}
      >
        {keys.map((key, idx) => (
          <React.Fragment key={idx}>
            <kbd className={`${BLOCK}__key`}>
              {resolveKeySymbol(key)}
            </kbd>
            {idx < keys.length - 1 && (
              <span className={`${BLOCK}__sep`} aria-hidden="true" />
            )}
          </React.Fragment>
        ))}
      </span>
    );
  },
);

KeyHint.displayName = 'KeyHint';

export default KeyHint;
