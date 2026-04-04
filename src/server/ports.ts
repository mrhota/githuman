/**
 * SPI ports for side effects — enables deterministic testing
 */

export type Clock = () => string
export type IdGenerator = () => string

export const systemClock: Clock = () => new Date().toISOString()
export const systemIdGenerator: IdGenerator = () => crypto.randomUUID()
