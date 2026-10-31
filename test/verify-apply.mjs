import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { apply, PURGE_ROUTE, ROUTE, STATUS_ROUTE } from '../lib/index.js'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-safe-session-delete-apply-'))
const home = path.join(tmp, 'home')
const homePath = (...parts) => path.join(home, ...parts)

try {
  const routes = []
  const effects = []
  const logger = { warn() {}, debug() {}, info() {} }
  const connection = {
    fetch: {
      register(options) {
        routes.push(options)
        return () => {}
      },
    },
  }
  const connectionCtx = {
    dshHomePath: homePath,
    logger,
    get(name) {
      return name === 'connection' ? connection : undefined
    },
    effect(callback) {
      const disposer = callback()
      if (typeof disposer === 'function') effects.push(disposer)
      return disposer
    },
  }
  const ctx = {
    dshHomePath: homePath,
    logger,
    inject(names, callback) {
      assert.deepEqual(names, ['connection'])
      callback(connectionCtx)
    },
    effect(callback) {
      return callback()
    },
  }

  apply(ctx, { retentionDays: 7 })
  await new Promise((resolve) => setTimeout(resolve, 30))

  assert.deepEqual(
    routes.map((route) => [route.path, route.methods]),
    [
      [ROUTE, ['POST']],
      [PURGE_ROUTE, ['POST']],
      [STATUS_ROUTE, ['GET']],
    ],
  )

  const statusRoute = routes.find((route) => route.path === STATUS_ROUTE)
  const status = await statusRoute.fetch(new Request(`http://127.0.0.1${STATUS_ROUTE}`))
  assert.deepEqual(await status.json(), { ok: true, retentionDays: 7 })

  const deleteRoute = routes.find((route) => route.path === ROUTE)
  const bad = await deleteRoute.fetch(
    new Request(`http://127.0.0.1${ROUTE}`, {
      method: 'POST',
      body: JSON.stringify({ sessionId: '../escape' }),
    }),
  )
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error.code, 'BAD_REQUEST')

  const purgeRoute = routes.find((route) => route.path === PURGE_ROUTE)
  const purge = await purgeRoute.fetch(
    new Request(`http://127.0.0.1${PURGE_ROUTE}`, { method: 'POST' }),
  )
  assert.deepEqual(await purge.json(), {
    ok: true,
    retentionDays: 7,
    removed: [],
    kept: 0,
  })

  for (const dispose of effects) dispose()
  console.log('apply verification passed')
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}
