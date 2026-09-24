import net from 'net'
import { CommandId, PR_PORT, SEQUENCE_OPACITY_MAX } from './constants.js'

export type TransportState = 'Play' | 'Pause' | 'Stop' | 'Unknown'

export interface SequenceInfo {
	id: number
	name: string
}

export interface CueInfo {
	previousCueId: number
	previousCueName: string
	previousCueMode: number // same mode encoding as nextCueMode - see cueModeToLetter
	// The previous cue's own position in the sequence timeline (not a countdown) - used to compute
	// a "time since last cue" countup client-side, since the device has no direct command for it.
	previousCueH: number
	previousCueM: number
	previousCueS: number
	previousCueF: number
	nextCueId: number
	nextCueName: string
	nextCueMode: number // 1=Play, 2=Stop, 3=Pause, 4=Jump, 5=Wait (confirmed empirically, see cueModeToLetter)
}

// 'PBAU'(4) + preHeader(1) + domain(4) + length(2) + postHeader(5) + checksum(1), body follows after this.
const PBAU_HEADER_LEN = 17

// Human-readable label for a command id, for debug logging.
function commandName(id: number): string {
	const name = CommandId[id]
	return name !== undefined ? `${name}(${id})` : `${id}`
}

/**
 * Splits as many complete PBAU messages as possible out of a byte stream buffer, using the
 * length field in each message's header. A single TCP `data` event can contain more than one
 * PBAU message concatenated together (or only part of one), so this must not assume that one
 * `data` event equals exactly one message.
 */
function extractPbauMessages(buffer: Buffer): { messages: Buffer[]; remainder: Buffer } {
	const messages: Buffer[] = []
	let offset = 0

	while (buffer.length - offset >= PBAU_HEADER_LEN) {
		if (buffer.toString('ascii', offset, offset + 4) !== 'PBAU') {
			// Lost sync with the stream - drop a byte and try to resync from the next position.
			offset += 1
			continue
		}
		const bodyLen = buffer[offset + 9] * 256 + buffer[offset + 10]
		const totalLen = PBAU_HEADER_LEN + bodyLen
		if (buffer.length - offset < totalLen) break // Wait for the rest of this message to arrive.
		messages.push(buffer.subarray(offset, offset + totalLen))
		offset += totalLen
	}

	return { messages, remainder: buffer.subarray(offset) }
}

export type FadeCurve = 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out' | 's_curve'

// Progress (0-1) -> eased progress (0-1). Linear is the recommended default - see fadeSequenceVisibility.
const FADE_CURVES: Record<FadeCurve, (t: number) => number> = {
	linear: (t) => t,
	ease_in: (t) => t * t * t,
	ease_out: (t) => 1 - Math.pow(1 - t, 3),
	ease_in_out: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
	s_curve: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
}

// The device answered a request with its generic error response (command id -1).
class DeviceErrorResponse extends Error {}

interface PendingRequest {
	cmdId: CommandId
	parts: Buffer[]
	resolve: (data: Buffer) => void
	reject: (err: Error) => void
	timer?: NodeJS.Timeout
}

export interface PollHandlers {
	/** Called once when we receive the first valid PBAU packet for the configured domain */
	onProtocolAlive?: () => void
	/** Called when the main TCP connection closes */
	onDisconnected?: () => void
	onSequenceTime?: (seqId: number, h: number, m: number, s: number, f: number) => void
	onSequenceCountdown?: (seqId: number, h: number, m: number, s: number, f: number) => void
	onSequenceCueInfo?: (seqId: number, cueInfo: CueInfo) => void
	onSequenceOpacity?: (seqId: number, value: number) => void
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
	private rxBuffer: Buffer = Buffer.alloc(0)
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

