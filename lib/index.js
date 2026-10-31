/**
 * dsh-safe-session-delete — host half.
 *
 * DeepSeek Harness deliberately ships archive but not delete. This plugin adds
 * one authenticated route that removes a stored session without ever touching
 * a live writer: it archives the session, detaches a live Session object when
 * present, flushes persistence, and only then moves the session directory to a
 * recoverable trash folder. The projection-cache row is removed as well so a
 * later list refresh cannot resurrect the deleted row from a stale hint.
 */
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-safe-session-delete'
export const inject = ['connection']

export const ROUTE = '/api/dsh-safe-session-delete/delete'
export const PURGE_ROUTE = '/api/dsh-safe-session-delete/purge-trash'
export const STATUS_ROUTE = '/api/dsh-safe-session-delete/status'
export const DEFAULT_RETENTION_DAYS = 30

const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const RETRYABLE_RENAME = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY'])
const TRASH_STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/
const DAY_MS = 24 * 60 * 60 * 1000

/** A typed failure whose `code` is safe to return to the browser. */
export class SessionDeleteError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SessionDeleteError'
    this.code = code
  }
}

/** Return whether `value` is a safe single path segment for a session id. */
export function isSafeSessionId(value) {
  return (
    typeof value === 'string' &&
    value !== '.' &&
    value !== '..' &&
    SESSION_ID.test(value)
  )
}

/** Resolve the host's `dshHomePath(...)` helper, with an environment fallback. */
export function resolveHomePath(ctx) {
  try {
    if (typeof ctx?.dshHomePath === 'function') return ctx.dshHomePath
    const service = ctx?.get?.('dshHomePath', false)
    if (typeof service === 'function') return service
  } catch {
    // Fall through to the environment fallback.
  }
  const home = process.env.DSH_HOME
  if (typeof home === 'string' && home !== '') {
    return (...parts) => path.join(home, ...parts)
  }
  return (...parts) => path.join(os.homedir(), '.dsh', ...parts)
}

async function isDirectory(target) {
  try {
    return (await fs.stat(target)).isDirectory()
  } catch {
    return false
  }
}

/**
 * Locate a session's on-disk directory. The shipped JSONL backend stores it as
 * `<root>/<normalized-cwd>/<session-id>`; the direct child form is accepted too
 * so a future flat backend keeps working.
 */
export async function locateSessionDir(root, sessionId) {
  if (!isSafeSessionId(sessionId)) return null
  const direct = path.join(root, sessionId)
  if (await isDirectory(direct)) return direct
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(root, entry.name, sessionId)
    if (await isDirectory(candidate)) return candidate
  }
  return null
}

/** Flatten a SessionQuery list row into `{ id, parentSession }` facts. */
function headerFacts(row) {
  const header = row?.header ?? row
  const id = header?.id
  const parent = header?.parentSession ?? header?.parent
  if (typeof id !== 'string' || id === '') return null
  return {
    id,
    parentSession: typeof parent === 'string' && parent !== '' ? parent : undefined,
  }
}

/**
 * Return the requested id followed by every descendant discoverable from the
 * persisted headers. Subagent sessions are hidden in the sidebar but still own
 * their own log directory, so they are deleted with their parent.
 */
export function collectSessionIds(rootId, rows) {
  const ids = [rootId]
  const seen = new Set(ids)
  const parentOf = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const facts = headerFacts(row)
    if (facts?.parentSession !== undefined) parentOf.set(facts.id, facts.parentSession)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const [id, parent] of parentOf) {
      if (!seen.has(parent) || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
      changed = true
    }
  }
  return ids
}

async function listRows(ctx) {
  const query = ctx.get?.('sessionQuery')
  if (typeof query?.listSessions !== 'function') return []
  try {
    const rows = await query.listSessions()
    return Array.isArray(rows) ? rows : []
  } catch (error) {
    ctx.logger?.debug?.(`dsh-safe-session-delete: listSessions failed: ${String(error)}`)
    return []
  }
}

/**
 * Move one session directory into the trash root. A cross-device rename falls
 * back to copy-then-remove; the destination keeps the project folder name.
 */
export async function moveToTrash(source, trashRoot, sessionId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const project = path.basename(path.dirname(source)) || 'session'
  let destination = path.join(trashRoot, stamp, project, sessionId)
  try {
    await fs.access(destination)
    destination = `${destination}-${Math.random().toString(36).slice(2, 8)}`
  } catch {
    // Destination does not exist yet: the normal case.
  }
  await fs.mkdir(path.dirname(destination), { recursive: true })

  let lastError
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await fs.rename(source, destination)
      return destination
    } catch (error) {
      lastError = error
      if (error?.code === 'EXDEV') {
        await fs.cp(source, destination, { recursive: true, force: false, errorOnExist: true })
        await fs.rm(source, { recursive: true, force: true })
        return destination
      }
      if (!RETRYABLE_RENAME.has(error?.code)) throw error
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)))
    }
  }
  throw lastError
}

/**
 * Parse the timestamp folder name produced by {@link moveToTrash}.
 * @returns epoch milliseconds, or null for a foreign directory name.
 */
