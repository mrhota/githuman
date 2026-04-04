/**
 * SPI ports for side effects — enables deterministic testing
 */

export type Clock = () => string
export type IdGenerator = () => string

export const systemClock: Clock = () => new Date().toISOString()
export const systemIdGenerator: IdGenerator = () => crypto.randomUUID()

export type EventType = 'todos' | 'reviews' | 'comments' | 'files'

export interface EventBus {
  emit (type: EventType, data?: unknown): Promise<void>
  on (listener: (type: EventType, data?: unknown) => void): void
  removeListener (listener: (type: EventType, data?: unknown) => void): void
  close (): Promise<void>
}
