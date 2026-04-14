<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { notifications } from '$lib/stores/notifications';
	import { activityFeed } from '$lib/stores/activity-feed';
	import { lhpOutboxCount, refreshLhpOutboxCount } from '$lib/stores/lhp-outbox-status';
	import { syncOutbox } from '$lib/client/lhp-outbox';
	import type { Snippet } from 'svelte';

	let { data, children }: { data: { user: NonNullable<App.Locals['user']> }; children: Snippet } =
		$props();

	let sidebarOpen = $state(false);
	/** Di lg+, sembunyikan sidebar kiri agar konten melebar (toggle lewat navbar). */
	let desktopSidebarCollapsed = $state(false);
	let toasts: { id: string; type: string; message: string }[] = $state([]);
	let online = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);
	let outboxPending = $state(0);

	notifications.subscribe((n) => (toasts = n));

	onMount(() => {
		online = navigator.onLine;
		const onOnline = () => {
			online = true;
			void (async () => {
				await syncOutbox();
				await refreshLhpOutboxCount();
				await invalidateAll();
			})();
		};
		const onOffline = () => {
			online = false;
		};
		window.addEventListener('online', onOnline);
		window.addEventListener('offline', onOffline);
		void refreshLhpOutboxCount();
		const unsubOutbox = lhpOutboxCount.subscribe((n) => (outboxPending = n));

		const es = new EventSource('/api/events');
		es.onmessage = (event) => {
			try {
				const payload = JSON.parse(event.data);
				if (payload.type === 'connected') return;

				if (payload.type === 'lhp_new') {
					if (['POLDA', 'KARO OPS'].includes(data.user.role)) {
						void invalidateAll();
					}
					return;
				}

				if (payload.type === 'field_giat_update') {
					const d = payload.data as { polresId?: number };
					const u = data.user;
					if (u.role === 'POLRES' && typeof d.polresId === 'number' && u.unitId === d.polresId) {
						void invalidateAll();
					}
					return;
				}

				if (payload.type === 'lhp_verification') {
					const d = payload.data as {
						message?: string;
						targetUserId?: number;
						polresId?: number;
						kind?: string;
					};
					const u = data.user;
					if (
						u.role === 'POLSEK' &&
						typeof d.targetUserId === 'number' &&
						u.id === d.targetUserId &&
						typeof d.polresId === 'number' &&
						d.polresId === u.polresId
					) {
						notifications.add({
							type: d.kind === 'returned' ? 'warning' : 'success',
							message: d.message ?? 'Verifikasi LHP'
						});
						activityFeed.push(d.message ?? '');
						void invalidateAll();
					}
					return;
				}

				if (payload.type === 'rengiat_update') {
					const d = payload.data as {
						message?: string;
						notifyRoles?: string[];
						polresId?: number;
					};
					const u = data.user;
					let showToast = true;
					if (Array.isArray(d.notifyRoles) && d.notifyRoles.length > 0) {
						showToast = d.notifyRoles.includes(u.role);
					}
					if (showToast && u.role === 'POLRES' && typeof d.polresId === 'number') {
						showToast = u.unitId === d.polresId;
					}
					if (showToast && u.role === 'POLSEK' && typeof d.polresId === 'number') {
						showToast = d.polresId === u.polresId;
					}
					if (showToast) {
						const msg = d.message ?? 'Status Rengiat diperbarui';
						notifications.add({
							type: 'success',
							message: msg
						});
						if (u.role === 'POLSEK') {
							activityFeed.push(msg);
						}
					}
					void invalidateAll();
				}
			} catch {}
		};
		return () => {
			es.close();
			window.removeEventListener('online', onOnline);
			window.removeEventListener('offline', onOffline);
			unsubOutbox();
		};
	});

	const navItems = $derived(getNavItems(data.user.role));

	function getNavItems(role: string) {
		const items = [
			{ href: '/dashboard', label: 'Dashboard', icon: 'home' },
			{ href: '/dashboard/peta', label: 'Peta Rawan', icon: 'map' }
		];
		if (role === 'POLRES') {
			items.push({ href: '/dashboard/rengiat', label: 'Rengiat', icon: 'file' });
			items.push({ href: '/dashboard/verifikasi-lhp', label: 'Verifikasi LHP', icon: 'check' });
			items.push({ href: '/dashboard/monitoring', label: 'Monitoring', icon: 'chart' });
		}
		if (role === 'POLDA') {
			items.push({ href: '/dashboard/rengiat', label: 'Review Rengiat', icon: 'file' });
			items.push({ href: '/dashboard/monitoring', label: 'Monitoring', icon: 'chart' });
			items.push({ href: '/dashboard/laporan', label: 'Laporan', icon: 'clipboard' });
			items.push({ href: '/live-wall', label: 'Live Wall', icon: 'wall' });
			items.push({ href: '/dashboard/admin/satwil', label: 'Admin Satwil', icon: 'settings' });
		}
		if (role === 'KARO OPS') {
			items.push({ href: '/dashboard/rengiat', label: 'Approval', icon: 'check' });
			items.push({ href: '/dashboard/monitoring', label: 'Monitoring', icon: 'chart' });
			items.push({ href: '/dashboard/laporan', label: 'Laporan', icon: 'clipboard' });
			items.push({ href: '/live-wall', label: 'Live Wall', icon: 'wall' });
		}
		if (role === 'POLSEK') {
			items.push({ href: '/dashboard/giat-saya', label: 'Giat Saya', icon: 'activity' });
		}
		return items;
	}

	function isActive(href: string, currentPath: string) {
		if (href === '/dashboard') return currentPath === '/dashboard';
		return currentPath.startsWith(href);
	}

	const iconMap: Record<string, string> = {
		home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
		map: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
		file: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
		check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
		camera: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z',
		eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
		chart:
			'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
		clipboard:
			'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
		settings:
			'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
		activity:
			'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9zM4 12a8 8 0 1116 0 8 8 0 01-16 0z',
		wall: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'
	};

	function toggleSidebar() {
		if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
			desktopSidebarCollapsed = !desktopSidebarCollapsed;
		} else {
			sidebarOpen = true;
		}
	}

	const roleBadgeColor: Record<string, string> = {
		'KARO OPS': 'bg-accent text-accent-foreground',
		POLDA: 'bg-primary text-primary-foreground',
		POLRES: 'bg-blue-600 text-white',
		POLSEK: 'bg-emerald-600 text-white'
	};
