import {
	InstanceBase,
	InstanceStatus,
	type SomeCompanionConfigField,
	type CompanionActionSchemaWithoutResult,
	type CompanionActionSchemaWithResult,
	type CompanionFeedbackSchema,
	type CompanionOptionValues,
	type CompanionVariableValues,
	type JsonValue,
} from '@companion-module/base'
import { GetActionsList } from './actions.js'
import { GetConfigFields, type DeviceConfig } from './config.js'
import { GetFeedbacksList, type ModuleState } from './feedback.js'
import { GetPresetsList } from './presets.js'
import { PBClient, type TransportState, type SequenceInfo, type CueInfo } from './client.js'
import {
	GetVariableDefinitions,
	GetSequenceVariableDefinitions,
	GetSequenceVariableValues,
	GetSequenceStatusVariableDefinitions,
	GetSequenceStatusVariableValues,
	GetSequenceTimeVariableDefinitions,
	GetSequenceTimeVariableValues,
	GetSequenceCountdownVariableDefinitions,
	GetSequenceCountdownVariableValues,
	GetSequenceNextCueVariableDefinitions,
	GetSequenceNextCueVariableValues,
	GetSequenceOpacityVariableDefinitions,
	GetSequenceOpacityVariableValues,
	type SequenceTime,
} from './variables.js'
import { UpgradeScripts } from './upgrades.js'

export type ModuleSchema = {
	config: DeviceConfig
	secrets: undefined
	actions: Record<
		string,
		| CompanionActionSchemaWithoutResult<CompanionOptionValues>
		| CompanionActionSchemaWithResult<CompanionOptionValues, JsonValue>
	>
	feedbacks: Record<string, CompanionFeedbackSchema<CompanionOptionValues>>
	variables: CompanionVariableValues
}

export { UpgradeScripts }

export default class TwolooxPandorasInstance extends InstanceBase<ModuleSchema> {
	private client: PBClient | undefined
	private state: ModuleState = {
		transport: 'Unknown',
		remaining: { h: 0, m: 0, s: 0, f: 0 },
	}
	private sequences: SequenceInfo[] = []
	private sequenceRefreshTimer: NodeJS.Timeout | undefined
	private sequenceStates: Map<number, TransportState> = new Map()
	private sequenceTimes: Map<number, SequenceTime> = new Map()
	private sequenceCountdowns: Map<number, SequenceTime> = new Map()
	private sequenceCueInfos: Map<number, CueInfo> = new Map()
	private sequenceOpacities: Map<number, number> = new Map()

	public getSequenceChoices(): { id: number; label: string }[] {
		if (this.sequences.length === 0) {
			return [{ id: 1, label: 'Sequence 1 (not connected)' }]
		}
		return this.sequences.map((seq) => ({
			id: seq.id,
			label: `${seq.id}: ${seq.name}`,
		}))
	}

	private updateActionDefinitions(): void {
		this.setActionDefinitions(
			GetActionsList(
				() => this.client,
				() => this.getSequenceChoices(),
				(seqId) => this.sequenceStates.get(seqId) || 'Unknown',
			),
		)
	}

	public async init(config: DeviceConfig): Promise<void> {
		this.updateActionDefinitions()
		this.setFeedbackDefinitions(
			GetFeedbacksList(
				() => this.state,
				() => this.getSequenceChoices(),
				(seqId) => this.sequenceStates.get(seqId) || 'Unknown',
			),
		)
		const initialPresets = GetPresetsList(this.sequences, () => this.sequenceStates)
		this.setPresetDefinitions(initialPresets.structure, initialPresets.presets)
		this.setVariableDefinitions(GetVariableDefinitions())

		await this.configUpdated(config)
	}

	public async destroy(): Promise<void> {
		if (this.sequenceRefreshTimer) {
			clearInterval(this.sequenceRefreshTimer)
			this.sequenceRefreshTimer = undefined
		}
		this.client?.disconnect()
		this.client = undefined
	}

