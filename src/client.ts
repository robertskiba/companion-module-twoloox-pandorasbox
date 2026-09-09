import net from 'net'
import { CommandId, PR_PORT } from './constants.js'

export type TransportState = 'Play' | 'Pause' | 'Stop' | 'Unknown'

export interface SequenceInfo {
	id: number
	name: string
}

export interface CueInfo {
	nextCueId: number
	nextCueName: string
	nextCueMode: number // 0=Pause, 1=Play, 2=Stop, 3=Jump, 4=Wait
}

export interface PollHandlers {
	/** Called once when we receive the first valid PBAU packet for the configured domain */
	onProtocolAlive?: () => void
	/** Called when the main TCP connection closes */
	onDisconnected?: () => void
	onSequenceTime?: (seqId: number, h: number, m: number, s: number, f: number) => void
	onSequenceCountdown?: (seqId: number, h: number, m: number, s: number, f: number) => void
	onSequenceCueInfo?: (seqId: number, cueInfo: CueInfo) => void
	onNextCueTime?: (h: number, m: number, s: number, f: number) => void
	onTransport?: (state: TransportState) => void
	onSequenceTransport?: (seqId: number, state: TransportState) => void
	onSequencesUpdated?: (sequences: SequenceInfo[]) => void
	onError?: (err: Error) => void
	onDebug?: (message: string) => void
}

// Lightweight connection for a single sequence's timecode polling
class SequenceConnection {
	private host: string
	private domain: number
	private seqId: number
	private socket: net.Socket | null = null
	private pollTimer: NodeJS.Timeout | null = null
	private connected = false
	private onTime: (h: number, m: number, s: number, f: number) => void
	private onCountdown: (h: number, m: number, s: number, f: number) => void
	private onCueInfo: (cueInfo: CueInfo) => void
	private onDebug?: (message: string) => void
	private currentState: TransportState = 'Unknown'

	private static readonly POLL_FAST = 33 // 30x/sec when playing
	private static readonly POLL_SLOW = 200 // 5x/sec when stopped/paused

	constructor(
		host: string,
		domain: number,
		seqId: number,
		onTime: (h: number, m: number, s: number, f: number) => void,
		onCountdown: (h: number, m: number, s: number, f: number) => void,
		onCueInfo: (cueInfo: CueInfo) => void,
		onDebug?: (message: string) => void,
	) {
		this.host = host
		this.domain = domain
		this.seqId = seqId
		this.onTime = onTime
		this.onCountdown = onCountdown
		this.onCueInfo = onCueInfo
		this.onDebug = onDebug
	}

	async connect(): Promise<void> {
		if (this.socket) return

		await new Promise<void>((resolve, reject) => {
			const sock = new net.Socket()
			this.socket = sock

			sock.once('error', (err) => {
				this.onDebug?.(`SeqConn[${this.seqId}] error: ${err.message}`)
				this.connected = false
				this.socket = null
				reject(err)
			})

			sock.once('close', () => {
				this.connected = false
				this.socket = null
				this.stopPolling()
			})

			sock.on('data', (data) => this.handleData(data))

			sock.connect({ host: this.host, port: PR_PORT }, () => {
				this.connected = true
				resolve()
				this.startPolling()
			})
		})
	}

	disconnect(): void {
		this.stopPolling()
		if (this.socket) {
			this.socket.destroy()
			this.socket = null
		}
		this.connected = false
	}

	updateState(state: TransportState): void {
		this.currentState = state
	}

	private startPolling(): void {
		this.stopPolling()
		this.scheduleNextPoll()
	}

	private stopPolling(): void {
		if (this.pollTimer) {
			clearTimeout(this.pollTimer)
			this.pollTimer = null
		}
	}

