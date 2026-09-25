import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	authMode: locals.authMode,
	user: locals.user
});