</script>

<svelte:head>
	<title>Dashboard — OPS SIS</title>
</svelte:head>

<div class="flex h-screen overflow-hidden bg-background">
	<!-- Desktop Sidebar -->
	<aside
		class="hidden shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out lg:flex {desktopSidebarCollapsed
			? 'lg:w-0 lg:min-w-0 lg:border-transparent'
			: 'lg:w-64'}"
		aria-hidden={desktopSidebarCollapsed ? 'true' : 'false'}
	>
		<div class="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
			<div
				class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
			>
				SIS
			</div>
			<div>
				<h2 class="text-sm font-semibold text-sidebar-foreground">OPS — SIS</h2>
				<p class="text-[11px] text-muted-foreground">Strategi Operasional</p>
			</div>
		</div>

		<nav class="flex-1 space-y-1 p-3">
			{#each navItems as item}
				{@const active = isActive(item.href, $page.url.pathname)}
				<a
					href={item.href}
					class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {active
						? 'bg-sidebar-primary text-sidebar-primary-foreground'
						: 'text-sidebar-foreground hover:bg-sidebar-accent'}"
				>
					<svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d={iconMap[item.icon]} />
					</svg>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="border-t border-sidebar-border p-4">
			<div class="mb-3 flex items-center gap-3">
				<div
					class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
				>
					{data.user.nama.charAt(0)}
				</div>
				<div class="min-w-0 flex-1">
					<p class="truncate text-sm font-medium text-sidebar-foreground">{data.user.nama}</p>
					<div class="flex items-center gap-1.5">
						<span class="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold {roleBadgeColor[data.user.role]}">
							{data.user.role}
						</span>
						{#if data.user.unitNama}
							<span class="truncate text-[11px] text-muted-foreground">{data.user.unitNama}</span>
						{/if}
					</div>
				</div>
			</div>
			<form action="/logout" method="POST" use:enhance>
				<button
					type="submit"
					class="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
						<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
					</svg>
					Keluar
				</button>
			</form>
		</div>
	</aside>

	<!-- Mobile overlay -->
	{#if sidebarOpen}
		<div class="fixed inset-0 z-40 lg:hidden">
			<button class="absolute inset-0 bg-black/50" onclick={() => (sidebarOpen = false)} aria-label="Close menu"></button>
			<aside class="absolute inset-y-0 left-0 w-72 border-r border-sidebar-border bg-sidebar shadow-xl">
				<div class="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
					<div class="flex items-center gap-3">
						<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
							SIS
						</div>
						<h2 class="text-sm font-semibold text-sidebar-foreground">OPS — SIS</h2>
					</div>
					<button onclick={() => (sidebarOpen = false)} class="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Tutup menu">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<nav class="space-y-1 p-3">
					{#each navItems as item}
						{@const active = isActive(item.href, $page.url.pathname)}
						<a
							href={item.href}
							onclick={() => (sidebarOpen = false)}
							class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {active
								? 'bg-sidebar-primary text-sidebar-primary-foreground'
								: 'text-sidebar-foreground hover:bg-sidebar-accent'}"
						>
							<svg class="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
								<path stroke-linecap="round" stroke-linejoin="round" d={iconMap[item.icon]} />
							</svg>
							{item.label}
						</a>
					{/each}
				</nav>

				<div class="absolute bottom-0 left-0 right-0 border-t border-sidebar-border p-4">
					<div class="mb-3 flex items-center gap-3">
						<div class="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
							{data.user.nama.charAt(0)}
						</div>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium">{data.user.nama}</p>
							<span class="inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold {roleBadgeColor[data.user.role]}">
								{data.user.role}
							</span>
						</div>
					</div>
					<form action="/logout" method="POST" use:enhance>
						<button
							type="submit"
							class="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
						>
							Keluar
						</button>
					</form>
				</div>
			</aside>
		</div>
	{/if}

	<!-- Main content -->
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden">
		<header class="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-3 sm:px-4">
			<button
				type="button"
				onclick={toggleSidebar}
				class="rounded-lg p-1.5 text-foreground hover:bg-muted"
				aria-label="Buka atau tutup menu sidebar"
			>
				<svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<div class="flex min-w-0 items-center gap-2">
				<div
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
				>
					SIS
				</div>
				<span class="truncate text-sm font-semibold">OPS — SIS</span>
			</div>
			<div class="ml-auto flex flex-wrap items-center justify-end gap-2">
				<span
					class="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide {online
						? 'border-emerald-200 bg-emerald-50 text-emerald-800'
						: 'border-amber-200 bg-amber-50 text-amber-900'}"
					aria-live="polite"
				>
					{online ? 'Online' : 'Offline'}
				</span>
				{#if data.user.role === 'POLSEK' && outboxPending > 0}
					<span
						class="hidden rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950 sm:inline"
					>
						{outboxPending} antre
					</span>
				{/if}
				<span
					class="inline-flex max-w-[8rem] truncate rounded px-1.5 py-0.5 text-[10px] font-semibold sm:max-w-none {roleBadgeColor[
						data.user.role
					]}"
				>
					{data.user.role}
				</span>
			</div>
		</header>

		<!-- Page content -->
		<main class="relative flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
			{#if data.user.role === 'POLSEK' && outboxPending > 0}
				<div class="mb-3 sm:hidden">
					<span
						class="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-950"
					>
						{outboxPending} laporan menunggu sinyal
					</span>
				</div>
			{/if}
			{@render children()}
		</main>

		<!-- Mobile bottom nav -->
		<nav class="flex border-t border-border bg-card lg:hidden">
			{#each navItems.slice(0, 4) as item}
				{@const active = isActive(item.href, $page.url.pathname)}
				<a
					href={item.href}
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors {active
						? 'text-primary'
						: 'text-muted-foreground'}"
				>
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={active ? 2 : 1.5}>
						<path stroke-linecap="round" stroke-linejoin="round" d={iconMap[item.icon]} />
					</svg>
					{item.label.split(' ')[0]}
				</a>
			{/each}
		</nav>
	</div>

	<!-- Toast Notifications -->
	{#if toasts.length > 0}
		<div class="fixed bottom-20 right-4 z-50 flex flex-col gap-2 lg:bottom-6 lg:right-6">
			{#each toasts as toast (toast.id)}
				<div
					class="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg animate-in slide-in-from-right"
				>
					<svg class="h-5 w-5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<p class="text-sm font-medium text-emerald-800">{toast.message}</p>
					<button onclick={() => notifications.dismiss(toast.id)} class="ml-2 text-emerald-400 hover:text-emerald-600" aria-label="Tutup notifikasi">
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
