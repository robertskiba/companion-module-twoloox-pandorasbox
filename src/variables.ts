import type { CompanionVariableDefinitions, CompanionVariableValues } from '@companion-module/base'
import type { SequenceInfo, TransportState, CueInfo } from './client.js'
import { SEQUENCE_OPACITY_MAX } from './constants.js'

export function GetVariableDefinitions(): CompanionVariableDefinitions {
	// Base definitions are empty now - all sequence-specific
	return {}
}

// Generate variable definitions for discovered sequences
export function GetSequenceVariableDefinitions(sequences: SequenceInfo[]): CompanionVariableDefinitions {
	const defs: CompanionVariableDefinitions = {}
	for (const seq of sequences) {
		defs[`sequence_${seq.id}`] = { name: `Sequence ${seq.id} Name` }
	}
	return defs
}

// Generate variable values for discovered sequences
export function GetSequenceVariableValues(sequences: SequenceInfo[]): CompanionVariableValues {
	const values: CompanionVariableValues = {}
	for (const seq of sequences) {
		values[`sequence_${seq.id}`] = seq.name
	}
	return values
}

// Generate variable definitions for sequence statuses
export function GetSequenceStatusVariableDefinitions(sequences: SequenceInfo[]): CompanionVariableDefinitions {
	const defs: CompanionVariableDefinitions = {}
	for (const seq of sequences) {
		defs[`sequence_${seq.id}_status`] = { name: `Sequence ${seq.id} Status` }
	}
	return defs
}

// Generate variable values for sequence statuses
export function GetSequenceStatusVariableValues(
	sequences: SequenceInfo[],
	states: Map<number, TransportState>,
): CompanionVariableValues {
	const values: CompanionVariableValues = {}
	for (const seq of sequences) {
		values[`sequence_${seq.id}_status`] = states.get(seq.id) || 'Unknown'
	}
	return values
}

// Generate variable definitions for sequence opacity (visibility)
export function GetSequenceOpacityVariableDefinitions(sequences: SequenceInfo[]): CompanionVariableDefinitions {
	const defs: CompanionVariableDefinitions = {}
	for (const seq of sequences) {
		defs[`sequence_${seq.id}_opacity`] = { name: `Sequence ${seq.id} Opacity (%)` }
	}
	return defs
}

// Generate variable values for sequence opacity (visibility)
export function GetSequenceOpacityVariableValues(
	sequences: SequenceInfo[],
	opacities: Map<number, number>,
): CompanionVariableValues {
	const values: CompanionVariableValues = {}
	for (const seq of sequences) {
		const opacity = opacities.get(seq.id)
		values[`sequence_${seq.id}_opacity`] =
			opacity !== undefined ? Math.round((opacity / SEQUENCE_OPACITY_MAX) * 100).toString() : '--'
	}
	return values
}

// Generate variable definitions for sequence times
export function GetSequenceTimeVariableDefinitions(sequences: SequenceInfo[]): CompanionVariableDefinitions {
	const defs: CompanionVariableDefinitions = {}
	for (const seq of sequences) {
		defs[`sequence_${seq.id}_time`] = { name: `Sequence ${seq.id} Time (HH:MM:SS:ff)` }
		defs[`sequence_${seq.id}_hh`] = { name: `Sequence ${seq.id} Hours` }
		defs[`sequence_${seq.id}_mm`] = { name: `Sequence ${seq.id} Minutes` }
		defs[`sequence_${seq.id}_ss`] = { name: `Sequence ${seq.id} Seconds` }
		defs[`sequence_${seq.id}_ff`] = { name: `Sequence ${seq.id} Frames` }
	}
	return defs
}