	private scheduleNextPoll(): void {
		const interval = this.currentState === 'Play' ? SequenceConnection.POLL_FAST : SequenceConnection.POLL_SLOW

		this.pollTimer = setTimeout(() => {
			void (async () => {
				if (!this.connected || !this.socket) return

				try {
					await this.sendGetTime()
				} catch (e) {
					this.onDebug?.(`SeqConn[${this.seqId}] send error: ${e}`)
				}

				this.scheduleNextPoll()
			})()
		}, interval)
	}

	private async sendGetTime(): Promise<void> {
		const seqIdBuf = Buffer.alloc(4)
		seqIdBuf.writeInt32BE(this.seqId)
		await this.send(CommandId.GetSeqTime, [seqIdBuf])
		// Also request countdown to next cue
		const seqIdBuf2 = Buffer.alloc(4)
		seqIdBuf2.writeInt32BE(this.seqId)
		await this.send(CommandId.GetRemainingTimeUntilNextCue, [seqIdBuf2])
		// Also request cue info (for next cue name/mode)
		const seqIdBuf3 = Buffer.alloc(4)
		seqIdBuf3.writeInt32BE(this.seqId)
		await this.send(CommandId.GetCurrentTimeCueInfo, [seqIdBuf3])
	}

	private handleData(data: Buffer): void {
		try {
			if (data.length < 19) return
			if (data.toString('ascii', 0, 4) !== 'PBAU') return
			const domain = data.readInt32BE(5)
			if (domain !== this.domain) return
			const cmdId: CommandId = data.readInt16BE(17)

			if (cmdId === CommandId.GetSeqTime && data.length >= 35) {
				const h = data.readInt32BE(19)
				const m = data.readInt32BE(23)
				const s = data.readInt32BE(27)
				const f = data.readInt32BE(31)
				this.onTime(h, m, s, f)
			} else if (cmdId === CommandId.GetRemainingTimeUntilNextCue && data.length >= 35) {
				const h = data.readInt32BE(19)
				const m = data.readInt32BE(23)
				const s = data.readInt32BE(27)
				const f = data.readInt32BE(31)
				this.onCountdown(h, m, s, f)
			} else if (cmdId === CommandId.GetCurrentTimeCueInfo) {
				// Parse CueInfo response.
				// StringNarrow format: 2-byte length prefix (BE) + chars
				// Layout: currentTime(4 ints), previousCueId(int), previousCueName(StringNarrow),
				//         previousCueTime(4 ints), previousCueMode(int),
				//         nextCueId(int), nextCueName(StringNarrow), nextCueTime(4 ints), nextCueMode(int)
				try {
					let offset = 19

					// current sequence time (hours/minutes/seconds/frames) - 4 ints
					offset += 16

					// previousCueId
					offset += 4

					// previousCueName - StringNarrow: 2-byte length + chars
					if (offset + 2 > data.length) return
					const prevNameLen = data.readInt16BE(offset)
					offset += 2 + prevNameLen

					// previousCueTime (4 ints)
					offset += 16

					// previousCueMode
					offset += 4

					// nextCueId
					if (offset + 4 > data.length) return
					const nextCueId = data.readInt32BE(offset)
					offset += 4

					// nextCueName - StringNarrow: 2-byte length + chars
					if (offset + 2 > data.length) return
					const nextNameLen = data.readInt16BE(offset)
					offset += 2
					if (offset + nextNameLen > data.length) return
					const nextCueName = data.toString('latin1', offset, offset + nextNameLen)
					offset += nextNameLen

					// nextCueTime (4 ints)
					offset += 16

					// nextCueMode
					if (offset + 4 > data.length) return
					const nextCueMode = data.readInt32BE(offset)

					this.onCueInfo({ nextCueId, nextCueName, nextCueMode })
				} catch (e) {
					this.onDebug?.(`SeqConn[${this.seqId}] CueInfo parse error: ${e}`)
				}
			}
		} catch (e) {
			this.onDebug?.(`SeqConn[${this.seqId}] parse error: ${e}`)
		}
	}

