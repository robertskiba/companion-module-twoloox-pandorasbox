# companion-module-twoloox-pandorasbox

[Bitfocus Companion](https://bitfocus.io/companion) module for controlling **twoloox Pandoras Box** media servers (V8 and newer) via the **PandorasAutomation (PBAU)** TCP protocol.

Requires **Companion 5.0 or later** (the module uses `@companion-module/base` 2.1). On older Companion versions, use module version 3.0.1, which targets `@companion-module/base` 1.x.

User documentation (configuration, actions, feedbacks, variables) is in [companion/HELP.md](companion/HELP.md), which Companion also shows as the module's help. Changes per version are listed in [CHANGELOG.md](CHANGELOG.md).

## Features

- **Sequences:** Play/Pause/Stop, toggle Play/Pause, goto cue, next/last cue, ignore next cue, Set Playhead (absolute or relative), SMPTE timecode mode, select for editing
- **Opacity:** Sequence Opacity Fade with selectable curves, live opacity variable
- **Programming:** Store Active (to sequence or container beginning), Clear All Active, Reset All
- **Project and sites:** save project, toggle site fullscreen, set site IP, recall GUI view
- **Variables per sequence:** name, status, timecode, countdown to the next cue, countup since the previous cue, next and previous cue (name, ID, mode), opacity
- **Feedbacks:** sequence transport state, remaining time until the next cue below a threshold
- **Presets** generated per sequence, plus general presets
- Automatic sequence discovery and automatic reconnect

## Installation

- **Module library:** install the module from Companion's module manager.
- **Manually:** download the `.tgz` file from a release, then import it in Companion via _Modules > Import module package_.

## Architecture

- **Main TCP connection:** sequence discovery, transport/opacity polling (5x per second), commands. Queries whose answers don't identify their sequence run strictly one at a time, so every answer is matched to the right request.
- **One TCP connection per sequence:** timecode, countdown and cue info, polled 30x per second while playing and 5x per second otherwise.
- **Protocol notes:** mixed endianness (big-endian headers, little-endian sequence ID lists), opacity is read in 0-65535 but written in 0-255, error answers don't say which request failed.


## Tested versions

- **Companion:** 5.0.5
- **Pandoras Box:** 8.11.3

## License

MIT, see [LICENSE](LICENSE).

## Support

For issues and feature requests, contact twoloox GmbH or open an issue at https://github.com/bitfocus/companion-module-twoloox-pandorasbox/issues.