// Generate variable definitions for countdown to next cue
export function GetSequenceCountdownVariableDefinitions(sequences: SequenceInfo[]): CompanionVariableDefinitions {
	const defs: CompanionVariableDefinitions = {}
	for (const seq of sequences) {
		defs[`sequence_${seq.id}_countdown`] = { name: `Sequence ${seq.id} Countdown to Next Cue (HH:MM:SS:ff)` }
		defs[`sequence_${seq.id}_countdown_hh`] = { name: `Sequence ${seq.id} Countdown Hours` }
		defs[`sequence_${seq.id}_countdown_mm`] = { name: `Sequence ${seq.id} Countdown Minutes` }
		defs[`sequence_${seq.id}_countdown_ss`] = { name: `Sequence ${seq.id} Countdown Seconds` }
		defs[`sequence_${seq.id}_countdown_ff`] = { name: `Sequence ${seq.id} Countdown Frames` }
	}
	return defs
}

export interface SequenceTime {
	h: number
	m: number
	s: number
	f: number
}

// Generate variable values for sequence times
export function GetSequenceTimeVariableValues(
	sequences: SequenceInfo[],
	times: Map<number, SequenceTime>,
): CompanionVariableValues {
	const values: CompanionVariableValues = {}
	for (const seq of sequences) {
		const time = times.get(seq.id)
		if (time) {
			const hh = time.h.toString().padStart(2, '0')
			const mm = time.m.toString().padStart(2, '0')
			const ss = time.s.toString().padStart(2, '0')
			const ff = time.f.toString().padStart(2, '0')
			values[`sequence_${seq.id}_time`] = `${hh}:${mm}:${ss}:${ff}`
			values[`sequence_${seq.id}_hh`] = hh
			values[`sequence_${seq.id}_mm`] = mm
			values[`sequence_${seq.id}_ss`] = ss
			values[`sequence_${seq.id}_ff`] = ff
		} else {
			values[`sequence_${seq.id}_time`] = '00:00:00:00'
			values[`sequence_${seq.id}_hh`] = '00'
			values[`sequence_${seq.id}_mm`] = '00'
			values[`sequence_${seq.id}_ss`] = '00'
			values[`sequence_${seq.id}_ff`] = '00'
		}
	}
	return values
}

// Generate variable values for countdown to next cue
export function GetSequenceCountdownVariableValues(
	sequences: SequenceInfo[],
	countdowns: Map<number, SequenceTime>,
): CompanionVariableValues {
	const values: CompanionVariableValues = {}
	for (const seq of sequences) {
		const time = countdowns.get(seq.id)
		if (time) {
			const hh = time.h.toString().padStart(2, '0')
			const mm = time.m.toString().padStart(2, '0')
			const ss = time.s.toString().padStart(2, '0')
			const ff = time.f.toString().padStart(2, '0')
			values[`sequence_${seq.id}_countdown`] = `${hh}:${mm}:${ss}:${ff}`
			values[`sequence_${seq.id}_countdown_hh`] = hh
			values[`sequence_${seq.id}_countdown_mm`] = mm
			values[`sequence_${seq.id}_countdown_ss`] = ss
			values[`sequence_${seq.id}_countdown_ff`] = ff
		} else {
			values[`sequence_${seq.id}_countdown`] = '--:--:--:--'
			values[`sequence_${seq.id}_countdown_hh`] = '--'
			values[`sequence_${seq.id}_countdown_mm`] = '--'
			values[`sequence_${seq.id}_countdown_ss`] = '--'
			values[`sequence_${seq.id}_countdown_ff`] = '--'
		}
	}
	return values
}

// Generate variable definitions for countup since the last (previous) cue
export function GetSequenceCountupVariableDefinitions(sequences: SequenceInfo[]): CompanionVariableDefinitions {
	const defs: CompanionVariableDefinitions = {}
	for (const seq of sequences) {
		defs[`sequence_${seq.id}_countup`] = { name: `Sequence ${seq.id} Time Since Last Cue (HH:MM:SS:ff)` }
		defs[`sequence_${seq.id}_countup_hh`] = { name: `Sequence ${seq.id} Countup Hours` }
		defs[`sequence_${seq.id}_countup_mm`] = { name: `Sequence ${seq.id} Countup Minutes` }
		defs[`sequence_${seq.id}_countup_ss`] = { name: `Sequence ${seq.id} Countup Seconds` }
		defs[`sequence_${seq.id}_countup_ff`] = { name: `Sequence ${seq.id} Countup Frames` }
	}
	return defs
}

