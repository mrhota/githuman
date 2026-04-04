import { EventEmitter } from 'node:events'
import type { EventBus, EventType } from '../ports.ts'

export function createEventBus (): EventBus {
  const ee = new EventEmitter()
  return {
    async emit (type: EventType, data?: unknown) {
      ee.emit('event', type, data)
    },
    on (listener) {
      ee.on('event', listener)
    },
    removeListener (listener) {
      ee.removeListener('event', listener)
    },
    async close () {
      ee.removeAllListeners()
    },
  }
}
