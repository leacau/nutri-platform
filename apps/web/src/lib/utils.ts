import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatDate(input: string | Date | undefined | null): string {
	// 1. Si no hay nada, no intentamos formatear
	if (!input) return '—';

	// 2. Intentamos crear la fecha
	const date = new Date(input);

	// 3. Chequeamos si la fecha resultante es válida (es un truco de JS: getTime() en una Invalid Date da NaN)
	if (isNaN(date.getTime())) {
		return '—'; // o podés poner "Fecha inválida"
	}

	// 4. Si llegamos acá, la fecha es perfecta, la formateamos
	return new Intl.DateTimeFormat('es-AR', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	}).format(date);
}
