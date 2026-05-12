<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let rootEl: HTMLElement | undefined = $state();
	let scrollY = $state(0);
	let reduceMotion = $state(false);
	let navOpen = $state(false);
	let navVisible = $state(false);
	let heroLogoWrap: HTMLElement | undefined = $state();
	let heroTiltX = $state(0);
	let heroTiltY = $state(0);

	const heroLogoY = $derived(reduceMotion ? 0 : Math.min(scrollY * 0.14, 160));
	const heroGlowY = $derived(reduceMotion ? 0 : scrollY * 0.06);
	const heroGridY = $derived(reduceMotion ? 0 : scrollY * 0.03);

	function scrollToId(id: string) {
		if (!browser) return;
		document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
		navOpen = false;
	}

	onMount(() => {
		if (!browser) return;
		reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

		const onScroll = () => {
			scrollY = window.scrollY;
		};
		onScroll();
		window.addEventListener('scroll', onScroll, { passive: true });

		let io: IntersectionObserver | undefined;
		let navIo: IntersectionObserver | undefined;
		if (rootEl && !reduceMotion) {
			io = new IntersectionObserver(
				(entries) => {
					for (const e of entries) {
						if (e.isIntersecting) e.target.classList.add('lp-in');
					}
				},
				{ threshold: 0.08, rootMargin: '0px 0px -6% 0px' }
			);
			rootEl.querySelectorAll('.lp-animate').forEach((el) => io?.observe(el));
		} else if (rootEl) {
			rootEl.querySelectorAll('.lp-animate').forEach((el) => el.classList.add('lp-in'));
		}

		// Navbar hanya muncul saat user mulai masuk section "Tentang".
		const tentang = document.getElementById('tentang');
		if (tentang) {
			navIo = new IntersectionObserver(
				(entries) => {
					const e = entries[0];
					navVisible = !!e?.isIntersecting;
					if (!navVisible) navOpen = false;
				},
				{ threshold: 0.08, rootMargin: '-10% 0px -70% 0px' }
			);
			navIo.observe(tentang);
		}

		return () => {
			window.removeEventListener('scroll', onScroll);
			io?.disconnect();
			navIo?.disconnect();
		};
	});

	function onHeroPointerMove(e: PointerEvent) {
		if (reduceMotion || !heroLogoWrap) return;
		const r = heroLogoWrap.getBoundingClientRect();
		const cx = r.left + r.width / 2;
		const cy = r.top + r.height / 2;
		const dx = (e.clientX - cx) / (r.width / 2);
		const dy = (e.clientY - cy) / (r.height / 2);
		heroTiltX = Math.max(-1, Math.min(1, -dy)) * 7.5;
		heroTiltY = Math.max(-1, Math.min(1, dx)) * 9;
	}

	function onHeroPointerLeave() {
		heroTiltX = 0;
		heroTiltY = 0;
	}
</script>

