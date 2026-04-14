import { writable } from 'svelte/store';

export interface Notification {
	id: string;
	type: 'info' | 'success' | 'warning';
	message: string;
	timestamp: number;
}

function createNotificationStore() {
	const { subscribe, update } = writable<Notification[]>([]);

	return {
		subscribe,
		add(notification: Omit<Notification, 'id' | 'timestamp'>) {
			const entry: Notification = {
				...notification,
				id: crypto.randomUUID(),
				timestamp: Date.now()
			};
			update((n) => [entry, ...n].slice(0, 10));
			setTimeout(() => {
				update((n) => n.filter((item) => item.id !== entry.id));
			}, 6000);
		},
		dismiss(id: string) {
			update((n) => n.filter((item) => item.id !== id));
		}
	};
}

export const notifications = createNotificationStore();
