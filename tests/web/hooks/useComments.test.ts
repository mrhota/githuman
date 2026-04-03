import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useComments, useCommentStats, useCreateComment, useResolveComment, useDeleteComment } from '../../../src/web/hooks/useComments'

describe('useComments', () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockFetch = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should start with loading state', () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    const { result } = renderHook(() => useComments('review-1'))
    expect(result.current.loading).toBe(true)
    expect(result.current.comments).toEqual([])
  })

  it('should load comments for a review', async () => {
    const comments = [
      { id: 'c1', reviewId: 'r1', filePath: 'a.ts', content: 'test', resolved: false },
    ]
    mockFetch.mockResolvedValue(new Response(JSON.stringify(comments), { status: 200 }))

    const { result } = renderHook(() => useComments('r1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.comments).toEqual(comments)
    expect(result.current.error).toBeNull()
  })

  it('should handle fetch errors', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }))

    const { result } = renderHook(() => useComments('bad-id'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.comments).toEqual([])
  })

  it('should not fetch when reviewId is empty', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }))
    const callsBefore = mockFetch.mock.calls.length
    renderHook(() => useComments(''))

    // Give it a tick to see if fetch is called
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(mockFetch.mock.calls.length).toBe(callsBefore)
  })
})

describe('useCommentStats', () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockFetch = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should load comment stats', async () => {
    const stats = { total: 5, resolved: 2, unresolved: 3, withSuggestions: 1 }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(stats), { status: 200 }))

    const { result } = renderHook(() => useCommentStats('r1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.stats).toEqual(stats)
  })
})

describe('useCreateComment', () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockFetch = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create a comment and return it', async () => {
    const newComment = { id: 'c1', reviewId: 'r1', filePath: 'a.ts', content: 'looks good' }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(newComment), { status: 201 }))

    const { result } = renderHook(() => useCreateComment())

    expect(result.current.loading).toBe(false)

    let created: unknown
    await act(async () => {
      created = await result.current.create('r1', { filePath: 'a.ts', content: 'looks good' })
    })

    expect(created).toEqual(newComment)
    expect(result.current.loading).toBe(false)
  })

  it('should set error on failure', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 }))

    const { result } = renderHook(() => useCreateComment())

    await act(async () => {
      try {
        await result.current.create('r1', { filePath: 'a.ts', content: '' })
      } catch {
        // expected
      }
    })

    expect(result.current.error).not.toBeNull()
  })
})

describe('useResolveComment', () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockFetch = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should resolve a comment', async () => {
    const resolved = { id: 'c1', resolved: true }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(resolved), { status: 200 }))

    const { result } = renderHook(() => useResolveComment())

    let comment: unknown
    await act(async () => {
      comment = await result.current.resolve('c1')
    })

    expect(comment).toEqual(resolved)
  })

  it('should unresolve a comment', async () => {
    const unresolved = { id: 'c1', resolved: false }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(unresolved), { status: 200 }))

    const { result } = renderHook(() => useResolveComment())

    let comment: unknown
    await act(async () => {
      comment = await result.current.unresolve('c1')
    })

    expect(comment).toEqual(unresolved)
  })
})

describe('useDeleteComment', () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockFetch = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should delete a comment', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))

    const { result } = renderHook(() => useDeleteComment())

    await act(async () => {
      await result.current.deleteComment('c1')
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
