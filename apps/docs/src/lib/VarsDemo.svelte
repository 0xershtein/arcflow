<script lang="ts">
	import { browser } from '$app/environment';
	import { FlowEditor, type EditorOptions } from '@arcsig-labs/editor/svelte';
	import { standardRegistry } from '@arcsig-labs/nodes';
	import CodeBlock from './Code.svelte';
	import Segmented from './Segmented.svelte';
	import { createVarsFlow } from './demo-flow';

	/** `vars` and `summaries` on one editor: the host's numbers go into runs, never into the flow. */
	const flow = createVarsFlow();

	let balance = $state<'800' | '2400'>('2400');
	let wording = $state<'definition' | 'host'>('host');

	const vars = $derived({ balance: Number(balance), currency: 'USDC' });

	const summaries: EditorOptions['summaries'] = {
		'logic.if': (config) => `Balance over ${(config.conditions as { right: unknown }[])[0]?.right}?`
	};

	const code = $derived(
		[
			`createEditor('#editor', {`,
			`\tsteps: standardRegistry,`,
			`\tflow,`,
			`\tvars: { balance: ${balance}, currency: 'USDC' }${wording === 'host' ? ',' : ''}`,
			...(wording === 'host' ? [`\tsummaries: {`, `\t\t'logic.if': (config) => \`Balance over \${config.conditions[0].right}?\``, `\t}`] : []),
			`});`
		].join('\n')
	);
</script>

<div class="controls">
	<Segmented label="vars.balance" bind:value={balance} options={[{ value: '800', label: '800' }, { value: '2400', label: '2 400' }]} />
	<Segmented label="Summaries" bind:value={wording} options={[{ value: 'definition', label: 'Step’s own' }, { value: 'host', label: 'Host’s' }]} />
</div>

<div class="frame">
	{#if browser}
		<FlowEditor steps={standardRegistry} {flow} {vars} summaries={wording === 'host' ? summaries : undefined} ui={{ palette: false }} />
	{:else}
		<p class="placeholder">Loading the editor…</p>
	{/if}
</div>
<CodeBlock {code} />

<style>
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 24px;
		margin: 0 0 16px;
	}

	.frame {
		height: 520px;
		margin: 0 0 16px;
		border: 1px solid var(--line-strong);
		border-radius: 12px;
		overflow: hidden;
		background: var(--surface-2);
	}

	.placeholder {
		display: grid;
		place-items: center;
		height: 100%;
		margin: 0;
		color: var(--text-muted);
		font-size: 14px;
	}
</style>
