import { vi } from 'vitest'

export type MockFetch = ReturnType<typeof vi.spyOn>

export function spyOnFetch (): MockFetch {
  return vi.spyOn(globalThis, 'fetch')
}

export function jsonResponse (body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}