export function parseTrashStamp(name) {
  const match = TRASH_STAMP.exec(name)
  if (match === null) return null
  const [, year, month, day, hour, minute, second, millisecond] = match
  const at = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond),
  )
  return Number.isFinite(at) ? at : null
}

/** Normalize the `retentionDays` plugin config; 0 disables automatic cleanup. */
export function normalizeRetentionDays(config) {
  const raw = Number(config?.retentionDays)
  if (!Number.isFinite(raw)) return DEFAULT_RETENTION_DAYS
  return Math.min(3650, Math.max(0, Math.trunc(raw)))
}

/**
 * Remove trash batches older than the retention window. Only direct children
 * whose names match this plugin's timestamp format are considered, so an
 * unrelated folder placed in the trash root is never deleted.
 * @returns {Promise<{ removed: string[], kept: number }>}
 */
export async function purgeExpiredTrash(homePath, retentionDays, now = Date.now()) {
  const days = Number.isFinite(retentionDays) ? retentionDays : DEFAULT_RETENTION_DAYS
  if (days <= 0) return { removed: [], kept: 0 }
  const trashRoot = homePath('session-trash')
  let entries
  try {
    entries = await fs.readdir(trashRoot, { withFileTypes: true })
  } catch {
    return { removed: [], kept: 0 }
  }
  const cutoff = now - days * DAY_MS
  const removed = []
  let kept = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const at = parseTrashStamp(entry.name)
    if (at === null) continue
    if (at > cutoff) {
      kept += 1
      continue
    }
    try {
      await fs.rm(path.join(trashRoot, entry.name), { recursive: true, force: true })
      removed.push(entry.name)
    } catch {
      // A batch may be locked by an external process; retry on the next sweep.
      kept += 1
    }
  }
  return { removed, kept }
}

/** Remove the projection-cache checkpoint (and skipped backups) for one id. */
export async function removeProjectionCache(storagesRoot, sessionId) {
  const directory = path.join(storagesRoot, 'session_projcache', 'sessions')
  let entries
  try {
    entries = await fs.readdir(directory)
  } catch {
    return []
  }
  const removed = []
  for (const entry of entries) {
    if (entry !== `${sessionId}.json` && !entry.startsWith(`${sessionId}.json.bak.`)) continue
    try {
      await fs.rm(path.join(directory, entry), { force: true })
      removed.push(entry)
    } catch (error) {
      // A locked cache file is harmless: the authoritative log is gone.
      void error
    }
  }
  return removed
}

function detachLiveSession(ctx, sessionId) {
  const sessions = ctx.get?.('sessions')
  if (typeof sessions?.get !== 'function') return false
  const session = sessions.get(sessionId)
  if (session === undefined) return false
  try {
    const entry = sessions.liveEntryFor(session)
    sessions.detachEntered(entry)
    return true
  } catch (error) {
    ctx.logger?.warn?.(
      `dsh-safe-session-delete: could not detach live session "${sessionId}": ${String(error)}`,
    )
    return false
  }
}

async function archiveSession(ctx, sessionId) {
  const registry = ctx.get?.('workspaceRegistry')
  if (typeof registry?.archiveSession !== 'function') return false
  try {
    if (registry.archivedSessionIds?.includes?.(sessionId)) return true
    await registry.archiveSession(sessionId, { stopActivity: true })
    return true
  } catch (error) {
    // Archive is best-effort: a detached/unknown session may reject here while
    // the log directory is still perfectly deletable.
    ctx.logger?.debug?.(
      `dsh-safe-session-delete: archive "${sessionId}" skipped: ${String(error)}`,
    )
    return false
  }
}

async function flushPersistence(ctx) {
  const persistence = ctx.get?.('sessionPersistence')
  if (typeof persistence?.flush !== 'function') return
  try {
    await persistence.flush()
  } catch (error) {
    ctx.logger?.warn?.(`dsh-safe-session-delete: persistence flush failed: ${String(error)}`)
  }
}

/**
 * Delete one session and its descendants from disk.
 * @returns {{ deleted: string[], moved: string[], purged: string[] }}
 */
