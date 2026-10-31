# Publishing checklist

This file is for maintainers. The plugin is functionally ready for a GitHub
release, but "risk-free" is not a claim anyone can make for a plugin that moves
and deletes files. The checklist below makes the remaining risks explicit.

## Current release status (2026-10-31)

- Public repository: https://github.com/tz-Wang510/dsh-safe-session-delete
- Release `v0.2.0`:
  https://github.com/tz-Wang510/dsh-safe-session-delete/releases/tag/v0.2.0
- GitHub-tarball install verified with
  `dsh plugin --profile web add <release-tgz>` on Windows. This machine needed
  `NODE_OPTIONS=--use-system-ca` for pnpm's certificate chain.
- npm: **not published** — this machine has no npm login (`npm whoami` is
  unauthenticated). Do not run `npm publish` until `npm login` is complete.
- Market: entry prepared at
  `market/tz-Wang510__dsh-safe-session-delete.yml`. The registry requires the
  GitHub repository to be at least 1 day old, so submit the PR on or after
  2026-11-01.

## What is already in place

- MIT license, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`.
- Zero runtime npm dependencies, no outbound network calls.
- Owner-only HTTP routes mounted through `connection.fetch.register`.
- Path-segment validation for session ids and a trash-only retention sweep.
- Unit tests for deletion, trash movement, cache cleanup, retention, and the
  browser registration/request flow.
- CI matrix for Node 20 / 22 / 24, kept as `ci/github-actions.yml` because the
  current `gh` token has no `workflow` scope. Copy it to
  `.github/workflows/ci.yml` after granting that scope, then push.
- `npm pack --dry-run` produces a 9-file package without tests or CI files.

## Name check

`dsh-safe-session-delete` was free on the public npm registry on 2026-10-31.
Do not publish under `dsh-session-delete`: that name belongs to another author.
Similar existing packages include `dsh-session-trash`, `dsh-session-recycle`,
`dsh-session-recycle-bin`, and `dsh-session-delete`; mention only your own
package, and do not copy their code or README text.

## Remaining steps

1. Run `npm test` on Linux and macOS. Only Windows + DSH `0.2.1-rc.5` has been
   exercised in a real browser so far.
2. Enable private vulnerability reporting / Security Advisories on the GitHub
   repository.
3. If npm distribution is wanted: `npm login`, then
   `npm publish --access public`, then verify with
   `dsh plugin --profile web add dsh-safe-session-delete`.
4. On or after 2026-11-01, copy
   `market/tz-Wang510__dsh-safe-session-delete.yml` to
   `data/plugins/tz-Wang510__dsh-safe-session-delete.yml` in a fork of
   [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
   and open one PR. Do not edit the generated READMEs.
5. Optional: add a sanitized `screenshots.json` and screenshot assets. The
   earlier local screenshot was removed because it contained real session ids.
6. Re-run the isolated-host smoke test once per new supported DSH release.

## Known risks to disclose

- **Destructive file operations.** The plugin moves session directories and
  permanently removes trash batches older than the retention window.
- **Preview plugin API.** DSH `0.2.x` APIs may change; the package declares a
  tested range, but a future release can still require a patch.
- **Live-session race.** Archive + detach + flush is a best-effort handoff, not
  a transaction. The wait is short and work is stopped, but a hostile timing
  window cannot be fully eliminated from a plugin.
- **Custom storage root.** A non-default `session-persistence-jsonl.root` is not
  discovered automatically.
- **Retention is host-driven.** It runs at startup and every 24 hours; a DSH
  installation that is never started keeps old batches.
- **Market fit.** Four similar plugins already exist. Reviewers may consider the
  feature set duplicative; the distinguishing feature here is the 30-day
  retention window plus the three official-slot entry points, not a new
  deletion capability.

## Do not do

- Do not publish to npm before checking the name again (registry state changes).
- Do not claim "tested on all platforms" until CI and a manual macOS/Linux run
  actually cover it.
- Do not add telemetry, remote config, or an auto-updater without a new security
  review.
- Do not squash third-party code into `lib/` without preserving its license.
