<script lang="ts">
	import { formatMoney, formatMoneyInput, parseMoney } from '$lib/money';

	type EditMode = 'amount' | 'full';

	let {
		rowKey,
		label,
		hint,
		amount,
		mode = 'amount',
		disabled = false,
		editingKey,
		onOpen,
		onSave,
		onDelete
	}: {
		rowKey: string;
		label: string;
		hint: string;
		amount: number;
		mode?: EditMode;
		disabled?: boolean;
		editingKey: string | null;
		onOpen: (key: string | null) => void;
		onSave: (label: string, amount: number) => void;
		onDelete?: () => void;
	} = $props();

	let draftLabel = $state('');
	let draftAmount = $state('');
	let error = $state('');
	let isOpen = $derived(editingKey === rowKey && !disabled);

	$effect(() => {
		if (isOpen) {
			draftLabel = label;
			draftAmount = formatMoneyInput(amount);
			error = '';
		}
	});

	function submit(event: SubmitEvent) {
		event.preventDefault();
		const parsed = parseMoney(draftAmount);
		if (parsed === null || parsed < 0) {
			error = 'Bitte einen gültigen, nicht negativen Betrag eingeben.';
			return;
		}
		if (mode === 'full' && !draftLabel.trim()) {
			error = 'Bitte eine Bezeichnung eingeben.';
			return;
		}
		onSave(mode === 'full' ? draftLabel.trim() : label, parsed);
		onOpen(null);
	}
</script>

<button
	type="button"
	class:editable={!disabled}
	class:editing={isOpen}
	class="ledger-row"
	disabled={disabled}
	onclick={() => !disabled && onOpen(isOpen ? null : rowKey)}
	aria-expanded={isOpen}
>
	<strong>{label}</strong>
	<span class="row-hint">{hint}</span>
	<span class="row-value">{formatMoney(amount)}</span>
</button>

{#if isOpen}
	<form class="row-editor" onsubmit={submit}>
		<p class="editor-title">{mode === 'full' ? 'Zeile bearbeiten' : label}</p>
		{#if mode === 'amount'}
			<p class="locked-description">
				Die Bezeichnung ist fest vorgegeben. Hier kann nur der Monatsbetrag geändert werden.
			</p>
		{/if}
		<div class:single={mode === 'amount'} class="editor-fields">
			{#if mode === 'full'}
				<label>
					<span>Bezeichnung</span>
					<input bind:value={draftLabel} autocomplete="off" />
				</label>
			{/if}
			<label>
				<span>Betrag</span>
				<input class="money-input" bind:value={draftAmount} inputmode="decimal" />
			</label>
		</div>
		{#if error}<p class="form-error">{error}</p>{/if}
		<div class="editor-actions">
			{#if mode === 'full' && onDelete}
				<button class="text-danger" type="button" onclick={onDelete}>Zeile entfernen</button>
			{:else}
				<span></span>
			{/if}
			<div class="button-group">
				<button class="button secondary" type="button" onclick={() => onOpen(null)}>Abbrechen</button>
				<button class="button primary-small" type="submit">Änderungen übernehmen</button>
			</div>
		</div>
	</form>
{/if}
