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

export interface GitPort {
  revparse (args: string[]): Promise<string>
  status (): Promise<GitStatusResult>
  diff (args: string[]): Promise<string>
  show (args: string[]): Promise<string>
  showBinary (args: string[]): Promise<Buffer>
  add (args: string[]): Promise<void>
  reset (args: string[]): Promise<void>
  branch (args: string[]): Promise<string>
  getRemotes (): Promise<GitRemote[]>
  getConfigValue (key: string): Promise<string | null>
  raw (args: string[]): Promise<string>
  statusPorcelain (): Promise<string>
}

export interface GitStatusResult {
  staged: string[]
  modified: string[]
  created: string[]
  deleted: string[]
  renamed: Array<{ from: string; to: string }>
  notAdded: string[]
}

export interface GitRemote {
  name: string
  refs?: { fetch?: string; push?: string }
}

export interface ChangeDetector {
  start (): Promise<void>
  stop (): Promise<void>
  checkNow (): Promise<void>
}
