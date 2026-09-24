# companion-module-twoloox-pandorasbox

Companion module for controlling **twoloox Pandoras Box** media servers via the **PandorasAutomation (PBAU)** TCP protocol.

## Features

✅ **Sequence Control**
- Play/Pause/Stop sequences
- Goto Cue, Next/Last Cue
- Ignore Next Cue
- Set Playhead (absolute or relative, accepts hh:mm:ss:ff or plain digits, e.g. `1000` = 10s)
- SMPTE Timecode Mode (None/Send/Receive)
- Real-time timecode display (30fps)
- Sequence selection for editing

✅ **Programming**
- Store Active to Sequence
- Store Active to Container Beginning
- Clear All Active
- Reset All

✅ **Project Management**
- Save Project
- Toggle Site Fullscreen
- Set Site IP Address
- Apply GUI View

✅ **Sequence Opacity**
- Sequence Opacity Fade: fade a sequence's visibility in/out to a target (0-100%) over a configurable duration, with a choice of curve (Linear, Ease In, Ease Out, Ease In-Out, S-Curve)
- Live sequence opacity variable

✅ **Dynamic Features**
- Automatic sequence discovery
- Per-sequence timecode polling (30x/sec when playing)
- 26+ dynamic presets (4 per sequence)
- Real-time status variables

✅ **Feedbacks**
- Sequence transport state matches (per sequence)
- Remaining time until next cue under threshold

## Tested Versions

- **Companion:** v5.0.5
- **Pandoras Box:** v8.11.3

Requires **Companion v4.3 or later** (this module uses `@companion-module/base` v2.x). If you're on an older Companion version, use [module version 3.0.1](https://github.com/bitfocus/companion-module-twoloox-pandorasbox/releases/tag/v3.0.1) instead, which targets `@companion-module/base` v1.x.

## Installation

Install directly in Companion via the module library (when published) or use the built `dist/` folder.

## Configuration

After adding the module in Companion:

1. **Host:** IP address of Pandoras Box server (e.g., `192.168.1.100`)
2. **Port:** Default `6211`
3. **Domain:** Default `0`
4. **Log protocol traffic (debug):** Off by default. Enable and set the connection's log level to Debug in Companion to capture a hex dump of every sent/received PBAU message, useful for troubleshooting.

The module will automatically:
- Discover all sequences
- Create dynamic presets
- Start timecode polling for playing sequences

## Architecture

### Multi-Connection Design
- **Main TCP Connection:** Sequence discovery, status polling (5x/sec), commands
- **Per-Sequence Connections:** Independent timecode polling (30x/sec when playing, 5x/sec when stopped)

### Protocol Details
- **PBAU Header:** Mixed endianness (BE headers, LE sequence IDs)
- **Commands Implemented:** 20+ (Transport, Cue, Programming, Project, SMPTE, Opacity)
- **Polling:** Adaptive rate based on sequence state

## Known Limitations
- Cue discovery not implemented (manual cue ID entry required)
- SMPTE mode cannot be read back (write-only command)

## License

See project license file.

## Support

For issues and feature requests, contact twoloox GmbH
