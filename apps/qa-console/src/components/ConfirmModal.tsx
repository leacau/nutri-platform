import { useEffect, useId, useRef } from 'react';
import type { ConfirmAction } from '../types/app';
import type { getCopy } from '../i18n';

type Copy = ReturnType<typeof getCopy>;

type ConfirmCopy = Record<
	ConfirmAction['type'],
	{ title: string; body: string; confirmLabel: string; tone: 'warning' | 'success' }
>;

type ConfirmModalProps = {
	confirmAction: ConfirmAction | null;
	confirmCopy: ConfirmCopy;
	copy: Copy;
	onConfirm: () => Promise<void>;
	onCancel: () => void;
};

export function ConfirmModal({ confirmAction, confirmCopy, copy, onConfirm, onCancel }: ConfirmModalProps) {
	const dialogTitleId = useId();
	const dialogDescriptionId = useId();
	const dialogRef = useRef<HTMLDivElement | null>(null);
	const lastFocusedRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!confirmAction) return;

		lastFocusedRef.current = document.activeElement as HTMLElement | null;
		const dialogEl = dialogRef.current;
		if (!dialogEl) return;

		const getFocusable = () =>
			Array.from(
				dialogEl.querySelectorAll<HTMLElement>(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				)
			).filter((el) => !el.hasAttribute('disabled'));

		const focusables = getFocusable();
		if (focusables[0]) {
			focusables[0].focus({ preventScroll: true });
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Tab') return;
			const focusableItems = getFocusable();
			if (focusableItems.length === 0) return;
			const active = document.activeElement as HTMLElement | null;
			const currentIndex = focusableItems.findIndex((el) => el === active);
			const nextIndex =
				currentIndex === -1
					? 0
					: event.shiftKey
					? (currentIndex - 1 + focusableItems.length) % focusableItems.length
					: (currentIndex + 1) % focusableItems.length;
			event.preventDefault();
			focusableItems[nextIndex]?.focus({ preventScroll: true });
		};

		dialogEl.addEventListener('keydown', handleKeyDown);

		return () => {
			dialogEl.removeEventListener('keydown', handleKeyDown);
			lastFocusedRef.current?.focus?.({ preventScroll: true });
		};
	}, [confirmAction]);

	if (!confirmAction) return null;

	return (
		<div
			className='modal-backdrop'
			role='dialog'
			aria-modal='true'
			aria-labelledby={dialogTitleId}
			aria-describedby={dialogDescriptionId}
		>
			<div className='modal' ref={dialogRef}>
				<p className='eyebrow' id={dialogTitleId}>
					{confirmAction.type === 'cancel' ? copy.confirm.cancel.title : copy.confirm.complete.title}
				</p>
				<h3>{confirmCopy[confirmAction.type].title}</h3>
				<p className='muted' id={dialogDescriptionId}>
					{confirmCopy[confirmAction.type].body}
				</p>
				<div className='actions end'>
					<button className='btn ghost' onClick={onCancel}>
						{copy.confirm.back}
					</button>
					<button
						className={`btn ${confirmCopy[confirmAction.type].tone === 'warning' ? 'danger' : 'success'}`}
						onClick={onConfirm}
					>
						{confirmCopy[confirmAction.type].confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