	private async send(commandId: CommandId, parts: Buffer[]): Promise<void> {
		if (!this.socket || !this.connected) return

		const body = Buffer.concat([this.writeShort(commandId), ...parts])
		const header = this.buildHeader(body.length)
		const checksum = this.checksum(header)
		const message = Buffer.concat([Buffer.from('PBAU', 'ascii'), header, Buffer.from([checksum]), body])

		await new Promise<void>((resolve, reject) => {
			this.socket?.write(message, (err) => {
				if (err) reject(err)
				else resolve()
			})
		})
	}

	private buildHeader(bodyLen: number): Buffer {
		const preHeader = Buffer.from([1])
		const domain = this.writeInt(this.domain)
		const length = Buffer.from([Math.floor(bodyLen / 256), bodyLen % 256])
		const postHeader = Buffer.from([0, 0, 0, 0, 0])
		return Buffer.concat([preHeader, domain, length, postHeader])
	}

	private checksum(buf: Buffer): number {
		let sum = 0
		for (const b of buf.values()) sum = (sum + b) % 256
		return sum
	}

	private writeShort(n: number): Buffer {
		const b = Buffer.alloc(2)
		b.writeUInt16BE(n)
		return b
	}

	private writeInt(n: number): Buffer {
		const b = Buffer.alloc(4)
		b.writeInt32BE(n)
		return b
	}
}

export class PBClient {
	private host: string
	private domain: number
	private pollHandlers: PollHandlers
	private statusPollTimer: NodeJS.Timeout | null = null
	private socket: net.Socket | null = null
	private connecting = false
	private pendingSequenceIds: number[] = []
	private pendingSequenceNames: Map<number, string> = new Map()
	private sequenceNameQueue: number[] = []
	private currentSequenceNameId: number | null = null
	private pollSequenceIds: number[] = []
	private statusRequestQueue: number[] = []
	private currentStatusRequestId: number | null = null
	private statusRequestPending = false
	private sequenceStates: Map<number, TransportState> = new Map()
	private gotAnyResponse = false

	// Per-sequence connections for timecode polling
	private sequenceConnections: Map<number, SequenceConnection> = new Map()

	// Polling intervals
	private static readonly STATUS_POLL_INTERVAL = 200 // 5x per second

	constructor(host: string, domain: number, handlers: PollHandlers) {
		this.host = host
		this.domain = domain
		this.pollHandlers = handlers
	}

	async connect(): Promise<void> {
		if (this.socket) return
		this.connecting = true
		await new Promise<void>((resolve, reject) => {
			const sock = new net.Socket()
			this.socket = sock

			sock.once('error', (err) => {
				this.connecting = false
				this.socket = null
				this.pollHandlers.onError?.(err)
				reject(err)
			})

			sock.once('close', () => {
				this.connecting = false
				this.socket = null
				this.stopPolling()
				this.pollHandlers.onDisconnected?.()
			})

			sock.on('data', (data) => this.handleData(data))

			sock.connect({ host: this.host, port: PR_PORT }, () => {
				this.connecting = false
				resolve()
				this.startPolling()
			})
		})
	}

	disconnect(): void {
		this.stopPolling()
		this.disconnectAllSequenceConnections()
		if (this.socket) {
			this.socket.destroy()
			this.socket = null
		}
	}

	private disconnectAllSequenceConnections(): void {
		for (const conn of this.sequenceConnections.values()) {
			conn.disconnect()
		}
		this.sequenceConnections.clear()
	}

	updateHandlers(handlers: PollHandlers): void {
		this.pollHandlers = handlers
	}

	setPollSequences(sequenceIds: number[]): void {
		this.pollSequenceIds = sequenceIds

		// Create/update sequence connections for timecode polling
		void this.updateSequenceConnections(sequenceIds)
	}