// Generate variable values for time elapsed since the last (previous) cue. The device has no
// direct command for this - it's computed here as currentTime minus the previous cue's own
// position in the sequence timeline. Hours/minutes/seconds carry correctly (base 60, no frame
// rate needed). The frames digit intentionally isn't computed the same way (time.f minus the
// cue's own frame offset): without knowing the sequence's frame rate, that difference can't be
// borrowed/carried, so whenever time.f dips below the cue's frame offset it clamps to 0 for a
// stretch of every second - looking like the display "hakt" (stutters) once a second instead of
// updating frame-by-frame like the countdown does. Mirroring time.f directly keeps this ticking
// smoothly every poll, at the cost of it being "current frame" rather than "frames elapsed".
export function GetSequenceCountupVariableValues(
	sequences: SequenceInfo[],
	times: Map<number, SequenceTime>,
	cueInfos: Map<number, CueInfo>,
): CompanionVariableValues {
	const values: CompanionVariableValues = {}
	for (const seq of sequences) {
		const time = times.get(seq.id)
		const cue = cueInfos.get(seq.id)
		if (time && cue && cue.previousCueId > 0) {
			const currentTotalSeconds = time.h * 3600 + time.m * 60 + time.s
			const previousTotalSeconds = cue.previousCueH * 3600 + cue.previousCueM * 60 + cue.previousCueS
			const elapsedTotalSeconds = Math.max(0, currentTotalSeconds - previousTotalSeconds)
			const hh = Math.floor(elapsedTotalSeconds / 3600)
				.toString()
				.padStart(2, '0')
			const mm = Math.floor((elapsedTotalSeconds % 3600) / 60)
				.toString()
				.padStart(2, '0')
			const ss = (elapsedTotalSeconds % 60).toString().padStart(2, '0')
			const ff = time.f.toString().padStart(2, '0')
			values[`sequence_${seq.id}_countup`] = `${hh}:${mm}:${ss}:${ff}`
			values[`sequence_${seq.id}_countup_hh`] = hh
			values[`sequence_${seq.id}_countup_mm`] = mm
			values[`sequence_${seq.id}_countup_ss`] = ss
			values[`sequence_${seq.id}_countup_ff`] = ff
		} else {
			values[`sequence_${seq.id}_countup`] = '--:--:--:--'
			values[`sequence_${seq.id}_countup_hh`] = '--'
			values[`sequence_${seq.id}_countup_mm`] = '--'
			values[`sequence_${seq.id}_countup_ss`] = '--'
			values[`sequence_${seq.id}_countup_ff`] = '--'
		}
	}
	return values
}

// Generate variable definitions for next cue info
export function GetSequenceNextCueVariableDefinitions(sequences: SequenceInfo[]): CompanionVariableDefinitions {
	const defs: CompanionVariableDefinitions = {}
	for (const seq of sequences) {
		defs[`sequence_${seq.id}_nextcue`] = { name: `Sequence ${seq.id} Next Cue (Name + Mode + ID)` }
		defs[`sequence_${seq.id}_nextcue_name`] = { name: `Sequence ${seq.id} Next Cue Name` }
		defs[`sequence_${seq.id}_nextcue_id`] = { name: `Sequence ${seq.id} Next Cue ID` }
		defs[`sequence_${seq.id}_nextcue_mode`] = { name: `Sequence ${seq.id} Next Cue Mode Letter` }
	}
	return defs
}

