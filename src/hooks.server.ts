import { env } from '$env/dynamic/private';
import { getOidcSettings, SESSION_COOKIE } from '$lib/server/auth';
import { hasAllowedGroup } from '$lib/server/auth-policy';
import { deleteAuthSession, readAuthSession } from '$lib/server/database';
import { timingSafeEqual } from 'node:crypto';
import type { Handle } from '@sveltejs/kit';

const PUBLIC_AUTH_PATHS = new Set([
	'/auth/login',
	'/auth/callback',
	'/auth/logout',
	'/auth/signed-out'
]);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.authMode = 'none';
	event.locals.user = null;

	let oidcSettings;
	try {
		oidcSettings = getOidcSettings();
	} catch {
		return new Response('Die OIDC-Konfiguration des Servers ist unvollständig.', {
			status: 503
		});
	}

	if (oidcSettings) {
		event.locals.authMode = 'oidc';
		if (PUBLIC_AUTH_PATHS.has(event.url.pathname)) return resolve(event);

		const sessionToken = event.cookies.get(SESSION_COOKIE);
		const user = sessionToken ? readAuthSession(sessionToken) : null;
		if (user && hasAllowedGroup(user.groups, oidcSettings.allowedGroups)) {
			event.locals.user = user;
			if (
				!SAFE_METHODS.has(event.request.method) &&
				!isSameOrigin(event.request, event.url, oidcSettings.redirectUri)
			) {
				return new Response('Anfrage von einer fremden Quelle abgelehnt.', { status: 403 });
			}
			return resolve(event);
		}
		if (sessionToken) {
			deleteAuthSession(sessionToken);
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}

		if (event.url.pathname.startsWith('/api/')) {
			return new Response('Anmeldung erforderlich', {
				status: 401,
				headers: { 'cache-control': 'no-store' }
			});
		}

		const returnTo = `${event.url.pathname}${event.url.search}`;
		return new Response(null, {
			status: 303,
			headers: {
				location: `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
				'cache-control': 'no-store'
			}
		});
	}

	const username = env.APP_USERNAME;
	const password = env.APP_PASSWORD;
	if (!username || !password) return resolve(event);

	event.locals.authMode = 'basic';
	const authorization = event.request.headers.get('authorization');
	const expected = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

	if (!authorization || !safeEqual(authorization, expected)) {
		return new Response('Anmeldung erforderlich', {
			status: 401,
			headers: { 'www-authenticate': 'Basic realm="Monatsabrechnung", charset="UTF-8"' }
		});
	}

	return resolve(event);
};

function isSameOrigin(request: Request, url: URL, redirectUri?: string): boolean {
	const origin = request.headers.get('origin');
	const expectedOrigin = redirectUri ? new URL(redirectUri).origin : url.origin;
	return !origin || origin === expectedOrigin;
}

function safeEqual(left: string, right: string): boolean {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	if (leftBuffer.length !== rightBuffer.length) return false;
	return timingSafeEqual(leftBuffer, rightBuffer);
}