	private async updateSequenceConnections(sequenceIds: number[]): Promise<void> {
		// Remove connections for sequences no longer in the list
		for (const [seqId, conn] of this.sequenceConnections.entries()) {
			if (!sequenceIds.includes(seqId)) {
				conn.disconnect()
				this.sequenceConnections.delete(seqId)
			}
		}

		// Create connections for new sequences
		for (const seqId of sequenceIds) {
			if (!this.sequenceConnections.has(seqId)) {
				const conn = new SequenceConnection(
					this.host,
					this.domain,
					seqId,
					(h, m, s, f) => {
						this.pollHandlers.onSequenceTime?.(seqId, h, m, s, f)
					},
					(h, m, s, f) => {
						this.pollHandlers.onSequenceCountdown?.(seqId, h, m, s, f)
					},
					(cueInfo) => {
						this.pollHandlers.onSequenceCueInfo?.(seqId, cueInfo)
					},
					undefined, // No debug logging for sequence connections
				)
				this.sequenceConnections.set(seqId, conn)

				try {
					await conn.connect()
				} catch (e) {
					this.pollHandlers.onDebug?.(`Failed to connect sequence ${seqId}: ${e}`)
				}
			}
		}
	}

	async setTransport(mode: number, sequenceId: number): Promise<void> {
		await this.send(CommandId.SetSeqTransportMode, [this.writeInt(sequenceId), this.writeInt(mode)])
	}

	async selectSequence(sequenceId: number): Promise<void> {
		await this.send(CommandId.SetSeqSelection, [this.writeInt(sequenceId)])
	}

	async gotoCue(sequenceId: number, cueId: number): Promise<void> {
		await this.send(CommandId.MoveSeqToCue, [this.writeInt(sequenceId), this.writeInt(cueId)])
	}

	async nextOrLastCue(sequenceId: number, isNext: boolean): Promise<void> {
		await this.send(CommandId.MoveSeqToLastNextCue, [this.writeInt(sequenceId), Buffer.from([isNext ? 1 : 0])])
	}

	async ignoreNextCue(sequenceId: number, doIgnore: boolean): Promise<void> {
		await this.send(CommandId.IgnoreNextCue, [this.writeInt(sequenceId), Buffer.from([doIgnore ? 1 : 0])])
	}

	async applyView(viewId: number): Promise<void> {
		await this.send(CommandId.ApplyView, [this.writeInt(viewId)])
	}

	async saveProject(): Promise<void> {
		await this.send(CommandId.SaveProject, [])
	}

	async toggleFullscreen(siteId: number): Promise<void> {
		await this.send(CommandId.ToggleFullscreen, [this.writeInt(siteId)])
	}

	async setSiteIp(siteId: number, ip: string): Promise<void> {
		const ipBuf = Buffer.from(ip, 'ascii')
		await this.send(CommandId.SetSiteIp, [this.writeInt(siteId), this.writeShort(ipBuf.length), ipBuf])
	}

	async clearAllActive(): Promise<void> {
		await this.send(CommandId.ClearAllActive, [])
	}

	async storeActive(sequenceId: number): Promise<void> {
		await this.send(CommandId.StoreActive, [this.writeInt(sequenceId)])
	}

	async storeActiveToBeginning(sequenceId: number): Promise<void> {
		await this.send(CommandId.StoreActiveToBeginning, [this.writeInt(sequenceId)])
	}

	async resetAll(): Promise<void> {
		await this.send(CommandId.ResetAll, [])
	}

	async setSequenceSmpteMode(sequenceId: number, mode: number): Promise<void> {
		// mode: 0=None, 1=Send, 2=Receive
		await this.send(CommandId.SetSeqSmpteMode, [this.writeInt(sequenceId), this.writeInt(mode)])
	}

	async refreshSequences(): Promise<void> {
		this.pendingSequenceIds = []
		this.pendingSequenceNames.clear()
		this.sequenceNameQueue = []
		await this.send(CommandId.GetSequenceIds, [])
	}

	private async fetchSequenceName(seqId: number): Promise<void> {
		this.currentSequenceNameId = seqId
		await this.send(CommandId.GetSequenceName, [this.writeInt(seqId)])
	}

