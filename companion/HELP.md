# twoloox Pandoras Box

Controls **twoloox Pandoras Box** media servers (V8 and newer) via the **PandorasAutomation (PBAU)** TCP protocol.

Requires **Companion 5.0 or later**. For older Companion versions, use module version 3.0.1.

## Configuration

- **Target IP:** IP address of the Pandoras Box server (e.g. `192.168.1.100`). The module always connects to port `6211`, the PandorasAutomation port.
- **Domain:** Pandoras Box domain, default `0`. If the connection stays in an error state, check that the domain matches.
- **Log protocol traffic (debug):** Off by default. For troubleshooting, enable it and set the connection's log level in Companion to Debug to log every message sent and received.

After connecting, the module finds all sequences by itself and keeps the list up to date every 10 seconds. If the connection drops, or Pandoras Box stops answering for about 5 seconds (e.g. a network cable was pulled), it reconnects automatically every 10 seconds.

## Actions

**Sequences**

- **Sequence Transport:** Play, Pause or Stop a sequence.
- **Toggle Sequence Play/Pause**
- **Goto Cue:** jump to a cue by its ID.
- **Goto Next/Last Cue**
- **Ignore Next Cue**
- **Set Playhead:** move a sequence to a time, see below.
- **Sequence Opacity Fade:** fade a sequence to a target opacity (0-100 %) over a time in milliseconds. Curves: Linear (recommended), Ease In, Ease Out, Ease In-Out, S-Curve. Triggering it again on the same sequence replaces the running fade.
- **Set Sequence SMPTE Timecode Mode:** None, TC Send or TC Receive.
- **Select Sequence (Edit)**
- **Refresh Sequence List:** reload the sequence list right away instead of waiting for the next automatic refresh.

**Programming**

- Store Active to Sequence
- Store Active to Container Beginning
- Clear All Active
- Reset All Values

**Project and sites**

- Save Project
- Toggle Fullscreen (Site ID)
- Set Site IP by ID
- Recall GUI View

### Set Playhead

- **Absolute** moves the sequence to the given time, **Relative** moves it forward (`+`) or back (`-`) from its current position.
- Time formats: `hh:mm:ss:ff` (e.g. `00:01:30:15`), shorter forms read from the right (`1:00` = 1 second, `1:10:00` = 1 minute 10 seconds) or digits without colons, read in pairs from the right (`10` = 10 frames, `100` = 1 second, `1000` = 10 seconds).
- The field accepts variables and expressions. Invalid input, including decimals such as `10.5` or units such as `1m30s`, is ignored and nothing is sent.
- **Learn** fills in the sequence's current time and sets the mode to Absolute.

## Feedbacks

- **Sequence transport state matches:** active while the selected sequence is in the selected state (Play, Pause or Stop).
- **Remaining cue under threshold:** active while the time until the next cue of the selected sequence is at or below the threshold in seconds.

## Variables

Replace `<id>` with the sequence ID and `pandorasbox` with your connection's label, e.g. `$(pandorasbox:sequence_2_time)`.

| Variable                  | Content                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `sequence_<id>`           | Sequence name                                                                                        |
| `sequence_<id>_status`    | `Play`, `Pause`, `Stop` or `Unknown`                                                                 |
| `sequence_<id>_time`      | Current time `hh:mm:ss:ff`, parts in `_hh`, `_mm`, `_ss`, `_ff`                                      |
| `sequence_<id>_countdown` | Time until the next cue, parts in `_countdown_hh`, `_countdown_mm`, `_countdown_ss`, `_countdown_ff` |
| `sequence_<id>_countup`   | Time since the previous cue, parts in `_countup_hh`, `_countup_mm`, `_countup_ss`, `_countup_ff`     |
| `sequence_<id>_nextcue`   | Next cue as `Name (Mode ID)`, parts in `_nextcue_name`, `_nextcue_id`, `_nextcue_mode`               |
| `sequence_<id>_prevcue`   | Previous cue as `Name (Mode ID)`, parts in `_prevcue_name`, `_prevcue_id`, `_prevcue_mode`           |
| `sequence_<id>_opacity`   | Opacity in percent (0-100)                                                                           |

- Cue mode letters: `C` = Play (continue), `S` = Stop, `P` = Pause, `J` = Jump, `W` = Wait.
- Without a next or previous cue, the cue variables show `No Cue (-)` and `-`.
- Without data, e.g. while disconnected, the countdown, countup and opacity variables show `--`, the time shows `00:00:00:00` and the status shows `Unknown`.
- Time variables update up to 30 times per second while a sequence plays, 5 times per second otherwise.

## Presets

- Per sequence: Select (Edit), SMPTE Off, SMPTE Send, SMPTE Receive.
- General presets for transport, cues, programming and the application. They use sequence 1, site 1 or view 1; adjust the options after placing them.

## Known limitations

- Cues can't be listed from Pandoras Box, so cue IDs have to be entered by hand.
- The SMPTE mode can't be read back from Pandoras Box.
- The module doesn't know a sequence's frame rate. The frames part of `_countup_ff` shows the sequence's current frame, and relative Set Playhead moves don't carry frames over into seconds.

## Tested versions

- **Companion:** 5.0.5
- **Pandoras Box:** 8.11.3

## Support

For issues and feature requests, contact twoloox GmbH or open an issue at https://github.com/bitfocus/companion-module-twoloox-pandorasbox/issues.
