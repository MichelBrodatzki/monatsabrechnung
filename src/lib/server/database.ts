import Database from 'better-sqlite3';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { env } from '$env/dynamic/private';
import { createDefaultState } from '$lib/default-state';
import type { HouseholdState } from '$lib/types';

export interface AuthUser {
	subject: string;
	displayName: string;
	groups: string[];
}

export interface AuthFlow {
	codeVerifier: string;
	state: string;
	nonce: string;
	returnTo: string;
}

const databasePath = resolve(env.DATABASE_PATH || 'data/monatsabrechnung.db');
mkdirSync(dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
	CREATE TABLE IF NOT EXISTS app_state (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		payload TEXT NOT NULL,
		updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS auth_sessions (
		token_hash TEXT PRIMARY KEY,
		subject TEXT NOT NULL,
		display_name TEXT NOT NULL,
		groups_json TEXT NOT NULL,
		expires_at INTEGER NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE INDEX IF NOT EXISTS auth_sessions_expires_at
		ON auth_sessions (expires_at);

	CREATE TABLE IF NOT EXISTS auth_flows (
		token_hash TEXT PRIMARY KEY,
		code_verifier TEXT NOT NULL,
		state TEXT NOT NULL,
		nonce TEXT NOT NULL,
		return_to TEXT NOT NULL,
		expires_at INTEGER NOT NULL
	);

	CREATE INDEX IF NOT EXISTS auth_flows_expires_at
		ON auth_flows (expires_at);
`);

const readStatement = database.prepare('SELECT payload FROM app_state WHERE id = 1');
const writeStatement = database.prepare(`
	INSERT INTO app_state (id, payload, updated_at)
	VALUES (1, ?, CURRENT_TIMESTAMP)
	ON CONFLICT(id) DO UPDATE SET
		payload = excluded.payload,
		updated_at = CURRENT_TIMESTAMP
`);
const insertSessionStatement = database.prepare(`
	INSERT INTO auth_sessions (
		token_hash, subject, display_name, groups_json, expires_at, created_at
	) VALUES (?, ?, ?, ?, ?, ?)
`);
const readSessionStatement = database.prepare(`
	SELECT subject, display_name, groups_json, expires_at
	FROM auth_sessions
	WHERE token_hash = ?
`);
const deleteSessionStatement = database.prepare(
	'DELETE FROM auth_sessions WHERE token_hash = ?'
);
const purgeSessionsStatement = database.prepare(
	'DELETE FROM auth_sessions WHERE expires_at <= ?'
);
const insertFlowStatement = database.prepare(`
	INSERT INTO auth_flows (
		token_hash, code_verifier, state, nonce, return_to, expires_at
	) VALUES (?, ?, ?, ?, ?, ?)
`);
const readFlowStatement = database.prepare(`
	SELECT code_verifier, state, nonce, return_to, expires_at
	FROM auth_flows
	WHERE token_hash = ?
`);
const deleteFlowStatement = database.prepare('DELETE FROM auth_flows WHERE token_hash = ?');
const purgeFlowsStatement = database.prepare('DELETE FROM auth_flows WHERE expires_at <= ?');

export function readState(): HouseholdState {
	const row = readStatement.get() as { payload: string } | undefined;
	if (row) return JSON.parse(row.payload) as HouseholdState;

	const state = createDefaultState();
	writeStatement.run(JSON.stringify(state));
	return state;
}

export function writeState(state: HouseholdState): void {
	writeStatement.run(JSON.stringify(state));
}

export function createAuthSession(user: AuthUser, expiresAt: number): string {
	const token = randomToken();
	const now = epochSeconds();
	purgeSessionsStatement.run(now);
	insertSessionStatement.run(
		hashToken(token),
		user.subject,
		user.displayName,
		JSON.stringify(user.groups),
		expiresAt,
		now
	);
	return token;
}

export function readAuthSession(token: string): AuthUser | null {
	const now = epochSeconds();
	const row = readSessionStatement.get(hashToken(token)) as
		| {
				subject: string;
				display_name: string;
				groups_json: string;
				expires_at: number;
		  }
		| undefined;
	if (!row) return null;
	if (row.expires_at <= now) {
		deleteSessionStatement.run(hashToken(token));
		return null;
	}

	try {
		const groups = JSON.parse(row.groups_json) as unknown;
		return {
			subject: row.subject,
			displayName: row.display_name,
			groups: Array.isArray(groups)
				? groups.filter((group): group is string => typeof group === 'string')
				: []
		};
	} catch {
		deleteSessionStatement.run(hashToken(token));
		return null;
	}
}

export function deleteAuthSession(token: string): void {
	deleteSessionStatement.run(hashToken(token));
}

export function createAuthFlow(flow: AuthFlow, expiresAt: number): string {
	const token = randomToken();
	const now = epochSeconds();
	purgeFlowsStatement.run(now);
	insertFlowStatement.run(
		hashToken(token),
		flow.codeVerifier,
		flow.state,
		flow.nonce,
		flow.returnTo,
		expiresAt
	);
	return token;
}

export function consumeAuthFlow(token: string): AuthFlow | null {
	const tokenHash = hashToken(token);
	const row = readFlowStatement.get(tokenHash) as
		| {
				code_verifier: string;
				state: string;
				nonce: string;
				return_to: string;
				expires_at: number;
		  }
		| undefined;
	deleteFlowStatement.run(tokenHash);
	if (!row || row.expires_at <= epochSeconds()) return null;
	return {
		codeVerifier: row.code_verifier,
		state: row.state,
		nonce: row.nonce,
		returnTo: row.return_to
	};
}

function randomToken(): string {
	return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

function epochSeconds(): number {
	return Math.floor(Date.now() / 1000);
}