export async function deleteSessions(ctx, sessionId, options = {}) {
  if (!isSafeSessionId(sessionId)) {
    throw new SessionDeleteError('BAD_REQUEST', 'invalid session id')
  }
  const homePath = resolveHomePath(ctx)
  const root = homePath('sessions')
  const trashRoot = homePath('session-trash')
  const storagesRoot = homePath('storages')
  const retentionDays = normalizeRetentionDays(options)

  const sessions = ctx.get?.('sessions')
  const isLive = typeof sessions?.get === 'function' && sessions.get(sessionId) !== undefined
  const locatedRoot = await locateSessionDir(root, sessionId)
  if (!isLive && locatedRoot === null) {
    throw new SessionDeleteError('NOT_FOUND', `session "${sessionId}" was not found`)
  }

  const rows = await listRows(ctx)
  const ids = collectSessionIds(sessionId, rows)

  await archiveSession(ctx, sessionId)
  for (const id of ids) detachLiveSession(ctx, id)
  await flushPersistence(ctx)
  // `session/disposed` starts an asynchronous drain/close in the persistence
  // backend; give it a moment before asking Windows to move the directory.
  await new Promise((resolve) => setTimeout(resolve, 120))

  const deleted = []
  const moved = []
  for (const id of [...ids].reverse()) {
    const directory = await locateSessionDir(root, id)
    if (directory !== null) {
      try {
        moved.push(await moveToTrash(directory, trashRoot, id))
      } catch (error) {
        throw new SessionDeleteError(
          'DELETE_FAILED',
          `could not move session "${id}" to trash: ${error?.message ?? String(error)}`,
        )
      }
    }
    await removeProjectionCache(storagesRoot, id)
    if (directory !== null || id === sessionId) deleted.push(id)
    try {
      ctx.emit?.('api-session/removed', id)
    } catch {
      // The controller may be unloading; the deletion itself still stands.
    }
  }

  return { deleted: deleted.reverse(), moved, purged: await purgeQuietly(homePath, retentionDays, ctx) }
}

async function purgeQuietly(homePath, retentionDays, ctx) {
  try {
    return (await purgeExpiredTrash(homePath, retentionDays)).removed
  } catch (error) {
    ctx.logger?.warn?.(`dsh-safe-session-delete: trash purge failed: ${String(error)}`)
    return []
  }
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

export function errorResponse(status, code, message) {
  return jsonResponse({ ok: false, error: { code, message } }, status)
}

export async function handleDeleteRequest(ctx, request, options = {}) {
  let payload
  try {
    payload = await request.json()
  } catch {
    return errorResponse(400, 'BAD_JSON', 'request body must be JSON')
  }
  const sessionId = payload?.sessionId
  if (!isSafeSessionId(sessionId)) {
    return errorResponse(400, 'BAD_REQUEST', 'missing or invalid sessionId')
  }
  try {
    const result = await deleteSessions(ctx, sessionId, options)
    return jsonResponse({ ok: true, ...result })
  } catch (error) {
    if (error instanceof SessionDeleteError) {
      const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'BAD_REQUEST' ? 400 : 500
      return errorResponse(status, error.code, error.message)
    }
    ctx.logger?.warn?.(`dsh-safe-session-delete: delete "${sessionId}" failed: ${String(error)}`)
    return errorResponse(500, 'INTERNAL', error?.message ?? String(error))
  }
}

export async function handlePurgeRequest(ctx, _request, options = {}) {
  const retentionDays = normalizeRetentionDays(options)
  try {
    const result = await purgeExpiredTrash(resolveHomePath(ctx), retentionDays)
    return jsonResponse({ ok: true, retentionDays, ...result })
  } catch (error) {
    ctx.logger?.warn?.(`dsh-safe-session-delete: purge failed: ${String(error)}`)
    return errorResponse(500, 'PURGE_FAILED', error?.message ?? String(error))
  }
}

export function handleStatusRequest(_ctx, _request, options = {}) {
  return jsonResponse({ ok: true, retentionDays: normalizeRetentionDays(options) })
}

/**
 * Cordis entry point. Routes are registered inside an injected effect so they
 * appear exactly when the Host connection service is available and disappear
 * with the plugin fiber.
 */
export function apply(ctx, config = {}) {
  const retentionDays = normalizeRetentionDays(config)
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = connectionCtx.get('connection')
    if (typeof connection?.fetch?.register !== 'function') {
      connectionCtx.logger?.warn?.(
        'dsh-safe-session-delete: connection.fetch.register is unavailable; delete route not mounted',
      )
      return
    }
    const options = { retentionDays }
    const register = (path, methods, fetch, requestBody) =>
      connection.fetch.register({
        path,
        methods,
        ...(requestBody === undefined ? {} : { requestBody }),
        fetch,
      })

    connectionCtx.effect(
      () =>
        register(ROUTE, ['POST'], (request) => handleDeleteRequest(connectionCtx, request, options), 'buffered'),
      'dsh-safe-session-delete: delete route',
    )
    connectionCtx.effect(
      () =>
        register(
          PURGE_ROUTE,
          ['POST'],
          (request) => handlePurgeRequest(connectionCtx, request, options),
          'buffered',
        ),
      'dsh-safe-session-delete: purge route',
    )
    connectionCtx.effect(
      () =>
        register(STATUS_ROUTE, ['POST'], (request) => handleStatusRequest(connectionCtx, request, options), 'buffered'),
      'dsh-safe-session-delete: status route',
    )

    // Retention runs once at startup and then once a day while the Host lives.
    const homePath = resolveHomePath(connectionCtx)
    const sweep = () => {
      purgeExpiredTrash(homePath, retentionDays).catch((error) => {
        connectionCtx.logger?.warn?.(`dsh-safe-session-delete: trash sweep failed: ${String(error)}`)
      })
    }
    sweep()
    connectionCtx.effect(() => {
      const timer = setInterval(sweep, DAY_MS)
      timer.unref?.()
      return () => clearInterval(timer)
    }, 'dsh-safe-session-delete: retention timer')
  })
}
