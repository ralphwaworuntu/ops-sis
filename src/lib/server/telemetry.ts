type CounterName = 'sse_connected' | 'sse_disconnected' | 'buffer_dropped';

const counters = new Map<CounterName, number>([
	['sse_connected', 0],
	['sse_disconnected', 0],
	['buffer_dropped', 0]
]);

export function incCounter(name: CounterName, by: number = 1) {
	counters.set(name, (counters.get(name) ?? 0) + by);
}

export function getCounters() {
	return Object.fromEntries(counters.entries()) as Record<CounterName, number>;
}

