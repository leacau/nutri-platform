import { useEffect, useState } from 'react';

export default function useDebouncedValue<T>(value: T, delayMs = 300): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		const id = window.setTimeout(() => setDebouncedValue(value), delayMs);
		return () => window.clearTimeout(id);
	}, [value, delayMs]);

	return debouncedValue;
}
