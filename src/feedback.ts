import type { CompanionFeedbackDefinitions, CompanionFeedbackBooleanEvent } from '@companion-module/base'
import type { TransportState } from './client.js'

// The former global 'transport_state' feedback was removed in 3.1.2 (the device only reports
// transport state per sequence) - see upgrades.ts, which converts existing uses.
export enum FeedbackId {
	RemainingCueThreshold = 'remaining_threshold',
	SequenceTransportState = 'sequence_transport_state',
}

export interface SequenceCountdown {
	h: number
	m: number
	s: number
	f: number
}

export function GetFeedbacksList(
	getSequenceChoices: () => { id: number; label: string }[],
	getSequenceState: (seqId: number) => TransportState,
	getSequenceCountdown: (seqId: number) => SequenceCountdown | undefined,
): CompanionFeedbackDefinitions {
	return {
		[FeedbackId.RemainingCueThreshold]: {
			type: 'boolean',
			name: 'Remaining cue under threshold',
			description: 'True when remaining time until next cue is below threshold (seconds) for the selected sequence',
			options: [
				{
					type: 'dropdown',
					id: 'sequence',
					label: 'Sequence',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
				},
				{
					type: 'number',
					id: 'threshold',
					label: 'Threshold seconds',
					default: 10,
					min: 1,
					max: 3600,
					step: 1,
				},
			],
			defaultStyle: {},
			callback: (fb: CompanionFeedbackBooleanEvent) => {
				const seqId = Number(fb.options.sequence)
				const countdown = getSequenceCountdown(seqId)
				if (!countdown) return false
				const totalSec = countdown.h * 3600 + countdown.m * 60 + countdown.s
				return totalSec <= Number(fb.options.threshold)
			},
		},
		[FeedbackId.SequenceTransportState]: {
			type: 'boolean',
			name: 'Sequence transport state matches',
			description: 'True when a specific sequence transport state matches',
			options: [
				{
					type: 'dropdown',
					id: 'sequence',
					label: 'Sequence',
					default: 1,
					choices: getSequenceChoices(),
					allowCustom: true,
				},
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: 'Play',
					choices: [
						{ id: 'Play', label: 'Play' },
						{ id: 'Pause', label: 'Pause' },
						{ id: 'Stop', label: 'Stop' },
					],
				},
			],
			defaultStyle: {},
			callback: (fb: CompanionFeedbackBooleanEvent) => {
				const seqId = Number(fb.options.sequence)
				const state = getSequenceState(seqId)
				return state === fb.options.state
			},
		},
	}
}
