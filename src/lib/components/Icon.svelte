<script lang="ts">
	import { icons, type IconName } from '../flow/icons';

	let { name, size = 18, stroke = 1.6 }: { name: IconName; size?: number; stroke?: number } = $props();
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
	{@html icons[name]}
</svg>
