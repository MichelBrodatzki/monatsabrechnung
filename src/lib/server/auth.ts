import { env } from '$env/dynamic/private';
import * as oidc from 'openid-client';

export const SESSION_COOKIE = 'monatsabrechnung_session';
export const FLOW_COOKIE = 'monatsabrechnung_oidc_flow';

export interface OidcSettings {
	issuer: URL;
	clientId: string;
	clientSecret: string;
	redirectUri?: string;
	scopes: string;
	groupsClaim: string;
	allowedGroups: string[];
	sessionTtlSeconds: number;
	clientAuthMethod: 'client_secret_basic' | 'client_secret_post';
}

let cachedConfiguration: Promise<oidc.Configuration> | undefined;
let cachedConfigurationKey = '';

export function getOidcSettings(): OidcSettings | null {
	const values = {
		issuer: env.OIDC_ISSUER?.trim(),
		clientId: env.OIDC_CLIENT_ID?.trim(),
		clientSecret: env.OIDC_CLIENT_SECRET?.trim(),
		groupsClaim: env.OIDC_GROUPS_CLAIM?.trim(),
		allowedGroups: env.OIDC_ALLOWED_GROUPS?.trim()
	};
	if (!values.issuer) return null;

	const missing = Object.entries(values)
		.filter(([, value]) => !value)
		.map(([key]) => key);
	if (missing.length > 0) {
		throw new Error(`Unvollständige OIDC-Konfiguration: ${missing.join(', ')}`);
	}

	const allowedGroups = values.allowedGroups!
		.split(',')
		.map((group) => group.trim())
		.filter(Boolean);
	if (allowedGroups.length === 0) {
		throw new Error('OIDC_ALLOWED_GROUPS enthält keine Gruppe.');
	}

	const configuredClientAuthMethod =
		env.OIDC_CLIENT_AUTH_METHOD?.trim() || 'client_secret_basic';
	if (
		configuredClientAuthMethod !== 'client_secret_basic' &&
		configuredClientAuthMethod !== 'client_secret_post'
	) {
		throw new Error('OIDC_CLIENT_AUTH_METHOD ist ungültig.');
	}
	const scopes = env.OIDC_SCOPES?.trim() || 'openid profile email';
	if (!scopes.split(/\s+/).includes('openid')) {
		throw new Error('OIDC_SCOPES muss den Scope „openid“ enthalten.');
	}
	const parsedTtl = Number.parseInt(env.OIDC_SESSION_TTL_SECONDS || '', 10);

	return {
		issuer: new URL(values.issuer!),
		clientId: values.clientId!,
		clientSecret: values.clientSecret!,
		redirectUri: env.OIDC_REDIRECT_URI?.trim() || undefined,
		scopes,
		groupsClaim: values.groupsClaim!,
		allowedGroups,
		sessionTtlSeconds: Number.isFinite(parsedTtl) && parsedTtl >= 300 ? parsedTtl : 43_200,
		clientAuthMethod: configuredClientAuthMethod
	};
}

export async function getOidcConfiguration(
	settings: OidcSettings
): Promise<oidc.Configuration> {
	const key = [
		settings.issuer.href,
		settings.clientId,
		settings.clientAuthMethod
	].join('|');
	if (!cachedConfiguration || cachedConfigurationKey !== key) {
		cachedConfigurationKey = key;
		const clientAuthentication =
			settings.clientAuthMethod === 'client_secret_post'
				? oidc.ClientSecretPost(settings.clientSecret)
				: oidc.ClientSecretBasic(settings.clientSecret);
		cachedConfiguration = oidc.discovery(
			settings.issuer,
			settings.clientId,
			{
				client_id: settings.clientId,
				client_secret: settings.clientSecret,
				token_endpoint_auth_method: settings.clientAuthMethod
			},
			clientAuthentication
		);
	}
	return cachedConfiguration;
}

export function oidcRedirectUri(settings: OidcSettings, requestUrl: URL): string {
	return settings.redirectUri || new URL('/auth/callback', requestUrl.origin).href;
}

export function callbackUrl(settings: OidcSettings, requestUrl: URL): URL {
	const url = new URL(oidcRedirectUri(settings, requestUrl));
	url.search = requestUrl.search;
	return url;
}

export function secureCookie(requestUrl: URL): boolean {
	return requestUrl.protocol === 'https:' || env.NODE_ENV === 'production';
}

export function epochSeconds(): number {
	return Math.floor(Date.now() / 1000);
}
