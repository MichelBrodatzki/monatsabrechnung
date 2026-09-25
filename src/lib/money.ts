const currencyFormatter = new Intl.NumberFormat('de-DE', {
	style: 'currency',
	currency: 'EUR'
});

const numberFormatter = new Intl.NumberFormat('de-DE', {
	minimumFractionDigits: 2,
	maximumFractionDigits: 2
});

export function formatMoney(cents: number): string {
	return currencyFormatter.format(cents / 100);
}

export function formatMoneyInput(cents: number): string {
	return numberFormatter.format(cents / 100);
}

export function parseMoney(value: string): number | null {
	const normalized = value
		.trim()
		.replace(/\s/g, '')
		.replace(/€/g, '')
		.replace(/\./g, '')
		.replace(',', '.');
	const amount = Number(normalized);
	if (!Number.isFinite(amount)) return null;
	return Math.round(amount * 100);
}
