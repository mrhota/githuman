/**
 * Shared test helpers for server tests
 */

import type { GitPort, GitStatusResult } from '../../src/server/ports.ts'

// A test token that meets the 32-character minimum requirement
export const TEST_TOKEN = 'test-secret-token-32-chars-min!!'

// Auth header for use in requests
export function authHeader (token: string = TEST_TOKEN) {
  return { authorization: `Bearer ${token}` }
}

const emptyStatus: GitStatusResult = {
  staged: [],
  modified: [],
  created: [],
  deleted: [],
  renamed: [],
  notAdded: [],
}

export function createFakeGitPort (overrides: Partial<GitPort> = {}): GitPort {
  return {
    revparse: async () => '',
    status: async () => emptyStatus,
    diff: async () => '',
    show: async () => '',
    showBinary: async () => Buffer.alloc(0),
    add: async () => {},
    reset: async () => {},
    branch: async () => '',
    getRemotes: async () => [],
    getConfigValue: async () => null,
    raw: async () => '',
    statusPorcelain: async () => '',
    ...overrides,
  }
}
