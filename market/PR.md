Adds `dsh-safe-session-delete`, a recoverable session-deletion plugin for DSH 0.2.x.

- Session row `...` menu, hover `×`, and Settings → Session management.
- Logs move to `<DSH_HOME>/session-trash/`; projection cache and subagent logs are cleaned with the parent.
- Trash batches older than 30 days are removed at startup and once a day; `retentionDays` is configurable and `0` disables the sweep.
- Owner-authenticated routes; no runtime npm dependencies and no outbound network calls.
- Prebuilt tarball attached to `v0.2.0`; installable with `dsh plugin add <release-tgz>`.
- Tested on Windows with DSH `0.2.1-rc.5`; the unit suite is platform-neutral.

Repo: https://github.com/tz-Wang510/dsh-safe-session-delete
