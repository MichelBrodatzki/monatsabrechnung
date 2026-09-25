import {
	callbackUrl,
	epochSeconds,
	FLOW_COOKIE,
	getOidcConfiguration,
	getOidcSettings,
	secureCookie,
	SESSION_COOKIE
} from '$lib/server/auth';
import { groupsFromClaim, hasAllowedGroup } from '$lib/server/auth-policy';
import { consumeAuthFlow, createAuthSession } from '$lib/server/database';
import * as oidc from 'openid-client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const settings = getOidcSettings();
	const flowToken = cookies.get(FLOW_COOKIE);
	cookies.delete(FLOW_COOKIE, { path: '/' });
	if (!settings || !flowToken) return authError('Der Anmeldevorgang ist abgelaufen.', 400);

	const flow = consumeAuthFlow(flowToken);
	if (!flow) return authError('Der Anmeldevorgang ist abgelaufen.', 400);

	try {
		const configuration = await getOidcConfiguration(settings);
		const tokens = await oidc.authorizationCodeGrant(
			configuration,
			callbackUrl(settings, url),
			{
				pkceCodeVerifier: flow.codeVerifier,
				expectedState: flow.state,
				expectedNonce: flow.nonce,
				idTokenExpected: true
			}
		);
		const idTokenClaims = tokens.claims();
		if (!idTokenClaims?.sub) return authError('Der Provider hat keine Benutzerkennung geliefert.', 502);

		let userInfo: Record<string, unknown> = {};
		try {
			userInfo = (await oidc.fetchUserInfo(
				configuration,
				tokens.access_token,
				idTokenClaims.sub
			)) as Record<string, unknown>;
		} catch {
			// Manche Provider liefern alle benötigten Claims bereits im ID-Token.
		}

		const claims = {
			...(idTokenClaims as Record<string, unknown>),
			...userInfo
		};
		const groups = groupsFromClaim(claims, settings.groupsClaim);
		if (!hasAllowedGroup(groups, settings.allowedGroups)) {
			return authError(
				`Zugriff verweigert. Keine erlaubte Gruppe im Claim „${settings.groupsClaim}“ gefunden.`,
				403
			);
		}

		const displayName = firstClaim(claims, [
			'name',
			'preferred_username',
			'email'
		]) || idTokenClaims.sub;
		const sessionToken = createAuthSession(
			{
				subject: idTokenClaims.sub,
				displayName,
				groups
			},
			epochSeconds() + settings.sessionTtlSeconds
		);
		cookies.set(SESSION_COOKIE, sessionToken, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: secureCookie(url),
			maxAge: settings.sessionTtlSeconds
		});
		return new Response(null, {
			status: 303,
			headers: {
				location: flow.returnTo,
				'cache-control': 'no-store'
			}
		});
	} catch {
		return authError('Die Anmeldung beim OIDC-Provider konnte nicht abgeschlossen werden.', 502);
	}
};

function firstClaim(claims: Record<string, unknown>, names: string[]): string {
	for (const name of names) {
		const value = claims[name];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return '';
}

function authError(message: string, status: number): Response {
	return new Response(message, {
		status,
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'no-store'
		}
	});
}
