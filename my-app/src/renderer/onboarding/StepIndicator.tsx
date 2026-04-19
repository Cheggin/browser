/**
 * StepIndicator — row of segment dots showing onboarding progress.
 * Active step = wider filled bar. Completed steps = green. Remaining = muted.
 * Uses CSS classes from theme.onboarding.css — no hardcoded colors.
 */

import React from 'react';

interface StepIndicatorProps {
  /** Current step (1-based) */
  step: number;
  /** Total number of steps */
  total: number;
}

export function StepIndicator({ step, total }: StepIndicatorProps): React.ReactElement {
  return (
    <div className="step-indicator" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={total} aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const dotStep = i + 1;
        const isActive = dotStep === step;
        const isCompleted = dotStep < step;
        return (
          <div
            key={dotStep}
            className="step-dot"
            data-active={isActive ? 'true' : 'false'}
            data-completed={isCompleted ? 'true' : 'false'}
            aria-hidden="true"
          />
        );
      })}
    </div>
  );
}
