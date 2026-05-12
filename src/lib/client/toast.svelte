<script module lang="ts">
	export type ToastType = 'success' | 'error' | 'info';

	export type ToastItem = {
		id: string;
		message: string;
		type: ToastType;
		duration: number;
	};

	let toasts = $state<ToastItem[]>([]);
	let toastVersion = $state(0);

	function bump() {
		toastVersion += 1;
	}

	function remove(id: string) {
		toasts = toasts.filter((t) => t.id !== id);
		bump();
	}

	export function showToast(message: string, type: ToastType = 'info', duration = 4200) {
		const id = crypto.randomUUID();
		const item: ToastItem = { id, message, type, duration };
		toasts = [...toasts, item];
		bump();
		if (typeof window !== 'undefined' && duration > 0) {
			window.setTimeout(() => remove(id), duration);
		}
		return id;
	}

	export function dismissToast(id: string) {
		remove(id);
	}

	export function getToasts(): ToastItem[] {
		return toasts;
	}

	export function getToastVersion(): number {
		return toastVersion;
	}
</script>
