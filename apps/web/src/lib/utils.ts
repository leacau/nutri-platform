import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatDate(date: any) {
	if (!date) return 'Fecha no disponible';

	let d: Date;

	// 1. Si ya es un objeto Date nativo
	if (date instanceof Date) {
		d = date;
	}
	// 2. Si es un texto (ISO string) o un número (milisegundos)
	else if (typeof date === 'string' || typeof date === 'number') {
		d = new Date(date);
	}
	// 3. Si es un objeto crudo (probablemente un Timestamp de Firebase)
	else if (typeof date === 'object') {
		if ('_seconds' in date) {
			d = new Date(date._seconds * 1000);
		} else if ('seconds' in date) {
			d = new Date(date.seconds * 1000);
		} else {
			// Intento desesperado si es un objeto raro
			d = new Date(String(date));
		}
	} else {
		return 'Fecha inválida';
	}

	// Validamos si el objeto Date final se pudo construir correctamente
	if (isNaN(d.getTime())) {
		return 'Fecha inválida';
	}

	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(d);
}
