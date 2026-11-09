import type { CompanionActionDefinitions } from '@companion-module/base'
import { PBClient, type TransportState, type FadeCurve } from './client.js'
import { SEQUENCE_OPACITY_MAX } from './constants.js'
import type { SequenceTime } from './variables.js'

export enum ActionId {
	SeqTransport = 'seq_transport',
	ToggleSequence = 'toggle_sequence',
	SelectSequence = 'select_sequence',
	SetSmpteMode = 'set_smpte_mode',
	GotoCue = 'goto_cue',
	NextLastCue = 'next_last_cue',
	IgnoreNextCue = 'ignore_next_cue',
	SetPlayhead = 'set_playhead',
	ApplyView = 'apply_view',
	SaveProject = 'save_project',
	ToggleFullscreen = 'toggle_fullscreen',
	SetSiteIp = 'set_site_ip',
	ClearAllActive = 'clear_all_active',
	StoreActive = 'store_active',
	StoreActiveToBeginning = 'store_active_to_beginning',
	ResetAll = 'reset_all',
	RefreshSequences = 'refresh_sequences',
	FadeSequenceVisibility = 'fade_sequence_visibility',
}

export interface SequenceChoice {
	id: number
	label: string
}

// Sequence dropdowns allow typing in a custom sequence id, which arrives as a string.
type SequenceOption = number | string
type NoOptions = Record<string, never>

export type ActionSchemas = {
	[ActionId.SeqTransport]: { options: { mode: number; seq: SequenceOption } }
	[ActionId.ToggleSequence]: { options: { sequence: SequenceOption } }
	[ActionId.SelectSequence]: { options: { sequence: SequenceOption } }
	[ActionId.SetSmpteMode]: { options: { sequence: SequenceOption; mode: number } }
	[ActionId.GotoCue]: { options: { seq: SequenceOption; cue: number } }
	[ActionId.NextLastCue]: { options: { seq: SequenceOption; isNext: number } }
	[ActionId.IgnoreNextCue]: { options: { seq: SequenceOption; doIgnore: number } }
	[ActionId.SetPlayhead]: { options: { seq: SequenceOption; mode: 'absolute' | 'relative'; time: string } }
	[ActionId.ApplyView]: { options: { view: number } }
	[ActionId.SaveProject]: { options: NoOptions }
	[ActionId.ToggleFullscreen]: { options: { site: number } }
	[ActionId.SetSiteIp]: { options: { site: number; ip: string } }
	[ActionId.ClearAllActive]: { options: NoOptions }
	[ActionId.StoreActive]: { options: { seq: SequenceOption } }
	[ActionId.StoreActiveToBeginning]: { options: { seq: SequenceOption } }
	[ActionId.ResetAll]: { options: NoOptions }
	[ActionId.RefreshSequences]: { options: NoOptions }
	[ActionId.FadeSequenceVisibility]: {
		options: { seq: SequenceOption; value: number; duration: number; curve: FadeCurve }
	}
}

interface ParsedPlayheadTime {
	h: number
	m: number
	s: number
	f: number
}

// Wire format is 4 signed 32-bit integers - reject anything that wouldn't survive that trip
// instead of letting Buffer.writeInt32BE throw (or silently wrapping) on out-of-range input.
const INT32_MAX = 2147483647
function isValidTimeComponent(n: number): boolean {
	return Number.isInteger(n) && Math.abs(n) <= INT32_MAX
}

// Only the units h, m, s and f, in this order, each at most once, whole numbers only: "2h3m5s",
// "120m90s", "5s10f". Anything else fails to match and is ignored: "500ms" (the "m" leaves a bare
// "s" behind), "2hh", "5mins", "1.5m".
const UNIT_TIME = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?(?:(\d+)f)?$/i

