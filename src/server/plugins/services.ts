/**
 * Service factory plugin — centralizes service construction
 */
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { getDatabase } from '../db/index.ts'
import { ReviewService } from '../services/review.service.ts'
import { CommentService } from '../services/comment.service.ts'
import { ExportService } from '../services/export.service.ts'
import { GitService } from '../services/git.service.ts'
import { TodoRepository } from '../repositories/todo.repo.ts'

export interface ServiceFactories {
  review: () => ReviewService
  comment: () => CommentService
  export: () => ExportService
  git: () => GitService
  todoRepo: () => TodoRepository
}

const servicesPlugin: FastifyPluginAsync = async (fastify) => {
  const services: ServiceFactories = {
    review: () => new ReviewService(getDatabase(), fastify.config.repositoryPath),
    comment: () => new CommentService(getDatabase()),
    export: () => new ExportService(getDatabase()),
    git: () => new GitService(fastify.config.repositoryPath),
    todoRepo: () => new TodoRepository(getDatabase()),
  }

  fastify.decorate('services', services)
}

export default fp(servicesPlugin, {
  name: 'services',
  dependencies: ['auth'], // registered after config is decorated
})

declare module 'fastify' {
  interface FastifyInstance {
    services: ServiceFactories
  }
}
