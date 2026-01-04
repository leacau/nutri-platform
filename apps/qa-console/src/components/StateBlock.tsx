import type { ReactNode } from 'react';

type StateBlockProps = {
	icon?: string;
	title: string;
	description?: string | null;
	loading?: boolean;
	action?: ReactNode;
};

export function StateBlock({ icon, title, description, loading = false, action }: StateBlockProps) {
	return (
		<div className={`state-block ${loading ? 'loading' : ''}`} role={loading ? 'status' : 'note'} aria-busy={loading}>
			<div className='state-icon' aria-hidden>
				{loading ? <span className='loader' /> : <span>{icon ?? 'ℹ️'}</span>}
			</div>
			<div className='state-body'>
				<p className='state-title'>{title}</p>
				{description && <p className='muted small'>{description}</p>}
				{action && <div className='actions wrap'>{action}</div>}
			</div>
		</div>
	);
}