	public getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	public async configUpdated(config: DeviceConfig): Promise<void> {
		if (this.sequenceRefreshTimer) {
			clearInterval(this.sequenceRefreshTimer)
			this.sequenceRefreshTimer = undefined
		}
		this.client?.disconnect()
		this.client = undefined
		this.sequences = []

		const host = config.host?.trim()
		const domain = Number(config.domain ?? 0)

		if (!host) {
			this.updateStatus(InstanceStatus.BadConfig, 'Host is required')
			return
		}

		this.updateStatus(InstanceStatus.Connecting)

		let protocolAliveResolve: (() => void) | undefined
		const protocolAlive = new Promise<void>((resolve) => {
			protocolAliveResolve = resolve
		})

		const client = new PBClient(
			host,
			domain,
			{
				onProtocolAlive: () => {
					protocolAliveResolve?.()
					protocolAliveResolve = undefined
				},
				onDisconnected: () => {
					// Only report disconnect if this is the active client
					if (this.client === client) {
						this.updateStatus(InstanceStatus.Disconnected, 'Disconnected from Pandoras Box')
					}
				},
				onTransport: (state) => {
					this.state.transport = state
				},
				onSequenceTransport: (seqId, state) => {
					this.sequenceStates.set(seqId, state)
					this.updateSequenceStatusVariables()
					this.checkAllFeedbacks()
				},
				onSequenceTime: (seqId, h, m, s, f) => {
					this.sequenceTimes.set(seqId, { h, m, s, f })
					this.updateSequenceTimeVariables()
				},
				onSequenceCountdown: (seqId, h, m, s, f) => {
					this.sequenceCountdowns.set(seqId, { h, m, s, f })
					this.updateSequenceCountdownVariables()
				},
				onSequenceCueInfo: (seqId, cueInfo) => {
					this.sequenceCueInfos.set(seqId, cueInfo)
					this.updateSequenceNextCueVariables()
				},
				onSequenceOpacity: (seqId, value) => {
					this.sequenceOpacities.set(seqId, value)
					this.updateSequenceOpacityVariables()
				},
				onSequencesUpdated: (sequences) => {
					this.log('info', `Received ${sequences.length} sequences from Pandoras Box`)
					this.sequences = sequences
					// Update actions with new sequence choices
					this.updateActionDefinitions()
					// Update variable definitions and values for sequences
					this.updateSequenceVariables()
					// Start polling sequence statuses
					this.client?.setPollSequences(sequences.map((s) => s.id))
					// Update presets with new sequences
					this.updatePresetDefinitions()
				},
				onDebug: (message) => {
					this.log('debug', `[PBClient] ${message}`)
				},
				onError: (err) => {
					this.log('error', err.message)
					this.updateStatus(InstanceStatus.UnknownError, err.message)
				},
			},
			config.debugTraffic,
		)

		this.client = client

		try {
			await client.connect()

			// TCP is connected at this point; now verify we also get a PBAU response for the configured domain.
			this.log('info', 'TCP connected, verifying Pandoras Box protocol response...')
			await client.refreshSequences()

			const timeoutMs = 3000
			await Promise.race([
				protocolAlive,
				new Promise<void>((_, reject) =>
					setTimeout(() => reject(new Error('No response from Pandoras Box (check Domain)')), timeoutMs),
				),
			])

			this.updateStatus(InstanceStatus.Ok)
			this.log('info', 'Connected to Pandoras Box, requesting sequences...')
			// Fetch sequences immediately and then every 10 seconds
			const refreshSequences = () => {
				this.log('debug', 'Refreshing sequences...')
				void client.refreshSequences()
			}
			// Initial refresh after 500ms
			setTimeout(refreshSequences, 500)
			// Then refresh every 10 seconds
			this.sequenceRefreshTimer = setInterval(refreshSequences, 10000)
		} catch (e: any) {
			const msg = e?.message ?? 'Connect failed'
			this.log('error', msg)
			// If we connected TCP but never got a protocol response, this often indicates a wrong domain.
			this.updateStatus(InstanceStatus.BadConfig, msg)
			client.disconnect()
		}
	}

	private updateSequenceVariables(): void {
		// Update variable definitions to include sequence variables
		const baseVars = GetVariableDefinitions()
		const seqVars = GetSequenceVariableDefinitions(this.sequences)
		const statusVars = GetSequenceStatusVariableDefinitions(this.sequences)
		const timeVars = GetSequenceTimeVariableDefinitions(this.sequences)
		const countdownVars = GetSequenceCountdownVariableDefinitions(this.sequences)
		const nextCueVars = GetSequenceNextCueVariableDefinitions(this.sequences)
		const opacityVars = GetSequenceOpacityVariableDefinitions(this.sequences)
		this.setVariableDefinitions({
			...baseVars,
			...seqVars,
			...statusVars,
			...timeVars,
			...countdownVars,
			...nextCueVars,
			...opacityVars,
		})

		// Set the sequence variable values
		const seqValues = GetSequenceVariableValues(this.sequences)
		this.setVariableValues(seqValues)
		this.log(
			'debug',
			`Created ${this.sequences.length} sequence variables (name, status, time, countdown, nextcue, opacity)`,
		)
	}

	private updateSequenceStatusVariables(): void {
		const statusValues = GetSequenceStatusVariableValues(this.sequences, this.sequenceStates)
		this.setVariableValues(statusValues)
	}

	private updateSequenceTimeVariables(): void {
		const timeValues = GetSequenceTimeVariableValues(this.sequences, this.sequenceTimes)
		this.setVariableValues(timeValues)
	}

	private updateSequenceCountdownVariables(): void {
		const countdownValues = GetSequenceCountdownVariableValues(this.sequences, this.sequenceCountdowns)
		this.setVariableValues(countdownValues)
	}

	private updateSequenceNextCueVariables(): void {
		const nextCueValues = GetSequenceNextCueVariableValues(this.sequences, this.sequenceCueInfos)
		this.setVariableValues(nextCueValues)
	}

	private updateSequenceOpacityVariables(): void {
		const opacityValues = GetSequenceOpacityVariableValues(this.sequences, this.sequenceOpacities)
		this.setVariableValues(opacityValues)
	}

	private updatePresetDefinitions(): void {
		const updatedPresets = GetPresetsList(this.sequences, () => this.sequenceStates)
		this.setPresetDefinitions(updatedPresets.structure, updatedPresets.presets)
	}
}
