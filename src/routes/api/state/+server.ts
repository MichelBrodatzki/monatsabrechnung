import { json } from '@sveltejs/kit';
import { readState, writeState } from '$lib/server/database';
import type { RequestHandler } from './$types';
import type { HouseholdState } from '$lib/types';

export const GET: RequestHandler = () => {
	return json(readState());
};

export const PUT: RequestHandler = async ({ request }) => {
	const raw = await request.text();
	if (raw.length > 2_000_000) {
		return json({ error: 'Die Datensicherung ist zu groß.' }, { status: 413 });
	}

	let state: HouseholdState;
	try {
		state = JSON.parse(raw) as HouseholdState;
	} catch {
		return json({ error: 'Ungültige JSON-Daten.' }, { status: 400 });
	}

	if (
		state?.version !== 1 ||
		!Array.isArray(state.persons) ||
		!Array.isArray(state.statements)
	) {
		return json({ error: 'Ungültiges Datenformat.' }, { status: 400 });
	}

	writeState(state);
	return json({ ok: true });
};
