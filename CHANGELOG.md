# Changelog

All notable changes to this module are documented in this file.

## [3.1.7-beta.1] - 2026-11-09

Addresses the module review of 3.1.6.

### Added

- Set Playhead accepts times with the units `h`, `m`, `s` and `f` (frames), e.g. `2h3m5s`, `3m5s` or `5s10f`. Larger values are converted: `120m90s` = 2 hours 1 minute 30 seconds. Other units such as `ms` are ignored.
- Set Playhead explains its input formats in a tooltip and a short description below the Time field.

### Fixed

- Saving corrected connection settings (e.g. the right Domain) while the module was retrying could switch the connection back to the old settings a few seconds later. The connection then failed again until the settings were saved once more or the connection was disabled and enabled.
- After disabling the connection while it was retrying, the module could still try to connect once more.
- A connection that stops answering without being closed (e.g. network cable pulled, switch down, Pandoras Box not responding) is now detected after about 5 seconds and re-established automatically. Before, the status stayed OK with frozen values until the operating system gave up on the connection, which can take many minutes.
- Set Playhead: decimals such as `10.5`, input with spaces and other text are now ignored. Before, the other characters were dropped and the sequence jumped to an unexpected position (`10.5` went to 1 second 5 frames).

### Changed

- Unchanged countdown values are no longer sent to Companion again.

## [3.1.6] - 2026-11-03

First release in the Companion module library since 3.0.1, so it also includes all changes listed under 3.1.0 to 3.1.5 below. Requires Companion 5.0 or later. This version addresses the module review of 3.1.4.

### Changed

- The module now runs on Node.js 26, like the current module template.
- The fixed choice fields Transport, SMPTE Mode, Direction, Ignore, the Set Playhead mode and Fade Curve can no longer be switched to expression mode. In expression mode they expected internal codes, e.g. `3` for Pause.
- Unchanged timecode values are no longer sent to Companion again.

### Fixed

- "Remaining cue under threshold" feedbacks saved with 3.0.1 or earlier had no sequence and never became active. They are now set to sequence 1 automatically.

### Development

- Repository aligned with the module template: `package`, `format` and `postinstall` scripts (replacing `dist` and `prepare`), `LICENSE` instead of `LICENSE.txt`, `.prettierignore`, `.husky/pre-commit`, root-anchored `.gitignore` entries, and the `node.yaml` and `release.yaml` workflows. Publishing a GitHub release now attaches the package automatically.
- Action and feedback options are typed, so a wrong option id fails the build.

## [3.1.5] - 2026-11-02

Not published in the Companion module library.

### Changed

- Documentation: the in-app help now lists all actions, feedbacks and variables, the Companion requirement is corrected to 5.0 or later, and the port setting was removed from the documentation (the port is always 6211).

## [3.1.4] - 2026-10-30

Not published in the Companion module library. Version 3.1.3 was tagged but never published either.

### Security

- Updated `colord` to 2.10.0 (GHSA-2wm5-q62r-hmrv). It is the only affected dependency that ships inside the module.

### Changed

- Updated the development tooling to ESLint 10, typescript-eslint 8.71 and lint-staged 16, and updated development-only dependencies with known advisories. `yarn npm audit` reports no issues.

## [3.1.2] - 2026-09-24

### Removed

- Feedback "Transport state matches". It never became active, because Pandoras Box only reports the transport state per sequence. Existing uses are converted automatically to "Sequence transport state matches" for sequence 1 with the same state. Check the sequence on those buttons.

### Fixed

- When the connection to Pandoras Box is lost, variables and feedbacks now reset to their placeholders instead of keeping the last known values (e.g. a sequence still showing "Play" or a frozen timecode).
- An error from one sequence (e.g. right after it was deleted) could stop the status and opacity updates of a different sequence for up to 10 seconds.
- If the timecode connection of a single sequence failed or dropped, its time, countdown, countup and cue variables stayed frozen until the whole module reconnected. Such connections are now re-established within 10 seconds.

### Changed

- Less load on Companion: updates only touch the variables of the sequence they belong to, feedbacks are only re-checked when their value changes, and definitions are only sent again when the sequence list changes.

## [3.1.1] - 2026-09-16

### Added

- Action "Set Playhead": moves a sequence to a time, either absolute or relative to the current position (with a leading `+` or `-`). Accepts `hh:mm:ss:ff`, shorter forms such as `ss:ff`, or digits without colons (`100` = 1 s, `1000` = 10 s). "Learn" reads the sequence's current time into the action.
- Variables for the previous cue, i.e. the last cue behind the playhead: `sequence_<id>_prevcue`, `_prevcue_name`, `_prevcue_id` and `_prevcue_mode`.
- Variables for the time since the previous cue: `sequence_<id>_countup` and `_countup_hh`, `_countup_mm`, `_countup_ss`, `_countup_ff`.
- Config option "Log protocol traffic (debug)" (off by default) to switch the protocol logging introduced in 3.1.0 on and off.

### Changed

- Feedback "Remaining cue under threshold" now works per sequence and has a new "Sequence" option. Set it on existing buttons.

### Fixed

- The module now reconnects automatically every 10 seconds if the connection drops or the first connection attempt fails, e.g. after restarting Pandoras Box Manager. Before, it stayed disconnected until the configuration was saved again.
- After a single sequence returned an error (e.g. after it was deleted), the status and opacity of all sequences stopped updating until the module reconnected.
- Feedback "Remaining cue under threshold" was always active, regardless of the actual countdown.
- The "Sequence" dropdown in feedbacks stayed on "Sequence 1 (not connected)" instead of listing the actual sequences.
- Wrong next-cue mode letters: Pause was shown as "J", Jump as "W" and Wait as "?".
- Without a next cue, the next-cue variables now show `No Cue (-)` and `-` instead of raw device values such as `No Cue Found (? -1)`.
- Umlauts and other special characters in sequence and cue names were garbled (e.g. "EigenstÃ¤ndig" instead of "Eigenständig").
- Triggering "Sequence Opacity Fade" twice in quick succession on the same sequence could leave two fades running against each other.

## [3.1.0] - 2026-09-12

### Added

- Action "Sequence Opacity Fade": fades a sequence to a target opacity (0-100 %) over a given time in milliseconds, with a choice of curve (Linear, recommended, plus Ease In, Ease Out, Ease In-Out and S-Curve). The fade runs in the background; triggering it again on the same sequence replaces the running fade.
- Variable `sequence_<id>_opacity` with the current opacity of each sequence (0-100 %).
- Every protocol message sent and received is logged at debug level, for troubleshooting.

### Changed

- Migrated to `@companion-module/base` 2.x and `@companion-module/tools` 3.x. Requires Companion 5.0 or later. On older Companion versions, keep using module version 3.0.1.

### Fixed

- When several protocol messages arrived at once, or only part of one, some of them were lost or misread.
- Manifest: runtime corrected to Node.js 22, and the required `"type": "connection"` added.

### Development

- Added an ESLint configuration (`yarn lint` did not run before) and a `.gitattributes` file that enforces LF line endings.

## [3.0.1] - 2026-01-16

### Fixed

- The connection is only reported as OK once Pandoras Box has actually answered.

### Changed

- The built `dist/` output is no longer committed. Repository and issue links added to the manifest.

## [3.0.0] - 2026-01-11

### Added

- Complete rewrite of the module in TypeScript.
- Countdown and next-cue variables.
- In-app help (`HELP.md`).

## Earlier versions

Versions before the TypeScript rewrite (tagged `old-version-before-rewrite` and earlier) are not covered by this changelog. See the git history and the legacy module id `chrisite-pandorasbox`.
