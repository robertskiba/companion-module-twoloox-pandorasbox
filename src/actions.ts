import type { CompanionActionDefinitions } from '@companion-module/base'
import { PBClient, type TransportState } from './client.js'

export enum ActionId {
	SeqTransport = 'seq_transport',
	ToggleSequence = 'toggle_sequence',
	SelectSequence = 'select_sequence',
	SetSmpteMode = 'set_smpte_mode',
	GotoCue = 'goto_cue',
	NextLastCue = 'next_last_cue',
	IgnoreNextCue = 'ignore_next_cue',
	ApplyView = 'apply_view',
	SaveProject = 'save_project',
	ToggleFullscreen = 'toggle_fullscreen',
	SetSiteIp = 'set_site_ip',
	ClearAllActive = 'clear_all_active',
	StoreActive = 'store_active',
	StoreActiveToBeginning = 'store_active_to_beginning',
	ResetAll = 'reset_all',
	RefreshSequences = 'refresh_sequences',
}

export interface SequenceChoice {
	id: number
	label: string
}

export function GetActionsList(
	getClient: () => PBClient | undefined,
	getSequenceChoices: () => SequenceChoice[],
	getSequenceState: (seqId: number) => TransportState,
): CompanionActionDefinitions {
	return {
		[ActionId.SeqTransport]: {
			name: 'Sequence Transport',
			options: [
				{
					type: 'dropdown',
					label: 'Transport',
					id: 'mode',
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
	}
}
