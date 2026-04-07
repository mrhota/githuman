/**
 * Service factory plugin — centralizes service construction
 */
import type { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { getDatabase } from '../db/index.ts'
import { ReviewService } from '../services/review.service.ts'
import { CommentService } from '../services/comment.service.ts'
import { ExportService } from '../services/export.service.ts'
import { GitService, type GitServiceLogger } from '../services/git.service.ts'
import { createGitAdapter } from '../adapters/git.ts'
import { ReviewRepository } from '../repositories/review.repo.ts'
import { ReviewFileRepository } from '../repositories/review-file.repo.ts'
import { CommentRepository } from '../repositories/comment.repo.ts'
import { TodoRepository } from '../repositories/todo.repo.ts'

export interface ServiceFactories {
  review: (log?: GitServiceLogger) => ReviewService
  comment: () => CommentService
  export: () => ExportService
  git: (log?: GitServiceLogger) => GitService
  todoRepo: () => TodoRepository
}

const servicesPlugin: FastifyPluginAsync = async (fastify) => {
  const services: ServiceFactories = {
    review: (log?) => {
      const db = getDatabase()
      return new ReviewService(
        new ReviewRepository(db),
        new ReviewFileRepository(db),
        new GitService(createGitAdapter(fastify.config.repositoryPath), fastify.config.repositoryPath, log),
      )
    },
    comment: () => {
      const db = getDatabase()
      return new CommentService(
        new CommentRepository(db),
        new ReviewRepository(db),
      )
    },
    export: () => {
      const db = getDatabase()
      return new ExportService(
        new ReviewRepository(db),
        new ReviewFileRepository(db),
        new CommentRepository(db),
      )
    },
    git: (log?) => new GitService(createGitAdapter(fastify.config.repositoryPath), fastify.config.repositoryPath, log),
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
