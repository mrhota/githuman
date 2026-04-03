import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKeyboardShortcuts, keyboardShortcuts } from '../../../src/web/hooks/useKeyboardShortcuts'

function fireKey (key: string, target?: Partial<HTMLElement>) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true })
  if (target) {
    Object.defineProperty(event, 'target', { value: target })
  }
  window.dispatchEvent(event)
}

describe('useKeyboardShortcuts', () => {
  it('should call onNextFile when j is pressed', () => {
    const onNextFile = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onNextFile }))

    fireKey('j')
    expect(onNextFile).toHaveBeenCalledOnce()
  })

  it('should call onPrevFile when k is pressed', () => {
    const onPrevFile = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onPrevFile }))

    fireKey('k')
    expect(onPrevFile).toHaveBeenCalledOnce()
  })

  it('should call onToggleComment when c is pressed', () => {
    const onToggleComment = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onToggleComment }))

    fireKey('c')
    expect(onToggleComment).toHaveBeenCalledOnce()
  })

  it('should call onEscape when Escape is pressed', () => {
    const onEscape = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onEscape }))

    fireKey('Escape')
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('should not fire handlers when disabled', () => {
    const onNextFile = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onNextFile, enabled: false }))

    fireKey('j')
    expect(onNextFile).not.toHaveBeenCalled()
  })

  it('should ignore shortcuts when typing in an input', () => {
    const onNextFile = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onNextFile }))

    fireKey('j', { tagName: 'INPUT' } as Partial<HTMLElement>)
    expect(onNextFile).not.toHaveBeenCalled()
  })

  it('should ignore shortcuts when typing in a textarea', () => {
    const onNextFile = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onNextFile }))

    fireKey('j', { tagName: 'TEXTAREA' } as Partial<HTMLElement>)
    expect(onNextFile).not.toHaveBeenCalled()
  })

  it('should still fire Escape in inputs', () => {
    const onEscape = vi.fn()
    renderHook(() => useKeyboardShortcuts({ onEscape }))

    fireKey('Escape', { tagName: 'INPUT' } as Partial<HTMLElement>)
    expect(onEscape).toHaveBeenCalledOnce()
  })

  it('should clean up event listeners on unmount', () => {
    const onNextFile = vi.fn()
    const { unmount } = renderHook(() => useKeyboardShortcuts({ onNextFile }))

    unmount()
    fireKey('j')
    expect(onNextFile).not.toHaveBeenCalled()
  })
})

describe('keyboardShortcuts constant', () => {
  it('should export keyboard shortcut descriptions', () => {
    expect(keyboardShortcuts).toHaveLength(4)
    expect(keyboardShortcuts[0]).toEqual({ key: 'j', description: 'Next file' })
  })
})
