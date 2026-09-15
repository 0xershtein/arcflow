<script lang="ts">
	import { FlowBuilder, createRegistry, paymentsPack, sampleFlow } from '$lib';

	const registry = createRegistry([paymentsPack]);
</script>

<svelte:head>
	<title>Flow builder</title>
</svelte:head>

<main>
	<FlowBuilder {registry} initial={sampleFlow} storageKey="flow-builder:demo">
		{#snippet brand()}
			<svg width="22" height="22" viewBox="0 0 34 34" fill="none" aria-hidden="true">
				<defs>
					<linearGradient id="brand-arc" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
						<stop offset="0" stop-color="#ecd9ae" />
						<stop offset="0.55" stop-color="#a8844a" />
						<stop offset="1" stop-color="#e2c78f" />
					</linearGradient>
				</defs>
				<path d="M3 26 A14 14 0 0 1 31 26" stroke="url(#brand-arc)" stroke-width="6" stroke-linecap="round" />
				<circle cx="17" cy="12" r="3" fill="#0f0d0b" />
			</svg>
			<span>Flows</span>
		{/snippet}
	</FlowBuilder>
</main>

<style>
	main {
		height: 100dvh;
	}
</style>
