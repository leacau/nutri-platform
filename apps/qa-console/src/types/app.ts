import type { ApiLogEntry } from '../api';
import type { RoleCopy } from '../i18n';

export type Claims = { role: string | null; clinicId: string | null };

export type RoleTab = RoleCopy;

export type Toast = {
	id: string;
	message: string;
	tone: 'success' | 'info' | 'warning' | 'error';
};

export type ConfirmAction = { type: 'cancel' | 'complete'; apptId: string };

export type LogEntry = ApiLogEntry;

export type AuthedFetchResult =
	| { ok: true; status: number; data: unknown; attempts: number; durationMs: number }
	| { ok: false; status: number; data: unknown; error: string; attempts: number; durationMs: number };

export type BackendStatusState = 'unknown' | 'online' | 'degraded' | 'offline';
export type BackendStatus = { state: BackendStatusState; message: string; lastChecked?: string };
