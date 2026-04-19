/**
 * Crash-recovery logic for the Unix socket connection to the Python daemon.
 *
 * Strategy: exponential backoff with jitter, up to MAX_ATTEMPTS.
 * The daemon is expected to be respawned externally (by utilityProcess lifecycle
 * management in the main process) before reconnect attempts land.
 */

import { daemonLogger } from "../logger";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_DELAY_MS = 200;
const MAX_DELAY_MS = 10000;
const BACKOFF_FACTOR = 2;
const MAX_ATTEMPTS = 10;
/** Jitter percentage (0–1). Adds up to ±20% randomness to each delay. */
const JITTER_FACTOR = 0.2;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconnectManagerOptions {
  /** Called to attempt a reconnection. Should return a promise. */
  onReconnect: () => Promise<void>;
  /** Called when all attempts are exhausted */
  onGiveUp: () => void;
  initialDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
}

// ---------------------------------------------------------------------------
// ReconnectManager
// ---------------------------------------------------------------------------

export class ReconnectManager {
  private readonly onReconnect: () => Promise<void>;
  private readonly onGiveUp: () => void;
  private readonly initialDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;

  private attempts = 0;
  private currentDelayMs: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(opts: ReconnectManagerOptions) {
    this.onReconnect = opts.onReconnect;
    this.onGiveUp = opts.onGiveUp;
    this.initialDelayMs = opts.initialDelayMs ?? INITIAL_DELAY_MS;
    this.maxDelayMs = opts.maxDelayMs ?? MAX_DELAY_MS;
    this.maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
    this.currentDelayMs = this.initialDelayMs;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle hooks called by DaemonClient
  // ---------------------------------------------------------------------------

  /** Called when the socket successfully connects or reconnects. Resets state. */
  onConnected(): void {
    daemonLogger.debug("ReconnectManager.connected", {
      attemptsBeforeConnect: this.attempts,
      msg: "Connection established. Resetting backoff.",
    });
    this.attempts = 0;
    this.currentDelayMs = this.initialDelayMs;
    this._cancelPendingReconnect();
  }

  /** Called when the socket disconnects unexpectedly. Schedules a reconnect attempt. */
  onDisconnected(): void {
    if (this.stopped) return;
    this._scheduleReconnect();
  }

  /** Stop all reconnection attempts (e.g. on graceful shutdown). */
  stop(): void {
    daemonLogger.debug("ReconnectManager.stop", { attempts: this.attempts });
    this.stopped = true;
    this._cancelPendingReconnect();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _scheduleReconnect(): void {
    if (this.stopped) return;

    this.attempts += 1;

    if (this.attempts > this.maxAttempts) {
      daemonLogger.error("ReconnectManager.giveUp", {
        attempts: this.attempts,
        maxAttempts: this.maxAttempts,
        msg: "Exhausted all reconnect attempts.",
      });
      this.onGiveUp();
      return;
    }

    const jitter = (Math.random() * 2 - 1) * JITTER_FACTOR * this.currentDelayMs;
    const delay = Math.min(this.currentDelayMs + jitter, this.maxDelayMs);

    daemonLogger.warn("ReconnectManager.scheduleReconnect", {
      attempt: this.attempts,
      maxAttempts: this.maxAttempts,
      delayMs: Math.round(delay),
      backoffMs: Math.round(this.currentDelayMs),
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.stopped) return;

      daemonLogger.debug("ReconnectManager.attempt", { attempt: this.attempts });
      this.onReconnect().catch((err: Error) => {
        daemonLogger.error("ReconnectManager.attempt.failed", {
          attempt: this.attempts,
          error: err.message,
          stack: err.stack,
          currentDelayMs: this.currentDelayMs,
        });
        // _onDisconnect in DaemonClient will call onDisconnected() again, scheduling next attempt
      });
    }, delay);

    // Advance backoff for next attempt
    this.currentDelayMs = Math.min(
      this.currentDelayMs * BACKOFF_FACTOR,
      this.maxDelayMs
    );
  }

  private _cancelPendingReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors for tests / diagnostics
  // ---------------------------------------------------------------------------

  getAttempts(): number {
    return this.attempts;
  }

  getCurrentDelayMs(): number {
    return this.currentDelayMs;
  }

  isStopped(): boolean {
    return this.stopped;
  }
}
