# dsh-safe-session-delete

Recoverable session deletion for DeepSeek Harness (DSH) 0.2.x.

DSH ships archive but no delete. This plugin adds deletion without discarding the
log immediately: the session is archived, detached from the live Host, flushed,
and moved to a trash folder. Projection-cache rows and subagent subtrees are
cleaned with it. Trash batches older than 30 days are removed automatically.

[中文](README.md) | English

## Features

- Session row `...` menu entry.
- Hover `×` button on the session row.
- **Settings → Session management / Sessions** page listing every session.
- Confirmation dialog; the current session closes and the page reloads after
  deletion.
- Logs move to `<DSH_HOME>/session-trash/<timestamp>/<project>/<session-id>/`.
- Projection cache (`storages/session_projcache/sessions/<id>.json`) and
  subagent log directories are removed with the parent.
- Trash retention: 30 days by default, swept at startup and once a day.
- Owner-authenticated Host routes; no runtime npm dependencies; no outbound
  network calls.

## Install

From the `v0.2.0` GitHub Release:

```bash
dsh plugin --profile <profile> add "https://github.com/tz-Wang510/dsh-safe-session-delete/releases/download/v0.2.0/dsh-safe-session-delete-0.2.0.tgz"
```

If pnpm reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE` on Windows, set
`NODE_OPTIONS=--use-system-ca` for the command.

Restart DSH after installation. An npm package is not published yet.

## Usage

1. Hover a session row and click `...` → **Delete session**, or click the red
   `×`, or open **Settings → Session management**.
2. Confirm.
3. The row disappears from the sidebar.

## Trash and retention

```text
<DSH_HOME>/session-trash/
```

On Windows this is usually `C:\Users\<you>\.dsh\session-trash\`.

The default retention is 30 days. It is configurable in the profile patch:

```yaml
- id: dsh-safe-session-delete
  name: dsh-safe-session-delete
  config:
    retentionDays: 30
```

`retentionDays: 0` disables automatic cleanup. The Settings page shows the
active window and offers a manual **Clean expired trash** action.

## Host routes

```http
POST /api/dsh-safe-session-delete/delete
Content-Type: application/json

{ "sessionId": "session-xxxx" }
```

```http
GET  /api/dsh-safe-session-delete/status
POST /api/dsh-safe-session-delete/purge-trash
```

All routes are mounted through `connection.fetch.register` and use the same
browser-token / signed-cookie authentication as the built-in API.

## Compatibility

- Tested on Windows with DSH `0.2.1-rc.5` in a real browser.
- Target range: DSH `>=0.2.1-rc.5 <0.3.0-0`, Node.js >= 20.
- Linux and macOS have not been manually verified. The unit suite is
  platform-neutral and runs on Node 20 / 22 / 24.

## Security

- Session ids are validated as one safe path segment.
- Retention only removes direct children of the trash root whose names match
  this plugin's timestamp format; unrelated directories are left alone.
- No telemetry, no remote config, no auto-updater.
- See [SECURITY.md](SECURITY.md) for the threat model and reporting.

## Limitations

- Depends on the default JSONL layout at `dshHomePath('sessions')`. A custom
  `session-persistence-jsonl.root` is not discovered automatically.
- This is a best-effort file operation, not an official persistence API.
  Archive + detach + flush is not a transaction.
- Retention runs only while DSH is running; a long-idle installation keeps old
  batches until the next start.
- No in-app undo. To restore, move the directory from the trash back to its
  original project folder and restart DSH.
- DSH's plugin API is still preview software; a storage-layout change can require
  an update.

## Test

```bash
npm test
```

## License

MIT. See [LICENSE](LICENSE), [CHANGELOG.md](CHANGELOG.md), and
[PUBLISHING.md](PUBLISHING.md).
