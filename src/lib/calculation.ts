import type { CalculationResult, Statement } from './types';

export function calculateStatement(statement: Statement): CalculationResult {
	const personIds = statement.personIds;
	const specialIncomeTotal = sum(statement.specialIncomes.map((item) => item.amount));
	const totalIncome =
		sum(personIds.map((id) => statement.personValues[id]?.income ?? 0)) + specialIncomeTotal;
	const savingTotal = sum(statement.savings.map((item) => item.amount));
	const communityAndSavingBase = statement.communityCost + savingTotal;
	const personalNeedTotal = sum(
		personIds.map((id) => statement.personValues[id]?.need ?? 0)
	);
	const rest = totalIncome - communityAndSavingBase - personalNeedTotal;
	const pocketByPerson = Object.fromEntries(personIds.map((id) => [id, 0]));

	let roundingToCommunity = 0;
	let equalizationReached = true;

	if (rest >= 0 && personIds.length > 0) {
		if (statement.method === 'equal-pocket') {
			const share = Math.floor(rest / personIds.length);
			roundingToCommunity = rest - share * personIds.length;
			for (const id of personIds) pocketByPerson[id] = share;
		} else {
			const outcome = distributeToEqualTotals(
				personIds.map((id) => ({
					id,
					need: statement.personValues[id]?.need ?? 0
				})),
				rest
			);
			Object.assign(pocketByPerson, outcome.pockets);
			roundingToCommunity = outcome.rounding;
			equalizationReached = outcome.equalizationReached;
		}
	} else if (rest < 0) {
		equalizationReached = false;
	}

	const personalTotalByPerson = Object.fromEntries(
		personIds.map((id) => [
			id,
			(statement.personValues[id]?.need ?? 0) + (pocketByPerson[id] ?? 0)
		])
	);
	const communityTransferByPerson = Object.fromEntries(
		personIds.map((id) => [
			id,
			(statement.personValues[id]?.income ?? 0) - (personalTotalByPerson[id] ?? 0)
		])
	);
	const communityTransferTotal = sum(Object.values(communityTransferByPerson));
	const distributedTotal =
		communityAndSavingBase +
		roundingToCommunity +
		personalNeedTotal +
		sum(Object.values(pocketByPerson));

	return {
		totalIncome,
		specialIncomeTotal,
		savingTotal,
		communityAndSavingBase,
		personalNeedTotal,
		rest,
		pocketByPerson,
		personalTotalByPerson,
		communityTransferByPerson,
		communityTransferTotal,
		roundingToCommunity,
		distributedTotal,
		balanced: distributedTotal === totalIncome,
		equalizationReached
	};
}

function distributeToEqualTotals(
	people: Array<{ id: string; need: number }>,
	available: number
): {
	pockets: Record<string, number>;
	rounding: number;
	equalizationReached: boolean;
} {
	const sorted = [...people].sort((a, b) => a.need - b.need || a.id.localeCompare(b.id));
	const pockets = Object.fromEntries(people.map((person) => [person.id, 0]));

	if (sorted.length === 0 || available <= 0) {
		return {
			pockets,
			rounding: 0,
			equalizationReached:
				sorted.length < 2 || sorted.every((person) => person.need === sorted[0].need)
		};
	}

	let budget = available;
	let activeCount = 1;
	let level = sorted[0].need;

	for (let index = 1; index < sorted.length; index += 1) {
		const nextLevel = sorted[index].need;
		const difference = nextLevel - level;
		const cost = difference * activeCount;

		if (budget < cost) {
			const share = Math.floor(budget / activeCount);
			for (let activeIndex = 0; activeIndex < activeCount; activeIndex += 1) {
				pockets[sorted[activeIndex].id] += share;
			}
			return {
				pockets,
				rounding: budget - share * activeCount,
				equalizationReached: false
			};
		}

		for (let activeIndex = 0; activeIndex < activeCount; activeIndex += 1) {
			pockets[sorted[activeIndex].id] += difference;
		}
		budget -= cost;
		level = nextLevel;
		activeCount += 1;
	}

	const share = Math.floor(budget / sorted.length);
	for (const person of sorted) pockets[person.id] += share;

	return {
		pockets,
		rounding: budget - share * sorted.length,
		equalizationReached: true
	};
}

function sum(values: number[]): number {
	return values.reduce((total, value) => total + value, 0);
}
