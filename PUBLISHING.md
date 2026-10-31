# Publishing checklist

This file is for maintainers. The plugin is functionally ready for a GitHub
release, but "risk-free" is not a claim anyone can make for a plugin that moves
and deletes files. The checklist below makes the remaining risks explicit.

## What is already in place

- MIT license, `LICENSE`, `CHANGELOG.md`, `SECURITY.md`.
- Zero runtime npm dependencies, no outbound network calls.
- Owner-only HTTP routes mounted through `connection.fetch.register`.
- Path-segment validation for session ids and a trash-only retention sweep.
- Unit tests for deletion, trash movement, cache cleanup, retention, and the
  browser registration/request flow.
- GitHub Actions matrix for Node 20 / 22 / 24.
- `npm pack --dry-run` produces a 9-file package without tests or CI files.

## Name check

`dsh-safe-session-delete` was free on the public npm registry on 2026-10-31.
Do not publish under `dsh-session-delete`: that name belongs to another author.
Similar existing packages include `dsh-session-trash`, `dsh-session-recycle`,
`dsh-session-recycle-bin`, and `dsh-session-delete`; mention only your own
package, and do not copy their code or README text.

## Before the first public release

1. Run `npm test` on Windows, Linux, and macOS. Only Windows + DSH
   `0.2.1-rc.5` has been exercised in a real browser so far.
2. Run the isolated-host smoke test once per supported DSH release:
   - install into a throwaway profile;
   - delete a copied session;
   - confirm the log is under `session-trash`;
   - confirm the original directory and projection cache are gone;
   - restart once and confirm the sidebar row stays gone.
3. Update the screenshot in `docs/`, the compatibility table in `README.md`,
   and `CHANGELOG.md`.
4. Check that no local path, token, user name, or session id is present in the
   repository (`git grep -n "C:\\\\Users"`, `git grep -n "session-"`).
5. Create the GitHub repository, push `main`, and enable private vulnerability
   reporting / Security Advisories.
6. `npm pack --dry-run` once more, then `npm publish --access public`.
7. Verify the published package with a clean install:
   `dsh plugin --profile web add dsh-safe-session-delete`.
8. For the DSH market, open a PR against
   [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
   (the market reads that registry; do not PR the market app repository).

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
