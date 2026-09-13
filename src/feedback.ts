import type { CompanionFeedbackDefinitions, CompanionFeedbackBooleanEvent } from '@companion-module/base'
import type { TransportState } from './client.js'

export enum FeedbackId {
	TransportState = 'transport_state',
	RemainingCueThreshold = 'remaining_threshold',
	SequenceTransportState = 'sequence_transport_state',
}

export interface ModuleState {
	transport: TransportState
}

export interface SequenceCountdown {
	h: number
	m: number
	s: number
	f: number
}

export function GetFeedbacksList(
	getState: () => ModuleState,
	getSequenceChoices: () => { id: number; label: string }[],
	getSequenceState: (seqId: number) => TransportState,
	getSequenceCountdown: (seqId: number) => SequenceCountdown | undefined,
): CompanionFeedbackDefinitions {
	return {
		[FeedbackId.TransportState]: {
			type: 'boolean',
			name: 'Transport state matches',
			description: 'True when transport matches selected state',
			options: [
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
				const state = getState().transport
				return state === fb.options.state
			},
		},
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
