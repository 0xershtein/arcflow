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
		/* Set --code-bg where a block sits on a different surface; the fade below reads it. */
		background: var(--code-bg, var(--surface-2));
		overflow: hidden;
	}

	/* A long line scrolls under the copy button, so it fades out before reaching it. */
	.code::after {
		content: '';
		position: absolute;
		top: 0;
		right: 0;
		width: 108px;
		height: 46px;
		background: linear-gradient(to right, transparent, var(--code-bg, var(--surface-2)) 58%);
		pointer-events: none;
	}

	button {
		position: absolute;
		top: 8px;
		right: 8px;
		padding: 4px 10px;
		/* Above the fade, which is declared later and would otherwise paint over it. */
		z-index: 1;
		/* The block's own surface gives the button nothing to stand on in light mode. */
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text-soft);
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: color 0.15s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.15s cubic-bezier(0.16, 1, 0.3, 1);
	}

	button:hover {
		color: var(--text);
		background: var(--surface-2);
	}

	pre {
		margin: 0;
		padding: 16px 18px;
		overflow-x: auto;
		font-family: var(--mono);
		font-size: 13px;
		line-height: 1.6;
		/* The snippets are written with tabs; eight columns each is a wall of whitespace. */
		tab-size: 2;
		color: var(--text-soft);
	}
</style>
