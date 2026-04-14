import type { RequestHandler } from './$types';
import { sseBroadcaster } from '$lib/server/sse';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return new Response('Unauthorized', { status: 401 });
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			const send = (data: string) => {
				try {
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				} catch {
					unsubscribe();
				}
			};

			send(JSON.stringify({ type: 'connected', data: { userId: locals.user!.id } }));

			const unsubscribe = sseBroadcaster.subscribe((event) => {
				send(JSON.stringify(event));
			});

			const keepalive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': keepalive\n\n'));
				} catch {
					clearInterval(keepalive);
					unsubscribe();
				}
			}, 30000);

			return () => {
				clearInterval(keepalive);
				unsubscribe();
			};
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
