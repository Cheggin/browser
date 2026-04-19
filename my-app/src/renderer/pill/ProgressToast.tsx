/**
 * Track B — ProgressToast component.
 *
 * Renders streaming step events during an active agent task.
 * Listens for pill:event (AgentEvent) via pillAPI.onEvent and updates
 * the displayed step text in real-time.
 *
 * Event handling:
 * - task_started       → show "Starting…"
 * - step_start         → show step number + plan text
 * - step_result        → append result summary
 * - step_error         → show step error inline (agent will self-correct)
 * - task_done          → parent Pill handles this (shows ResultDisplay)
 * - task_failed        → parent handles
 * - target_lost        → parent handles
 * - task_cancelled     → parent handles
 */

import React from 'react';
import { Spinner } from '../components/base';
import type {
  AgentEvent,
  StepStartEvent,
  StepResultEvent,
  StepErrorEvent,
  TaskStartedEvent,
} from '../../shared/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProgressStep {
  step: number;
  plan: string;
  result?: string;
  error?: string;
}

interface ProgressToastProps {
  steps: ProgressStep[];
  isStarting: boolean;
  taskId: string | null;
}

// ---------------------------------------------------------------------------
// Exported event → steps reducer (pure — easy to test)
// ---------------------------------------------------------------------------

export function applyEventToSteps(
  steps: ProgressStep[],
  event: AgentEvent,
): ProgressStep[] {
  switch (event.event) {
    case 'task_started': {
      // Reset steps on new task
      return [];
    }

    case 'step_start': {
      const e = event as StepStartEvent;
      // Avoid duplicate step entries
      if (steps.some((s) => s.step === e.step)) {
        return steps;
      }
      return [...steps, { step: e.step, plan: e.plan }];
    }

    case 'step_result': {
      const e = event as StepResultEvent;
      return steps.map((s) =>
        s.step === e.step
          ? { ...s, result: String(e.result ?? '') }
          : s,
      );
    }

    case 'step_error': {
      const e = event as StepErrorEvent;
      return steps.map((s) =>
        s.step === e.step
          ? { ...s, error: e.error.message }
          : s,
      );
    }

    default:
      return steps;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProgressToast({
  steps,
  isStarting,
  taskId,
}: ProgressToastProps): React.ReactElement {
  // Show the most recent step prominently
  const latestStep = steps[steps.length - 1] ?? null;

  return (
    <div className="pill-toast" data-testid="progress-toast" data-task-id={taskId ?? ''}>
      <div className="pill-toast-header">
        <Spinner size="xs" className="pill-spinner" aria-label="Agent working" />
        <span>Agent working</span>
        {steps.length > 0 && (
          <span className="pill-toast-step-number">
            Step {steps.length}
          </span>
        )}
      </div>

      {isStarting && steps.length === 0 && (
        <div className="pill-toast-step" data-testid="toast-starting">
          Starting…
        </div>
      )}

      {latestStep && (
        <div className="pill-toast-step" data-testid="toast-step-text">
          {latestStep.plan}
          {latestStep.error && (
            <span style={{ color: 'var(--color-status-error, #f87171)', marginLeft: 6 }}>
              — {latestStep.error} (retrying…)
            </span>
          )}
        </div>
      )}

      {/* Previous steps summary (collapsed) */}
      {steps.length > 1 && (
        <div className="pill-toast-step-number" data-testid="toast-step-count">
          {steps.length - 1} step{steps.length - 1 !== 1 ? 's' : ''} completed
        </div>
      )}
    </div>
  );
}
