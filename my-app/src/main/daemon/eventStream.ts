/**
 * Push event subscriber for the Python agent daemon.
 *
 * The daemon writes events to the Unix socket as they occur (push-based, not polled).
 * EventStream receives them from DaemonClient and fans out to registered handlers.
 */

import { AgentEvent, AgentEventType } from "../../shared/types";
import { daemonLogger } from "../logger";

type EventHandler = (event: AgentEvent) => void;
type TypedEventHandler<T extends AgentEvent> = (event: T) => void;

// ---------------------------------------------------------------------------
// EventStream
// ---------------------------------------------------------------------------

export class EventStream {
  /** Global handlers receive every event */
  private globalHandlers = new Set<EventHandler>();

  /** Per-event-type handlers */
  private typedHandlers = new Map<string, Set<EventHandler>>();

  /** Per-task-id handlers for targeted subscriptions */
  private taskHandlers = new Map<string, Set<EventHandler>>();

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  /**
   * Subscribe to all agent events.
   * Returns an unsubscribe function.
   */
  subscribe(handler: EventHandler): () => void {
    this.globalHandlers.add(handler);
    daemonLogger.debug("EventStream.subscribe.global", { totalSubscribers: this.globalHandlers.size });
    return () => {
      this.globalHandlers.delete(handler);
      daemonLogger.debug("EventStream.unsubscribe.global", { totalSubscribers: this.globalHandlers.size });
    };
  }

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  subscribeToType<E extends AgentEvent>(
    eventType: E["event"],
    handler: TypedEventHandler<E>
  ): () => void {
    let handlers = this.typedHandlers.get(eventType);
    if (!handlers) {
      handlers = new Set();
      this.typedHandlers.set(eventType, handlers);
    }
    handlers.add(handler as EventHandler);
    daemonLogger.debug("EventStream.subscribe.typed", { eventType });
    return () => {
      const set = this.typedHandlers.get(eventType);
      if (set) {
        set.delete(handler as EventHandler);
        if (set.size === 0) this.typedHandlers.delete(eventType);
      }
      daemonLogger.debug("EventStream.unsubscribe.typed", { eventType });
    };
  }

  /**
   * Subscribe to all events for a specific task_id.
   * Returns an unsubscribe function.
   */
  subscribeToTask(taskId: string, handler: EventHandler): () => void {
    let handlers = this.taskHandlers.get(taskId);
    if (!handlers) {
      handlers = new Set();
      this.taskHandlers.set(taskId, handlers);
    }
    handlers.add(handler);
    daemonLogger.debug("EventStream.subscribe.task", { taskId });
    return () => {
      const set = this.taskHandlers.get(taskId);
      if (set) {
        set.delete(handler);
        if (set.size === 0) this.taskHandlers.delete(taskId);
      }
      daemonLogger.debug("EventStream.unsubscribe.task", { taskId });
    };
  }

  // ---------------------------------------------------------------------------
  // Emit (called by DaemonClient when a push event arrives)
  // ---------------------------------------------------------------------------

  emit(event: AgentEvent): void {
    daemonLogger.debug("EventStream.emit", {
      event: event.event,
      task_id: event.task_id,
      globalSubscribers: this.globalHandlers.size,
      typedSubscribers: this.typedHandlers.get(event.event)?.size ?? 0,
      taskSubscribers: this.taskHandlers.get(event.task_id)?.size ?? 0,
    });

    // Fan out to global handlers
    for (const handler of this.globalHandlers) {
      try {
        handler(event);
      } catch (err) {
        daemonLogger.error("EventStream.emit.globalHandlerError", {
          event: event.event,
          task_id: event.task_id,
          error: (err as Error).message,
          stack: (err as Error).stack,
        });
      }
    }

    // Fan out to typed handlers
    const typedSet = this.typedHandlers.get(event.event);
    if (typedSet) {
      for (const handler of typedSet) {
        try {
          handler(event);
        } catch (err) {
          daemonLogger.error("EventStream.emit.typedHandlerError", {
            event: event.event,
            task_id: event.task_id,
            error: (err as Error).message,
            stack: (err as Error).stack,
          });
        }
      }
    }

    // Fan out to per-task handlers
    const taskSet = this.taskHandlers.get(event.task_id);
    if (taskSet) {
      for (const handler of taskSet) {
        try {
          handler(event);
        } catch (err) {
          daemonLogger.error("EventStream.emit.taskHandlerError", {
            event: event.event,
            task_id: event.task_id,
            error: (err as Error).message,
            stack: (err as Error).stack,
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Remove all handlers for a specific task (call after task_done/task_failed/task_cancelled) */
  clearTaskHandlers(taskId: string): void {
    const removed = this.taskHandlers.delete(taskId);
    if (removed) {
      daemonLogger.debug("EventStream.clearTaskHandlers", { taskId });
    }
  }

  /** Return number of active global subscribers */
  subscriberCount(): number {
    return this.globalHandlers.size;
  }
}
