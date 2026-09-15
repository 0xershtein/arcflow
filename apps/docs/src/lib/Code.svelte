<script lang="ts">
	/** A code block with a copy button. */
	let { code, language = 'ts' }: { code: string; language?: string } = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1500);
		} catch {
			// clipboard can be blocked; the code is selectable anyway
		}
	}
</script>

<figure class="code">
	<button onclick={copy} aria-label="Copy code">{copied ? 'Copied' : 'Copy'}</button>
	<pre><code data-language={language}>{code}</code></pre>
</figure>

<style>
	.code {
		position: relative;
		margin: 0 0 24px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: var(--surface-2);
		overflow: hidden;
	}

	button {
		position: absolute;
		top: 8px;
		right: 8px;
		padding: 4px 10px;
		border: 1px solid var(--line);
		border-radius: 6px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 12px;
		cursor: pointer;
	}

	button:hover {
		color: var(--text);
		border-color: var(--line-strong);
	}

	pre {
		margin: 0;
		padding: 16px 18px;
		overflow-x: auto;
		font-family: var(--mono);
		font-size: 13px;
		line-height: 1.6;
		color: var(--text-soft);
	}
</style>
