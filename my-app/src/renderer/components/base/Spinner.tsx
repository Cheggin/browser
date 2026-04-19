/**
 * Spinner.tsx — loading indicator component
 * Sizes: xs | sm | md | lg
 * Uses CSS animation (spin keyframe defined in theme.global.css).
 * forwardRef, accessible via aria-label / role="status".
 * No !important, no Inter references.
 */

import React, { forwardRef, HTMLAttributes } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCK = 'agb-spinner' as const;

const SIZE_CLASSES = {
  xs: `${BLOCK}--xs`,
  sm: `${BLOCK}--sm`,
  md: `${BLOCK}--md`,
  lg: `${BLOCK}--lg`,
} as const;

const SIZE_PX = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 28,
} as const;

const STROKE_WIDTH = {
  xs: 1.5,
  sm: 1.5,
  md: 2,
  lg: 2,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpinnerSize = keyof typeof SIZE_CLASSES;

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: SpinnerSize;
  label?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Spinner = forwardRef<HTMLSpanElement, SpinnerProps>(
  function Spinner(
    {
      size = 'md',
      label = 'Loading',
      className = '',
      style,
      ...rest
    },
    ref,
  ) {
    const px = SIZE_PX[size];
    const sw = STROKE_WIDTH[size];
    const r  = (px - sw * 2) / 2;
    const cx = px / 2;
    const circumference = 2 * Math.PI * r;

    const classes = [
      BLOCK,
      SIZE_CLASSES[size],
      'animate-spin',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <span
        ref={ref}
        role="status"
        aria-label={label}
        className={classes}
        style={{ display: 'inline-block', lineHeight: 0, ...style }}
        {...rest}
      >
        <svg
          width={px}
          height={px}
          viewBox={`0 0 ${px} ${px}`}
          fill="none"
          aria-hidden="true"
        >
          {/* Track ring */}
          <circle
            cx={cx}
            cy={cx}
            r={r}
            stroke="currentColor"
            strokeWidth={sw}
            opacity={0.15}
          />
          {/* Active arc — covers ~25% of circumference */}
          <circle
            cx={cx}
            cy={cx}
            r={r}
            stroke="currentColor"
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * 0.75}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        </svg>
        <span className="sr-only">{label}</span>
      </span>
    );
  },
);

Spinner.displayName = 'Spinner';

export default Spinner;
