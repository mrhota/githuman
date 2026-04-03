import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useReviewsList, useReview, useCreateReview, useUpdateReview } from '../../../src/web/hooks/useReviews'

describe('useReviewsList', () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockFetch = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should start with loading state', () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ reviews: [], total: 0, page: 1, pageSize: 20 }), { status: 200 })
    )
    const { result } = renderHook(() => useReviewsList())
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('should load paginated reviews', async () => {
    const response = {
      reviews: [{ id: 'r1', status: 'in_progress' }],
      total: 1,
      page: 1,
      pageSize: 20,
    }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))

    const { result } = renderHook(() => useReviewsList())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual(response)
    expect(result.current.error).toBeNull()
  })

  it('should handle errors', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Server error' }), { status: 500 }))

    const { result } = renderHook(() => useReviewsList())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
  })
})

describe('useReview', () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockFetch = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should load a single review', async () => {
    const review = { id: 'r1', status: 'in_progress', files: [], summary: {} }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(review), { status: 200 }))

    const { result } = renderHook(() => useReview('r1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual(review)
  })

  it('should handle 404 errors', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Review not found' }), { status: 404 })
    )

    const { result } = renderHook(() => useReview('nonexistent'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.data).toBeNull()
  })
})

describe('useCreateReview', () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockFetch = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create a review', async () => {
    const newReview = { id: 'r1', status: 'in_progress' }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(newReview), { status: 201 }))

    const { result } = renderHook(() => useCreateReview())

    let created: unknown
    await act(async () => {
      created = await result.current.create({ sourceType: 'staged' })
    })

    expect(created).toEqual(newReview)
    expect(result.current.loading).toBe(false)
  })

  it('should set error on failure', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: 'No staged changes' }), { status: 400 })
    )

    const { result } = renderHook(() => useCreateReview())

    await act(async () => {
      try {
        await result.current.create({ sourceType: 'staged' })
      } catch {
        // expected
      }
    })

    expect(result.current.error).not.toBeNull()
  })
})

describe('useUpdateReview', () => {
  let mockFetch: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockFetch = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should update a review status', async () => {
    const updated = { id: 'r1', status: 'approved' }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(updated), { status: 200 }))

    const { result } = renderHook(() => useUpdateReview())

    let review: unknown
    await act(async () => {
      review = await result.current.update('r1', { status: 'approved' })
    })

    expect(review).toEqual(updated)
  })
})