	private startPolling(): void {
		this.stopPolling()

		// Reset pending flags when starting fresh
		this.statusRequestPending = false
		this.statusRequestQueue = []

		// Status polling: 5x per second for all sequences
		this.statusPollTimer = setInterval(() => {
			if (this.statusRequestQueue.length === 0 && this.pollSequenceIds.length > 0) {
				this.statusRequestQueue = [...this.pollSequenceIds]
				void this.processStatusRequestQueue()
			}
		}, PBClient.STATUS_POLL_INTERVAL)

		// Timecode polling is now handled by per-sequence connections
	}

	// Called when sequence state changes to update polling speed in sequence connections
	private updateSequenceState(seqId: number, state: TransportState): void {
		this.sequenceStates.set(seqId, state)

		// Notify the sequence connection about state change for adaptive polling
		const conn = this.sequenceConnections.get(seqId)
		if (conn) {
			conn.updateState(state)
		}
	}

	private stopPolling(): void {
		if (this.statusPollTimer) {
			clearInterval(this.statusPollTimer)
			this.statusPollTimer = null
		}
		// Sequence connections handle their own polling
	}

	private async send(commandId: CommandId, parts: Buffer[]): Promise<void> {
		if (!this.socket || this.connecting) {
			return
		}
		const body = Buffer.concat([this.writeShort(commandId), ...parts])
		const header = this.buildHeader(body.length)
		const checksum = this.checksum(header)
		const message = Buffer.concat([Buffer.from('PBAU', 'ascii'), header, Buffer.from([checksum]), body])
		await new Promise<void>((resolve, reject) => {
			this.socket?.write(message, (err) => {
				if (err) {
					this.pollHandlers.onError?.(err)
					reject(err)
				} else {
					resolve()
				}
			})
		})
	}

