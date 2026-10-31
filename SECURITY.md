# Security policy

## What this plugin can do

`dsh-safe-session-delete` is deliberately destructive, although recoverable by default:

- It archives a session and detaches it from the running Host.
- It moves the session's log directory from `<DSH_HOME>/sessions/...` to
  `<DSH_HOME>/session-trash/<timestamp>/...`.
- It deletes the session's projection-cache record.
- After 30 days (configurable), it permanently removes old trash batches.
- It never reads session message contents and never sends data off the machine.

## Trust boundaries

- The HTTP routes are mounted through `ctx.connection.fetch.register` and use the
  same browser-token / signed-cookie authentication as the built-in API. Exact
  routes answer `403` to a non-owner Peer.
- The plugin has no runtime npm dependencies and makes no outbound network calls.
- Session ids are validated as one safe path segment; only directories directly
  under the configured session trash root whose names match the plugin's own
  timestamp format are auto-purged.
- The plugin is a local Host plugin. Anyone who can write to the profile's
  `node_modules` or `cordis.patch.yml` can already run arbitrary code with the
  same privileges, so that is outside this plugin's trust boundary.

## Known operational risks

- Deleting a running session relies on archive + detach and can race with work
  that has not settled yet. The plugin stops the turn, flushes persistence, and
  waits briefly before moving files, but this is not a transactional guarantee.
- A custom `session-persistence-jsonl.root` outside the default
  `<DSH_HOME>/sessions` is not discovered automatically.
- The plugin targets DSH `0.2.x`. DSH's plugin API is still preview software; a
  future storage-layout change can require an update.
- Trash is a plain directory. If another program moves files into it with a
  matching timestamp name, the retention sweep will treat them as its own.

## Reporting

Please report suspected vulnerabilities privately through the repository's
GitHub Security Advisories tab rather than a public issue. Include the DSH
version, OS, and a minimal reproduction. Do not attach real session logs.
