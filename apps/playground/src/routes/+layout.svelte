<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600&display=swap"
	/>
</svelte:head>

{@render children()}

<style>
	:global(html, body) {
		margin: 0;
		height: 100%;
		background: #0f0d0b;
	}
</style>
