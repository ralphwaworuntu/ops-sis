import type { RequestHandler } from './$types';
import { sseBroadcaster } from '$lib/server/sse';
import { incCounter } from '$lib/server/telemetry';

const MAX_BUFFER = 50;

export const GET: RequestHandler = async ({ locals, request, getClientAddress }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const userId = locals.user.id;
	const ip = (() => {
		try {
			return getClientAddress();
		} catch {
			return 'unknown';
		}
	})();

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();
			const buffer: string[] = [];
			let flushing = false;
			let closed = false;

			const log = (msg: string) => console.log(`[SSE] ${msg}`);
			const warn = (msg: string) => console.warn(`[SSE] ${msg}`);

			const flush = () => {
				if (flushing || closed) return;
				flushing = true;
				try {
					while (buffer.length > 0) {
						const data = buffer.shift()!;
						controller.enqueue(encoder.encode(`data: ${data}\n\n`));
					}
				} catch {
					// enqueue gagal → client kemungkinan disconnect
					cleanup('enqueue-failed');
				} finally {
					flushing = false;
				}
			};

			const send = (data: string) => {
				if (closed) return;
				// Buffer per client untuk burst event.
				buffer.push(data);
				if (buffer.length > MAX_BUFFER) {
					const dropped = buffer.splice(0, buffer.length - MAX_BUFFER);
					incCounter('buffer_dropped', dropped.length);
					warn(`BufferFull user=${userId} ip=${ip} dropped=${dropped.length}`);
				}
				flush();
			};

			incCounter('sse_connected');
			log(`Connected user=${userId} ip=${ip} listeners=${sseBroadcaster.count() + 1}`);
			send(JSON.stringify({ type: 'connected', data: { userId } }));

			const unsubscribe = sseBroadcaster.subscribe((event) => {
				send(JSON.stringify(event));
			});

			const keepalive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': keepalive\n\n'));
				} catch {
					cleanup('keepalive-failed');
				}
			}, 30000);

			const onAbort = () => cleanup('abort');
			request.signal.addEventListener('abort', onAbort);

			const cleanup = (reason: string) => {
				if (closed) return;
				closed = true;
				try {
					clearInterval(keepalive);
					unsubscribe();
				} finally {
					request.signal.removeEventListener('abort', onAbort);
					try {
						controller.close();
					} catch {
						/* noop */
					}
					incCounter('sse_disconnected');
					log(`Disconnected user=${userId} ip=${ip} reason=${reason} listeners=${sseBroadcaster.count()}`);
				}
			};

			// cancel() dipanggil saat client menutup stream.
			// (SvelteKit/ReadableStream akan memanggil return function dari start() jika disediakan,
			// tapi kita tetap explicit lewat cleanup via abort+exception.)
			return () => cleanup('cancel');
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
