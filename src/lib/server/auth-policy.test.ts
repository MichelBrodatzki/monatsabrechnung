import { describe, expect, it } from 'vitest';
import { groupsFromClaim, hasAllowedGroup, safeReturnTo } from './auth-policy';

describe('OIDC-Gruppenprüfung', () => {
	it('liest einen einfachen Gruppen-Claim', () => {
		expect(groupsFromClaim({ groups: ['family', 'finance'] }, 'groups')).toEqual([
			'family',
			'finance'
		]);
	});

	it('liest einen verschachtelten Claim-Pfad', () => {
		expect(
			groupsFromClaim(
				{ realm_access: { roles: ['household-admin', 'viewer'] } },
				'realm_access.roles'
			)
		).toEqual(['household-admin', 'viewer']);
	});

	it('unterstützt Claim-Namen, die selbst Punkte enthalten', () => {
		expect(
			groupsFromClaim(
				{ 'https://example.org/claims.groups': ['family'] },
				'https://example.org/claims.groups'
			)
		).toEqual(['family']);
	});

	it('erlaubt den Zugriff bei mindestens einer Übereinstimmung', () => {
		expect(hasAllowedGroup(['family', 'finance'], ['household', 'finance'])).toBe(true);
		expect(hasAllowedGroup(['family'], ['household', 'finance'])).toBe(false);
	});

	it('akzeptiert nur lokale Rücksprungpfade', () => {
		expect(safeReturnTo('/?abrechnung=2026-08')).toBe('/?abrechnung=2026-08');
		expect(safeReturnTo('//example.org')).toBe('/');
		expect(safeReturnTo('/\\example.org')).toBe('/');
		expect(safeReturnTo('https://example.org')).toBe('/');
	});
});
