/**
 * Test setup for Track C (Onboarding) tests.
 * Runs before each test file in the onboarding vitest config.
 *
 * Provides:
 *   - @testing-library/react cleanup after each test
 *   - global crypto (randomUUID, randomBytes) polyfill for jsdom
 *   - Suppress noisy console output from logger.ts during tests
 */

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup React Testing Library after each test
afterEach(() => {
  cleanup();
});
