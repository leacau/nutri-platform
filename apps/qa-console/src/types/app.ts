import type { RoleCopy } from '../i18n';

export type Claims = { role: string | null; clinicId: string | null };

export type RoleTab = RoleCopy;

export type Toast = {
	id: string;
	message: string;
	tone: 'success' | 'info' | 'warning' | 'error';
};

export type ConfirmAction = { type: 'cancel' | 'complete'; apptId: string };

export type LogEntry =
	| { ts: string; endpoint: string; payload?: unknown; ok: true; data: unknown }
	| {
			ts: string;
			endpoint: string;
			payload?: unknown;
			ok: false;
			error: string;
	  };

export type AuthedFetchResult =
	| { ok: true; status: number; data: unknown }
	| { ok: false; status: number; data: unknown; error: string };
