# Changelog

All notable changes to this module are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 3.1.0-beta.1

### Changed

- **Migrated to `@companion-module/base` v2.x and `@companion-module/tools` v3.x.** This is now an ESM-only module and **requires Companion v4.3 or later** (previously tested against Companion v4.2 / `@companion-module/base` v1.x). If you're on an older Companion version, keep using module version `3.0.1`.
- Bootstrapping switched from the removed `runEntrypoint()` call to a default class export plus a named `UpgradeScripts` export.
- `setVariableDefinitions()` now takes an object keyed by variable id instead of an array.
- Presets restructured for the new preset API: the `category` field was removed from individual presets and replaced by a separate section `structure` passed to `setPresetDefinitions(structure, presets)`; preset `type: 'button'` renamed to `'simple'`.
- `checkFeedbacks()` with no arguments is no longer valid; replaced with `checkAllFeedbacks()` to preserve the previous "recheck everything" behavior.
- Device config fields (`host`, `domain`) are now required strings instead of optional, to satisfy the new `JsonObject`-based config typing.
- Build output converted to pure ESM (`package.json` `"type": "module"`, TypeScript targets the `node22` ESM toolchain).

### Fixed

- Removed an unreachable `case 0xFFFF` branch in the PBAU response parser — a signed 16-bit read can never produce `0xFFFF` (only `-1` for the same bytes), so that branch never ran.
- Fixed unhandled/misused promises in the sequence timecode polling loop and in `setPollSequences()`.
- Corrected `runtime.type` in the manifest from `node18` to `node22` to match the module's actual `engines.node` requirement.
- Added the required top-level `"type": "connection"` field to the manifest (missing before, and required by current manifest validation).

### Added

- `eslint.config.mjs` so `yarn lint` actually runs — the project referenced ESLint 9 but shipped no config since its initial commit.
- `.gitattributes` enforcing LF line endings, to stop Windows checkouts silently reintroducing CRLF and breaking lint/prettier.
- Feedbacks documented in the README/HELP (they were already implemented, but the docs still said "no feedback implementation yet").

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
