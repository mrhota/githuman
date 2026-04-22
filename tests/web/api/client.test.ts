import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setAuthToken, api } from '../../../src/web/api/client'
import { spyOnFetch, jsonResponse, type MockFetch } from '../helpers'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock })

describe('API client authentication', () => {
  let mockFetch: MockFetch

  beforeEach(() => {
    localStorageMock.clear()
    mockFetch = spyOnFetch().mockResolvedValue(jsonResponse({ data: 'test' }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorageMock.clear()
  })

  it('should not include Authorization header when no token', async () => {
    await api.get('/test')

    const callArgs = mockFetch.mock.calls[0]
    const headers = callArgs[1]?.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('should include Authorization header when token is set', async () => {
    setAuthToken('bearer-test-token')

    await api.get('/test')

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer bearer-test-token',
        }),
      })
    )
  })

  it('should include Authorization header in POST requests', async () => {
    setAuthToken('post-token')

    await api.post('/test', { foo: 'bar' })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer post-token',
        }),
      })
    )
  })

  it('should include Authorization header in PATCH requests', async () => {
    setAuthToken('patch-token')

    await api.patch('/test', { foo: 'bar' })

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer patch-token',
        }),
      })
    )
  })

  it('should include Authorization header in DELETE requests', async () => {
    setAuthToken('delete-token')

    await api.delete('/test')

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer delete-token',
        }),
      })
    )
  })
})
