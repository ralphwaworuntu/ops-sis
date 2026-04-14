import { writable } from 'svelte/store';

export type FeedItem = { id: string; at: string; message: string };

const MAX = 24;

function createActivityFeed() {
	const { subscribe, update } = writable<FeedItem[]>([]);

	return {
		subscribe,
		push(message: string) {
			update((list) => {
				const row: FeedItem = {
					id: crypto.randomUUID(),
					at: new Date().toISOString(),
					message
				};
				return [row, ...list].slice(0, MAX);
			});
		}
	};
}

export const activityFeed = createActivityFeed();
