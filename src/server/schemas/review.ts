/**
 * Shared TypeBox schemas for review-related types
 */
import { Type } from '@fastify/type-provider-typebox'

export const ReviewStatusSchema = Type.Union(
  [Type.Literal('in_progress'), Type.Literal('approved'), Type.Literal('changes_requested')],
  { description: 'Review status' }
)

export const ReviewSourceTypeSchema = Type.Union(
  [Type.Literal('staged'), Type.Literal('branch'), Type.Literal('commits')],
  { description: 'Review source type' }
)
