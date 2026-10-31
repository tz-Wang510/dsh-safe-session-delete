# Changelog

## [0.2.0] - 2026-10-31

### Added

- **Trash retention policy.** Trash batches older than 30 days are removed automatically at Host startup and once a day while the Host runs.
- **Manual cleanup.** The Settings page shows the active retention window and offers a "Clean expired trash" button.
- **Retention routes.** `GET /api/dsh-safe-session-delete/status` and `POST /api/dsh-safe-session-delete/purge-trash`.
- **Package rename.** Published name is `dsh-safe-session-delete`; the earlier local name was already taken on npm.

### Changed

- Removed the development-only diagnostic probe and localStorage markers.
- Settings page now keeps the session list and trash controls in one place.

## [0.1.3] - 2026-10-31

### Fixed

- **React error #310.** The row action no longer calls an optional slot hook conditionally, so the delete entry is not dropped from the session row.
- The current session can be deleted; it closes and reloads the page after confirmation.

### Added

- Hover `×` action on session rows.
- Settings → Session management page.
- Custom menu button rendering instead of relying on an optional primitive.

## [0.1.0] - 2026-10-31

### Added

- Session row `...` menu entry.
- Host-side archive, live-session detach, persistence flush, log move to `session-trash`, projection-cache cleanup, and subagent subtree collection.
