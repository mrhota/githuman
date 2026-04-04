import { describe, it } from 'node:test'
import assert from 'node:assert'
import { createEventBus } from '../../../src/server/adapters/event-bus.ts'
import type { EventType } from '../../../src/server/ports.ts'

describe('EventBus adapter', () => {
  it('should deliver events to registered listeners', async () => {
    const bus = createEventBus()
    const received: Array<{ type: EventType; data: unknown }> = []

    bus.on((type, data) => {
      received.push({ type, data })
    })

    await bus.emit('todos', { action: 'created' })

    assert.strictEqual(received.length, 1)
    assert.strictEqual(received[0].type, 'todos')
    assert.deepStrictEqual(received[0].data, { action: 'created' })

    await bus.close()
  })

  it('should deliver events to multiple listeners', async () => {
    const bus = createEventBus()
    let count = 0

    bus.on(() => { count++ })
    bus.on(() => { count++ })

    await bus.emit('reviews')

    assert.strictEqual(count, 2)

    await bus.close()
  })

  it('should stop delivering events after removeListener', async () => {
    const bus = createEventBus()
    const received: EventType[] = []

    const listener = (type: EventType) => {
      received.push(type)
    }

    bus.on(listener)
    await bus.emit('comments')

    bus.removeListener(listener)
    await bus.emit('todos')

    assert.strictEqual(received.length, 1)
    assert.strictEqual(received[0], 'comments')

    await bus.close()
  })

  it('should remove all listeners on close', async () => {
    const bus = createEventBus()
    let count = 0

    bus.on(() => { count++ })
    bus.on(() => { count++ })

    await bus.close()
    await bus.emit('files')

    assert.strictEqual(count, 0)
  })
})
