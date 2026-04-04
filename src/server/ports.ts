export type EventType = 'todos' | 'reviews' | 'comments' | 'files'

export interface EventBus {
  emit (type: EventType, data?: unknown): Promise<void>
  on (listener: (type: EventType, data?: unknown) => void): void
  removeListener (listener: (type: EventType, data?: unknown) => void): void
  close (): Promise<void>
}
