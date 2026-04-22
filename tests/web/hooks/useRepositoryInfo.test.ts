import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRepositoryInfo } from '../../../src/web/hooks/useRepositoryInfo'
import { spyOnFetch, jsonResponse, type MockFetch } from '../helpers'

describe('useRepositoryInfo', () => {
  let mockFetch: MockFetch

  beforeEach(() => {
    mockFetch = spyOnFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should start with loading state', () => {
    mockFetch.mockResolvedValue(jsonResponse({ name: 'repo', branch: 'main' }))
    const { result } = renderHook(() => useRepositoryInfo())
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('should load repository info', async () => {
    const repoInfo = { name: 'githuman', branch: 'main', remote: 'https://github.com/test/repo', path: '/tmp/repo' }
    mockFetch.mockResolvedValue(jsonResponse(repoInfo))

    const { result } = renderHook(() => useRepositoryInfo())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual(repoInfo)
    expect(result.current.error).toBeNull()
  })

  it('should handle errors', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Not a git repo' }, 400))

    const { result } = renderHook(() => useRepositoryInfo())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.data).toBeNull()
  })

  it('should support refetch', async () => {
    const repoInfo = { name: 'repo', branch: 'main', remote: null, path: '/tmp' }
    mockFetch.mockResolvedValue(jsonResponse(repoInfo))

    const { result } = renderHook(() => useRepositoryInfo())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const updatedInfo = { ...repoInfo, branch: 'feature' }
    mockFetch.mockResolvedValue(jsonResponse(updatedInfo))

    result.current.refetch()

    await waitFor(() => {
      expect(result.current.data).toEqual(updatedInfo)
    })
  })
})
