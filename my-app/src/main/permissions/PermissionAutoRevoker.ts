/**
 * PermissionAutoRevoker — background scan that identifies granted permissions
 * for sites that haven't been visited recently, then offers them for revocation.
 *
 * Chrome parity: Chrome auto-revokes notification permissions for sites with
 * very low engagement. We implement a similar heuristic:
 *   - Scan all 'allow' permission records
 *   - Find sites not visited in the last INACTIVE_THRESHOLD_MS
 *   - Expose these as "candidates" the user can revoke or opt out of
 *
 * Only notification permissions are flagged by default (Chrome parity), but
 * the scan can cover any permission type via options.
 */

import { mainLogger } from '../logger';
import { PermissionStore, PermissionRecord, PermissionType } from './PermissionStore';
import { HistoryStore } from '../history/HistoryStore';

// 90 days without a visit → site is considered inactive
const INACTIVE_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000;

// Permission types that are candidates for auto-revoke (Chrome only does notifications)
const AUTO_REVOKE_PERMISSION_TYPES: Set<PermissionType> = new Set([
  'notifications',
  'geolocation',
  'camera',
  'microphone',
]);

export interface AutoRevokeCandidate {
  origin: string;
  permissionType: PermissionType;
  grantedAt: number;
  daysSinceVisit: number | null;
  /** null means: never visited in recorded history */
  lastVisit: number | null;
}

export interface AutoRevokeScanResult {
  candidates: AutoRevokeCandidate[];
  scannedAt: number;
}

export class PermissionAutoRevoker {
  private store: PermissionStore;
  private historyStore: HistoryStore;
  /** Origins the user has opted out of auto-revoke for (persisted in-memory for the session) */
  private optedOut: Set<string> = new Set();

  constructor(opts: { store: PermissionStore; historyStore: HistoryStore }) {
    this.store = opts.store;
    this.historyStore = opts.historyStore;
    mainLogger.info('PermissionAutoRevoker.init');
  }

  /**
   * Run the scan and return candidates. Does not modify any permissions.
   * Filters out origins the user has opted out of.
   */
  scan(): AutoRevokeScanResult {
    const now = Date.now();
    const allRecords = this.store.getAllRecords();

    // Build a map of origin → most recent visit time from history
    const lastVisitMap = this.buildLastVisitMap();

    mainLogger.info('PermissionAutoRevoker.scan.start', {
      totalRecords: allRecords.length,
      historyOrigins: lastVisitMap.size,
    });

    const candidates: AutoRevokeCandidate[] = [];

    for (const record of allRecords) {
      if (record.state !== 'allow') continue;
      if (!AUTO_REVOKE_PERMISSION_TYPES.has(record.permissionType)) continue;

      const optOutKey = this.optOutKey(record.origin, record.permissionType);
      if (this.optedOut.has(optOutKey)) continue;

      const lastVisit = lastVisitMap.get(record.origin) ?? null;
      const timeSinceVisit = lastVisit !== null ? now - lastVisit : null;
      const isInactive =
        lastVisit === null || (now - lastVisit) > INACTIVE_THRESHOLD_MS;

      if (!isInactive) continue;

      const daysSinceVisit =
        timeSinceVisit !== null ? Math.floor(timeSinceVisit / (24 * 60 * 60 * 1000)) : null;

      candidates.push({
        origin: record.origin,
        permissionType: record.permissionType,
        grantedAt: record.updatedAt,
        daysSinceVisit,
        lastVisit,
      });

      mainLogger.info('PermissionAutoRevoker.scan.candidate', {
        origin: record.origin,
        permissionType: record.permissionType,
        daysSinceVisit,
        lastVisit,
      });
    }

    mainLogger.info('PermissionAutoRevoker.scan.done', {
      candidateCount: candidates.length,
    });

    return { candidates, scannedAt: now };
  }

  /**
   * Revoke a list of (origin, permissionType) pairs by setting their state to 'deny'.
   * Returns the count of successfully revoked permissions.
   */
  applyRevoke(revocations: Array<{ origin: string; permissionType: PermissionType }>): number {
    let count = 0;
    for (const { origin, permissionType } of revocations) {
      const current = this.store.getSitePermission(origin, permissionType);
      if (current !== 'allow') {
        mainLogger.warn('PermissionAutoRevoker.applyRevoke.skipped', {
          origin,
          permissionType,
          currentState: current,
        });
        continue;
      }
      this.store.setSitePermission(origin, permissionType, 'deny');
      mainLogger.info('PermissionAutoRevoker.applyRevoke.revoked', {
        origin,
        permissionType,
      });
      count++;
    }
    mainLogger.info('PermissionAutoRevoker.applyRevoke.done', { revoked: count });
    return count;
  }

  /**
   * Opt a specific (origin, permissionType) out of future auto-revoke candidates.
   * The grant remains 'allow' — the user is saying "keep this permission even though
   * I don't visit often".
   */
  optOut(origin: string, permissionType: PermissionType): void {
    const key = this.optOutKey(origin, permissionType);
    this.optedOut.add(key);
    mainLogger.info('PermissionAutoRevoker.optOut', { origin, permissionType });
  }

  /**
   * Clear a previously set opt-out so the origin shows up in future scans.
   */
  clearOptOut(origin: string, permissionType: PermissionType): void {
    const key = this.optOutKey(origin, permissionType);
    this.optedOut.delete(key);
    mainLogger.info('PermissionAutoRevoker.clearOptOut', { origin, permissionType });
  }

  /**
   * Returns an origin → most-recent-visit-timestamp map built from history.
   * Uses the HistoryEntry.url parsed to origin.
   */
  private buildLastVisitMap(): Map<string, number> {
    const map = new Map<string, number>();
    const allEntries = this.historyStore.getAll();

    for (const entry of allEntries) {
      try {
        const origin = new URL(entry.url).origin;
        const existing = map.get(origin);
        if (existing === undefined || entry.visitTime > existing) {
          map.set(origin, entry.visitTime);
        }
      } catch {
        // skip unparseable URLs
      }
    }

    mainLogger.debug('PermissionAutoRevoker.buildLastVisitMap', { originCount: map.size });
    return map;
  }

  private optOutKey(origin: string, permissionType: PermissionType): string {
    return `${origin}::${permissionType}`;
  }

  /**
   * Get all records that are currently auto-revoke candidates (for use in
   * getAllRecords-style queries without the opt-out filter).
   */
  getOptedOutKeys(): string[] {
    return [...this.optedOut];
  }
}