// Accepts "hh:mm:ss:ff" (or a shorter right-aligned form, e.g. "ss:ff"), plain digits entered
// without colons, read in pairs from the right - e.g. "100" -> 1s 00f, "1000" -> 10s 00f,
// "13000" -> 1m 30s 00f, with any further leading digits rolling up into hours - or units such as
// "2h3m5s". An optional leading +/- sign carries through to every field (used for relative
// offsets). Returns undefined for anything that doesn't cleanly parse - any whitespace, empty
// groups, non-digit or negative colon groups, more than 4 colon groups, decimals or other stray
// characters (e.g. "10.5"), or a value too large to send to the device.
function parsePlayheadInput(raw: string): ParsedPlayheadTime | undefined {
	// Whitespace almost always means a typo, so it makes the whole input invalid rather than being trimmed.
	if (raw === '' || /\s/.test(raw)) return undefined

	let negative = false
	let body = raw
	if (body.startsWith('-')) {
		negative = true
		body = body.slice(1)
	} else if (body.startsWith('+')) {
		body = body.slice(1)
	}

	let h: number
	let m: number
	let s: number
	let f: number

	if (body.includes(':')) {
		const parts = body.split(':')
		// Each group must be a plain non-negative integer - Number('') is 0 (not NaN), so an
		// empty group like the middle of "1::3" would otherwise silently parse as a real zero.
		if (parts.length === 0 || parts.length > 4 || parts.some((part) => !/^\d+$/.test(part))) return undefined
		const values = parts.map(Number)
		const padded = [0, 0, 0, 0]
		for (let i = 0; i < values.length; i++) {
			padded[4 - values.length + i] = values[i]
		}
		;[h, m, s, f] = padded
	} else if (/[hmsf]/i.test(body)) {
		const match = UNIT_TIME.exec(body)
		if (!match || match.slice(1).every((group) => group === undefined)) return undefined
		const [hours, minutes, seconds, frames] = match.slice(1).map((group) => (group === undefined ? 0 : Number(group)))
		// "90s" or "1h90m" are fine to type - carry them over into proper hours/minutes/seconds. Frames
		// can't be carried, since this module doesn't know the sequence's frame rate.
		const totalSeconds = hours * 3600 + minutes * 60 + seconds
		h = Math.floor(totalSeconds / 3600)
		m = Math.floor((totalSeconds % 3600) / 60)
		s = totalSeconds % 60
		f = frames
	} else {
		// Reject rather than strip stray characters: "10.5" would otherwise become "105" (1s 5f) and
		// make the sequence jump somewhere unexpected instead of doing nothing.
		if (!/^\d+$/.test(body)) return undefined
		const digits = body
		f = Number(digits.slice(-2))
		const afterFrames = digits.slice(0, -2)
		s = afterFrames === '' ? 0 : Number(afterFrames.slice(-2))
		const afterSeconds = afterFrames.slice(0, -2)
		m = afterSeconds === '' ? 0 : Number(afterSeconds.slice(-2))
		const afterMinutes = afterSeconds.slice(0, -2)
		h = afterMinutes === '' ? 0 : Number(afterMinutes)
	}

	const sign = negative ? -1 : 1
	const result = { h: sign * h, m: sign * m, s: sign * s, f: sign * f }
	if (!Object.values(result).every(isValidTimeComponent)) return undefined
	return result
}

// Formats a time as "hh:mm:ss:ff" for the Learn function - matches this module's display format
// and is accepted straight back by parsePlayheadInput.
function formatPlayheadTime(t: ParsedPlayheadTime): string {
	const pad = (n: number) => n.toString().padStart(2, '0')
	return `${pad(t.h)}:${pad(t.m)}:${pad(t.s)}:${pad(t.f)}`
}

// Applies a signed offset to the sequence's current time. Hours/minutes/seconds carry correctly
// (base 60/24, no frame rate needed), but frames are simply added on top: this module doesn't know
// the sequence's frame rate, so it can't borrow/carry frames into seconds. A negative frame result
// is clamped to 0, which can be up to ~1 second off for large negative frame offsets.
function applyRelativeOffset(current: ParsedPlayheadTime, offset: ParsedPlayheadTime): ParsedPlayheadTime {
	const currentTotalSeconds = current.h * 3600 + current.m * 60 + current.s
	const offsetTotalSeconds = offset.h * 3600 + offset.m * 60 + offset.s
	const newTotalSeconds = Math.max(0, currentTotalSeconds + offsetTotalSeconds)
	return {
		h: Math.floor(newTotalSeconds / 3600),
		m: Math.floor((newTotalSeconds % 3600) / 60),
		s: newTotalSeconds % 60,
		f: Math.max(0, current.f + offset.f),
	}
}

