/**
 * Comment API routes
 */
import { Type, type FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox'
import { CommentError } from '../services/comment.service.ts'
import { ErrorSchema, SuccessSchema } from '../schemas/common.ts'

const CommentSchema = Type.Object(
  {
    id: Type.String({ description: 'Unique identifier' }),
    reviewId: Type.String({ description: 'Associated review ID' }),
    filePath: Type.String({ description: 'File path' }),
    lineNumber: Type.Union([Type.Integer(), Type.Null()], {
      description: 'Line number (null for file-level comments)',
    }),
    lineType: Type.Union(
      [Type.Literal('added'), Type.Literal('removed'), Type.Literal('context'), Type.Null()],
      { description: 'Line type' }
    ),
    content: Type.String({ description: 'Comment content' }),
    suggestion: Type.Union([Type.String(), Type.Null()], {
      description: 'Code suggestion',
    }),
    resolved: Type.Boolean({ description: 'Resolution status' }),
    createdAt: Type.String({ format: 'date-time', description: 'Creation timestamp' }),
    updatedAt: Type.String({ format: 'date-time', description: 'Last update timestamp' }),
  },
  { description: 'Comment' }
)

const CommentsArraySchema = Type.Array(CommentSchema, {
  description: 'List of comments',
})

const CreateCommentSchema = Type.Object(
  {
    filePath: Type.String({ description: 'File path' }),
    lineNumber: Type.Optional(Type.Integer({ description: 'Line number' })),
    lineType: Type.Optional(
      Type.Union([Type.Literal('added'), Type.Literal('removed'), Type.Literal('context')])
    ),
    content: Type.String({ minLength: 1, description: 'Comment content' }),
    suggestion: Type.Optional(Type.String({ description: 'Code suggestion' })),
  },
  { description: 'Create comment request' }
)

const UpdateCommentSchema = Type.Object(
  {
    content: Type.Optional(Type.String({ minLength: 1, description: 'Updated content' })),
    suggestion: Type.Optional(Type.String({ description: 'Updated suggestion' })),
  },
  { description: 'Update comment request' }
)

const ReviewIdParamsSchema = Type.Object({
  reviewId: Type.String({ description: 'Review ID' }),
})

const CommentIdParamsSchema = Type.Object({
  id: Type.String({ description: 'Comment ID' }),
})

const FileQuerystringSchema = Type.Object({
  filePath: Type.Optional(Type.String({ description: 'Filter by file path' })),
})

const CommentStatsSchema = Type.Object(
  {
    total: Type.Integer({ description: 'Total comments' }),
    resolved: Type.Integer({ description: 'Resolved comments' }),
    unresolved: Type.Integer({ description: 'Unresolved comments' }),
    withSuggestions: Type.Integer({ description: 'Comments with suggestions' }),
  },
  { description: 'Comment statistics' }
)

const commentRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  /**
   * GET /api/reviews/:reviewId/comments
   * List all comments for a review, optionally filtered by file
   */
  fastify.get('/api/reviews/:reviewId/comments', {
    schema: {
      tags: ['comments'],
      summary: 'List comments for a review',
      description: 'Retrieve all comments for a review, optionally filtered by file path',
      params: ReviewIdParamsSchema,
      querystring: FileQuerystringSchema,
      response: {
        200: CommentsArraySchema,
      },
    },
  }, async (request, reply) => {
    const service = fastify.services.comment()
    const { reviewId } = request.params
    const { filePath } = request.query

    if (filePath) {
      return service.getByFile(reviewId, filePath)
    }

    return service.getByReview(reviewId)
  })

  /**
   * GET /api/reviews/:reviewId/comments/stats
   * Get comment statistics for a review
   */
  fastify.get('/api/reviews/:reviewId/comments/stats', {
    schema: {
      tags: ['comments'],
      summary: 'Get comment statistics',
      description: 'Get comment counts and breakdown for a review',
      params: ReviewIdParamsSchema,
      response: {
        200: CommentStatsSchema,
      },
    },
  }, async (request) => {
    const service = fastify.services.comment()
    return service.getStats(request.params.reviewId)
  })

  /**
   * POST /api/reviews/:reviewId/comments
   * Add a comment to a review
   */
  fastify.post('/api/reviews/:reviewId/comments', {
    schema: {
      tags: ['comments'],
      summary: 'Add a comment',
      description: 'Add a comment to a review, optionally on a specific line',
      params: ReviewIdParamsSchema,
      body: CreateCommentSchema,
      response: {
        201: CommentSchema,
        400: ErrorSchema,
        404: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const service = fastify.services.comment()

    try {
      const comment = service.create(request.params.reviewId, request.body)
      reply.code(201)
      return comment
    } catch (err) {
      if (err instanceof CommentError) {
        const statusCode = err.code === 'REVIEW_NOT_FOUND' ? 404 : 400
        return reply.code(statusCode).send({
          error: err.message,
          code: err.code,
        })
      }
      throw err
    }
  })

  /**
   * GET /api/comments/:id
   * Get a specific comment
   */
  fastify.get('/api/comments/:id', {
    schema: {
      tags: ['comments'],
      summary: 'Get a comment by ID',
      description: 'Retrieve a specific comment by its unique identifier',
      params: CommentIdParamsSchema,
      response: {
        200: CommentSchema,
        404: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const service = fastify.services.comment()
    const comment = service.getById(request.params.id)

    if (!comment) {
      return reply.code(404).send({
        error: 'Comment not found',
      })
    }

    return comment
  })

  /**
   * PATCH /api/comments/:id
   * Update a comment's content or suggestion
   */
  fastify.patch('/api/comments/:id', {
    schema: {
      tags: ['comments'],
      summary: 'Update a comment',
      description: 'Update the content or suggestion of a comment',
      params: CommentIdParamsSchema,
      body: UpdateCommentSchema,
      response: {
        200: CommentSchema,
        404: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const service = fastify.services.comment()
    const comment = service.update(request.params.id, request.body)

    if (!comment) {
      return reply.code(404).send({
        error: 'Comment not found',
      })
    }

    return comment
  })

  /**
   * DELETE /api/comments/:id
   * Delete a comment
   */
  fastify.delete('/api/comments/:id', {
    schema: {
      tags: ['comments'],
      summary: 'Delete a comment',
      description: 'Permanently delete a comment',
      params: CommentIdParamsSchema,
      response: {
        200: SuccessSchema,
        404: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const service = fastify.services.comment()
    const deleted = service.delete(request.params.id)

    if (!deleted) {
      return reply.code(404).send({
        error: 'Comment not found',
      })
    }

    return { success: true }
  })

  /**
   * POST /api/comments/:id/resolve
   * Mark a comment as resolved
   */
  fastify.post('/api/comments/:id/resolve', {
    schema: {
      tags: ['comments'],
      summary: 'Resolve a comment',
      description: 'Mark a comment as resolved',
      params: CommentIdParamsSchema,
      response: {
        200: CommentSchema,
        404: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const service = fastify.services.comment()
    const comment = service.resolve(request.params.id)

    if (!comment) {
      return reply.code(404).send({
        error: 'Comment not found',
      })
    }

    return comment
  })

  /**
   * POST /api/comments/:id/unresolve
   * Mark a comment as unresolved
   */
  fastify.post('/api/comments/:id/unresolve', {
    schema: {
      tags: ['comments'],
      summary: 'Unresolve a comment',
      description: 'Mark a comment as unresolved',
      params: CommentIdParamsSchema,
      response: {
        200: CommentSchema,
        404: ErrorSchema,
      },
    },
  }, async (request, reply) => {
    const service = fastify.services.comment()
    const comment = service.unresolve(request.params.id)

    if (!comment) {
      return reply.code(404).send({
        error: 'Comment not found',
      })
    }

    return comment
  })
}

export default commentRoutes
