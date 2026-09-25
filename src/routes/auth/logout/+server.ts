import { deleteAuthSession } from '$lib/server/database';
import { SESSION_COOKIE } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) deleteAuthSession(token);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/auth/signed-out');
};
