import {
	epochSeconds,
	FLOW_COOKIE,
	getOidcConfiguration,
	getOidcSettings,
	oidcRedirectUri,
	secureCookie
} from '$lib/server/auth';
import { safeReturnTo } from '$lib/server/auth-policy';
import { createAuthFlow } from '$lib/server/database';
import { redirect } from '@sveltejs/kit';
import * as oidc from 'openid-client';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const settings = getOidcSettings();
	if (!settings) redirect(303, '/');

	const configuration = await getOidcConfiguration(settings);
	const codeVerifier = oidc.randomPKCECodeVerifier();
	const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
	const state = oidc.randomState();
	const nonce = oidc.randomNonce();
	const returnTo = safeReturnTo(url.searchParams.get('returnTo'));
	const flowToken = createAuthFlow(
		{ codeVerifier, state, nonce, returnTo },
		epochSeconds() + 600
	);

	cookies.set(FLOW_COOKIE, flowToken, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: secureCookie(url),
		maxAge: 600
	});

	const authorizationUrl = oidc.buildAuthorizationUrl(configuration, {
		redirect_uri: oidcRedirectUri(settings, url),
		scope: settings.scopes,
		response_type: 'code',
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
		state,
		nonce
	});

	redirect(303, authorizationUrl.href);
};
