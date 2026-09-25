<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import LedgerRow from '$lib/LedgerRow.svelte';
	import { calculateStatement } from '$lib/calculation';
	import { formatMoney, formatMoneyInput, parseMoney } from '$lib/money';
	import type {
		DistributionMethod,
		HouseholdState,
		LineItem,
		Person,
		Statement
	} from '$lib/types';

	type View = 'billing' | 'archive' | 'settings';
	type AddMode = 'special-income' | 'saving' | 'person' | 'month' | null;

	let household = $state<HouseholdState | null>(null);
	let editingKey = $state<string | null>(null);
	let addMode = $state<AddMode>(null);
	let addLabel = $state('');
	let addAmount = $state('');
	let newMonth = $state('');
	let personEditId = $state<string | null>(null);
	let personDraftName = $state('');
	let loadError = $state('');
	let formError = $state('');
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveTimer: ReturnType<typeof setTimeout> | undefined;

	let view = $derived<View>(
		page.url.searchParams.get('ansicht') === 'archiv'
			? 'archive'
			: page.url.searchParams.get('ansicht') === 'einstellungen'
				? 'settings'
				: 'billing'
	);
	let requestedMonth = $derived(page.url.searchParams.get('abrechnung'));
	let statements = $derived(
		[...(household?.statements ?? [])].sort((a, b) => b.month.localeCompare(a.month))
	);
	let activeStatement = $derived(
		view === 'billing'
			? requestedMonth
				? (household?.statements.find((statement) => statement.month === requestedMonth) ?? null)
				: (statements[0] ?? null)
			: null
	);
	let result = $derived(activeStatement ? calculateStatement(activeStatement) : null);
	let activePeople = $derived(household?.persons.filter((person) => person.active) ?? []);
	let locked = $derived(activeStatement?.status === 'final');
	let billingHref = $derived(activeStatement ? statementHref(activeStatement) : '/');

	onMount(() => {
		void loadState();
		return () => {
			if (saveTimer) clearTimeout(saveTimer);
		};
	});

	async function loadState() {
		try {
			const response = await fetch('/api/state');
			if (!response.ok) throw new Error('Die gespeicherten Daten konnten nicht geladen werden.');
			household = (await response.json()) as HouseholdState;
			const latestStatement = [...household.statements].sort((a, b) =>
				b.month.localeCompare(a.month)
			)[0];
			if (view === 'billing' && !requestedMonth && latestStatement) {
				await goto(statementHref(latestStatement), {
					replaceState: true,
					noScroll: true
				});
			}
			saveStatus = 'saved';
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Unbekannter Fehler';
		}
	}

	function scheduleSave() {
		if (!household) return;
		saveStatus = 'saving';
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void saveNow(), 450);
	}

	async function saveNow() {
		if (!household) return;
		try {
			const response = await fetch('/api/state', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(household)
			});
			if (!response.ok) throw new Error();
			saveStatus = 'saved';
		} catch {
			saveStatus = 'error';
		}
	}

	function touchStatement() {
		if (!activeStatement) return;
		activeStatement.updatedAt = new Date().toISOString();
		scheduleSave();
	}

	function prepareNavigation() {
		editingKey = null;
		addMode = null;
		personEditId = null;
	}

	function statementHref(statement: Statement): string {
		return `/?abrechnung=${encodeURIComponent(statement.month)}`;
	}

	function personName(statement: Statement, personId: string): string {
		return (
			statement.personNames[personId] ??
			household?.persons.find((person) => person.id === personId)?.name ??
			'Unbekannte Person'
		);
	}

	function updatePersonAmount(personId: string, field: 'income' | 'need', amount: number) {
		if (!activeStatement || locked) return;
		activeStatement.personValues[personId] ??= { income: 0, need: 0 };
		activeStatement.personValues[personId][field] = amount;
		touchStatement();
	}

	function updateCommunityCost(amount: number) {
		if (!activeStatement || locked) return;
		activeStatement.communityCost = amount;
		touchStatement();
	}

	function updateLine(
		collection: 'specialIncomes' | 'savings',
		itemId: string,
		label: string,
		amount: number
	) {
		if (!activeStatement || locked) return;
		const item = activeStatement[collection].find((entry) => entry.id === itemId);
		if (!item) return;
		item.label = label;
		item.amount = amount;
		touchStatement();
	}

	function removeLine(collection: 'specialIncomes' | 'savings', itemId: string) {
		if (!activeStatement || locked) return;
		activeStatement[collection] = activeStatement[collection].filter(
			(item) => item.id !== itemId
		);
		editingKey = null;
		touchStatement();
	}

	function beginAdd(mode: AddMode) {
		editingKey = null;
		addMode = addMode === mode ? null : mode;
		addLabel = '';
		addAmount = '';
		formError = '';
	}

	function addLine(event: SubmitEvent, collection: 'specialIncomes' | 'savings') {
		event.preventDefault();
		if (!activeStatement || locked) return;
		const amount = parseMoney(addAmount);
		if (!addLabel.trim() || amount === null || amount < 0) {
			formError = 'Bitte Bezeichnung und einen gültigen Betrag eingeben.';
			return;
		}
		const item: LineItem = {
			id: crypto.randomUUID(),
			label: addLabel.trim(),
			amount
		};
		activeStatement[collection].push(item);
		addMode = null;
		touchStatement();
	}

	function setMethod(event: Event) {
		if (!activeStatement || locked) return;
		activeStatement.method = (event.currentTarget as HTMLSelectElement)
			.value as DistributionMethod;
		touchStatement();
	}

	function toggleFinalStatus() {
		if (!activeStatement) return;
		if (
			activeStatement.status === 'final' &&
			!confirm('Soll die abgeschlossene Abrechnung wieder bearbeitbar werden?')
		) {
			return;
		}
		activeStatement.status = activeStatement.status === 'draft' ? 'final' : 'draft';
		editingKey = null;
		addMode = null;
		touchStatement();
	}

	function deleteDraftStatement() {
		if (!household || !activeStatement || activeStatement.status !== 'draft') return;
		if (!confirm(`Entwurf für ${monthLabel(activeStatement.month)} endgültig löschen?`)) return;

		const deletedId = activeStatement.id;
		household.statements = household.statements.filter((statement) => statement.id !== deletedId);
		const remainingStatements = [...household.statements].sort((a, b) =>
			b.month.localeCompare(a.month)
		);
		editingKey = null;
		addMode = null;
		scheduleSave();
		void goto('/?ansicht=archiv');
	}

	function startPersonEdit(person: Person) {
		addMode = null;
		personEditId = personEditId === person.id ? null : person.id;
		personDraftName = person.name;
		formError = '';
	}

	function renamePerson(event: SubmitEvent, personId: string) {
		event.preventDefault();
		if (!household || !personDraftName.trim()) {
			formError = 'Bitte einen Namen eingeben.';
			return;
		}
		const person = household.persons.find((entry) => entry.id === personId);
		if (!person) return;
		person.name = personDraftName.trim();
		for (const statement of household.statements.filter((entry) => entry.status === 'draft')) {
			if (statement.personIds.includes(personId)) {
				statement.personNames[personId] = person.name;
			}
		}
		personEditId = null;
		scheduleSave();
	}

	function addPerson(event: SubmitEvent) {
		event.preventDefault();
		if (!household || !addLabel.trim()) {
			formError = 'Bitte einen Namen eingeben.';
			return;
		}
		const id = crypto.randomUUID();
		const person: Person = {
			id,
			name: addLabel.trim(),
			active: true,
			createdAt: new Date().toISOString()
		};
		household.persons.push(person);
		for (const statement of household.statements.filter((entry) => entry.status === 'draft')) {
			statement.personIds.push(id);
			statement.personNames[id] = person.name;
			statement.personValues[id] = { income: 0, need: 0 };
		}
		addMode = null;
		scheduleSave();
	}

	function removePerson(personId: string) {
		if (!household || activePeople.length <= 1) {
			formError = 'Mindestens eine Person muss aktiv bleiben.';
			return;
		}
		if (!confirm('Person aus zukünftigen und noch offenen Abrechnungen entfernen?')) return;
		const person = household.persons.find((entry) => entry.id === personId);
		if (!person) return;
		person.active = false;
		for (const statement of household.statements.filter((entry) => entry.status === 'draft')) {
			statement.personIds = statement.personIds.filter((id) => id !== personId);
			delete statement.personValues[personId];
			delete statement.personNames[personId];
		}
		personEditId = null;
		scheduleSave();
	}

	function suggestNextMonth(): string {
		const sourceMonth = statements[0]?.month ?? new Date().toISOString().slice(0, 7);
		const [year, month] = sourceMonth.split('-').map(Number);
		const date = new Date(Date.UTC(year, month, 1));
		return date.toISOString().slice(0, 7);
	}

	function beginNewMonth() {
		addMode = 'month';
		newMonth = suggestNextMonth();
		formError = '';
	}

	function createMonth(event: SubmitEvent) {
		event.preventDefault();
		if (!household || !newMonth) return;
		if (household.statements.some((statement) => statement.month === newMonth)) {
			formError = 'Für diesen Monat existiert bereits eine Abrechnung.';
			return;
		}
		const source = activeStatement ?? statements[0] ?? null;
		const now = new Date().toISOString();
		const personIds = activePeople.map((person) => person.id);
		const statement: Statement = {
			id: crypto.randomUUID(),
			month: newMonth,
			status: 'draft',
			method: source?.method ?? 'equal-total',
			communityCost: source?.communityCost ?? 0,
			specialIncomes: [],
			savings:
				source?.savings.map((item) => ({
					id: crypto.randomUUID(),
					label: item.label,
					amount: item.amount
				})) ?? [],
			personIds,
			personNames: Object.fromEntries(activePeople.map((person) => [person.id, person.name])),
			personValues: Object.fromEntries(
				personIds.map((id) => [
					id,
					{
						income: source?.personValues[id]?.income ?? 0,
						need: source?.personValues[id]?.need ?? 0
					}
				])
			),
			notes: '',
			createdAt: now,
			updatedAt: now
		};
		household.statements.push(statement);
		addMode = null;
		scheduleSave();
		void goto(statementHref(statement));
	}

	function changeStatement(event: Event) {
		const statementId = (event.currentTarget as HTMLSelectElement).value;
		const statement = household?.statements.find((entry) => entry.id === statementId);
		if (!statement) return;
		editingKey = null;
		addMode = null;
		void goto(statementHref(statement));
	}

	function exportBackup() {
		if (!household) return;
		const blob = new Blob([JSON.stringify(household, null, 2)], { type: 'application/json' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `monatsabrechnung-${new Date().toISOString().slice(0, 10)}.json`;
		link.click();
		URL.revokeObjectURL(link.href);
	}

	async function importBackup(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !confirm('Die aktuelle Datenbank durch diese Sicherung ersetzen?')) return;
		try {
			const imported = JSON.parse(await file.text()) as HouseholdState;
			if (
				imported.version !== 1 ||
				!Array.isArray(imported.persons) ||
				!Array.isArray(imported.statements)
			) {
				throw new Error();
			}
			household = imported;
			await saveNow();
			const latestStatement = [...imported.statements].sort((a, b) =>
				b.month.localeCompare(a.month)
			)[0];
			if (latestStatement) await goto(statementHref(latestStatement));
			formError = '';
		} catch {
			formError = 'Die Sicherungsdatei konnte nicht gelesen werden.';
		} finally {
			input.value = '';
		}
	}

	function monthLabel(month: string): string {
		const [year, monthIndex] = month.split('-').map(Number);
		return new Intl.DateTimeFormat('de-DE', {
			month: 'long',
			year: 'numeric',
			timeZone: 'UTC'
		}).format(new Date(Date.UTC(year, monthIndex - 1, 1)));
	}
</script>

<svelte:head>
	<title>Monatsabrechnung</title>
	<meta
		name="description"
		content="Private Monatsabrechnungen für gemeinsames Einkommen, Sparziele und Taschengeld."
	/>
</svelte:head>

<header class="topbar">
	<a class="brand" href={billingHref} onclick={prepareNavigation}>
		<span class="brand-mark" aria-hidden="true"></span>
		<span>Monatsabrechnung</span>
	</a>
	<nav aria-label="Hauptnavigation">
		<a class:active={view === 'billing'} href={billingHref} onclick={prepareNavigation}>
			Abrechnung
		</a>
		<a class:active={view === 'archive'} href="/?ansicht=archiv" onclick={prepareNavigation}>
			Archiv
		</a>
		<a
			class:active={view === 'settings'}
			href="/?ansicht=einstellungen"
			onclick={prepareNavigation}
		>
			Einstellungen
		</a>
	</nav>
	<div class="top-actions">
		{#if view === 'billing' && activeStatement}
			<button class="print-button" type="button" onclick={() => window.print()}>Druckansicht</button>
		{/if}
		{#if page.data.authMode === 'oidc' && page.data.user}
			<span class="auth-user" title={page.data.user.displayName}>
				{page.data.user.displayName}
			</span>
			<form method="POST" action="/auth/logout">
				<button class="logout-button" type="submit">Abmelden</button>
			</form>
		{/if}
	</div>
</header>

{#if loadError}
	<main class="center-state">
		<h1>Die App konnte nicht gestartet werden</h1>
		<p>{loadError}</p>
		<button class="button primary-small" type="button" onclick={loadState}>Erneut versuchen</button>
	</main>
{:else if !household}
	<main class="center-state" aria-live="polite">
		<p>Monatsabrechnungen werden geladen …</p>
	</main>
{:else if view === 'billing' && activeStatement && result}
	<main>
		<article class="sheet billing-sheet">
			<header class="sheet-heading">
				<div>
					<p class="eyebrow">Monatliche Verteilung</p>
					<h1>Monatsabrechnung</h1>
				</div>
				<label class="month-control">
					<span>Abrechnungsmonat</span>
					<select value={activeStatement.id} onchange={changeStatement}>
						{#each statements as statement}
							<option value={statement.id}>{monthLabel(statement.month)}</option>
						{/each}
					</select>
				</label>
			</header>

			<section class="summary-strip" aria-label="Übersicht">
				<div>
					<span>Gesamteinkommen</span>
					<strong>{formatMoney(result.totalIncome)}</strong>
				</div>
				<div>
					<span>Gemeinschaft &amp; Sparen</span>
					<strong>{formatMoney(result.communityAndSavingBase + result.roundingToCommunity)}</strong>
				</div>
				<div class:negative={result.rest < 0}>
					<span>{result.rest < 0 ? 'Nicht gedeckter Betrag' : 'Rest zur Verteilung'}</span>
					<strong>{formatMoney(Math.abs(result.rest))}</strong>
				</div>
			</section>

			{#if locked}
				<div class="locked-banner">
					Diese Abrechnung ist abgeschlossen. Sie kann gedruckt oder wieder als Entwurf geöffnet werden.
				</div>
			{/if}

			<div class="workgrid">
				<div class="ledger-column">
					<section class="section">
						<div class="section-title">
							<h2>01 — Einnahmen</h2>
							<span>{activeStatement.personIds.length + activeStatement.specialIncomes.length} Positionen</span>
						</div>
						<div class="ledger">
							{#each activeStatement.personIds as personId (personId)}
								<LedgerRow
									rowKey={`income-${personId}`}
									label={personName(activeStatement, personId)}
									hint="Einkommen"
									amount={activeStatement.personValues[personId]?.income ?? 0}
									disabled={locked}
									{editingKey}
									onOpen={(key) => {
										editingKey = key;
										addMode = null;
									}}
									onSave={(_, amount) => updatePersonAmount(personId, 'income', amount)}
								/>
							{/each}
							{#each activeStatement.specialIncomes as item (item.id)}
								<LedgerRow
									rowKey={`special-${item.id}`}
									label={item.label}
									hint="Sondereinnahme"
									amount={item.amount}
									mode="full"
									disabled={locked}
									{editingKey}
									onOpen={(key) => {
										editingKey = key;
										addMode = null;
									}}
									onSave={(label, amount) =>
										updateLine('specialIncomes', item.id, label, amount)}
									onDelete={() => removeLine('specialIncomes', item.id)}
								/>
							{/each}
							<div class="ledger-total">
								<strong>Gesamteinkommen</strong><span></span><strong>{formatMoney(result.totalIncome)}</strong>
							</div>
						</div>
						{#if !locked}
							<button class="add-row" type="button" onclick={() => beginAdd('special-income')}>
								Sondereinnahme hinzufügen
							</button>
							{#if addMode === 'special-income'}
								<form class="add-editor" onsubmit={(event) => addLine(event, 'specialIncomes')}>
									<p class="editor-title">Neue Sondereinnahme</p>
									<div class="editor-fields">
										<label><span>Bezeichnung</span><input bind:value={addLabel} placeholder="z. B. Geschenk" /></label>
										<label><span>Betrag</span><input class="money-input" bind:value={addAmount} inputmode="decimal" placeholder="0,00" /></label>
									</div>
									{#if formError}<p class="form-error">{formError}</p>{/if}
									<div class="editor-actions">
										<span></span>
										<div class="button-group">
											<button class="button secondary" type="button" onclick={() => (addMode = null)}>Abbrechen</button>
											<button class="button primary-small" type="submit">Übernehmen</button>
										</div>
									</div>
								</form>
							{/if}
						{/if}
					</section>

					<section class="section">
						<div class="section-title">
							<h2>02 — Gemeinschaft &amp; Sparziele</h2>
							<span>{activeStatement.savings.length + 1} Positionen</span>
						</div>
						<div class="ledger">
							<LedgerRow
								rowKey="community"
								label="Gemeinschaftskosten"
								hint="Haushalt"
								amount={activeStatement.communityCost}
								disabled={locked}
								{editingKey}
								onOpen={(key) => {
									editingKey = key;
									addMode = null;
								}}
								onSave={(_, amount) => updateCommunityCost(amount)}
							/>
							{#each activeStatement.savings as item (item.id)}
								<LedgerRow
									rowKey={`saving-${item.id}`}
									label={item.label}
									hint="Sparziel"
									amount={item.amount}
									mode="full"
									disabled={locked}
									{editingKey}
									onOpen={(key) => {
										editingKey = key;
										addMode = null;
									}}
									onSave={(label, amount) => updateLine('savings', item.id, label, amount)}
									onDelete={() => removeLine('savings', item.id)}
								/>
							{/each}
							<div class="ledger-total">
								<strong>Gemeinschaft &amp; Sparen</strong><span></span>
								<strong>{formatMoney(result.communityAndSavingBase)}</strong>
							</div>
						</div>
						{#if !locked}
							<button class="add-row" type="button" onclick={() => beginAdd('saving')}>
								Sparziel hinzufügen
							</button>
							{#if addMode === 'saving'}
								<form class="add-editor" onsubmit={(event) => addLine(event, 'savings')}>
									<p class="editor-title">Neues Sparziel</p>
									<div class="editor-fields">
										<label><span>Bezeichnung</span><input bind:value={addLabel} placeholder="z. B. Urlaub" /></label>
										<label><span>Monatlicher Betrag</span><input class="money-input" bind:value={addAmount} inputmode="decimal" placeholder="0,00" /></label>
									</div>
									{#if formError}<p class="form-error">{formError}</p>{/if}
									<div class="editor-actions">
										<span></span>
										<div class="button-group">
											<button class="button secondary" type="button" onclick={() => (addMode = null)}>Abbrechen</button>
											<button class="button primary-small" type="submit">Übernehmen</button>
										</div>
									</div>
								</form>
							{/if}
						{/if}
					</section>

					<section class="section">
						<div class="section-title">
							<h2>03 — Persönlicher Bedarf</h2>
							<span>vor Taschengeld</span>
						</div>
						<div class="ledger">
							{#each activeStatement.personIds as personId (personId)}
								<LedgerRow
									rowKey={`need-${personId}`}
									label={personName(activeStatement, personId)}
									hint="benötigt"
									amount={activeStatement.personValues[personId]?.need ?? 0}
									disabled={locked}
									{editingKey}
									onOpen={(key) => {
										editingKey = key;
										addMode = null;
									}}
									onSave={(_, amount) => updatePersonAmount(personId, 'need', amount)}
								/>
							{/each}
							<div class="ledger-total">
								<strong>Persönlicher Bedarf gesamt</strong><span></span>
								<strong>{formatMoney(result.personalNeedTotal)}</strong>
							</div>
						</div>
					</section>
				</div>

				<aside>
					<section class="section">
						<div class="section-title">
							<h2>04 — Berechnung</h2>
							<span>Kontrollrechnung</span>
						</div>
						<div class="calculation">
							<div><span></span><span>Gesamteinkommen</span><strong>{formatMoney(result.totalIncome)}</strong></div>
							<div><span>−</span><span>Gemeinschaft &amp; Sparen</span><strong>{formatMoney(result.communityAndSavingBase)}</strong></div>
							<div><span>−</span><span>Persönlicher Bedarf</span><strong>{formatMoney(result.personalNeedTotal)}</strong></div>
							<div class="calculation-result"><span>=</span><span>Rest</span><strong>{formatMoney(result.rest)}</strong></div>
						</div>
					</section>

					<section class="section">
						<div class="section-title">
							<h2>05 — Verteilung</h2>
							<span>Ergebnis</span>
						</div>
						<div class="distribution">
							<label class="select-field">
								<span>Verteilungsmethode</span>
								<select value={activeStatement.method} onchange={setMethod} disabled={locked}>
									<option value="equal-total">Gleicher persönlicher Gesamtbetrag</option>
									<option value="equal-pocket">Gleiches Taschengeld</option>
								</select>
							</label>
							<p class="distribution-note">
								{activeStatement.method === 'equal-total'
									? 'Niedrigere persönliche Bedarfe werden zuerst ausgeglichen. Der verbleibende Betrag wird anschließend gleich verteilt.'
									: 'Der verfügbare Rest wird gleichmäßig als Taschengeld auf alle Personen verteilt.'}
							</p>

							<div class="result-table">
								{#each activeStatement.personIds as personId (personId)}
									{@const communityTransfer = result.communityTransferByPerson[personId] ?? 0}
									<div class="person-result">
										<div class="person-breakdown">
											<strong>{personName(activeStatement, personId)}</strong>
											<span>
												{formatMoney(activeStatement.personValues[personId]?.need ?? 0)} Bedarf +
												{formatMoney(result.pocketByPerson[personId] ?? 0)} Taschengeld
											</span>
										</div>
										<div class="person-receives">
											<span>Erhält</span>
											<strong>{formatMoney(result.personalTotalByPerson[personId] ?? 0)}</strong>
										</div>
										<div class:incoming-transfer={communityTransfer < 0} class="person-transfer">
											<span>
												{communityTransfer >= 0
													? 'Ans Gemeinschaftskonto überweisen'
													: 'Vom Gemeinschaftskonto erhalten'}
											</span>
											<strong>{formatMoney(Math.abs(communityTransfer))}</strong>
										</div>
									</div>
								{/each}
							</div>

							<div class="community-transfer-total">
								<span>Gemeinschaftskonto erhält insgesamt</span>
								<strong>{formatMoney(result.communityAndSavingBase + result.roundingToCommunity)}</strong>
							</div>
							{#if result.specialIncomeTotal > 0}
								<p class="transfer-note">
									Darin enthalten: {formatMoney(result.specialIncomeTotal)} Sondereinnahmen, die keiner Person zugeordnet sind.
								</p>
							{/if}
							{#if result.roundingToCommunity > 0}
								<p class="rounding-note">
									{formatMoney(result.roundingToCommunity)} Rundungsrest gehen zusätzlich an das Gemeinschaftskonto.
								</p>
							{/if}
							{#if result.rest < 0}
								<p class="warning-note">
									Die eingeplanten Beträge übersteigen das Einkommen um {formatMoney(Math.abs(result.rest))}.
								</p>
							{:else if activeStatement.method === 'equal-total' && !result.equalizationReached}
								<p class="warning-note">
									Der Rest reicht nicht aus, um alle persönlichen Gesamtbeträge vollständig anzugleichen.
								</p>
							{/if}

							<div class="balance-check">
								<span>Kontrollsumme: {formatMoney(result.distributedTotal)}</span>
								<strong class:invalid={!result.balanced}>
									{result.balanced ? 'Vollständig verteilt' : 'Nicht ausgeglichen'}
								</strong>
							</div>
						</div>
					</section>

					<div class="statement-actions">
						<p>
							{activeStatement.status === 'final' ? 'Abgeschlossen' : 'Entwurf'} ·
							{saveStatus === 'saving'
								? ' wird gespeichert'
								: saveStatus === 'error'
									? ' Speichern fehlgeschlagen'
									: ' gespeichert'}
						</p>
						<div class="statement-action-buttons">
							{#if activeStatement.status === 'draft'}
								<button class="text-danger" type="button" onclick={deleteDraftStatement}>
									Entwurf löschen
								</button>
							{/if}
							<button class="button primary" type="button" onclick={toggleFinalStatus}>
								{activeStatement.status === 'final'
									? 'Wieder als Entwurf öffnen'
									: 'Abrechnung abschließen'}
							</button>
						</div>
					</div>
				</aside>
			</div>
		</article>
	</main>
{:else if view === 'archive'}
	<main>
		<article class="sheet archive-sheet">
			<header class="sheet-heading">
				<div>
					<p class="eyebrow">Vergangene Monate</p>
					<h1>Archiv</h1>
				</div>
				<button class="button primary-small" type="button" onclick={beginNewMonth}>Neuen Monat anlegen</button>
			</header>

			{#if addMode === 'month'}
				<form class="new-month-form" onsubmit={createMonth}>
					<label><span>Abrechnungsmonat</span><input type="month" bind:value={newMonth} required /></label>
					<div class="button-group">
						<button class="button secondary" type="button" onclick={() => (addMode = null)}>Abbrechen</button>
						<button class="button primary-small" type="submit">Monat anlegen</button>
					</div>
					{#if formError}<p class="form-error">{formError}</p>{/if}
				</form>
			{/if}

			<div class="archive-list">
				<div class="archive-header">
					<span>Monat</span><span>Einkommen</span><span>Gemeinschaft &amp; Sparen</span><span>Status</span>
				</div>
				{#each statements as statement (statement.id)}
					{@const archiveResult = calculateStatement(statement)}
					<a class="archive-row" href={statementHref(statement)} onclick={prepareNavigation}>
						<strong>{monthLabel(statement.month)}</strong>
						<span>{formatMoney(archiveResult.totalIncome)}</span>
						<span>{formatMoney(archiveResult.communityAndSavingBase)}</span>
						<span>{statement.status === 'final' ? 'Abgeschlossen' : 'Entwurf'}</span>
					</a>
				{/each}
			</div>
		</article>
	</main>
{:else if view === 'settings'}
	<main>
		<article class="sheet settings-sheet">
			<header class="sheet-heading">
				<div>
					<p class="eyebrow">Haushalt</p>
					<h1>Einstellungen</h1>
				</div>
			</header>
			<p class="settings-intro">
				Personen werden einmal für den Haushalt definiert. Neue Personen erhalten in allen offenen und zukünftigen Abrechnungen automatisch feste Zeilen für Einkommen, persönlichen Bedarf und Verteilung.
			</p>

			<section class="settings-section">
				<div class="section-title">
					<h2>Personen</h2>
					<span>{activePeople.length} Personen</span>
				</div>
				<div class="person-definitions">
					{#each activePeople as person (person.id)}
						<button class="person-definition" type="button" onclick={() => startPersonEdit(person)}>
							<strong>{person.name}</strong>
							<span>Automatisch in Einnahmen, persönlichem Bedarf und Verteilung</span>
						</button>
						{#if personEditId === person.id}
							<form class="person-editor" onsubmit={(event) => renamePerson(event, person.id)}>
								<p class="editor-title">Person bearbeiten</p>
								<p class="locked-description">
									Der neue Name wird in offenen Abrechnungen übernommen. Abgeschlossene Monate behalten ihren bisherigen Namen.
								</p>
								<div class="editor-fields single">
									<label><span>Name</span><input bind:value={personDraftName} /></label>
								</div>
								{#if formError}<p class="form-error">{formError}</p>{/if}
								<div class="editor-actions">
									<button class="text-danger" type="button" onclick={() => removePerson(person.id)}>Person entfernen</button>
									<div class="button-group">
										<button class="button secondary" type="button" onclick={() => (personEditId = null)}>Abbrechen</button>
										<button class="button primary-small" type="submit">Änderungen übernehmen</button>
									</div>
								</div>
							</form>
						{/if}
					{/each}
				</div>
				<button class="add-row" type="button" onclick={() => beginAdd('person')}>Person hinzufügen</button>
				{#if addMode === 'person'}
					<form class="add-editor" onsubmit={addPerson}>
						<p class="editor-title">Neue Person</p>
						<div class="editor-fields single">
							<label><span>Name</span><input bind:value={addLabel} /></label>
						</div>
						{#if formError}<p class="form-error">{formError}</p>{/if}
						<div class="editor-actions">
							<span></span>
							<div class="button-group">
								<button class="button secondary" type="button" onclick={() => (addMode = null)}>Abbrechen</button>
								<button class="button primary-small" type="submit">Person anlegen</button>
							</div>
						</div>
					</form>
				{/if}
			</section>

			<section class="settings-section backup-section">
				<div class="section-title">
					<h2>Datensicherung</h2>
					<span>JSON-Datei</span>
				</div>
				<p>
					Exportiere regelmäßig eine Sicherung. Beim Import wird der aktuelle Datenbestand vollständig ersetzt.
				</p>
				<div class="backup-actions">
					<button class="button secondary" type="button" onclick={exportBackup}>Sicherung exportieren</button>
					<label class="button secondary file-button">
						Sicherung importieren
						<input type="file" accept="application/json,.json" onchange={importBackup} />
					</label>
				</div>
				{#if formError}<p class="form-error">{formError}</p>{/if}
			</section>
		</article>
	</main>
{:else if view === 'billing'}
	<main class="center-state">
		<h1>Abrechnung nicht gefunden</h1>
		<p>Unter diesem Link ist keine Abrechnung gespeichert.</p>
		<a class="button primary-small" href="/?ansicht=archiv">Zum Archiv</a>
	</main>
{/if}
