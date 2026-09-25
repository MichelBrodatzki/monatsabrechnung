import type { HouseholdState } from './types';

export function createDefaultState(): HouseholdState {
	const createdAt = '2026-07-01T08:00:00.000Z';

	return {
		version: 1,
		persons: [
			{ id: 'person-1', name: 'Person 1', active: true, createdAt },
			{ id: 'person-2', name: 'Person 2', active: true, createdAt }
		],
		statements: [
			{
				id: 'statement-2026-07',
				month: '2026-07',
				status: 'draft',
				method: 'equal-total',
				communityCost: 250000,
				specialIncomes: [],
				savings: [
					{ id: 'saving-funds', label: 'Fonds', amount: 50000 },
					{ id: 'saving-cash', label: 'Tagesgeld', amount: 20000 }
				],
				personIds: ['person-1', 'person-2'],
				personNames: { 'person-1': 'Person 1', 'person-2': 'Person 2' },
				personValues: {
					'person-1': { income: 600000, need: 133700 },
					'person-2': { income: 600000, need: 674200 }
				},
				notes: '',
				createdAt,
				updatedAt: createdAt
			}
		]
	};
}