	private handleData(data: Buffer): void {
		try {
			if (data.length < 19) return
			if (data.toString('ascii', 0, 4) !== 'PBAU') return
			const domain = data.readInt32BE(5)
			if (domain !== this.domain) return

			if (!this.gotAnyResponse) {
				this.gotAnyResponse = true
				this.pollHandlers.onProtocolAlive?.()
			}
			const rawCmdId = data.readInt16BE(17)

			if (rawCmdId === -1) {
				// Error response from Pandoras Box - skip invalid sequence
				if (this.currentStatusRequestId !== null) {
					// Remove invalid sequence from polling list
					const invalidId = this.currentStatusRequestId
					this.pollSequenceIds = this.pollSequenceIds.filter((id) => id !== invalidId)
					void this.processStatusRequestQueue()
				}
				if (this.currentSequenceNameId !== null) {
					// Remove from pending IDs and skip to next
					const invalidId = this.currentSequenceNameId
					this.pendingSequenceIds = this.pendingSequenceIds.filter((id) => id !== invalidId)
					this.currentSequenceNameId = null
					void this.processSequenceNameQueue()
				}
				return
			}

			const cmdId: CommandId = rawCmdId

			switch (cmdId) {
				case CommandId.GetSeqTransportMode: {
					// Response format: Only Int state (no seqId!)
					// We track which seqId we're requesting via currentStatusRequestId
					// State is at offset 19, right after the PBAU header

					this.statusRequestPending = false

					if (data.length >= 23) {
						const stateInt = data.readInt32BE(19)
						const state: TransportState =
							stateInt === 1 ? 'Play' : stateInt === 2 ? 'Stop' : stateInt === 3 ? 'Pause' : 'Unknown'

						// Check if this is for a specific sequence or main polling
						if (this.currentStatusRequestId !== null) {
							// Update internal state for polling speed adjustment
							this.updateSequenceState(this.currentStatusRequestId, state)
							this.pollHandlers.onSequenceTransport?.(this.currentStatusRequestId, state)
							void this.processStatusRequestQueue()
						} else {
							this.pollHandlers.onTransport?.(state)
						}
					}
					break
				}
				// GetSeqTime is handled by per-sequence connections, not main connection
				case CommandId.GetRemainingTimeUntilNextCue: {
					const h = data.readInt32BE(19)
					const m = data.readInt32BE(23)
					const s = data.readInt32BE(27)
					const f = data.readInt32BE(31)
					this.pollHandlers.onNextCueTime?.(h, m, s, f)
					break
				}
				case CommandId.GetSequenceIds: {
					// Response format: Int count (BE), Int mystery (BE), then count * Int IDs (LE)!
					const count = data.readInt32BE(19)

					this.pendingSequenceIds = []
					// Start reading IDs at offset 27, as Little-Endian
					let offset = 27
					for (let i = 0; i < count && offset + 4 <= data.length; i++) {
						const seqId = data.readInt32LE(offset)
						this.pendingSequenceIds.push(seqId)
						offset += 4
					}
					// Queue up name requests
					this.sequenceNameQueue = [...this.pendingSequenceIds]
					this.pendingSequenceNames.clear()
					// Start fetching names
					void this.processSequenceNameQueue()
					break
				}
				case CommandId.GetSequenceName: {
					// Response format: Short strLen, then strLen bytes (ASCII string)
					// No seqId in response! We track it from the request
					if (this.currentSequenceNameId === null) {
						break
					}

					const strLen = data.readInt16BE(19)
					let name = ''
					for (let i = 0; i < strLen && 21 + i < data.length; i++) {
						name += String.fromCharCode(data.readUInt8(21 + i))
					}

					this.pendingSequenceNames.set(this.currentSequenceNameId, name)
					this.currentSequenceNameId = null

					// Check if we got all names
					if (this.pendingSequenceNames.size === this.pendingSequenceIds.length) {
						const sequences: SequenceInfo[] = this.pendingSequenceIds.map((id) => ({
							id,
							name: this.pendingSequenceNames.get(id) || `Sequence ${id}`,
						}))
						this.pollHandlers.onSequencesUpdated?.(sequences)
					} else {
						// Fetch next name
						void this.processSequenceNameQueue()
					}
					break
				}
				default:
					break
			}
		} catch (err: any) {
			this.pollHandlers.onError?.(err)
		}
	}

	private async processSequenceNameQueue(): Promise<void> {
		if (this.sequenceNameQueue.length === 0) return
		const nextId = this.sequenceNameQueue.shift()
		if (nextId !== undefined) {
			await this.fetchSequenceName(nextId)
		}
	}

	private async processStatusRequestQueue(): Promise<void> {
		// Don't start a new request if one is pending
		if (this.statusRequestPending) {
			return
		}
		if (this.statusRequestQueue.length === 0) {
			this.currentStatusRequestId = null
			return
		}
		const nextId = this.statusRequestQueue.shift()
		if (nextId !== undefined) {
			this.currentStatusRequestId = nextId
			this.statusRequestPending = true
			await this.send(CommandId.GetSeqTransportMode, [this.writeInt(nextId)])
		}
	}

	// Time polling is now handled by per-sequence SequenceConnection instances

	private buildHeader(bodyLen: number): Buffer {
		const preHeader = Buffer.from([1])
		const domain = this.writeInt(this.domain)
		const length = Buffer.from([Math.floor(bodyLen / 256), bodyLen % 256])
		const postHeader = Buffer.from([0, 0, 0, 0, 0])
		return Buffer.concat([preHeader, domain, length, postHeader])
	}

	private checksum(buf: Buffer): number {
		let sum = 0
		for (const b of buf.values()) sum = (sum + b) % 256
		return sum
	}

	private writeShort(n: number): Buffer {
		const b = Buffer.alloc(2)
		b.writeUInt16BE(n)
		return b
	}

	private writeInt(n: number): Buffer {
		const b = Buffer.alloc(4)
		b.writeInt32BE(n)
		return b
	}
}
