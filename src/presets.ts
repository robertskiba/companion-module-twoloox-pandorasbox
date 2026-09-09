import { combineRgb, type CompanionPresetDefinitions, type CompanionPresetSection } from '@companion-module/base'
import { ActionId } from './actions.js'
import type { SequenceInfo, TransportState } from './client.js'
import type { ModuleSchema } from './index.js'

export interface PresetsResult {
	structure: CompanionPresetSection<ModuleSchema>[]
	presets: CompanionPresetDefinitions<ModuleSchema>
}

// Turn a category name into a stable section id, e.g. "Sequence Control" -> "sequence-control"
function categoryToSectionId(category: string): string {
	return category.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

const White = combineRgb(255, 255, 255)
const Black = combineRgb(0, 0, 0)
const Green = combineRgb(0, 200, 0)
const Red = combineRgb(200, 0, 0)
const Blue = combineRgb(0, 100, 200)
const Orange = combineRgb(255, 150, 0)
const Purple = combineRgb(150, 0, 200)

export function GetPresetsList(
	sequences: SequenceInfo[],
	_getSequenceStates: () => Map<number, TransportState>,
): PresetsResult {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {}
	const categoryToIds = new Map<string, string[]>()

	function addPreset(id: string, category: string, definition: CompanionPresetDefinitions<ModuleSchema>[string]): void {
		presets[id] = definition
		const ids = categoryToIds.get(category) ?? []
		ids.push(id)
		categoryToIds.set(category, ids)
	}

	// ========== Dynamic Sequence Selection ==========

	for (const seq of sequences) {
		addPreset(`seq_select_${seq.id}`, 'Sequence Selection', {
			type: 'simple',
			name: `Select ${seq.name} (${seq.id})`,
			style: {
				text: `Edit:\n${seq.name}\n(${seq.id})`,
				size: 'auto',
				color: White,
				bgcolor: Blue,
			},
			feedbacks: [],
			steps: [
				{
					down: [
						{
							actionId: ActionId.SelectSequence,
							options: {
								sequence: seq.id,
							},
						},
					],
					up: [],
				},
			],
		})
	}

	// ========== Dynamic SMPTE Timecode Mode ==========

	const Yellow = combineRgb(200, 200, 0)
	const Gray = combineRgb(80, 80, 80)

	for (const seq of sequences) {
		// SMPTE None (Off)
		addPreset(`seq_smpte_none_${seq.id}`, 'SMPTE Timecode', {
			type: 'simple',
			name: `${seq.name} (${seq.id}): SMPTE Off`,
			style: {
				text: `${seq.name} (${seq.id})\nSMPTE Off`,
				size: 'auto',
				color: White,
				bgcolor: Gray,
			},
			feedbacks: [],
			steps: [
				{
					down: [
						{
							actionId: ActionId.SetSmpteMode,
							options: {
								sequence: seq.id,
								mode: 0,
							},
						},
					],
					up: [],
				},
			],
		})

		// SMPTE Send
		addPreset(`seq_smpte_send_${seq.id}`, 'SMPTE Timecode', {
			type: 'simple',
			name: `${seq.name} (${seq.id}): SMPTE Send`,
			style: {
				text: `${seq.name} (${seq.id})\nSMPTE Send`,
				size: 'auto',
				color: Black,
				bgcolor: Yellow,
			},
			feedbacks: [],
			steps: [
				{
					down: [
						{
							actionId: ActionId.SetSmpteMode,
							options: {
								sequence: seq.id,
								mode: 1,
							},
						},
					],
					up: [],
				},
			],
		})

		// SMPTE Receive
		addPreset(`seq_smpte_receive_${seq.id}`, 'SMPTE Timecode', {
			type: 'simple',
			name: `${seq.name} (${seq.id}): SMPTE Receive`,
			style: {
				text: `${seq.name} (${seq.id})\nSMPTE Recv`,
				size: 'auto',
				color: White,
				bgcolor: Purple,
			},
			feedbacks: [],
			steps: [
				{
					down: [
						{
							actionId: ActionId.SetSmpteMode,
							options: {
								sequence: seq.id,
								mode: 2,
							},
						},
					],
					up: [],
				},
			],
		})
	}

	// ========== Application ==========

	addPreset('app_save_project', 'Application', {
		type: 'simple',
		name: 'Save Project',
		style: {
			text: 'Save\\nProject',
			size: 'auto',
			color: White,
			bgcolor: Blue,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.SaveProject, options: {} }],
				up: [],
			},
		],
	})

	addPreset('app_toggle_fullscreen', 'Application', {
		type: 'simple',
		name: 'Toggle Fullscreen',
		style: {
			text: 'Fullscreen\\nSite 1',
			size: 'auto',
			color: White,
			bgcolor: Blue,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.ToggleFullscreen, options: { site: 1 } }],
				up: [],
			},
		],
	})

	addPreset('app_recall_view', 'Application', {
		type: 'simple',
		name: 'Recall GUI View',
		style: {
			text: 'View 1',
			size: 'auto',
			color: White,
			bgcolor: Blue,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.ApplyView, options: { view: 1 } }],
				up: [],
			},
		],
	})

	addPreset('app_set_site_ip', 'Application', {
		type: 'simple',
		name: 'Set Site IP',
		style: {
			text: 'Set Site IP\\nID 1',
			size: 'auto',
			color: White,
			bgcolor: Blue,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.SetSiteIp, options: { site: 1, ip: '192.168.1.100' } }],
				up: [],
			},
		],
	})

	// ========== Programming ==========

	addPreset('prog_store_active', 'Programming', {
		type: 'simple',
		name: 'Store Active',
		style: {
			text: 'Store\nActive',
			size: 'auto',
			color: Black,
			bgcolor: Orange,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.StoreActive, options: { seq: 1 } }],
				up: [],
			},
		],
	})

	addPreset('prog_store_active_begin', 'Programming', {
		type: 'simple',
		name: 'Store Active to Container Beginning',
		style: {
			text: 'Store\nCont. Beg.',
			size: 'auto',
			color: Black,
			bgcolor: Orange,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.StoreActiveToBeginning, options: { seq: 1 } }],
				up: [],
			},
		],
	})

	addPreset('prog_clear_active', 'Programming', {
		type: 'simple',
		name: 'Clear All Active',
		style: {
			text: 'Clear\\nAll Active',
			size: 'auto',
			color: White,
			bgcolor: Red,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.ClearAllActive, options: {} }],
				up: [],
			},
		],
	})

	addPreset('prog_reset_all', 'Programming', {
		type: 'simple',
		name: 'Reset All Values',
		style: {
			text: 'Reset\\nAll',
			size: 'auto',
			color: White,
			bgcolor: Red,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.ResetAll, options: {} }],
				up: [],
			},
		],
	})

	// ========== Sequence Control ==========

	addPreset('seq_goto_cue', 'Sequence Control', {
		type: 'simple',
		name: 'Goto Cue',
		style: {
			text: 'Goto\\nCue 1',
			size: 'auto',
			color: White,
			bgcolor: Green,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.GotoCue, options: { seq: 1, cue: 1 } }],
				up: [],
			},
		],
	})

	addPreset('seq_next_cue', 'Sequence Control', {
		type: 'simple',
		name: 'Next Cue',
		style: {
			text: 'Next\\nCue',
			size: 'auto',
			color: White,
			bgcolor: Green,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.NextLastCue, options: { seq: 1, isNext: 1 } }],
				up: [],
			},
		],
	})

	addPreset('seq_last_cue', 'Sequence Control', {
		type: 'simple',
		name: 'Last Cue',
		style: {
			text: 'Last\\nCue',
			size: 'auto',
			color: White,
			bgcolor: Green,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.NextLastCue, options: { seq: 1, isNext: 0 } }],
				up: [],
			},
		],
	})

	addPreset('seq_ignore_next', 'Sequence Control', {
		type: 'simple',
		name: 'Ignore Next Cue',
		style: {
			text: 'Ignore\\nNext',
			size: 'auto',
			color: White,
			bgcolor: Orange,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.IgnoreNextCue, options: { seq: 1, doIgnore: 1 } }],
				up: [],
			},
		],
	})

	addPreset('seq_transport_play', 'Sequence Control', {
		type: 'simple',
		name: 'Sequence Play',
		style: {
			text: '▶\\nPlay',
			size: 'auto',
			color: White,
			bgcolor: Green,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.SeqTransport, options: { seq: 1, mode: 1 } }],
				up: [],
			},
		],
	})

	addPreset('seq_transport_pause', 'Sequence Control', {
		type: 'simple',
		name: 'Sequence Pause',
		style: {
			text: '⏸\\nPause',
			size: 'auto',
			color: White,
			bgcolor: Orange,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.SeqTransport, options: { seq: 1, mode: 3 } }],
				up: [],
			},
		],
	})

	addPreset('seq_transport_stop', 'Sequence Control', {
		type: 'simple',
		name: 'Sequence Stop',
		style: {
			text: '⏹\\nStop',
			size: 'auto',
			color: White,
			bgcolor: Red,
		},
		feedbacks: [],
		steps: [
			{
				down: [{ actionId: ActionId.SeqTransport, options: { seq: 1, mode: 2 } }],
				up: [],
			},
		],
	})

	const structure: CompanionPresetSection[] = Array.from(categoryToIds.entries()).map(([category, ids]) => ({
		id: categoryToSectionId(category),
		name: category,
		definitions: ids,
	}))

	return { structure, presets }
}
