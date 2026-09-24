# twoloox Pandoras Box

Companion module for controlling **twoloox Pandoras Box** media servers via the **PandorasAutomation (PBAU)** TCP protocol.

Requires **Companion v4.3 or later**. For older Companion versions, use module version 3.0.1 instead.

## Configuration

After adding the module in Companion:

- **Host:** IP address of the Pandoras Box server (e.g. `192.168.1.100`)
- **Port:** Default `6211`
- **Domain:** Default `0`
- **Log protocol traffic (debug):** Off by default. Enable and set the connection's log level to Debug in Companion to capture a hex dump of every sent/received PBAU message, useful for troubleshooting.

The module automatically:

- Discovers all sequences
- Creates dynamic presets per sequence
- Starts timecode polling for playing sequences

## Features

**Sequence Control**
- Play / Pause / Stop sequences
- Goto Cue, Next/Last Cue
- Ignore Next Cue
- Set Playhead (absolute or relative, accepts hh:mm:ss:ff or plain digits)
- SMPTE Timecode Mode (None / Send / Receive)
- Real-time timecode display (30fps)
- Sequence selection for editing

**Programming**
- Store Active to Sequence
- Store Active to Container Beginning
- Clear All Active
- Reset All

**Project Management**
- Save Project
- Toggle Site Fullscreen
- Set Site IP Address
- Apply GUI View

**Sequence Opacity**
- Sequence Opacity Fade: fade a sequence's visibility in/out to a target (0-100%) over a configurable duration, with a choice of curve (Linear, Ease In, Ease Out, Ease In-Out, S-Curve)
- Live sequence opacity variable

**Feedbacks**
- Sequence transport state matches (per sequence)
- Remaining time until next cue under threshold

**Dynamic Features**
- Automatic sequence discovery
- Per-sequence timecode polling (30x/sec when playing)
- Dynamic presets generated per sequence
- Real-time status variables

## Architecture

**Multi-Connection Design**
- Main TCP connection: sequence discovery, status polling (5x/sec), commands
- Per-sequence connections: independent timecode polling (30x/sec when playing, 5x/sec when stopped)

**Protocol Details**
- PBAU header uses mixed endianness (BE headers, LE sequence IDs)
- 20+ commands implemented (Transport, Cue, Programming, Project, SMPTE, Opacity)
- Adaptive polling rate based on sequence state

## Known Limitations

- Cue discovery not implemented (manual cue ID entry required)
- SMPTE mode cannot be read back (write-only command)

## Tested Versions

- **Companion:** v5.0.5
- **Pandoras Box:** v8.11.3

## Support

For issues and feature requests, contact twoloox GmbH.
