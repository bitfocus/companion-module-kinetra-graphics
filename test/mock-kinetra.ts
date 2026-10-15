// A mock Kinetra Control API for the client tests: the WebSocket protocol from the fixture
// (hello → welcome → snapshot, commands → results, resync → snapshot), plus the refusals before
// the upgrade (HTTP status + {code}) and the close codes.

import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo, Socket } from 'node:net'
import { WebSocketServer, type WebSocket } from 'ws'
import { SUBPROTOCOL } from '../src/kinetra/protocol.js'
import { fixture } from './helpers.js'

export interface Refusal {
	status: number
	code: string
}

export type Command = { t: 'command'; corr: string; action: string; args: Record<string, unknown> }

export class MockKinetra {
	readonly server: Server
	readonly wss = new WebSocketServer({
		noServer: true,
		handleProtocols: (p) => (p.has(SUBPROTOCOL) ? SUBPROTOCOL : false),
	})
	readonly sockets = new Set<WebSocket>()
	/** Every message clients sent, in order. */
	readonly received: Record<string, unknown>[] = []
	/** Headers of every upgrade request (accepted or not). */
	readonly upgrades: IncomingHttpHeaders[] = []
	token = 'kt_test'
	/** Refuse every upgrade with this (after the token check, like Kinetra's guard order allows). */
	refuse: Refusal | null = null
	/** `welcome.protocol` to send. */
	protocol = fixture.protocol
	/** Answer hellos at all (false: the hello times out). */
	answerHello = true
	/** How commands are answered; `null`: never (they time out). */
	onCommand: ((c: Command) => Record<string, unknown>) | null = (c) => ({ t: 'result', corr: c.corr, ok: true })
	seq = 0

	private constructor() {
		this.server = createServer((_req, res) => res.writeHead(404).end())
		this.server.on('upgrade', (req, socket: Socket, head) => {
			this.upgrades.push(req.headers)
			const deny = (r: Refusal) => {
				const body = JSON.stringify({ code: r.code, message: r.code })
				socket.end(
					`HTTP/1.1 ${r.status} Refused\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
				)
			}
			if (req.headers.authorization !== `Bearer ${this.token}`) return deny({ status: 401, code: 'token' })
			if (this.refuse) return deny(this.refuse)
			this.wss.handleUpgrade(req, socket, head, (ws) => this.#session(ws))
		})
	}

	static async start(port = 0): Promise<MockKinetra> {
		const m = new MockKinetra()
		await new Promise<void>((r) => m.server.listen(port, '127.0.0.1', r))
		return m
	}

	get port(): number {
		return (this.server.address() as AddressInfo).port
	}

	/** Messages of one type clients sent. */
	sent(t: string): Record<string, unknown>[] {
		return this.received.filter((m) => m.t === t)
	}

	#session(ws: WebSocket): void {
		this.sockets.add(ws)
		ws.on('close', () => this.sockets.delete(ws))
		ws.on('message', (data: Buffer) => {
			const msg = JSON.parse(data.toString('utf8')) as Record<string, unknown>
			this.received.push(msg)
			if (msg.t === 'hello' && this.answerHello) {
				this.#send(ws, { ...fixture.messages.welcome, protocol: this.protocol })
				this.#send(ws, { t: 'snapshot', seq: this.seq, state: fixture.messages.snapshot.state })
			} else if (msg.t === 'command' && this.onCommand) {
				this.#send(ws, this.onCommand(msg as unknown as Command))
			} else if (msg.t === 'resync') {
				this.#send(ws, { t: 'snapshot', seq: this.seq, state: fixture.messages.snapshot.state })
			}
		})
	}

	#send(ws: WebSocket, msg: unknown): void {
		ws.send(JSON.stringify(msg))
	}

	/** Sends a message to every client. */
	broadcast(msg: unknown): void {
		for (const ws of this.sockets) this.#send(ws, msg)
	}

	/** Closes every client with a code. */
	closeAll(code: number): void {
		for (const ws of this.sockets) ws.close(code, 'test')
	}

	async stop(): Promise<void> {
		for (const ws of this.sockets) ws.terminate()
		this.wss.close()
		await new Promise<void>((r) => this.server.close(() => r()))
	}
}
