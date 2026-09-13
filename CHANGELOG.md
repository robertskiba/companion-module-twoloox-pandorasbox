# Changelog

All notable changes to this module are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 3.1.1-beta.4

### Fixed

- Fixed the next-cue mode letter shown in `sequence_<id>_nextcue` / `sequence_<id>_nextcue_mode` (e.g. "P"/"C"/"S"/"J"/"W"): the numeric mode values reported by the device for this field don't follow the 0=Pause..4=Wait ordering used elsewhere - confirmed empirically, the real mapping is 1=Play, 2=Stop, 3=Pause, 4=Jump, 5=Wait. Previously Pause showed as "J", Jump as "W", and Wait as "?".
- The module no longer gets stuck permanently disconnected. Previously, if the TCP connection dropped (e.g. Pandoras Box Manager was closed and restarted) or the initial connection attempt failed, the module would report an error status and never try again until the config was re-saved. It now automatically retries every 10 seconds until the connection succeeds.
- Fixed a deadlock: if any sequence ever returned an error response to a status poll (e.g. it had been deleted), the module would stop updating transport-status and opacity variables/feedbacks for *all* sequences, permanently, until reconnected.
- Fixed "Remaining cue under threshold" feedback: it read from a value that was never actually updated, so it always evaluated as true regardless of the real countdown. It's now a per-sequence feedback (like "Sequence Transport State") backed by the working per-sequence countdown data. Existing uses of this feedback will need the new "Sequence" option set.
- Fixed feedback definitions never being refreshed once sequences were discovered: any feedback's "Sequence" dropdown (e.g. "Sequence Transport State", "Remaining cue under threshold") stayed stuck on the "Sequence 1 (not connected)" placeholder forever instead of listing the real sequences, even though the equivalent action/preset dropdowns updated correctly.
- Fixed a narrow race where re-triggering "Sequence Opacity Fade" for the same sequence in very quick succession could leave two fades running concurrently against each other instead of the newer one cleanly replacing the older.
- Removed unreachable code paths left over from earlier refactors (an unused main-connection handler for a command that's only ever sent per-sequence, and unused constants).

### Added

- New config option "Log protocol traffic (debug)" (off by default) to control the protocol-traffic hex dump logging added in 3.1.0 — previously always on, now opt-in per connection (still also requires the connection's Companion log level set to Debug to actually see it).

## [3.1.0] - 2026-09-12

### Added

- **New action "Sequence Opacity Fade"**: smoothly fades a sequence's visibility in or out over a configurable duration (ms) to a target opacity (0-100%), with a choice of curve (Linear — recommended — Ease In, Ease Out, Ease In-Out, S-Curve). Runs in the background without blocking Companion and times accurately regardless of duration; retriggering a fade for the same sequence cancels the one in progress.
  - Uses the device's `GetSequenceTransparency`/`SetSequenceTransparency` commands. On v8.11.3, these use different native scales — reads are linear 0-65535, writes only take visible effect in 0-255 — which the module accounts for internally; percentages in the UI are always 0-100%.
- New live-updating variable `sequence_<id>_opacity` (0-100%) reflecting each sequence's current visibility, polled alongside the existing transport-status polling.
- Raw PBAU protocol traffic (every sent/received message, as a hex dump with the decoded command name) is now logged at the module's `debug` log level — set the connection's log level to Debug in Companion to capture a trace for troubleshooting.
- `eslint.config.mjs` so `yarn lint` actually runs — the project referenced ESLint 9 but shipped no config since its initial commit.
- `.gitattributes` enforcing LF line endings, to stop Windows checkouts silently reintroducing CRLF and breaking lint/prettier.
- Feedbacks documented in the README/HELP (they were already implemented, but the docs still said "no feedback implementation yet").

### Changed

- **Migrated to `@companion-module/base` v2.x and `@companion-module/tools` v3.x.** This is now an ESM-only module and **requires Companion v4.3 or later** (previously tested against Companion v4.2 / `@companion-module/base` v1.x). If you're on an older Companion version, keep using module version `3.0.1`.
- Bootstrapping switched from the removed `runEntrypoint()` call to a default class export plus a named `UpgradeScripts` export.
- `setVariableDefinitions()` now takes an object keyed by variable id instead of an array.
- Presets restructured for the new preset API: the `category` field was removed from individual presets and replaced by a separate section `structure` passed to `setPresetDefinitions(structure, presets)`; preset `type: 'button'` renamed to `'simple'`.
- `checkFeedbacks()` with no arguments is no longer valid; replaced with `checkAllFeedbacks()` to preserve the previous "recheck everything" behavior.
- Device config fields (`host`, `domain`) are now required strings instead of optional, to satisfy the new `JsonObject`-based config typing.
- Build output converted to pure ESM (`package.json` `"type": "module"`, TypeScript targets the `node22` ESM toolchain).

### Fixed

- Fixed TCP message framing: a single `data` event from the socket could contain more than one PBAU message concatenated together (or only part of one), but the module assumed exactly one message per event and silently dropped/misparsed the rest. Incoming bytes are now buffered and split into complete messages using the length field in each message's header.
- Removed an unreachable `case 0xFFFF` branch in the PBAU response parser — a signed 16-bit read can never produce `0xFFFF` (only `-1` for the same bytes), so that branch never ran.
- Fixed unhandled/misused promises in the sequence timecode polling loop and in `setPollSequences()`.
- Corrected `runtime.type` in the manifest from `node18` to `node22` to match the module's actual `engines.node` requirement.
- Added the required top-level `"type": "connection"` field to the manifest (missing before, and required by current manifest validation).

## [3.0.1] - 2026-01-16

### Fixed

- Require a PBAU response from the device before reporting connection status as `Ok`.

### Changed

- Repository cleanup: stopped committing the built `dist/` output, added repository/issue links to the manifest.

## [3.0.0] - 2026-01-11

### Added

- Full TypeScript rewrite of the module.
- Countdown and "next cue info" variables.
- `HELP.md` in-app documentation.

### Changed

- Manifest and versioning cleanup following the rewrite.

## Earlier versions

Versions before the TypeScript rewrite (tagged `old-version-before-rewrite` and earlier) predate this changelog. See the git history and the legacy module id `chrisite-pandorasbox` for that lineage.
