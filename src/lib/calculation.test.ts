import { describe, expect, it } from 'vitest';
import { calculateStatement } from './calculation';
import { createDefaultState } from './default-state';
import type { Statement } from './types';

describe('calculateStatement', () => {
	it('verteilt das Beispiel-Taschengeld gleichmäßig', () => {
		const statement = exampleStatement();
		statement.method = 'equal-pocket';

		const result = calculateStatement(statement);

		expect(result.rest).toBe(20262);
		expect(result.pocketByPerson['person-1']).toBe(10131);
		expect(result.pocketByPerson['person-2']).toBe(10131);
		expect(result.balanced).toBe(true);
	});

	it('gleicht im Beispiel die persönlichen Gesamtbeträge aus', () => {
		const result = calculateStatement(exampleStatement());

		expect(result.pocketByPerson['person-1']).toBe(18429);
		expect(result.pocketByPerson['person-2']).toBe(1833);
		expect(result.personalTotalByPerson['person-1']).toBe(37264);
		expect(result.personalTotalByPerson['person-2']).toBe(37264);
		expect(result.communityTransferByPerson['person-1']).toBe(293604);
		expect(result.communityTransferByPerson['person-2']).toBe(23022);
		expect(result.communityTransferTotal).toBe(316626);
		expect(result.roundingToCommunity).toBe(0);
	});

	it('gibt einen unteilbaren Cent ans Gemeinschaftskonto', () => {
		const statement = exampleStatement();
		statement.method = 'equal-pocket';
		statement.personValues['person-1'].income += 1;

		const result = calculateStatement(statement);

		expect(result.rest).toBe(20263);
		expect(result.pocketByPerson['person-1']).toBe(10131);
		expect(result.pocketByPerson['person-2']).toBe(10131);
		expect(result.roundingToCommunity).toBe(1);
		expect(result.balanced).toBe(true);
	});

	it('verallgemeinert den Ausgleich auf drei Personen', () => {
		const statement = bareStatement();
		statement.personIds = ['a', 'b', 'c'];
		statement.personValues = {
			a: { income: 1200, need: 100 },
			b: { income: 0, need: 200 },
			c: { income: 0, need: 300 }
		};

		const result = calculateStatement(statement);

		expect(result.rest).toBe(600);
		expect(result.pocketByPerson).toEqual({ a: 300, b: 200, c: 100 });
		expect(result.personalTotalByPerson).toEqual({ a: 400, b: 400, c: 400 });
	});

	it('weist ein Defizit aus und verteilt kein Taschengeld', () => {
		const statement = exampleStatement();
		statement.communityCost += 30000;

		const result = calculateStatement(statement);

		expect(result.rest).toBe(-9738);
		expect(result.pocketByPerson).toEqual({ 'person-1': 0, 'person-2': 0 });
		expect(result.balanced).toBe(false);
	});
});

function exampleStatement(): Statement {
	return structuredClone(createDefaultState().statements[0]);
}

function bareStatement(): Statement {
	return {
		id: 'test',
		month: '2026-07',
		status: 'draft',
		method: 'equal-total',
		communityCost: 0,
		specialIncomes: [],
		savings: [],
		personIds: [],
		personNames: {},
		personValues: {},
		notes: '',
		createdAt: '',
		updatedAt: ''
	};
}
