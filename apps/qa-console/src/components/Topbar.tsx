import { useId } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { User } from 'firebase/auth';
import { Link } from 'react-router-dom';
import { getCopy, type Locale } from '../i18n';

type Copy = ReturnType<typeof getCopy>;

type TopbarProps = {
	copy: Copy;
	locale: Locale;
	setLocale: Dispatch<SetStateAction<Locale>>;
	supportedLocales: Locale[];
	user: User | null;
	loading: boolean;
	onLogout: () => Promise<void>;
};

export function Topbar({
	copy,
	locale,
	setLocale,
	supportedLocales,
	user,
	loading,
	onLogout,
}: TopbarProps) {
	const localeSelectId = useId();

	return (
		<nav className='topbar'>
			<div className='actions'>
				<Link to='/' className='brand'>
					{copy.nav.brand}
				</Link>
				<span className='badge'>{copy.nav.badge}</span>
			</div>
			<div className='top-actions'>
				<label className='field-inline' htmlFor={localeSelectId}>
					<span className='muted small'>{copy.nav.languageLabel}</span>
					<select id={localeSelectId} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
						{supportedLocales.map((loc) => {
							const locCopy = getCopy(loc);
							return (
								<option key={loc} value={loc}>
									{locCopy.languageName}
								</option>
							);
						})}
					</select>
				</label>
				<Link to='/' className='link'>
					{copy.nav.home}
				</Link>
				<Link to='/dashboard' className='link'>
					{copy.nav.dashboard}
				</Link>
				{user ? (
					<button className='btn ghost sm' onClick={onLogout} disabled={loading}>
						{copy.nav.logout}
					</button>
				) : (
					<Link to='/login' className='btn sm'>
						{copy.nav.login}
					</Link>
				)}
			</div>
		</nav>
	);
}
