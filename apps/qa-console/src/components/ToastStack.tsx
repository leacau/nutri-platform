import type { Toast } from '../types/app';

type ToastStackProps = {
	toasts: Toast[];
};

const toastIcons: Record<Toast['tone'], string> = {
	success: '✅',
	info: 'ℹ️',
	warning: '⚠️',
	error: '❌',
};

export function ToastStack({ toasts }: ToastStackProps) {
	return (
		<div className='toast-stack' aria-live='polite'>
			{toasts.map((toast) => (
				<div key={toast.id} className={`toast ${toast.tone}`}>
					<span className='toast-icon' aria-hidden>
						{toastIcons[toast.tone]}
					</span>
					<div>{toast.message}</div>
				</div>
			))}
		</div>
	);
}
