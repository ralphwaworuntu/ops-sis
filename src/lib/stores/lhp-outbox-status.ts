import { writable } from 'svelte/store';
import { outboxCount } from '$lib/client/lhp-outbox';

export const lhpOutboxCount = writable(0);

export async function refreshLhpOutboxCount() {
	try {
		lhpOutboxCount.set(await outboxCount());
	} catch {
		lhpOutboxCount.set(0);
	}
}
