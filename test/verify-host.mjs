import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  collectSessionIds,
  deleteSessions,
  handleDeleteRequest,
  handleStatusRequest,
  isSafeSessionId,
  locateSessionDir,
  moveToTrash,
  normalizeRetentionDays,
  parseTrashStamp,
  purgeExpiredTrash,
  removeProjectionCache,
} from '../lib/index.js'

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-safe-session-delete-'))
const home = path.join(tmp, 'home')
const sessionsRoot = path.join(home, 'sessions')
const project = path.join(sessionsRoot, '--D-deepseek--')
const trashRoot = path.join(home, 'session-trash')
const homePath = (...parts) => path.join(home, ...parts)

async function writeSession(id, parentSession) {
  const dir = path.join(project, id)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, 'session.v4.jsonl.zstd'), `log:${id}`)
  return { header: { id, ...(parentSession === undefined ? {} : { parentSession }) } }
}

try {
  assert.equal(isSafeSessionId('session-0f00'), true)
  assert.equal(isSafeSessionId('custom.id_1'), true)
  assert.equal(isSafeSessionId('../escape'), false)
  assert.equal(isSafeSessionId('a/b'), false)
  assert.equal(isSafeSessionId('a\\b'), false)
  assert.equal(isSafeSessionId('.'), false)
  assert.equal(isSafeSessionId(''), false)
  assert.equal(isSafeSessionId(undefined), false)

  assert.equal(normalizeRetentionDays(undefined), 30)
  assert.equal(normalizeRetentionDays({ retentionDays: 0 }), 0)
  assert.equal(normalizeRetentionDays({ retentionDays: '7' }), 7)
  assert.equal(normalizeRetentionDays({ retentionDays: 99999 }), 3650)
  assert.equal(normalizeRetentionDays({ retentionDays: 'bad' }), 30)
  assert.equal(
    parseTrashStamp('2026-10-31T05-38-57-352Z'),
    Date.UTC(2026, 9, 31, 5, 38, 57, 352),
  )
  assert.equal(parseTrashStamp('not-a-stamp'), null)

  const oldBatch = path.join(trashRoot, '2026-01-01T00-00-00-000Z')
  const freshBatch = path.join(trashRoot, '2026-10-30T00-00-00-000Z')
  const foreignDir = path.join(trashRoot, 'keep-me')
  for (const directory of [oldBatch, freshBatch, foreignDir]) {
    await fs.mkdir(directory, { recursive: true })
  }
  const purged = await purgeExpiredTrash(homePath, 30, Date.parse('2026-10-31T00:00:00Z'))
  assert.deepEqual(purged.removed, ['2026-01-01T00-00-00-000Z'])
  await assert.rejects(fs.stat(oldBatch))
  assert.ok((await fs.stat(freshBatch)).isDirectory())
  assert.ok((await fs.stat(foreignDir)).isDirectory())
  assert.deepEqual((await purgeExpiredTrash(homePath, 0, Date.now())).removed, [])

  const rootRow = await writeSession('session-root')
  const childRow = await writeSession('session-child', 'session-root')
  const grandRow = await writeSession('session-grand', 'session-child')
  const otherRow = await writeSession('session-other')
  const rows = [rootRow, childRow, grandRow, otherRow]
  assert.deepEqual(collectSessionIds('session-root', rows), [
    'session-root',
    'session-child',
    'session-grand',
  ])

  assert.equal(await locateSessionDir(sessionsRoot, 'session-root'), path.join(project, 'session-root'))
  assert.equal(await locateSessionDir(sessionsRoot, '../x'), null)
  assert.equal(await locateSessionDir(sessionsRoot, 'session-missing'), null)

  const moved = await moveToTrash(path.join(project, 'session-other'), trashRoot, 'session-other')
  assert.equal(await fs.readFile(path.join(moved, 'session.v4.jsonl.zstd'), 'utf8'), 'log:session-other')
  await assert.rejects(fs.stat(path.join(project, 'session-other')))

  const cacheDir = path.join(home, 'storages', 'session_projcache', 'sessions')
  await fs.mkdir(cacheDir, { recursive: true })
  await fs.writeFile(path.join(cacheDir, 'session-root.json'), '{}')
  await fs.writeFile(path.join(cacheDir, 'session-root.json.bak.1'), '{}')
  await fs.writeFile(path.join(cacheDir, 'session-keep.json'), '{}')
  assert.deepEqual((await removeProjectionCache(path.join(home, 'storages'), 'session-root')).sort(), [
    'session-root.json',
    'session-root.json.bak.1',
  ])
  assert.equal(await fs.readFile(path.join(cacheDir, 'session-keep.json'), 'utf8'), '{}')

  const events = []
  const fakeCtx = {
    dshHomePath: homePath,
    get(name) {
      if (name === 'sessionQuery') return { listSessions: async () => rows }
      if (name === 'workspaceRegistry') {
        return {
          archivedSessionIds: [],
          archiveSession: async () => {},
        }
      }
      if (name === 'sessionPersistence') return { flush: async () => {} }
      return undefined
    },
    logger: { warn() {}, debug() {} },
    emit(event, id) {
      events.push([event, id])
    },
  }

  const response = await handleDeleteRequest(
    fakeCtx,
    new Request('http://127.0.0.1/api/dsh-safe-session-delete/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 'session-root' }),
    }),
  )
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.equal(payload.ok, true)
  assert.deepEqual(payload.deleted.sort(), ['session-child', 'session-grand', 'session-root'])
  assert.equal(payload.moved.length, 3)
  assert.ok(Array.isArray(payload.purged))
  for (const id of ['session-root', 'session-child', 'session-grand']) {
    await assert.rejects(fs.stat(path.join(project, id)))
  }
  await assert.rejects(fs.stat(path.join(cacheDir, 'session-root.json')))
  assert.deepEqual(events.map(([, id]) => id).sort(), [
    'session-child',
    'session-grand',
    'session-root',
  ])

  const status = handleStatusRequest(
    fakeCtx,
    new Request('http://127.0.0.1/api/dsh-safe-session-delete/status'),
    { retentionDays: 30 },
  )
  assert.deepEqual(await status.json(), { ok: true, retentionDays: 30 })

  const missing = await handleDeleteRequest(
    fakeCtx,
    new Request('http://127.0.0.1/api/dsh-safe-session-delete/delete', {
      method: 'POST',
      body: JSON.stringify({ sessionId: 'session-missing' }),
    }),
  )
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).error.code, 'NOT_FOUND')

  const bad = await handleDeleteRequest(
    fakeCtx,
    new Request('http://127.0.0.1/api/dsh-safe-session-delete/delete', {
      method: 'POST',
      body: JSON.stringify({ sessionId: '../etc/passwd' }),
    }),
  )
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error.code, 'BAD_REQUEST')

  await assert.rejects(deleteSessions(fakeCtx, 'session-nope'), { code: 'NOT_FOUND' })

  console.log('host verification passed')
} finally {
  await fs.rm(tmp, { recursive: true, force: true })
}
