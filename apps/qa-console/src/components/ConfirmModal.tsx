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
	if (!confirmAction) return null;

	return (
		<div className='modal-backdrop' role='dialog' aria-modal='true'>
			<div className='modal'>
				<p className='eyebrow'>
					{confirmAction.type === 'cancel' ? copy.confirm.cancel.title : copy.confirm.complete.title}
				</p>
				<h3>{confirmCopy[confirmAction.type].title}</h3>
				<p className='muted'>{confirmCopy[confirmAction.type].body}</p>
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
