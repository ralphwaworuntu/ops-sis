<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
	let loading = $state(false);
	let credOpen = $state(false);
	let username = $state('');
	let password = $state('');

	const demos = [
		{ label: 'KARO OPS', user: 'karoops_admin', pass: 'karoops123' },
		{ label: 'POLDA', user: 'polda_admin', pass: 'polda123' },
		{ label: 'POLRES Jaksel', user: 'polres_jaksel', pass: 'polres123' },
		{ label: 'POLRES Jaktim', user: 'polres_jaktim', pass: 'polres123' },
		{ label: 'POLSEK Kebayoran', user: 'polsek_kebayoran', pass: 'polsek123' },
		{ label: 'POLSEK Pancoran', user: 'polsek_pancoran', pass: 'polsek123' }
	];

	$effect(() => {
		if (form?.username != null && form.username !== '') username = form.username as string;
	});

	function isiForm(u: string, p: string) {
		username = u;
		password = p;
	}

	async function salinUserPass(u: string, p: string) {
		try {
			await navigator.clipboard.writeText(`${u}\t${p}`);
		} catch {
			await navigator.clipboard.writeText(`user: ${u} pass: ${p}`);
		}
	}
</script>

<svelte:head>
	<title>Login — OPS SIS</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-primary-foreground shadow-lg">
				SIS
			</div>
			<h1 class="text-2xl font-bold tracking-tight text-foreground">OPS — SIS</h1>
			<p class="mt-1 text-sm text-muted-foreground">Sistem Informasi Strategi Operasional</p>
		</div>

		<details
			bind:open={credOpen}
			class="mb-4 rounded-xl border border-border bg-card/80 shadow-sm backdrop-blur-sm"
		>
			<summary class="cursor-pointer list-none px-4 py-3 text-sm font-medium text-foreground">
				<span class="flex items-center justify-between gap-2">
					<span>Kredensial demo (salin / isi form)</span>
					<svg
						class="h-4 w-4 shrink-0 text-muted-foreground transition-transform {credOpen ? 'rotate-180' : ''}"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
					</svg>
				</span>
			</summary>
			<div class="space-y-2 border-t border-border px-4 py-3">
				<p class="text-xs text-muted-foreground">Hanya untuk pengujian. Klik baris untuk mengisi username & password.</p>
				<ul class="space-y-1.5">
					{#each demos as d}
						<li
							class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs"
						>
							<button
								type="button"
								onclick={() => isiForm(d.user, d.pass)}
								class="min-w-0 flex-1 text-left font-medium text-foreground hover:text-primary"
							>
								{d.label}
								<span class="mt-0.5 block font-mono text-[10px] text-muted-foreground">{d.user}</span>
							</button>
							<button
								type="button"
								onclick={() => salinUserPass(d.user, d.pass)}
								class="shrink-0 rounded border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-muted"
							>
								Salin
							</button>
						</li>
					{/each}
				</ul>
			</div>
		</details>

		<div class="rounded-xl border border-border bg-card p-6 shadow-sm">
			<form
				method="POST"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				{#if form?.error}
					<div class="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
						{form.error}
					</div>
				{/if}

				<div class="space-y-2">
					<label for="username" class="text-sm font-medium text-foreground">Username</label>
					<input
						id="username"
						name="username"
						type="text"
						required
						bind:value={username}
						class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
						placeholder="Masukkan username"
					/>
				</div>

				<div class="space-y-2">
					<label for="password" class="text-sm font-medium text-foreground">Password</label>
					<input
						id="password"
						name="password"
						type="password"
						required
						bind:value={password}
						class="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
						placeholder="Masukkan password"
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					class="flex h-11 w-full items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
				>
					{#if loading}
						<svg class="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
						</svg>
						Memproses...
					{:else}
						Masuk
					{/if}
				</button>
			</form>
		</div>

		<p class="mt-6 text-center text-xs text-muted-foreground">
			OPS-SIS v0.1 &middot; Hanya untuk personil berwenang
		</p>
	</div>
</div>
