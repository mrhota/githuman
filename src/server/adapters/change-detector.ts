import type { GitPort, EventBus, ChangeDetector } from '../ports.ts'

export function createChangeDetector (git: GitPort, eventBus: EventBus, intervalMs: number): ChangeDetector {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastOutput = ''
  let checking: Promise<void> | null = null
  let stopped = false

  async function check () {
    try {
      const current = await git.statusPorcelain()
      if (current !== lastOutput) {
        lastOutput = current
        eventBus.emit('files', { action: 'updated' })
      }
    } catch {
      // git status failed - skip this cycle
    }
  }

  function scheduleNext () {
    if (stopped) return
    timer = setTimeout(async () => {
      await check()
      scheduleNext()
    }, intervalMs)
  }

  return {
    async start () {
      stopped = false
      lastOutput = ''
      try {
        lastOutput = await git.statusPorcelain()
      } catch {
        // Initial capture failed - will detect on next poll
      }
      scheduleNext()
    },
    async stop () {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
    },
    async checkNow () {
      if (checking) return checking
      checking = check()
      try { await checking } finally { checking = null }
    },
  }
}
