export type DistributionMethod = 'equal-pocket' | 'equal-total';
export type StatementStatus = 'draft' | 'final';

export type Person = {
	id: string;
	name: string;
	active: boolean;
	createdAt: string;
};

export type LineItem = {
	id: string;
	label: string;
	amount: number;
};

export type PersonValues = {
	income: number;
	need: number;
};

export type Statement = {
	id: string;
	month: string;
	status: StatementStatus;
	method: DistributionMethod;
	communityCost: number;
	specialIncomes: LineItem[];
	savings: LineItem[];
	personIds: string[];
	personNames: Record<string, string>;
	personValues: Record<string, PersonValues>;
	notes: string;
	createdAt: string;
	updatedAt: string;
};

export type HouseholdState = {
	version: 1;
	persons: Person[];
	statements: Statement[];
};

export type CalculationResult = {
	totalIncome: number;
	specialIncomeTotal: number;
	savingTotal: number;
	communityAndSavingBase: number;
	personalNeedTotal: number;
	rest: number;
	pocketByPerson: Record<string, number>;
	personalTotalByPerson: Record<string, number>;
	communityTransferByPerson: Record<string, number>;
	communityTransferTotal: number;
	roundingToCommunity: number;
	distributedTotal: number;
	balanced: boolean;
	equalizationReached: boolean;
};
