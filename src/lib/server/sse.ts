/** Real-time channel (SSE). For push/WebSocket later, mirror payloads from the same broadcaster. */
export interface SSEEvent {
	type:
		| 'rengiat_update'
		| 'notification'
		| 'lhp_new'
		| 'field_giat_update'
		| 'lhp_verification'
		| 'heartbeat_stale';
	data: Record<string, unknown> & {
		message?: string;
		/** Hanya peran ini yang melihat toast; kosong/undefined = semua peran. */
		notifyRoles?: ('POLDA' | 'KARO OPS' | 'POLRES' | 'POLSEK')[];
		/** Untuk toast yang hanya relevan bagi POLRES wilayah tertentu. */
		polresId?: number;
		/** Untuk notifikasi verifikasi LHP ke satu personil POLSEK. */
		targetUserId?: number;
		kind?: 'returned' | 'verified';
	};
}

type Listener = (event: SSEEvent) => void;

class SSEBroadcaster {
	private listeners = new Set<Listener>();

	subscribe(listener: Listener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	emit(event: SSEEvent) {
		for (const listener of this.listeners) {
			try {
				listener(event);
			} catch {
				this.listeners.delete(listener);
			}
		}
	}
}

export const sseBroadcaster = new SSEBroadcaster();
