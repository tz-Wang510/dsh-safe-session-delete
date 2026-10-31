// dsh-safe-session-delete — browser half.
//
// Loaded through DSH's Module Loader (`window.__ModuleLoader__`), the same lane
// used by other packaged client plugins. It adds one entry to the Session row
// "..." menu, confirms, calls the host route, and refreshes the session list.
window.__ModuleLoader__.load({
  id: 'dsh-safe-session-delete',
  factory: (require) => {
    const React = require('react')

    const NS = 'dsh-safe-session-delete'
    const MENU_SLOT = 'sidebar.workspaces.session.menu.item'
    const ROW_SLOT = 'sidebar.workspaces.session.row.action'
    const SETTINGS_SLOT = 'settings.section'
    const ROUTE = '/api/dsh-safe-session-delete/delete'
    const PURGE_ROUTE = '/api/dsh-safe-session-delete/purge-trash'
    const STATUS_ROUTE = '/api/dsh-safe-session-delete/status'

    const en = {
      delete: 'Delete session',
      deleting: 'Deleting…',
      confirm:
        'Delete “{title}” permanently?\n\n' +
        'The session log will be moved to the session trash folder, its projection cache will be cleared, ' +
        'and the row will disappear from the sidebar. This cannot be undone from the app.',
      confirmCurrent:
        '“{title}” is the session currently open in the main view.\n\n' +
        'Deleting it closes this conversation immediately, clears the saved selection, and reloads the page. ' +
        'The log is moved to the session trash folder. Continue?',
      failed: 'Could not delete the session: {message}',
      managerTitle: 'Session management',
      managerLead:
        'Delete sessions you no longer need. The log moves to the session trash folder and the row disappears from the sidebar.',
      empty: 'No sessions.',
      retention: 'Trash is kept for {days} days, then cleaned automatically.',
      retentionOff: 'Automatic trash cleanup is disabled.',
      purgeNow: 'Clean expired trash',
      purging: 'Cleaning…',
      purged: 'Removed {count} expired trash batch(es).',
      purgeFailed: 'Could not clean the trash: {message}',
    }

    const zh = {
      delete: '删除会话',
      deleting: '正在删除…',
      confirm:
        '确定要删除“{title}”吗？\n\n' +
        '会话日志会移入会话回收站，投影缓存会被清理，侧边栏中的这一行将消失。' +
        '此操作无法在应用内撤销。',
      confirmCurrent:
        '“{title}”是当前主视图打开的会话。\n\n' +
        '删除后本次对话会立即关闭，当前选择会被清除并刷新页面；日志会移入会话回收站。' +
        '确定继续吗？',
      failed: '删除会话失败：{message}',
      managerTitle: '会话管理',
      managerLead: '删除不再需要的会话。日志会移入会话回收站，侧边栏中的对应行会消失。',
      empty: '没有会话。',
      retention: '回收站自动保留 {days} 天，过期后自动清理。',
      retentionOff: '自动清理已关闭。',
      purgeNow: '清理过期回收站',
      purging: '正在清理…',
      purged: '已清理 {count} 个过期回收站批次。',
      purgeFailed: '清理回收站失败：{message}',
    }

    let stylesReady = false
    function ensureStyles() {
      if (stylesReady || typeof document === 'undefined') return
      stylesReady = true
      if (document.querySelector('style[data-plugin-css="dsh-safe-session-delete/menu.css"]')) return
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-safe-session-delete'
      style.dataset.pluginCss = 'dsh-safe-session-delete/menu.css'
      style.textContent = `
.dsd-menu-item{display:flex;align-items:center;box-sizing:border-box;width:100%;background:transparent;border:0;border-radius:6px;padding:6px 10px;font:inherit;font-size:13px;line-height:1.5;text-align:left;color:var(--dsw-alias-state-error-primary,#e5484d);cursor:pointer}
.dsd-menu-item:hover,.dsd-menu-item:focus-visible{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 12%,transparent);outline:none}
.dsd-menu-item:disabled{opacity:.55;cursor:default}
.dsd-menu-item-sep{border-top:1px solid var(--dsw-alias-border-l1,transparent);border-radius:0 0 6px 6px;margin-top:4px;padding-top:7px}
.dsd-row-button{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:15px;line-height:1;cursor:pointer}
.dsd-row-button:hover,.dsd-row-button:focus-visible{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 14%,transparent);color:var(--dsw-alias-state-error-primary,#e5484d);outline:none}
.dsd-row-button:disabled{opacity:.5;cursor:default}
.dsd-page{display:flex;flex-direction:column;gap:12px;padding:2px 0 24px;color:var(--dsw-alias-label-primary);font-size:13px}
.dsd-page-lead{margin:0;color:var(--dsw-alias-label-secondary);line-height:1.6}
.dsd-session-list{display:flex;flex-direction:column;gap:6px}
.dsd-session-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.dsd-session-main{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
.dsd-session-title{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsd-session-meta{color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsd-session-delete{flex:none;padding:4px 10px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 45%,transparent);border-radius:6px;background:transparent;color:var(--dsw-alias-state-error-primary,#e5484d);font:inherit;font-size:12px;cursor:pointer}
.dsd-session-delete:hover:enabled{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 12%,transparent)}
.dsd-session-delete:disabled{opacity:.55;cursor:default}
.dsd-empty{padding:16px;text-align:center;color:var(--dsw-alias-label-secondary)}
.dsd-toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dsd-retention{flex:1;min-width:0;color:var(--dsw-alias-label-secondary);font-size:12px}
.dsd-message{padding:7px 10px;border-radius:6px;font-size:12px;line-height:1.5}
.dsd-message-ok{color:var(--dsw-alias-state-success-primary);background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)}
.dsd-message-err{color:var(--dsw-alias-state-error-primary,#e5484d);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#e5484d) 10%,transparent)}
`
      document.head.appendChild(style)
    }

    // Shared behavior for the "..." menu entry and the compact hover button.
    // Deliberately only one hook: optional slot hooks must never be called
    // conditionally, or React drops the entry with error #310.
    function useDeleteSession(props) {
      const {
        sessionId,
        displayTitle,
        isCurrentSession,
        deleteSession,
        t,
      } = props
      const [busy, setBusy] = React.useState(false)

      const tr = (key, vars) => {
        let text
        if (typeof t === 'function') {
          text = t(key, vars)
        } else {
          text = (zh[key] ?? en[key] ?? key)
          for (const [name, value] of Object.entries(vars ?? {})) {
            text = text.replaceAll(`{${name}}`, String(value))
          }
        }
        return text
      }

      const run = async (event) => {
        event?.stopPropagation?.()
        const title = displayTitle || sessionId
        const current =
          typeof isCurrentSession === 'function' ? isCurrentSession(sessionId) : false
        const message = tr(current ? 'confirmCurrent' : 'confirm', { title })
        if (typeof window !== 'undefined' && !window.confirm(message)) return
        setBusy(true)
        try {
          await deleteSession(sessionId)
          if (current && typeof window !== 'undefined') {
            // The selected conversation no longer exists. Drop the remembered
            // selection so the reload lands on a fresh, valid page.
            try {
              window.localStorage.removeItem('dsh.sessions.current')
            } catch {
              // Storage can be unavailable; the reload still clears the live view.
            }
            window.location.reload()
          }
        } catch (error) {
          const detail = error?.message ?? String(error)
          if (typeof window !== 'undefined') window.alert(tr('failed', { message: detail }))
        } finally {
          setBusy(false)
        }
      }

      return { busy, run, tr }
    }

    function DeleteSessionRow(props) {
      const action = useDeleteSession(props)
      const menuState = typeof props.useMenuOpenState === 'function' ? props.useMenuOpenState() : [false, () => {}]
      const setMenuOpen = typeof menuState?.[1] === 'function' ? menuState[1] : () => {}
      ensureStyles()
      const label = action.busy ? action.tr('deleting') : action.tr('delete')
      return React.createElement(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          className: 'dsd-menu-item dsd-menu-item-sep',
          disabled: action.busy,
          onClick: (event) => {
            setMenuOpen(false)
            return action.run(event)
          },
        },
        label,
      )
    }

    function DeleteSessionRowButton(props) {
      const action = useDeleteSession(props)
      ensureStyles()
      const label = action.busy ? action.tr('deleting') : action.tr('delete')
      return React.createElement(
        'button',
        {
          type: 'button',
          className: 'dsd-row-button',
          title: label,
          'aria-label': label,
          disabled: action.busy,
          onClick: action.run,
        },
        '×',
      )
    }

    function SessionManagerSection(props) {
      ensureStyles()
      const { deleteSession, sessionsStore, getRetention, purgeTrash, t } = props
      const tr = (key, vars) => {
        let text
        if (typeof t === 'function') {
          text = t(key, vars)
        } else {
          text = (zh[key] ?? en[key] ?? key)
          for (const [name, value] of Object.entries(vars ?? {})) {
            text = text.replaceAll(`{${name}}`, String(value))
          }
        }
        return text
      }
      const snapshot = React.useSyncExternalStore(
        (listener) => sessionsStore.subscribe(listener),
        () => sessionsStore.getSnapshot(),
      )
      const [busyId, setBusyId] = React.useState(null)
      const [retentionDays, setRetentionDays] = React.useState(30)
      const [purgeBusy, setPurgeBusy] = React.useState(false)
      const [purgeMessage, setPurgeMessage] = React.useState(null)

      React.useEffect(() => {
        let alive = true
        if (typeof getRetention === 'function') {
          getRetention()
            .then((days) => {
              if (alive) setRetentionDays(Number(days) || 0)
            })
            .catch(() => {})
        }
        return () => {
          alive = false
        }
      }, [])
      const rows = (snapshot?.ids ?? [])
        .map((id) => ({ id, row: snapshot.byId?.[id] }))
        .filter((entry) => entry.row !== undefined)
        .sort(
          (left, right) =>
            (right.row.updatedAt ?? right.row.createdAt ?? 0) -
            (left.row.updatedAt ?? left.row.createdAt ?? 0),
        )

      const remove = async (id, row) => {
        const title = row.title || id
        const current = (row.retainedBy?.mainView ?? 0) > 0
        if (typeof window !== 'undefined' && !window.confirm(tr(current ? 'confirmCurrent' : 'confirm', { title }))) {
          return
        }
        setBusyId(id)
        try {
          await deleteSession(id)
        } catch (error) {
          const detail = error?.message ?? String(error)
          if (typeof window !== 'undefined') window.alert(tr('failed', { message: detail }))
        } finally {
          setBusyId(null)
        }
      }

      const runPurge = async () => {
        if (purgeBusy || typeof purgeTrash !== 'function') return
        setPurgeBusy(true)
        setPurgeMessage(null)
        try {
          const result = await purgeTrash()
          setPurgeMessage({
            kind: 'ok',
            text: tr('purged', { count: result?.removed?.length ?? 0 }),
          })
        } catch (error) {
          const detail = error?.message ?? String(error)
          setPurgeMessage({ kind: 'err', text: tr('purgeFailed', { message: detail }) })
        } finally {
          setPurgeBusy(false)
        }
      }

      return React.createElement(
        'div',
        { className: 'dsd-page' },
        React.createElement('p', { className: 'dsd-page-lead' }, tr('managerLead')),
        React.createElement(
          'div',
          { className: 'dsd-toolbar' },
          React.createElement(
            'span',
            { className: 'dsd-retention' },
            retentionDays > 0 ? tr('retention', { days: retentionDays }) : tr('retentionOff'),
          ),
          React.createElement(
            'button',
            {
              type: 'button',
              className: 'dsd-session-delete',
              disabled: purgeBusy,
              onClick: runPurge,
            },
            purgeBusy ? tr('purging') : tr('purgeNow'),
          ),
        ),
        purgeMessage
          ? React.createElement('div', { className: 'dsd-message dsd-message-' + purgeMessage.kind }, purgeMessage.text)
          : null,
        rows.length === 0
          ? React.createElement('div', { className: 'dsd-empty' }, tr('empty'))
          : React.createElement(
              'div',
              { className: 'dsd-session-list' },
              ...rows.map(({ id, row }) => {
                const title = row.title || id
                const when = row.updatedAt ?? row.createdAt
                return React.createElement(
                  'div',
                  { className: 'dsd-session-row', key: id },
                  React.createElement(
                    'div',
                    { className: 'dsd-session-main' },
                    React.createElement('span', { className: 'dsd-session-title', title }, title),
                    React.createElement(
                      'span',
                      { className: 'dsd-session-meta' },
                      id + (typeof when === 'number' ? ` · ${new Date(when).toLocaleString()}` : ''),
                    ),
                  ),
                  React.createElement(
                    'button',
                    {
                      type: 'button',
                      className: 'dsd-session-delete',
                      disabled: busyId === id,
                      onClick: () => remove(id, row),
                    },
                    busyId === id ? tr('deleting') : tr('delete'),
                  ),
                )
              }),
            ),
      )
    }

    function apply(ctx) {
      try {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-safe-session-delete: dictionaries')

        const readJson = async (response) => {
          let payload = null
          try {
            payload = await response.json()
          } catch {
            payload = null
          }
          if (!response.ok || payload?.ok !== true) {
            throw new Error(payload?.error?.message || `HTTP ${response.status}`)
          }
          return payload
        }

        const deleteSession = async (sessionId) => {
          const response = await fetch(ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ sessionId }),
          })
          await readJson(response)
          try {
            await ctx.sessions.refresh()
            // A stale baseline can keep the removed row for one frame; reloading
            // is the safe last resort and also clears any retained history view.
            if (ctx.sessions.list.getSnapshot().byId[sessionId] !== undefined) {
              if (typeof window !== 'undefined') window.location.reload()
            }
          } catch (error) {
            // The session is already gone on disk; a failed baseline refresh only
            // delays the visual update until the next list read.
            console.warn('[dsh-safe-session-delete] session list refresh failed', error)
            if (typeof window !== 'undefined') window.location.reload()
          }
        }

        const getRetention = async () => {
          const response = await fetch(STATUS_ROUTE, { credentials: 'same-origin' })
          const payload = await readJson(response)
          return Number(payload.retentionDays) || 0
        }

        const purgeTrash = async () => {
          const response = await fetch(PURGE_ROUTE, {
            method: 'POST',
            credentials: 'same-origin',
          })
          return readJson(response)
        }

        const isCurrentSession = (sessionId) => {
          try {
            const row = ctx.sessions.list.getSnapshot().byId[sessionId]
            return (row?.retainedBy?.mainView ?? 0) > 0
          } catch {
            return false
          }
        }

        const actionInjected = () => ({ deleteSession, isCurrentSession })

        ctx.slots.inject(MENU_SLOT, () =>
          ctx.slots.register(
            {
              name: MENU_SLOT,
              id: 'dsh-safe-session-delete.delete',
              order: 500,
              locale: NS,
              inject: actionInjected,
            },
            DeleteSessionRow,
          ),
        )

        ctx.slots.inject(ROW_SLOT, () =>
          ctx.slots.register(
            {
              name: ROW_SLOT,
              id: 'dsh-safe-session-delete.delete-row',
              order: 150,
              locale: NS,
              inject: actionInjected,
            },
            DeleteSessionRowButton,
          ),
        )

        ctx.slots.inject(SETTINGS_SLOT, () =>
          ctx.slots.register(
            {
              name: SETTINGS_SLOT,
              id: 'dsh-safe-session-delete.manager',
              order: 40,
              label: '会话管理 / Sessions',
              locale: NS,
              inject: () => ({
                deleteSession,
                sessionsStore: ctx.sessions.list,
                getRetention,
                purgeTrash,
              }),
            },
            SessionManagerSection,
          ),
        )
      } catch (error) {
        console.error('[dsh-safe-session-delete] apply failed', error)
        throw error
      }
    }

    return { apply, inject: ['slots', 'locale', 'sessions'] }
  },
})
