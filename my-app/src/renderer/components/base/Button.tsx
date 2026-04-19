/**
 * Button.tsx — base button component
 * Variants: primary | secondary | ghost | danger
 * Sizes: sm | md | lg
 * forwardRef, accessible, no !important, no Inter references.
 */

import React, { forwardRef, ButtonHTMLAttributes } from 'react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLOCK = 'agb-btn' as const;

const SIZE_CLASSES = {
  sm: `${BLOCK}--sm`,
  md: `${BLOCK}--md`,
  lg: `${BLOCK}--lg`,
} as const;

const VARIANT_CLASSES = {
  primary:   `${BLOCK}--primary`,
  secondary: `${BLOCK}--secondary`,
  ghost:     `${BLOCK}--ghost`,
  danger:    `${BLOCK}--danger`,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ButtonVariant = keyof typeof VARIANT_CLASSES;
export type ButtonSize    = keyof typeof SIZE_CLASSES;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      iconLeft,
      iconRight,
      disabled,
      className = '',
      children,
      ...rest
    },
    ref,
  ) {
    const isDisabled = disabled || loading;

    const classes = [
      BLOCK,
      SIZE_CLASSES[size],
      VARIANT_CLASSES[variant],
      loading    ? `${BLOCK}--loading`    : '',
      fullWidth  ? `${BLOCK}--full-width` : '',
      isDisabled ? `${BLOCK}--disabled`   : '',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        ref={ref}
        className={classes}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        {...rest}
      >
        {loading && (
          <span className={`${BLOCK}__spinner`} aria-hidden="true" />
        )}
        {!loading && iconLeft && (
          <span className={`${BLOCK}__icon ${BLOCK}__icon--left`} aria-hidden="true">
            {iconLeft}
          </span>
        )}
        {children && (
          <span className={`${BLOCK}__label`}>{children}</span>
        )}
        {!loading && iconRight && (
          <span className={`${BLOCK}__icon ${BLOCK}__icon--right`} aria-hidden="true">
            {iconRight}
          </span>
        )}
      </button>
    );
  },
);

Button.displayName = 'Button';

export default Button;