			sock.on('data', (chunk) => this.onSocketData(chunk))

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
		this.rxBuffer = Buffer.alloc(0)
	}

	private onSocketData(chunk: Buffer): void {
		this.rxBuffer = this.rxBuffer.length === 0 ? chunk : Buffer.concat([this.rxBuffer, chunk])
		const { messages, remainder } = extractPbauMessages(this.rxBuffer)
		this.rxBuffer = remainder
		for (const message of messages) {
			this.handleData(message)
		}
	}

	updateState(state: TransportState): void {
		this.currentState = state
	}

	// False once the socket has failed or closed - the connection is then dead for good and must be replaced.
	isAlive(): boolean {
		return this.socket !== null
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
					if (offset + 4 > data.length) return
					const previousCueId = data.readInt32BE(offset)
					offset += 4

					// previousCueName - StringNarrow: 2-byte length + chars
					if (offset + 2 > data.length) return
					const prevNameLen = data.readInt16BE(offset)
					offset += 2
					if (offset + prevNameLen > data.length) return
					const previousCueName = data.toString('utf8', offset, offset + prevNameLen)
					offset += prevNameLen

					// previousCueTime (4 ints)
					if (offset + 16 > data.length) return
					const previousCueH = data.readInt32BE(offset)
					const previousCueM = data.readInt32BE(offset + 4)
					const previousCueS = data.readInt32BE(offset + 8)
					const previousCueF = data.readInt32BE(offset + 12)
					offset += 16

					// previousCueMode
					if (offset + 4 > data.length) return
					const previousCueMode = data.readInt32BE(offset)
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
					const nextCueName = data.toString('utf8', offset, offset + nextNameLen)
					offset += nextNameLen

					// nextCueTime (4 ints)
					offset += 16

					// nextCueMode
					if (offset + 4 > data.length) return
					const nextCueMode = data.readInt32BE(offset)

					this.onCueInfo({
						previousCueId,
						previousCueName,
						previousCueMode,
						previousCueH,
						previousCueM,
						previousCueS,
						previousCueF,
						nextCueId,
						nextCueName,
						nextCueMode,
					})
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
	private pollSequenceIds: number[] = []
	private pollRoundRunning = false
	private refreshingSequences = false
	private sequenceStates: Map<number, TransportState> = new Map()
	private gotAnyResponse = false
	private rxBuffer: Buffer = Buffer.alloc(0)

	// Per-sequence connections for timecode polling
	private sequenceConnections: Map<number, SequenceConnection> = new Map()

	// Responses to status/transparency/sequence-list queries don't say which sequence they belong to,
	// and the device's error response doesn't say which request failed. So these queries go through
	// one queue with at most one request outstanding: every response - including an error - then
	// unambiguously belongs to the current request. The timeout keeps a lost response from stalling it.
	private requestQueue: PendingRequest[] = []
	private currentRequest: PendingRequest | null = null
	private static readonly REQUEST_TIMEOUT_MS = 1000

	// Active fade timers per sequence, so re-triggering a fade cancels the previous one for that sequence.
	// The token map guards against a rare race: if a new fade for the same sequence starts while an
	// older one is still awaiting its initial GetSequenceTransparency, the older one must not proceed.
	private activeFades: Map<number, NodeJS.Timeout> = new Map()
	private activeFadeTokens: Map<number, symbol> = new Map()
	private static readonly FADE_STEP_INTERVAL_MS = 33 // ~30 steps/sec, matches the module's other real-time polling rates

	// Polling intervals
	private static readonly STATUS_POLL_INTERVAL = 200 // 5x per second

	private debugTraffic: boolean

	constructor(host: string, domain: number, handlers: PollHandlers, debugTraffic = false) {
		this.host = host
		this.domain = domain
		this.pollHandlers = handlers
		this.debugTraffic = debugTraffic
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
				this.failAllRequests(new Error('Connection closed'))
				this.pollHandlers.onDisconnected?.()
			})

			sock.on('data', (chunk) => this.onSocketData(chunk))

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
		for (const timer of this.activeFades.values()) {
			clearInterval(timer)
		}
		this.activeFades.clear()
		this.activeFadeTokens.clear()
		if (this.socket) {
			this.socket.destroy()
			this.socket = null
		}
		this.failAllRequests(new Error('Disconnected'))
		this.rxBuffer = Buffer.alloc(0)
	}

	private onSocketData(chunk: Buffer): void {
		this.rxBuffer = this.rxBuffer.length === 0 ? chunk : Buffer.concat([this.rxBuffer, chunk])
		const { messages, remainder } = extractPbauMessages(this.rxBuffer)
		this.rxBuffer = remainder
		for (const message of messages) {
			this.handleData(message)
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

	// Called on every sequence refresh (every 10s), so this also replaces per-sequence timecode
	// connections that have failed or dropped since - otherwise they'd stay dead until a full reconnect.
	setPollSequences(sequenceIds: number[]): void {
		this.pollSequenceIds = sequenceIds

		for (const [seqId, conn] of this.sequenceConnections.entries()) {
			if (!sequenceIds.includes(seqId) || !conn.isAlive()) {
				conn.disconnect()
				this.sequenceConnections.delete(seqId)
			}
		}

		for (const seqId of sequenceIds) {
			if (this.sequenceConnections.has(seqId)) continue
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
			conn.updateState(this.sequenceStates.get(seqId) ?? 'Unknown')
			this.sequenceConnections.set(seqId, conn)
			conn.connect().catch((e: unknown) => {
				this.pollHandlers.onDebug?.(`Failed to connect sequence ${seqId}: ${e instanceof Error ? e.message : e}`)
			})
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

	async setPlayhead(sequenceId: number, h: number, m: number, s: number, f: number): Promise<void> {
		await this.send(CommandId.MoveSeqToTime, [
			this.writeInt(sequenceId),
			this.writeInt(h),
			this.writeInt(m),
			this.writeInt(s),
			this.writeInt(f),
		])
	}

	async getSequenceTransparency(sequenceId: number): Promise<number> {
		const data = await this.request(CommandId.GetSequenceTransparency, [this.writeInt(sequenceId)])
		if (data.length < 23) throw new Error(`Short GetSequenceTransparency response for sequence ${sequenceId}`)
		// Native range is linear 0-65535 (65535/100 = 655.35 per percent) - no descaling needed.
		return data.readInt32BE(19)
	}

	async setSequenceTransparency(sequenceId: number, value: number): Promise<void> {
		// GetSequenceTransparency and SetSequenceTransparency use different native scales on this
		// device (v8.11.3): reads are linear 0-65535, but writes only take visible effect in 0-255 -
		// values above ~255 are rendered as fully visible regardless of the actual number sent.
		// `value` here is in the 0-65535 domain (matching reads/percent), so descale before sending.
		const clampedLogical = Math.max(0, Math.min(SEQUENCE_OPACITY_MAX, Math.round(value)))
		const wireValue = Math.round((clampedLogical / SEQUENCE_OPACITY_MAX) * 255)
		await this.send(CommandId.SetSequenceTransparency, [this.writeInt(sequenceId), this.writeInt(wireValue)])
	}

	/**
	 * Fades a sequence's visibility from its current value to targetValue (0-65535) over durationMs.
	 * Uses a linear ramp by default: with only ~30 steps/sec, an eased curve visibly clusters/stalls
	 * near the start and end (many ticks round to the same value) then rushes through the middle -
	 * linear distributes the steps evenly and matches how lighting-desk dimmer fades work.
	 * Re-triggering a fade for the same sequence cancels the previous one.
	 *
	 * Returns as soon as the fade has started, not when it finishes - a multi-second fade must not
	 * hold the calling action open, or the host's action-execution timeout kills it mid-fade.
	 */
	async fadeSequenceVisibility(
		sequenceId: number,
		targetValue: number,
		durationMs: number,
		curve: FadeCurve = 'linear',
	): Promise<void> {
		const existing = this.activeFades.get(sequenceId)
		if (existing) {
			clearInterval(existing)
			this.activeFades.delete(sequenceId)
		}

		// Claim this sequence for this call. getSequenceTransparency() below can take a moment (it's
		// serialized behind other pending requests), and if another fade for the same sequence starts
		// in that window, the map-based cancellation above can miss it (neither call has registered a
		// timer yet). The token lets both the code below and the running timer notice they've been
		// superseded and stop, instead of leaving an orphaned interval fighting the newer fade.
		const token = Symbol()
		this.activeFadeTokens.set(sequenceId, token)

		const target = Math.max(0, Math.min(SEQUENCE_OPACITY_MAX, Math.round(targetValue)))
		const startValue = await this.getSequenceTransparency(sequenceId)

		if (this.activeFadeTokens.get(sequenceId) !== token) {
			return // Superseded by a newer fade while we were awaiting the current value.
		}

		if (durationMs <= 0 || startValue === target) {
			await this.setSequenceTransparency(sequenceId, target)
			return
		}

		const applyCurve = FADE_CURVES[curve] ?? FADE_CURVES.linear
		const delta = target - startValue

		// Track progress by wall-clock elapsed time rather than a fixed tick count: setInterval ticks
		// drift under load (concurrent status polling, TCP writes), and that drift compounds over the
		// hundreds of ticks a long fade needs - a 10s fade could otherwise measurably overrun to 14s+.
		const startTime = Date.now()
		const timer = setInterval(() => {
			if (this.activeFadeTokens.get(sequenceId) !== token) {
				clearInterval(timer)
				this.activeFades.delete(sequenceId)
				return
			}

			const progress = Math.min(1, (Date.now() - startTime) / durationMs)
			const value = Math.round(startValue + delta * applyCurve(progress))

			void this.setSequenceTransparency(sequenceId, value).catch((e: unknown) => {
				this.pollHandlers.onDebug?.(`Fade[${sequenceId}] send error: ${e instanceof Error ? e.message : e}`)
			})

			if (progress >= 1) {
				clearInterval(timer)
				this.activeFades.delete(sequenceId)
			}
		}, PBClient.FADE_STEP_INTERVAL_MS)
		this.activeFades.set(sequenceId, timer)
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
		if (this.refreshingSequences) return
		this.refreshingSequences = true
		try {
			const idsData = await this.request(CommandId.GetSequenceIds, [])
			// Response format: Int count (BE), Int mystery (BE), then count * Int IDs (LE)!
			if (idsData.length < 27) throw new Error('Short GetSequenceIds response')
			const count = idsData.readInt32BE(19)
			const ids: number[] = []
			for (let i = 0, offset = 27; i < count && offset + 4 <= idsData.length; i++, offset += 4) {
				ids.push(idsData.readInt32LE(offset))
			}

			const sequences: SequenceInfo[] = []
			for (const id of ids) {
				try {
					const nameData = await this.request(CommandId.GetSequenceName, [this.writeInt(id)])
					// Response format: Short strLen, then strLen bytes (UTF-8 string)
					const strLen = nameData.length >= 21 ? nameData.readInt16BE(19) : 0
					const name = nameData.toString('utf8', 21, Math.min(21 + strLen, nameData.length))
					sequences.push({ id, name: name || `Sequence ${id}` })
				} catch (e) {
					// An error response means the id isn't a valid sequence (anymore) - leave it out.
					// Anything else (e.g. a timeout) shouldn't make a real sequence vanish from the UI.
					if (!(e instanceof DeviceErrorResponse)) sequences.push({ id, name: `Sequence ${id}` })
				}
			}
			this.pollHandlers.onSequencesUpdated?.(sequences)
		} catch (e) {
			this.pollHandlers.onDebug?.(`Sequence refresh failed: ${e instanceof Error ? e.message : e}`)
		} finally {
			this.refreshingSequences = false
		}
	}

	private startPolling(): void {
		this.stopPolling()

		// Status polling: a round over all sequences 5x per second (a new round only starts once the
		// previous one has finished). Timecode polling is handled by the per-sequence connections.
		this.statusPollTimer = setInterval(() => {
			if (!this.pollRoundRunning && this.pollSequenceIds.length > 0) {
				void this.runStatusPollRound()
			}
		}, PBClient.STATUS_POLL_INTERVAL)
	}

	private async runStatusPollRound(): Promise<void> {
		this.pollRoundRunning = true
		try {
			for (const seqId of [...this.pollSequenceIds]) {
				if (!this.socket) return

				let state: TransportState
				try {
					const data = await this.request(CommandId.GetSeqTransportMode, [this.writeInt(seqId)])
					if (data.length < 23) continue
					const stateInt = data.readInt32BE(19)
					state = stateInt === 1 ? 'Play' : stateInt === 2 ? 'Stop' : stateInt === 3 ? 'Pause' : 'Unknown'
				} catch (e) {
					this.pollHandlers.onDebug?.(`GetSeqTransportMode(${seqId}) error: ${e instanceof Error ? e.message : e}`)
					continue
				}
				this.updateSequenceState(seqId, state)
				this.pollHandlers.onSequenceTransport?.(seqId, state)

				try {
					const opacity = await this.getSequenceTransparency(seqId)
					this.pollHandlers.onSequenceOpacity?.(seqId, opacity)
				} catch (e) {
					this.pollHandlers.onDebug?.(`GetSequenceTransparency(${seqId}) error: ${e instanceof Error ? e.message : e}`)
				}
			}
		} finally {
			this.pollRoundRunning = false
		}
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
		if (this.debugTraffic) {
			this.pollHandlers.onDebug?.(`TX ${commandName(commandId)} ${message.toString('hex')}`)
		}
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
			if (this.debugTraffic) {
				this.pollHandlers.onDebug?.(`RX ${commandName(rawCmdId)} ${data.toString('hex')}`)
			}

			const current = this.currentRequest
			if (!current) return // Unsolicited, or a late reply to a request that already timed out.
			if (rawCmdId === -1) {
				const err = new DeviceErrorResponse(`${commandName(current.cmdId)} returned an error`)
				this.finishRequest(current, undefined, err)
				return
			}
			const cmdId: CommandId = rawCmdId
			if (cmdId === current.cmdId) {
				this.finishRequest(current, data)
			}
		} catch (err: any) {
			this.pollHandlers.onError?.(err)
		}
	}

	private async request(cmdId: CommandId, parts: Buffer[]): Promise<Buffer> {
		if (!this.socket || this.connecting) throw new Error('Not connected')
		return new Promise<Buffer>((resolve, reject) => {
			this.requestQueue.push({ cmdId, parts, resolve, reject })
			this.pumpRequests()
		})
	}

	private pumpRequests(): void {
		if (this.currentRequest) return
		const next = this.requestQueue.shift()
		if (!next) return
		this.currentRequest = next
		next.timer = setTimeout(() => {
			this.finishRequest(next, undefined, new Error(`Timed out waiting for ${commandName(next.cmdId)}`))
		}, PBClient.REQUEST_TIMEOUT_MS)
		this.send(next.cmdId, next.parts).catch((e: unknown) => {
			this.finishRequest(next, undefined, e instanceof Error ? e : new Error(String(e)))
		})
	}

	private finishRequest(req: PendingRequest, data?: Buffer, err?: Error): void {
		if (this.currentRequest !== req) return
		clearTimeout(req.timer)
		this.currentRequest = null
		if (err || !data) req.reject(err ?? new Error('No response data'))
		else req.resolve(data)
		this.pumpRequests()
	}

	private failAllRequests(err: Error): void {
		const pending = this.currentRequest ? [this.currentRequest, ...this.requestQueue] : [...this.requestQueue]
		this.currentRequest = null
		this.requestQueue = []
		for (const req of pending) {
			clearTimeout(req.timer)
			req.reject(err)
		}
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
