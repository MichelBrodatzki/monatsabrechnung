// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			authMode: 'none' | 'basic' | 'oidc';
			user: {
				subject: string;
				displayName: string;
				groups: string[];
			} | null;
		}
		interface PageData {
			authMode: App.Locals['authMode'];
			user: App.Locals['user'];
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