export function GetActionsList(
	getClient: () => PBClient | undefined,
	getSequenceChoices: () => SequenceChoice[],
	getSequenceState: (seqId: number) => TransportState,
	getSequenceTime: (seqId: number) => SequenceTime | undefined,
): CompanionActionDefinitions<ActionSchemas> {
	return {
		[ActionId.SeqTransport]: {
			name: 'Sequence Transport',
			options: [
				{
					type: 'dropdown',
					label: 'Transport',
					id: 'mode',
					disableAutoExpression: true,
					default: 1,
					choices: [
						{ id: 1, label: 'Play' },
						{ id: 3, label: 'Pause' },
						{ id: 2, label: 'Stop' },
					],
				},
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'seq',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
					regex: '/^\\d+$/',
				},
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				await client.setTransport(Number(evt.options.mode), Number(evt.options.seq))
			},
		},
		[ActionId.ToggleSequence]: {
			name: 'Toggle Sequence Play/Pause',
			options: [
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'sequence',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
				},
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				const seqId = Number(evt.options.sequence)
				const currentState = getSequenceState(seqId)

				// If playing, pause. Otherwise, play.
				const newMode = currentState === 'Play' ? 3 : 1
				await client.setTransport(newMode, seqId)
			},
		},
		[ActionId.SelectSequence]: {
			name: 'Select Sequence (Edit)',
			options: [
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'sequence',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
				},
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				await client.selectSequence(Number(evt.options.sequence))
			},
		},
		[ActionId.SetSmpteMode]: {
			name: 'Set Sequence SMPTE Timecode Mode',
			options: [
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'sequence',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
				},
				{
					type: 'dropdown',
					label: 'SMPTE Mode',
					id: 'mode',
					disableAutoExpression: true,
					default: 0,
					choices: [
						{ id: 0, label: 'None (Off)' },
						{ id: 1, label: 'TC Send' },
						{ id: 2, label: 'TC Receive' },
					],
				},
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				await client.setSequenceSmpteMode(Number(evt.options.sequence), Number(evt.options.mode))
			},
		},
		[ActionId.GotoCue]: {
			name: 'Goto Cue',
			options: [
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'seq',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
					regex: '/^\\d+$/',
				},
				{ type: 'number', label: 'Cue ID', id: 'cue', default: 1, min: 1, max: 2147483647, step: 1 },
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				await client.gotoCue(Number(evt.options.seq), Number(evt.options.cue))
			},
		},
		[ActionId.NextLastCue]: {
			name: 'Goto Next/Last Cue',
			options: [
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'seq',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
					regex: '/^\\d+$/',
				},
				{
					type: 'dropdown',
					label: 'Direction',
					id: 'isNext',
					disableAutoExpression: true,
					default: 1,
					choices: [
						{ id: 1, label: 'Next cue' },
						{ id: 0, label: 'Last cue' },
					],
				},
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				await client.nextOrLastCue(Number(evt.options.seq), Number(evt.options.isNext) === 1)
			},
		},
		[ActionId.IgnoreNextCue]: {
			name: 'Ignore Next Cue',
			options: [
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'seq',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
					regex: '/^\\d+$/',
				},
				{
					type: 'dropdown',
					label: 'Ignore',
					id: 'doIgnore',
					disableAutoExpression: true,
					default: 1,
					choices: [
						{ id: 1, label: 'Ignore next cue' },
						{ id: 0, label: 'Do not ignore' },
					],
				},
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				await client.ignoreNextCue(Number(evt.options.seq), Number(evt.options.doIgnore) === 1)
			},
		},
		[ActionId.SetPlayhead]: {
			name: 'Set Playhead',
			options: [
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'seq',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
					regex: '/^\\d+$/',
				},
				{
					type: 'dropdown',
					label: 'Mode',
					id: 'mode',
					disableAutoExpression: true,
					default: 'absolute',
					choices: [
						{ id: 'absolute', label: 'Absolute (go to this time)' },
						{ id: 'relative', label: 'Relative (offset from current position)' },
					],
					tooltip:
						'Absolute: jumps to the time below, counted from the start of the timeline.\n' +
						'Relative: moves by the time below from the current position. Put + in front to move forward ' +
						'and - to move back, e.g. -500 = 5 seconds back.',
				},
				{
					type: 'textinput',
					label: 'Time (hh:mm:ss:ff)',
					id: 'time',
					default: '0',
					useVariables: true,
					description:
						'Timecode is read from the right, the last group is always frames: 01:00 = 1 second, 100 = 1 second. Or use units: 2h3m5s.',
					tooltip:
						'Read from the right like SMPTE timecode: the last group is frames, then seconds, minutes, hours. ' +
						'Missing groups count as 0.\n' +
						'With colons: 01:01:01:01 = 1 h 1 min 1 s 1 frame, 01:00:10 = 1 min 0 s 10 frames, 01:00 = 1 s 0 frames.\n' +
						'Without colons, digits are read in pairs from the right: 10 = 10 frames, 100 = 1 s, 1000 = 10 s, ' +
						'13000 = 1 min 30 s.\n' +
						'With units, only h, m, s and f (frames), in this order: 2h3m5s, 3m5s, 5s10f. Larger values are ' +
						'converted: 90s = 1 min 30 s, 120m90s = 2 h 1 min 30 s. Other units such as ms are ignored.\n' +
						'Relative mode: + moves forward, - moves back.\n' +
						'Spaces, decimals (10.5 or 1.5m) and any other text are ignored: nothing is sent.\n' +
						'Learn fills in the current time.',
					expressionDescription:
						'The expression must result in a time in one of the formats above, e.g. "00:01:30:00", 13000 or "1m30s".',
				},
			],
			learn: (action) => {
				const seqId = Number(action.options.seq)
				const current = getSequenceTime(seqId)
				if (!current) return undefined
				return {
					mode: 'absolute',
					time: formatPlayheadTime(current),
				}
			},
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				const seqId = Number(evt.options.seq)
				const timeOption = evt.options.time
				const raw =
					typeof timeOption === 'string' ? timeOption : typeof timeOption === 'number' ? String(timeOption) : ''
				const parsed = parsePlayheadInput(raw)
				if (!parsed) return

				if (evt.options.mode === 'relative') {
					const current = getSequenceTime(seqId)
					if (!current) return
					const target = applyRelativeOffset(current, parsed)
					await client.setPlayhead(seqId, target.h, target.m, target.s, target.f)
				} else {
					await client.setPlayhead(
						seqId,
						Math.abs(parsed.h),
						Math.abs(parsed.m),
						Math.abs(parsed.s),
						Math.abs(parsed.f),
					)
				}
			},
		},
		[ActionId.ApplyView]: {
			name: 'Recall GUI View',
			options: [{ type: 'number', label: 'View ID', id: 'view', default: 1, min: 1, max: 2147483647, step: 1 }],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				await client.applyView(Number(evt.options.view))
			},
		},
		[ActionId.SaveProject]: {
			name: 'Save Project',
			options: [],
			callback: async () => {
				const client = getClient()
				if (!client) return
				await client.saveProject()
			},
		},
		[ActionId.ToggleFullscreen]: {
			name: 'Toggle Fullscreen (Site ID)',
			options: [{ type: 'number', label: 'Site ID', id: 'site', default: 1, min: 1, max: 2147483647, step: 1 }],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				await client.toggleFullscreen(Number(evt.options.site))
			},
		},
		[ActionId.SetSiteIp]: {
			name: 'Set Site IP by ID',
			options: [
				{ type: 'number', label: 'Site ID', id: 'site', default: 1, min: 1, max: 2147483647, step: 1 },
				{ type: 'textinput', label: 'IP address', id: 'ip', default: '' },
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				const ip = evt.options.ip
				await client.setSiteIp(Number(evt.options.site), typeof ip === 'string' ? ip : '')
			},
		},
		[ActionId.ClearAllActive]: {
			name: 'Clear All Active',
			options: [],
			callback: async () => {
				const client = getClient()
				if (!client) return
				await client.clearAllActive()
			},
		},
		[ActionId.StoreActive]: {
			name: 'Store Active to Sequence',
			options: [
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'seq',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
					regex: '/^\\d+$/',
				},
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				await client.storeActive(Number(evt.options.seq))
			},
		},
		[ActionId.StoreActiveToBeginning]: {
			name: 'Store Active to Container Beginning',
			options: [
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'seq',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
					regex: '/^\\d+$/',
				},
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				await client.storeActiveToBeginning(Number(evt.options.seq))
			},
		},
		[ActionId.ResetAll]: {
			name: 'Reset All Values',
			options: [],
			callback: async () => {
				const client = getClient()
				if (!client) return
				await client.resetAll()
			},
		},
		[ActionId.RefreshSequences]: {
			name: 'Refresh Sequence List',
			options: [],
			callback: async () => {
				const client = getClient()
				if (!client) return
				await client.refreshSequences()
			},
		},
		[ActionId.FadeSequenceVisibility]: {
			name: 'Sequence Opacity Fade',
			options: [
				{
					type: 'dropdown',
					label: 'Sequence',
					id: 'seq',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
					regex: '/^\\d+$/',
				},
				{ type: 'number', label: 'Fade to Value (%)', id: 'value', default: 0, min: 0, max: 100, step: 1 },
				{ type: 'number', label: 'Fading time (ms)', id: 'duration', default: 1000, min: 0, max: 60000, step: 1 },
				{
					type: 'dropdown',
					label: 'Fade Curve',
					id: 'curve',
					disableAutoExpression: true,
					default: 'linear',
					choices: [
						{ id: 'linear', label: 'Linear (recommended, evenly spaced)' },
						{ id: 'ease_in', label: 'Ease In (slow start)' },
						{ id: 'ease_out', label: 'Ease Out (slow end)' },
						{ id: 'ease_in_out', label: 'Ease In-Out (slow start and end)' },
						{ id: 's_curve', label: 'S-Curve (gentle sine)' },
					],
				},
			],
			callback: async (evt) => {
				const client = getClient()
				if (!client) return
				const percent = Number(evt.options.value)
				const rawValue = Math.round((percent / 100) * SEQUENCE_OPACITY_MAX)
				await client.fadeSequenceVisibility(
					Number(evt.options.seq),
					rawValue,
					Number(evt.options.duration),
					evt.options.curve,
				)
			},
		},
	}
}
