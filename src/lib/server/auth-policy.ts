export function groupsFromClaim(claims: Record<string, unknown>, claimPath: string): string[] {
	let value: unknown;
	if (Object.hasOwn(claims, claimPath)) {
		value = claims[claimPath];
	} else {
		value = claims;
		for (const segment of claimPath.split('.').map((part) => part.trim()).filter(Boolean)) {
			if (!isRecord(value)) return [];
			value = value[segment];
		}
	}

	if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value
				.filter((group): group is string => typeof group === 'string')
				.map((group) => group.trim())
				.filter(Boolean)
		)
	];
}

export function hasAllowedGroup(userGroups: string[], allowedGroups: string[]): boolean {
	const allowed = new Set(allowedGroups);
	return userGroups.some((group) => allowed.has(group));
}

export function safeReturnTo(value: string | null | undefined): string {
	if (!value || !value.startsWith('/')) return '/';
	const base = new URL('https://monatsabrechnung.invalid');
	const parsed = new URL(value, base);
	if (parsed.origin !== base.origin) return '/';
	return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
