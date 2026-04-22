import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useReviewsList, useReview, useCreateReview, useUpdateReview } from '../../../src/web/hooks/useReviews'
import { spyOnFetch, jsonResponse, type MockFetch } from '../helpers'

describe('useReviewsList', () => {
  let mockFetch: MockFetch

  beforeEach(() => {
    mockFetch = spyOnFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should start with loading state', () => {
    mockFetch.mockResolvedValue(jsonResponse({ reviews: [], total: 0, page: 1, pageSize: 20 }))
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
    mockFetch.mockResolvedValue(jsonResponse(response))

    const { result } = renderHook(() => useReviewsList())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual(response)
    expect(result.current.error).toBeNull()
  })

  it('should handle errors', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Server error' }, 500))

    const { result } = renderHook(() => useReviewsList())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
  })
})

describe('useReview', () => {
  let mockFetch: MockFetch

  beforeEach(() => {
    mockFetch = spyOnFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should load a single review', async () => {
    const review = { id: 'r1', status: 'in_progress', files: [], summary: {} }
    mockFetch.mockResolvedValue(jsonResponse(review))

    const { result } = renderHook(() => useReview('r1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.data).toEqual(review)
  })

  it('should handle 404 errors', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'Review not found' }, 404))

    const { result } = renderHook(() => useReview('nonexistent'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).not.toBeNull()
    expect(result.current.data).toBeNull()
  })
})

describe('useCreateReview', () => {
  let mockFetch: MockFetch

  beforeEach(() => {
    mockFetch = spyOnFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create a review', async () => {
    const newReview = { id: 'r1', status: 'in_progress' }
    mockFetch.mockResolvedValue(jsonResponse(newReview, 201))

    const { result } = renderHook(() => useCreateReview())

    let created: unknown
    await act(async () => {
      created = await result.current.create({ sourceType: 'staged' })
    })

    expect(created).toEqual(newReview)
    expect(result.current.loading).toBe(false)
  })

  it('should set error on failure', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'No staged changes' }, 400))

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
  let mockFetch: MockFetch

  beforeEach(() => {
    mockFetch = spyOnFetch()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should update a review status', async () => {
    const updated = { id: 'r1', status: 'approved' }
    mockFetch.mockResolvedValue(jsonResponse(updated))

    const { result } = renderHook(() => useUpdateReview())

    let review: unknown
    await act(async () => {
      review = await result.current.update('r1', { status: 'approved' })
    })

    expect(review).toEqual(updated)
  })
})
