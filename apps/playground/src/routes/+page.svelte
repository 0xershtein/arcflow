<script lang="ts">
	import { FlowEditor, type Labels, type ThemeMode } from '@arcflow/editor/svelte';
	import { createPayrollFlow, paymentsRegistry } from '@arcflow/payments';

	const flow = createPayrollFlow();

	let mode = $state<ThemeMode>('auto');
	let accent = $state('#4f46e5');
	let radius = $state(10);
	let palette = $state(true);
	let inspector = $state(true);
	let readonly = $state(false);
	let turkish = $state(false);

	const tr: Partial<Labels> = {
		testRun: 'Test et',
		json: 'JSON',
		import: 'İçe aktar',
		export: 'Dışa aktar',
		ready: 'Hazır',
		problemCount: '{count} sorun',
		problemsCount: '{count} sorun',
		searchSteps: 'Adım ara',
		looksGood: 'Her şey yolunda',
		needsAttention: 'Dikkat gerekiyor',
		flow: 'Akış',
		name: 'Ad',
		duplicate: 'Kopyala',
		disable: 'Devre dışı',
		enable: 'Etkinleştir',
		delete: 'Sil',
		add: 'Ekle',
		runTitle: 'Test çalıştırma',
		completed: 'Tamamlandı',
		simulated: 'Simülasyon — hiçbir şey gönderilmez',
		allGood: 'Tüm adımlar bağlı ve ayarlı. Test et ile akışı izleyebilirsin.',
		hintAdd: 'Soldan bir adıma tıkla ya da canvas’a sürükle.',
		hintConnect: 'Bağlamak için adımın sağındaki noktadan sürükle.',
		hintJson: 'Koddan ya da bir LLM’den gelen akışı yapıştırmak için JSON’u aç.',
		hintDelete: 'Düzenlemek için bir adım seç. Backspace siler.'
	};

	let lastFlow = $state('');
	let problems = $state(0);
</script>

<svelte:head>
	<title>arcflow playground</title>
</svelte:head>

<div class="page" data-mode={mode}>
	<form class="settings" onsubmit={(event) => event.preventDefault()}>
		<strong>arcflow</strong>
		<label>
			Theme
			<select bind:value={mode}>
				<option value="auto">auto</option>
				<option value="light">light</option>
				<option value="dark">dark</option>
			</select>
		</label>
		<label>Accent <input type="color" bind:value={accent} /></label>
		<label>Radius <input type="range" min="0" max="16" bind:value={radius} /></label>
		<label><input type="checkbox" bind:checked={palette} /> Palette</label>
		<label><input type="checkbox" bind:checked={inspector} /> Inspector</label>
		<label><input type="checkbox" bind:checked={readonly} /> Read only</label>
		<label><input type="checkbox" bind:checked={turkish} /> Türkçe</label>
		<span class="meta">{problems} errors · onChange {lastFlow || '—'}</span>
	</form>

	<main>
		<FlowEditor
			steps={paymentsRegistry}
			{flow}
			{readonly}
			storageKey="arcflow:playground"
			theme={{ mode, radius, colors: { accent, accentSoft: `${accent}22` } }}
			ui={{ palette, inspector, minimap: false }}
			labels={turkish ? tr : undefined}
			onChange={(next) => (lastFlow = `${next.nodes.length} steps at ${new Date().toLocaleTimeString()}`)}
			onValidate={(issues) => (problems = issues.filter((issue) => issue.level === 'error').length)}
		/>
	</main>
</div>

<style>
	.page {
		height: 100dvh;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		font: 13px/1.4 ui-sans-serif, system-ui, sans-serif;
	}

	.settings {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 18px;
		padding: 8px 16px;
		border-bottom: 1px solid #e4e4e7;
		background: #fff;
		color: #3f3f46;
	}

	.settings label {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.meta {
		margin-left: auto;
		color: #71717a;
	}

	main {
		min-height: 0;
	}
</style>
