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
import { FeedbackId, GetFeedbacksList } from './feedback.js'
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
	GetSequenceCountupVariableDefinitions,
	GetSequenceCountupVariableValues,
	GetSequenceNextCueVariableDefinitions,
	GetSequenceNextCueVariableValues,
	GetSequencePrevCueVariableDefinitions,
	GetSequencePrevCueVariableValues,
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

function totalSeconds(t: SequenceTime): number {
	return t.h * 3600 + t.m * 60 + t.s
}

export default class TwolooxPandorasInstance extends InstanceBase<ModuleSchema> {
	private client: PBClient | undefined
	private sequences: SequenceInfo[] = []
	private sequenceRefreshTimer: NodeJS.Timeout | undefined
	private sequenceStates: Map<number, TransportState> = new Map()
	private sequenceTimes: Map<number, SequenceTime> = new Map()
	private sequenceCountdowns: Map<number, SequenceTime> = new Map()
	private sequenceCueInfos: Map<number, CueInfo> = new Map()
	private sequenceOpacities: Map<number, number> = new Map()
	private reconnectTimer: NodeJS.Timeout | undefined
	private static readonly RECONNECT_INTERVAL_MS = 10000

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
				(seqId) => this.sequenceTimes.get(seqId),
			),
		)
	}

	private updateFeedbackDefinitions(): void {
		this.setFeedbackDefinitions(
			GetFeedbacksList(
				() => this.getSequenceChoices(),
				(seqId) => this.sequenceStates.get(seqId) || 'Unknown',
				(seqId) => this.sequenceCountdowns.get(seqId),
			),
		)
	}

	public async init(config: DeviceConfig): Promise<void> {
		this.updateActionDefinitions()
		this.updateFeedbackDefinitions()
		const initialPresets = GetPresetsList(this.sequences, () => this.sequenceStates)
		this.setPresetDefinitions(initialPresets.structure, initialPresets.presets)
		this.setVariableDefinitions(GetVariableDefinitions())

		await this.configUpdated(config)
	}

	public async destroy(): Promise<void> {
		this.clearReconnectTimer()
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
		this.clearReconnectTimer()
		await this.connectToDevice(config)
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = undefined
		}
	}

	private scheduleReconnect(config: DeviceConfig): void {
		this.clearReconnectTimer()
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined
			this.log('info', 'Attempting to reconnect to Pandoras Box...')
			void this.connectToDevice(config)
		}, TwolooxPandorasInstance.RECONNECT_INTERVAL_MS)
	}

	private async connectToDevice(config: DeviceConfig): Promise<void> {
		if (this.sequenceRefreshTimer) {
			clearInterval(this.sequenceRefreshTimer)
			this.sequenceRefreshTimer = undefined
		}
		this.client?.disconnect()
		this.client = undefined
		this.resetSequenceState()
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
						this.resetSequenceState()
						this.scheduleReconnect(config)
					}
				},
				onSequenceTransport: (seqId, state) => {
					if (this.sequenceStates.get(seqId) === state) return
					this.sequenceStates.set(seqId, state)
					this.setSequenceValues(seqId, (seqs) => GetSequenceStatusVariableValues(seqs, this.sequenceStates))
					this.checkFeedbacks(FeedbackId.SequenceTransportState)
				},
				onSequenceTime: (seqId, h, m, s, f) => {
					this.sequenceTimes.set(seqId, { h, m, s, f })
					this.setSequenceValues(seqId, (seqs) => ({
						...GetSequenceTimeVariableValues(seqs, this.sequenceTimes),
						...GetSequenceCountupVariableValues(seqs, this.sequenceTimes, this.sequenceCueInfos),
					}))
				},
				onSequenceCountdown: (seqId, h, m, s, f) => {
					const previous = this.sequenceCountdowns.get(seqId)
					const countdown = { h, m, s, f }
					this.sequenceCountdowns.set(seqId, countdown)
					this.setSequenceValues(seqId, (seqs) => GetSequenceCountdownVariableValues(seqs, this.sequenceCountdowns))
					// The threshold feedback compares whole seconds, so it only needs re-checking when those change.
					if (!previous || totalSeconds(previous) !== totalSeconds(countdown)) {
						this.checkFeedbacks(FeedbackId.RemainingCueThreshold)
					}
				},
				onSequenceCueInfo: (seqId, cueInfo) => {
					if (JSON.stringify(this.sequenceCueInfos.get(seqId)) === JSON.stringify(cueInfo)) return
					this.sequenceCueInfos.set(seqId, cueInfo)
					this.setSequenceValues(seqId, (seqs) => ({
						...GetSequenceNextCueVariableValues(seqs, this.sequenceCueInfos),
						...GetSequencePrevCueVariableValues(seqs, this.sequenceCueInfos),
						...GetSequenceCountupVariableValues(seqs, this.sequenceTimes, this.sequenceCueInfos),
					}))
				},
				onSequenceOpacity: (seqId, value) => {
					if (this.sequenceOpacities.get(seqId) === value) return
					this.sequenceOpacities.set(seqId, value)
					this.setSequenceValues(seqId, (seqs) => GetSequenceOpacityVariableValues(seqs, this.sequenceOpacities))
				},
				onSequencesUpdated: (sequences) => {
					// Ignore late responses from a client that's no longer the active one (e.g. config
					// was changed again while this request was still in flight).
					if (this.client !== client) return
					// Runs on every refresh, not just on changes: it also replaces dead timecode connections.
					client.setPollSequences(sequences.map((s) => s.id))
					// The list is re-fetched every 10s - only push new definitions when something changed.
					if (JSON.stringify(sequences) === JSON.stringify(this.sequences)) return
					this.log('info', `Received ${sequences.length} sequences from Pandoras Box`)
					this.sequences = sequences
					this.updateActionDefinitions()
					this.updateFeedbackDefinitions()
					this.updateSequenceVariables()
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
			void client.refreshSequences()

			const timeoutMs = 3000
			await Promise.race([
				protocolAlive,
				new Promise<void>((_, reject) =>
					setTimeout(() => reject(new Error('No response from Pandoras Box (check Domain)')), timeoutMs),
				),
			])

			this.updateStatus(InstanceStatus.Ok)
			this.log('info', 'Connected to Pandoras Box')
			// Re-fetch the sequence list every 10 seconds to pick up added/removed/renamed sequences
			this.sequenceRefreshTimer = setInterval(() => {
				this.log('debug', 'Refreshing sequences...')
				void client.refreshSequences()
			}, 10000)
		} catch (e: any) {
			const msg = e?.message ?? 'Connect failed'
			this.log('error', msg)
			// If we connected TCP but never got a protocol response, this often indicates a wrong domain.
			// We'll keep retrying automatically, so this reflects an ongoing failure, not a fatal config error.
			this.updateStatus(InstanceStatus.ConnectionFailure, msg)
			// Clear this.client first so the async 'close' event triggered by disconnect() below doesn't
			// also run onDisconnected's status update/reconnect scheduling for the same failure.
			if (this.client === client) {
				this.client = undefined
			}
			client.disconnect()
			this.scheduleReconnect(config)
		}
	}

	// Pushes variable values for a single sequence only: time/countdown/cue updates arrive up to 30x/sec
	// per sequence, so rebuilding every sequence's values on each of them scales badly with many sequences.
	private setSequenceValues(seqId: number, build: (seqs: SequenceInfo[]) => CompanionVariableValues): void {
		const seq = this.sequences.find((s) => s.id === seqId)
		if (!seq) return
		this.setVariableValues(build([seq]))
	}

	// Once the device is gone, buttons must not keep showing its last known state (e.g. "Play" or a
	// frozen timecode) - reset every per-sequence value to its "no data" placeholder.
	private resetSequenceState(): void {
		this.sequenceStates.clear()
		this.sequenceTimes.clear()
		this.sequenceCountdowns.clear()
		this.sequenceCueInfos.clear()
		this.sequenceOpacities.clear()
		const seqs = this.sequences
		this.setVariableValues({
			...GetSequenceStatusVariableValues(seqs, this.sequenceStates),
			...GetSequenceTimeVariableValues(seqs, this.sequenceTimes),
			...GetSequenceCountdownVariableValues(seqs, this.sequenceCountdowns),
			...GetSequenceCountupVariableValues(seqs, this.sequenceTimes, this.sequenceCueInfos),
			...GetSequenceNextCueVariableValues(seqs, this.sequenceCueInfos),
			...GetSequencePrevCueVariableValues(seqs, this.sequenceCueInfos),
			...GetSequenceOpacityVariableValues(seqs, this.sequenceOpacities),
		})
		this.checkAllFeedbacks()
	}

	private updateSequenceVariables(): void {
		// Update variable definitions to include sequence variables
		const baseVars = GetVariableDefinitions()
		const seqVars = GetSequenceVariableDefinitions(this.sequences)
		const statusVars = GetSequenceStatusVariableDefinitions(this.sequences)
		const timeVars = GetSequenceTimeVariableDefinitions(this.sequences)
		const countdownVars = GetSequenceCountdownVariableDefinitions(this.sequences)
		const countupVars = GetSequenceCountupVariableDefinitions(this.sequences)
		const nextCueVars = GetSequenceNextCueVariableDefinitions(this.sequences)
		const prevCueVars = GetSequencePrevCueVariableDefinitions(this.sequences)
		const opacityVars = GetSequenceOpacityVariableDefinitions(this.sequences)
		this.setVariableDefinitions({
			...baseVars,
			...seqVars,
			...statusVars,
			...timeVars,
			...countdownVars,
			...countupVars,
			...nextCueVars,
			...prevCueVars,
			...opacityVars,
		})

		// Set the sequence variable values
		const seqValues = GetSequenceVariableValues(this.sequences)
		this.setVariableValues(seqValues)
		this.log(
			'debug',
			`Created variables for ${this.sequences.length} sequences (name, status, time, countdown, countup, next/prev cue, opacity)`,
		)
	}

	private updatePresetDefinitions(): void {
		const updatedPresets = GetPresetsList(this.sequences, () => this.sequenceStates)
		this.setPresetDefinitions(updatedPresets.structure, updatedPresets.presets)
	}
}
