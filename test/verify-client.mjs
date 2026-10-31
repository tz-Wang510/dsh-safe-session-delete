import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import vm from 'node:vm'

const source = await fs.readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

let plugin
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
  useEffect: (effect) => {
    effect()
  },
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
}

const calls = []
const sandbox = {
  window: {
    __ModuleLoader__: {
      load({ factory }) {
        plugin = factory((id) => {
          if (id === 'react') return React
          if (id === '@deepseek-ai/dsh-client-ui-primitives') {
            return { MenuItemButton: 'MenuItemButton' }
          }
          throw new Error(`unexpected require: ${id}`)
        })
      },
    },
  },
  document: {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: () => {} },
  },
  console,
  fetch: async (url, init) => {
    calls.push({ url, init })
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, deleted: ['session-1'] }),
    }
  },
}
vm.runInNewContext(source, sandbox)

assert.equal(typeof plugin.apply, 'function')
assert.deepEqual(Array.from(plugin.inject), ['slots', 'locale', 'sessions'])

const registrations = []
const locales = []
let refreshed = 0
const ctx = {
  effect: (fn) => fn(),
  locale: {
    register: (namespace, dictionaries) => {
      locales.push({ namespace, dictionaries })
      return () => {}
    },
  },
  slots: {
    inject: (name, fn) => {
      assert.ok(
        name === 'sidebar.workspaces.session.menu.item' ||
          name === 'sidebar.workspaces.session.row.action' ||
          name === 'settings.section',
        `unexpected slot ${name}`,
      )
      fn()
    },
    register: (registration, component) => {
      registrations.push({ registration, component })
      return () => {}
    },
  },
  sessions: {
    refresh: async () => {
      refreshed += 1
    },
    list: {
      ids: [],
      byId: {},
      subscribe: () => () => {},
      getSnapshot: () => ({ ids: [], byId: {} }),
    },
  },
}

plugin.apply(ctx)
assert.equal(registrations.length, 3)
assert.equal(locales.length, 1)
assert.equal(locales[0].namespace, 'dsh-safe-session-delete')
assert.deepEqual(Object.keys(locales[0].dictionaries), ['en', 'zh'])

const menuEntry = registrations.find((entry) => entry.registration.name === 'sidebar.workspaces.session.menu.item')
const rowEntry = registrations.find((entry) => entry.registration.name === 'sidebar.workspaces.session.row.action')
const settingsEntry = registrations.find((entry) => entry.registration.name === 'settings.section')
assert.ok(menuEntry)
assert.ok(rowEntry)
assert.ok(settingsEntry)
const { registration, component } = menuEntry
assert.equal(registration.id, 'dsh-safe-session-delete.delete')
assert.equal(registration.order, 500)
assert.equal(typeof registration.inject, 'function')
assert.equal(rowEntry.registration.id, 'dsh-safe-session-delete.delete-row')
assert.equal(rowEntry.registration.order, 150)
assert.equal(settingsEntry.registration.id, 'dsh-safe-session-delete.manager')
assert.equal(settingsEntry.registration.label, '会话管理 / Sessions')

const face = registration.inject()
assert.equal(typeof face.deleteSession, 'function')
assert.equal(typeof face.isCurrentSession, 'function')

await face.deleteSession('session-1')
const deleteCalls = calls.filter((call) => {
  try {
    return JSON.parse(call.init.body).sessionId === 'session-1'
  } catch {
    return false
  }
})
assert.equal(deleteCalls.length, 1)
assert.equal(deleteCalls[0].url, '/api/dsh-safe-session-delete/delete')
assert.equal(deleteCalls[0].init.method, 'POST')
assert.deepEqual(JSON.parse(deleteCalls[0].init.body), { sessionId: 'session-1' })
assert.equal(deleteCalls[0].init.credentials, 'same-origin')
assert.equal(refreshed, 1)

sandbox.fetch = async () => ({
  ok: false,
  status: 500,
  json: async () => ({ ok: false, error: { code: 'DELETE_FAILED', message: 'boom' } }),
})
await assert.rejects(face.deleteSession('session-1'), /boom/)
assert.equal(refreshed, 1)

let menuClosed = false
const baseProps = {
  sessionId: 'session-1',
  displayTitle: 'Demo',
  useMenuOpenState: () => [false, (value) => { menuClosed = value === false }],
  useSessions: () => ({ byId: { 'session-1': { retainedBy: { mainView: 1 } } } }),
  deleteSession: async () => {},
  t: (key) => key,
}
const currentElement = component(baseProps)
assert.equal(currentElement.type, 'button')
assert.match(currentElement.props.className, /dsd-menu-item/)
assert.deepEqual(currentElement.children, ['delete'])

const element = component({
  ...baseProps,
  useSessions: () => ({ byId: { 'session-1': { retainedBy: { mainView: 0 } } } }),
})
assert.equal(element.type, 'button')
assert.match(element.props.className, /dsd-menu-item/)
assert.deepEqual(element.children, ['delete'])

// The hover button renders the same action as a compact row control.
const rowButton = rowEntry.component(baseProps)
assert.equal(rowButton.type, 'button')
assert.match(rowButton.props.className, /dsd-row-button/)
assert.deepEqual(rowButton.children, ['×'])

// The menu item also renders when the slot omits optional hooks and translator.
const fallbackElement = component({
  sessionId: 'session-1',
  displayTitle: 'Demo',
  deleteSession: async () => {},
})
assert.equal(fallbackElement.type, 'button')
assert.deepEqual(fallbackElement.children, ['删除会话'])

const settingsElement = settingsEntry.component({
  deleteSession: async () => {},
  sessionsStore: ctx.sessions.list,
  t: (key) => key,
})
assert.equal(settingsElement.type, 'div')
assert.match(settingsElement.props.className, /dsd-page/)

console.log('client verification passed')