<div class="landing text-foreground" bind:this={rootEl}>
	<!-- Nav -->
	<header
		class="landing-nav fixed inset-x-0 top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur-md transition-[opacity,transform,box-shadow] duration-300"
		class:landing-nav--scrolled={scrollY > 24}
		class:landing-nav--hidden={!navVisible}
	>
		<div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
			<a
				href="/"
				class="group flex min-w-0 items-center gap-2 rounded-lg outline-none ring-ring focus-visible:ring-2"
				aria-label="OPS-SIS beranda"
			>
				<img
					src="/LOGO_OPS-SIS.png"
					width="96"
					height="96"
					alt=""
					class="h-10 w-10 shrink-0 object-contain transition-transform duration-300 group-hover:scale-105 sm:h-11 sm:w-11"
					decoding="async"
				/>
				<div class="min-w-0 leading-tight">
					<p class="truncate text-sm font-bold tracking-tight sm:text-base">OPS-SIS</p>
					<p class="truncate text-[10px] text-muted-foreground sm:text-xs">OPS POLDA NTT</p>
				</div>
			</a>

			<nav class="hidden items-center gap-1 md:flex" aria-label="Navigasi utama">
				{#each [{ id: 'tentang', label: 'Tentang' }, { id: 'tujuan', label: 'Tujuan' }, { id: 'modul', label: 'Modul' }, { id: 'kapolda', label: 'Pimpinan' }] as item (item.id)}
					<button
						type="button"
						class="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
						onclick={() => scrollToId(item.id)}
					>
						{item.label}
					</button>
				{/each}
				<a
					href="/login"
					class="landing-btn-primary ml-2 inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-95 active:scale-[0.98]"
				>
					Masuk
				</a>
			</nav>

			<div class="flex items-center gap-2 md:hidden">
				<a
					href="/login"
					class="landing-btn-primary inline-flex min-h-10 items-center justify-center rounded-[var(--radius)] px-3 py-2 text-sm font-semibold text-primary-foreground shadow"
				>
					Masuk
				</a>
				<button
					type="button"
					class="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground"
					aria-expanded={navOpen}
					aria-controls="landing-mobile-nav"
					onclick={() => (navOpen = !navOpen)}
				>
					<span class="sr-only">Menu</span>
					<svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
						{#if navOpen}
							<path d="M6 18L18 6M6 6l12 12" stroke-width="2" stroke-linecap="round" />
						{:else}
							<path d="M4 7h16M4 12h16M4 17h16" stroke-width="2" stroke-linecap="round" />
						{/if}
					</svg>
				</button>
			</div>
		</div>

		{#if navOpen}
			<div
				id="landing-mobile-nav"
				class="border-t border-border bg-background/95 px-4 py-3 md:hidden"
			>
				<div class="flex flex-col gap-1">
					{#each [{ id: 'tentang', label: 'Tentang sistem' }, { id: 'tujuan', label: 'Tujuan & manfaat' }, { id: 'modul', label: 'Modul & alur' }, { id: 'kapolda', label: 'Arahan pimpinan' }] as item (item.id)}
						<button
							type="button"
							class="rounded-lg px-3 py-3 text-left text-sm font-medium hover:bg-muted"
							onclick={() => scrollToId(item.id)}
						>
							{item.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</header>

	<!-- Hero -->
	<section
		id="hero"
		class="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden pt-4"
		aria-label="Hero OPS-SIS"
	>
		<img
			src="/landing/hero-bg.jpg"
			alt=""
			class="landing-hero-bg pointer-events-none absolute inset-0 h-full w-full object-cover"
			loading="eager"
			decoding="async"
			fetchpriority="high"
		/>
		<div class="landing-hero-overlay pointer-events-none absolute inset-0" aria-hidden="true"></div>
		<div
			class="landing-hero-grid pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.22]"
			style="transform: translateY({heroGridY}px)"
		></div>
		<div
			class="landing-hero-glow pointer-events-none absolute left-1/2 top-1/3 h-[min(80vw,520px)] w-[min(80vw,520px)] -translate-x-1/2 rounded-full bg-primary/25 blur-[100px] dark:bg-primary/35"
			style="transform: translate(-50%, calc(-50% + {heroGlowY}px))"
		></div>

		<div class="relative z-[1] flex w-full max-w-5xl flex-col items-center px-4 pb-10 pt-6 text-center sm:px-8">
			<div class="relative w-full max-w-[min(92vw,640px)] will-change-transform" style="transform: translateY({heroLogoY}px)">
				<div
					class="lp-float hero-logo-wrap relative"
					bind:this={heroLogoWrap}
					onpointermove={onHeroPointerMove}
					onpointerleave={onHeroPointerLeave}
					role="img"
					aria-label="Logo OPS-SIS interaktif"
					style="--hx:{heroTiltX}deg; --hy:{heroTiltY}deg;"
				>
					<img
						src="/LOGO_OPS-SIS.png"
						width="1024"
						height="1024"
						alt="Lambang OPS-SIS — OPS POLDA NTT"
						class="hero-logo mx-auto h-auto w-full max-w-[min(84vw,520px)] object-contain drop-shadow-2xl"
						fetchpriority="high"
						decoding="async"
					/>
					<div
						class="pointer-events-none absolute inset-x-[8%] -bottom-6 h-16 rounded-[50%] bg-foreground/10 blur-2xl dark:bg-primary/20"
						aria-hidden="true"
					></div>
				</div>
			</div>

			<p class="lp-animate lp-delay-3 mt-3 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
				Rengiat, giat, LHP, monitoring, peta kerawanan, dan live wall menyatu dalam satu alur — cepat, rapi, dan dapat dipertanggungjawabkan.
			</p>

			<div class="lp-animate lp-delay-4 hero-cta mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
				<a
					href="/login"
					class="landing-btn-primary landing-btn-pulse inline-flex min-h-12 items-center justify-center rounded-[var(--radius)] px-8 py-3 text-base font-semibold text-primary-foreground shadow-lg transition hover:opacity-95 active:scale-[0.98]"
				>
					Masuk ke aplikasi
				</a>
				<Button type="button" variant="secondary" size="lg" class="min-h-12 px-8" onclick={() => scrollToId('tentang')}>
					Pelajari fungsi sistem
				</Button>
			</div>

			<button
				type="button"
				class="lp-animate lp-delay-5 mt-16 flex flex-col items-center gap-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
				onclick={() => scrollToId('tentang')}
			>
				Gulir untuk detail
				<span class="landing-chevron inline-block h-6 w-6 animate-bounce rounded-full border border-border" aria-hidden="true"></span>
			</button>
		</div>
	</section>

	<!-- Tentang -->
	<section
		id="tentang"
		class="scroll-mt-24 border-t border-border bg-muted/40 px-4 py-20 sm:px-6 md:scroll-mt-28"
	>
		<div class="mx-auto max-w-6xl">
			<h2 class="lp-animate text-3xl font-bold tracking-tight md:text-4xl">Apa itu OPS-SIS?</h2>
			<p class="lp-animate lp-delay-1 mt-4 max-w-3xl text-lg text-muted-foreground">
				<strong class="text-foreground">OPS-SIS (Operational System — Sistem Informasi)</strong> adalah
				platform digital Polda Nusa Tenggara Timur untuk mengorkestrasi operasi: dari perencanaan
				rencana giat, eksekusi di lapangan, pelaporan, hingga monitoring dan analisis situasi di
				pusat komando.
			</p>

			<div class="mt-12 grid gap-6 md:grid-cols-3">
				{#each [{ t: 'Satu sumber kebenaran operasi', d: 'Rencana, status giat, bukti visual, dan laporan mengalir dalam satu pipeline sehingga tidak ada versi data yang bertentangan antar satuan.' }, { t: 'Transparansi & akuntabilitas', d: 'Setiap langkah dapat dilacak: siapa yang melaksanakan, kapan, di mana, dan dengan bukti apa — mendukung pengawasan internal dan sinergi dengan stakeholder.' }, { t: 'Cepat merespons di wilayah kepulauan', d: 'NTT memiliki tantangan geografis dan konektivitas. OPS-SIS dirancang dengan dukungan kerja offline-first pada bagian lapangan dan sinkronisasi ketika jaringan kembali stabil.' }] as card, i (card.t)}
					<div
						class="lp-animate rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
						style="transition-delay: {i * 60}ms"
					>
						<h3 class="text-lg font-semibold">{card.t}</h3>
						<p class="mt-3 text-sm leading-relaxed text-muted-foreground">{card.d}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Tujuan -->
	<section id="tujuan" class="scroll-mt-24 px-4 py-20 sm:px-6 md:scroll-mt-28">
		<div class="mx-auto max-w-6xl">
			<h2 class="lp-animate text-3xl font-bold tracking-tight md:text-4xl">Tujuan &amp; arah fungsional</h2>
			<p class="lp-animate lp-delay-1 mt-4 max-w-3xl text-muted-foreground">
				Sistem ini bukan sekadar “aplikasi laporan”. OPS-SIS dibangun agar pimpinan dan operator
				bekerja dari situasi yang sama — dengan indikator yang jelas dan bukti yang dapat
				diperiksa ulang.
			</p>

			<ol class="landing-steps lp-animate lp-delay-2 mt-12 space-y-0 md:grid md:grid-cols-4 md:gap-4 md:space-y-0">
				{#each [{ n: '1', h: 'Rencana', p: 'Penyusunan dan distribusi rencana giat (rengiat) agar satuan tahu tugas, waktu, dan sumber daya sebelum pelaksanaan.' }, { n: '2', h: 'Pelaksanaan', p: 'Pencatatan giat di lapangan dengan heartbeat/status, unggah bukti, dan penandaan lokasi untuk memastikan aktivitas sesuai rencana.' }, { n: '3', h: 'Pelaporan & verifikasi', p: 'Alur LHP dan verifikasi memastikan data yang naik ke tingkat atas sudah dicek, sehingga ringkasan untuk pimpinan konsisten.' }, { n: '4', h: 'Situasi', p: 'Monitoring, peta kerawanan, live wall, dan alur event membantu membaca dinamika wilayah secara kontinyu untuk keputusan taktis.' }] as step (step.n)}
					<li class="landing-step relative rounded-2xl border border-border bg-card/80 p-5 backdrop-blur-sm">
						<span class="landing-step-num">{step.n}</span>
						<h3 class="mt-2 font-semibold">{step.h}</h3>
						<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
							{step.p}
						</p>
					</li>
				{/each}
			</ol>
		</div>
	</section>

	<!-- Modul -->
	<section
		id="modul"
		class="scroll-mt-24 border-t border-border bg-muted/30 px-4 py-20 sm:px-6 md:scroll-mt-28"
	>
		<div class="mx-auto max-w-6xl">
			<h2 class="lp-animate text-3xl font-bold tracking-tight md:text-4xl">Modul &amp; kapabilitas utama</h2>
			<p class="lp-animate lp-delay-1 mt-4 max-w-3xl text-muted-foreground">
				Berikut komponen yang mendukung siklus operasi — dari perencanaan hingga evaluasi situasi.
				Setiap modul saling terhubung melalui data giat, personil, dan waktu.
			</p>

			<div class="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each [{ k: 'Rengiat', b: 'Perencanaan kegiatan', t: 'Buat, kelola, dan pantau rencana giat; koordinasi antar satuan dengan status yang terpusat.' }, { k: 'Giat & LHP', b: 'Pelaksanaan & laporan', t: 'Catat pelaksanaan, unggah bukti, sinkronisasi LHP, dan jalur verifikasi untuk kualitas data.' }, { k: 'Monitoring', b: 'Pemantauan operasi', t: 'Ringkasan indikator, aktivitas personil, dan alur kerja verifikasi untuk pengendalian harian.' }, { k: 'Peta kerawanan', b: 'Geospasial', t: 'Visualisasi risiko dan penandaan wilayah mendukung analisis taktis dan pengarahan sumber daya.' }, { k: 'Live wall', b: 'Pusat komando', t: 'Tampilan layar besar untuk situasi bersama — ideal untuk ruang kendali dan rapat cepat.' }, { k: 'Lapangan & ketahanan', b: 'Offline & unggahan aman', t: 'Dukungan kerja lapangan dengan antrean sinkronisasi dan kontrol keamanan unggahan media.' }] as m (m.k)}
					<article
						class="lp-animate group rounded-2xl border border-border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
					>
						<p class="text-xs font-semibold uppercase tracking-wider text-accent">{m.b}</p>
						<h3 class="mt-2 text-xl font-bold">{m.k}</h3>
						<p class="mt-3 text-sm leading-relaxed text-muted-foreground">{m.t}</p>
						<span
							class="mt-4 inline-block text-xs font-medium text-primary opacity-0 transition group-hover:opacity-100"
						>
							Terintegrasi dengan alur OPS-SIS →
						</span>
					</article>
				{/each}
			</div>

			<div class="lp-animate lp-delay-3 mt-14 rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-8 md:p-10">
				<h3 class="text-xl font-bold">Untuk siapa sistem ini?</h3>
				<ul class="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
					<li class="flex gap-2">
						<span class="text-accent" aria-hidden="true">●</span>
						Pimpinan Polda dan perwira staf yang membutuhkan gambaran situasi terpadu.
					</li>
					<li class="flex gap-2">
						<span class="text-accent" aria-hidden="true">●</span>
						Satuan pelaksana di tingkat polres/polsek yang melaksanakan dan melaporkan giat.
					</li>
					<li class="flex gap-2">
						<span class="text-accent" aria-hidden="true">●</span>
						Tim verifikasi dan administrasi yang menjaga konsistensi LHP dan arsip digital.
					</li>
					<li class="flex gap-2">
						<span class="text-accent" aria-hidden="true">●</span>
						Operator ruang kendali yang menampilkan situasi ke layar monitoring bersama.
					</li>
				</ul>
			</div>
		</div>
	</section>

	<!-- Kapolda -->
	<section id="kapolda" class="scroll-mt-24 px-4 py-20 sm:px-6 md:scroll-mt-28">
		<div class="mx-auto max-w-6xl">
			<h2 class="lp-animate text-3xl font-bold tracking-tight md:text-4xl">Arahan &amp; semangat kepemimpinan</h2>
			<p class="lp-animate lp-delay-1 mt-4 max-w-3xl text-muted-foreground">
				Nilai-nilai yang ditegaskan Kapolda NTT menjadi landasan bagaimana OPS-SIS diposisikan:
				bukan mengganti prinsip pelayanan dan kepercayaan publik, tetapi memperkuatnya lewat data
				yang akurat, sinergi, dan akuntabilitas.
			</p>

			<div class="lp-animate lp-delay-2 mt-12 grid gap-10 lg:grid-cols-2 lg:items-start">
				<div class="kapolda-3d-wrap lg:self-stretch">
					<img
						src="/landing/kapolda-ntt-3d.png"
						width="1024"
						height="1024"
						alt="Ilustrasi Kapolda NTT (Rudi Darmoko) — 3D"
						class="kapolda-3d mx-auto h-auto w-full max-w-[620px] select-none object-contain lg:max-w-[740px]"
						loading="lazy"
						decoding="async"
						draggable="false"
					/>
				</div>

				<div class="space-y-8">
					<blockquote class="landing-quote rounded-2xl border-l-4 border-accent bg-muted/50 p-6">
						<p class="text-lg font-medium leading-relaxed">
							&ldquo;Tugas kita bukan hanya menegakkan hukum, tetapi juga membangun kepercayaan publik.
							Mari kita menjadi wajah Polri yang humanis, adil, dan responsif.&rdquo;
						</p>
						<footer class="mt-4 text-sm text-muted-foreground">
							— Irjen Pol Rudi Darmoko, Kapolda NTT, dalam arahan Commander Wish kepada jajaran Polda NTT
							<span class="whitespace-nowrap">(Katantt.com, 11 Juni 2025)</span>
						</footer>
					</blockquote>

					<blockquote class="landing-quote rounded-2xl border-l-4 border-primary bg-muted/50 p-6">
						<p class="text-lg font-medium leading-relaxed">
							&ldquo;Kami menyadari peran penting media sebagai mitra strategis Polri dalam memberikan
							informasi yang akurat kepada masyarakat.&rdquo;
						</p>
						<footer class="mt-4 text-sm text-muted-foreground">
							— Irjen Pol Rudi Darmoko, saat silaturahmi dengan awak media di Mapolda NTT
							<span class="whitespace-nowrap">(Konteks.co.id, 4 Juli 2025)</span>
						</footer>
					</blockquote>

					<blockquote class="landing-quote rounded-2xl border-l-4 border-accent bg-muted/50 p-6">
						<p class="text-lg font-medium leading-relaxed">
							&ldquo;Mari kita bangun sinergi. Polri dan masyarakat bukan dua pihak yang terpisah. Kita
							adalah mitra yang saling menguatkan demi masa depan NTT yang aman, sejahtera, dan
							bermartabat.&rdquo;
						</p>
						<footer class="mt-4 text-sm text-muted-foreground">
							— Irjen Pol Rudi Darmoko, penutup arahan kebijakan kepada jajaran
							<span class="whitespace-nowrap">(Katantt.com, 11 Juni 2025)</span>
						</footer>
					</blockquote>

					<p class="text-sm leading-relaxed text-muted-foreground">
						Dalam konteks OPS-SIS, ketiga narasi di atas berarti: data operasi harus
						<strong class="text-foreground">akurat dan dapat dipertanggungjawabkan</strong> (mitra
						informasi), keputusan harus
						<strong class="text-foreground">adil dan responsif</strong> pada situasi masyarakat, serta
						platform ini hadir untuk
						<strong class="text-foreground">menyatukan sinergi</strong> antar satuan — bukan memecah
						koordinasi.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA -->
	<section class="border-t border-border bg-primary px-4 py-16 text-primary-foreground sm:px-6">
		<div class="lp-animate mx-auto max-w-3xl text-center">
			<h2 class="text-2xl font-bold md:text-3xl">Siap mengoperasikan OPS-SIS?</h2>
			<p class="mt-3 text-primary-foreground/90">
				Masuk dengan akun resmi personil. Jika Anda belum memiliki akses, hubungi administrator
				sistem di jajaran Polda NTT.
			</p>
			<div class="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:justify-center">
				<a
					href="/login"
					class="inline-flex min-h-12 items-center justify-center rounded-[var(--radius)] bg-background px-8 py-3 text-base font-semibold text-primary shadow-lg transition hover:opacity-95 active:scale-[0.98]"
				>
					Masuk sekarang
				</a>
				<button
					type="button"
					class="inline-flex min-h-12 items-center justify-center rounded-[var(--radius)] border-2 border-primary-foreground/50 px-8 py-3 text-base font-semibold text-primary-foreground transition hover:bg-primary-foreground/10"
					onclick={() => scrollToId('hero')}
				>
					Kembali ke atas
				</button>
			</div>
		</div>
	</section>

	<footer class="border-t border-border bg-muted/40 px-4 py-10 text-center text-sm text-muted-foreground sm:px-6">
		<p>&copy; {new Date().getFullYear()} OPS-SIS &middot; OPS POLDA NTT. Hak akses terbatas.</p>
	</footer>
</div>

<style>
	.landing {
		--landing-primary: var(--primary);
	}

	.landing-nav--scrolled {
		box-shadow: 0 8px 24px color-mix(in srgb, var(--foreground) 8%, transparent);
	}

	.landing-nav--hidden {
		opacity: 0;
		transform: translateY(-110%);
		pointer-events: none;
	}

	.landing-btn-primary {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--primary) 92%, white),
			color-mix(in srgb, var(--primary) 100%, black 12%)
		);
	}

	:global(.dark) .landing-btn-primary {
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--primary) 100%, white 8%),
			color-mix(in srgb, var(--primary) 85%, black 25%)
		);
	}

	.landing-hero-grid {
		background-image:
			linear-gradient(color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px),
			linear-gradient(90deg, color-mix(in srgb, var(--foreground) 6%, transparent) 1px, transparent 1px);
		background-size: 48px 48px;
		mask-image: radial-gradient(ellipse 70% 60% at 50% 35%, black 15%, transparent 70%);
		animation: landing-grid-drift 22s linear infinite;
	}

	.landing-hero-bg {
		transform: scale(1.06);
		filter: blur(1px) saturate(1.08) contrast(1.05);
		opacity: 0.92;
	}

	:global(.dark) .landing-hero-bg {
		filter: blur(1px) saturate(1.02) contrast(1.08) brightness(0.8);
		opacity: 0.85;
	}

	.landing-hero-overlay {
		background:
			radial-gradient(ellipse 55% 55% at 50% 30%, transparent 0%, color-mix(in srgb, var(--background) 38%, transparent) 55%, color-mix(in srgb, var(--background) 88%, transparent) 100%),
			linear-gradient(to bottom, color-mix(in srgb, var(--background) 72%, transparent), color-mix(in srgb, var(--background) 92%, transparent));
	}

	@keyframes landing-grid-drift {
		from {
			background-position: 0 0, 0 0;
		}
		to {
			background-position: 48px 48px, 48px 48px;
		}
	}

	.landing-chevron {
		background: linear-gradient(
			to bottom,
			transparent 40%,
			color-mix(in srgb, var(--muted-foreground) 55%, transparent) 40%,
			color-mix(in srgb, var(--muted-foreground) 55%, transparent) 55%,
			transparent 55%
		);
	}

	.landing-step-num {
		display: inline-flex;
		height: 2rem;
		width: 2rem;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--accent) 35%, transparent);
		font-size: 0.875rem;
		font-weight: 700;
		color: var(--foreground);
	}

	.kapolda-3d-wrap {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 10px;
		perspective: 900px;
	}

	.kapolda-3d {
		max-height: min(92vh, 980px);
		transform-style: preserve-3d;
		animation: kapolda-float 6.5s ease-in-out infinite;
		filter: drop-shadow(0 26px 34px color-mix(in srgb, var(--foreground) 20%, transparent))
			drop-shadow(0 0 60px color-mix(in srgb, var(--primary) 20%, transparent));
		will-change: transform;
	}

	.kapolda-3d:hover {
		transform: rotateX(8deg) rotateY(-10deg) translateZ(14px);
	}

	@keyframes kapolda-float {
		0%,
		100% {
			transform: translateY(0) rotateX(10deg) rotateY(-12deg);
		}
		50% {
			transform: translateY(-10px) rotateX(12deg) rotateY(-10deg);
		}
	}

	@media (min-width: 768px) {
		.landing-steps .landing-step:not(:last-child)::after {
			content: '';
			position: absolute;
			top: 50%;
			right: -0.5rem;
			width: 1rem;
			height: 2px;
			background: linear-gradient(90deg, var(--border), transparent);
			transform: translateY(-50%);
			pointer-events: none;
		}
	}

	.landing-quote {
		animation: landing-quote-in 0.85s cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.landing-quote:nth-child(2) {
		animation-delay: 0.08s;
	}
	.landing-quote:nth-child(3) {
		animation-delay: 0.16s;
	}

	@keyframes landing-quote-in {
		from {
			opacity: 0;
			transform: translateX(12px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	:global(.landing .lp-animate) {
		opacity: 0.02;
		transform: translateY(28px);
		transition:
			opacity 0.75s cubic-bezier(0.22, 1, 0.36, 1),
			transform 0.75s cubic-bezier(0.22, 1, 0.36, 1);
	}
	:global(.landing .lp-animate.lp-in) {
		opacity: 1;
		transform: translateY(0);
	}

	.lp-delay-1 {
		transition-delay: 0.06s;
	}
	.lp-delay-2 {
		transition-delay: 0.12s;
	}
	.lp-delay-3 {
		transition-delay: 0.18s;
	}
	.lp-delay-4 {
		transition-delay: 0.24s;
	}
	.lp-delay-5 {
		transition-delay: 0.3s;
	}

	.lp-float {
		animation: landing-float 7s ease-in-out infinite;
	}

	.hero-logo-wrap {
		transform-style: preserve-3d;
	}

	.hero-logo {
		transform: perspective(900px) rotateX(var(--hx, 0deg)) rotateY(var(--hy, 0deg)) translateZ(14px);
		transition: transform 140ms ease-out;
		will-change: transform;
		filter: drop-shadow(0 30px 44px color-mix(in srgb, var(--foreground) 22%, transparent))
			drop-shadow(0 0 90px color-mix(in srgb, var(--primary) 28%, transparent))
			drop-shadow(0 0 28px color-mix(in srgb, var(--accent) 18%, transparent));
	}

	.hero-cta :global(button),
	.hero-cta a {
		box-shadow:
			0 16px 36px color-mix(in srgb, var(--foreground) 10%, transparent),
			0 0 0 1px color-mix(in srgb, var(--border) 70%, transparent);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		transform: translateZ(0);
	}

	.hero-cta :global(button):hover,
	.hero-cta a:hover {
		transform: translateY(-1px);
	}

	@keyframes landing-float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-10px);
		}
	}

	.landing-btn-pulse {
		animation: landing-cta-pulse 2.8s ease-in-out infinite;
	}

	@keyframes landing-cta-pulse {
		0%,
		100% {
			box-shadow:
				0 10px 28px color-mix(in srgb, var(--primary) 35%, transparent),
				0 0 0 0 color-mix(in srgb, var(--accent) 45%, transparent);
		}
		50% {
			box-shadow:
				0 12px 32px color-mix(in srgb, var(--primary) 45%, transparent),
				0 0 0 10px transparent;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.landing-hero-grid {
			animation: none;
		}
		.lp-float {
			animation: none;
		}
		.hero-logo {
			transition: none;
			transform: none;
		}
		.landing-btn-pulse {
			animation: none;
		}
		.landing-quote {
			animation: none;
		}
		.kapolda-3d {
			animation: none;
			transform: none;
		}
		:global(.landing .lp-animate) {
			opacity: 1;
			transform: none;
			transition: none;
		}
	}
</style>