// Convert cue mode number to letter.
// Confirmed empirically on hardware (v8.11.3) - does not match the 0=Pause..4=Wait ordering some
// community docs describe for cue play modes in general; this specific field uses its own order.
function cueModeToLetter(mode: number): string {
	switch (mode) {
		case 1:
			return 'C' // Continue/Play
		case 2:
			return 'S' // Stop
		case 3:
			return 'P' // Pause
		case 4:
			return 'J' // Jump
		case 5:
			return 'W' // Wait
		default:
			return '?'
	}
}

// Generate variable values for next cue info
export function GetSequenceNextCueVariableValues(
	sequences: SequenceInfo[],
	cueInfos: Map<number, CueInfo>,
): CompanionVariableValues {
	const values: CompanionVariableValues = {}
	for (const seq of sequences) {
		const cue = cueInfos.get(seq.id)
		// The device reports nextCueId as -1 (not 0) when there's no next cue, alongside a literal
		// "No Cue Found" name and an unmapped mode - treat any non-positive id as "no cue".
		if (cue && cue.nextCueId > 0) {
			const modeLetter = cueModeToLetter(cue.nextCueMode)
			values[`sequence_${seq.id}_nextcue`] = `${cue.nextCueName} (${modeLetter} ${cue.nextCueId})`
			values[`sequence_${seq.id}_nextcue_name`] = cue.nextCueName
			values[`sequence_${seq.id}_nextcue_id`] = cue.nextCueId.toString()
			values[`sequence_${seq.id}_nextcue_mode`] = modeLetter
		} else {
			values[`sequence_${seq.id}_nextcue`] = 'No Cue (-)'
			values[`sequence_${seq.id}_nextcue_name`] = '-'
			values[`sequence_${seq.id}_nextcue_id`] = '-'
			values[`sequence_${seq.id}_nextcue_mode`] = '-'
		}
	}
	return values
}

// Generate variable definitions for previous cue info
export function GetSequencePrevCueVariableDefinitions(sequences: SequenceInfo[]): CompanionVariableDefinitions {
	const defs: CompanionVariableDefinitions = {}
	for (const seq of sequences) {
		defs[`sequence_${seq.id}_prevcue`] = { name: `Sequence ${seq.id} Previous Cue (Name + Mode + ID)` }
		defs[`sequence_${seq.id}_prevcue_name`] = { name: `Sequence ${seq.id} Previous Cue Name` }
		defs[`sequence_${seq.id}_prevcue_id`] = { name: `Sequence ${seq.id} Previous Cue ID` }
		defs[`sequence_${seq.id}_prevcue_mode`] = { name: `Sequence ${seq.id} Previous Cue Mode Letter` }
	}
	return defs
}

// Generate variable values for previous cue info
export function GetSequencePrevCueVariableValues(
	sequences: SequenceInfo[],
	cueInfos: Map<number, CueInfo>,
): CompanionVariableValues {
	const values: CompanionVariableValues = {}
	for (const seq of sequences) {
		const cue = cueInfos.get(seq.id)
		// Assumed symmetric with nextCueId (-1/non-positive when there's no previous cue, e.g.
		// before the first cue in the sequence) - not yet confirmed empirically on hardware.
		if (cue && cue.previousCueId > 0) {
			const modeLetter = cueModeToLetter(cue.previousCueMode)
			values[`sequence_${seq.id}_prevcue`] = `${cue.previousCueName} (${modeLetter} ${cue.previousCueId})`
			values[`sequence_${seq.id}_prevcue_name`] = cue.previousCueName
			values[`sequence_${seq.id}_prevcue_id`] = cue.previousCueId.toString()
			values[`sequence_${seq.id}_prevcue_mode`] = modeLetter
		} else {
			values[`sequence_${seq.id}_prevcue`] = 'No Cue (-)'
			values[`sequence_${seq.id}_prevcue_name`] = '-'
			values[`sequence_${seq.id}_prevcue_id`] = '-'
			values[`sequence_${seq.id}_prevcue_mode`] = '-'
		}
	}
	return values
}
