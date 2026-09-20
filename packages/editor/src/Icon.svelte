<script lang="ts">
	import { DEFAULT_ICON, icons, type IconName } from './icons.js';

	/** Unknown names (e.g. from a custom step) fall back to a generic mark. */
	let { name, size = 18, stroke = 1.6 }: { name: IconName | (string & {}); size?: number; stroke?: number } = $props();

	const markup = $derived(icons[name as IconName] ?? icons[DEFAULT_ICON]);
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<!-- icon markup is a static, trusted string from icons.ts -->
	{@html markup}
</svg>
