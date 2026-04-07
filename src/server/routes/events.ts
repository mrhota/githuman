/**
 * Server-Sent Events (SSE) routes for real-time updates
 * Uses EventBus port for local event dispatching
 * ChangeDetector lifecycle is managed by app.ts, not here
 */
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { SuccessSchema } from '../schemas/common.ts'
import type { EventType } from '../ports.ts'

// Re-export EventType so existing consumers don't break
export type { EventType } from '../ports.ts'

// Track connected clients for the /clients endpoint and graceful shutdown
let clientCount = 0
const activeConnections = new Set<{ close: () => void }>()

const NotifyBodySchema = Type.Object(
  {
    type: Type.Union([Type.Literal('todos'), Type.Literal('reviews'), Type.Literal('comments'), Type.Literal('files')], {
      description: 'Type of resource that changed',
    }),
    action: Type.Optional(
      Type.Union([
        Type.Literal('created'),
        Type.Literal('updated'),
        Type.Literal('deleted'),
      ])
    ),
  },
  { description: 'Notification payload' }
)

const eventsRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  const eventBus = fastify.eventBus

  // Clean up on server close
  fastify.addHook('onClose', async () => {
    // Close all active SSE connections
    fastify.log.info({ clients: activeConnections.size }, 'Closing active SSE connections')
    for (const connection of activeConnections) {
      try {
        connection.close()
      } catch {
        // Ignore errors when closing connections
      }
    }
    activeConnections.clear()

    // Close the event bus
    await eventBus.close()
  })

  /**
   * GET /api/events
   * SSE endpoint for real-time updates
   */
  fastify.get(
    '/api/events',
    {
      sse: true,
      schema: {
        tags: ['events'],
        summary: 'Subscribe to server-sent events',
        description:
          'Open an SSE connection to receive real-time updates when data changes',
      },
    },
    async (request, reply) => {
      clientCount++
      request.log.info({ clients: clientCount }, 'SSE client connected')

      // Track this connection for graceful shutdown
      const connection = { close: () => reply.sse.close() }
      activeConnections.add(connection)

      // Keep the connection alive
      reply.sse.keepAlive()

      // Send initial connection event
      await reply.sse.send({ data: { type: 'connected', timestamp: Date.now() } })

      // Subscribe to events from EventBus
      const listener = (type: EventType, data?: unknown) => {
        try {
          if (reply.sse.isConnected) {
            reply.sse.send({ data: { type, data, timestamp: Date.now() } })
          }
        } catch (err) {
          request.log.error({ err }, 'Error sending SSE event')
        }
      }

      eventBus.on(listener)

      // Clean up on disconnect
      reply.sse.onClose(() => {
        clientCount--
        activeConnections.delete(connection)
        eventBus.removeListener(listener)
        request.log.info({ clients: clientCount }, 'SSE client disconnected')
      })
    }
  )

  /**
   * POST /api/events/notify
   * Endpoint for CLI/external tools to trigger event broadcasts
   */
  fastify.post(
    '/api/events/notify',
    {
      schema: {
        tags: ['events'],
        summary: 'Broadcast an event notification',
        description:
          'Trigger a broadcast to all connected SSE clients. Used by CLI to notify UI of changes.',
        body: NotifyBodySchema,
        response: {
          200: SuccessSchema,
        },
      },
    },
    async (request) => {
      const { type, action } = request.body
      if (type === 'files') {
        await fastify.changeDetector.checkNow()
      } else {
        await eventBus.emit(type, { action })
      }
      request.log.info({ type, action, clients: clientCount }, 'Event broadcast')
      return { success: true }
    }
  )

  /**
   * GET /api/events/clients
   * Debug endpoint to see connected client count
   */
  fastify.get(
    '/api/events/clients',
    {
      schema: {
        tags: ['events'],
        summary: 'Get connected client count',
        description: 'Returns the number of currently connected SSE clients',
        response: {
          200: Type.Object({
            count: Type.Integer({ description: 'Number of connected clients' }),
          }),
        },
      },
    },
    async () => {
      return { count: clientCount }
    }
  )
}

export default eventsRoutes
