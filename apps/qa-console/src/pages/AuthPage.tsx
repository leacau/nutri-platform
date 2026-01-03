import { useId } from 'react';
import type { User } from 'firebase/auth';
import type { Dispatch, SetStateAction } from 'react';
import type { getCopy } from '../i18n';
import { EMAIL_PATTERN } from '../utils/validation';

type Copy = ReturnType<typeof getCopy>;

export type AuthPageProps = {
	copy: Copy;
	authErrors: string[];
	email: string;
	password: string;
	emailError: string | null;
	passwordError: string | null;
	showPassword: boolean;
	authPending: boolean;
	loading: boolean;
	user: User | null;
	claims: { role: string | null; clinicId: string | null };
	setAuthFieldRef: (field: 'email' | 'password', ref: HTMLInputElement | null) => void;
	setEmail: Dispatch<SetStateAction<string>>;
	setPassword: Dispatch<SetStateAction<string>>;
	setShowPassword: Dispatch<SetStateAction<boolean>>;
	setAuthActionError: Dispatch<SetStateAction<string | null>>;
	setEmailError: Dispatch<SetStateAction<string | null>>;
	setPasswordError: Dispatch<SetStateAction<string | null>>;
	setStickyAuthField: Dispatch<SetStateAction<'email' | 'password' | null>>;
	getEmailError: (value: string) => string | null;
	getPasswordError: (value: string) => string | null;
	handleLogin: () => Promise<void>;
	handleRegister: () => Promise<void>;
	handleLogout: () => Promise<void>;
	handleRefreshClaims: () => Promise<void>;
};

export default function AuthPage({
	copy,
	authErrors,
	email,
	password,
	emailError,
	passwordError,
	showPassword,
	authPending,
	loading,
	user,
	claims,
	setAuthFieldRef,
	setEmail,
	setPassword,
	setShowPassword,
	setAuthActionError,
	setEmailError,
	setPasswordError,
	setStickyAuthField,
	getEmailError,
	getPasswordError,
	handleLogin,
	handleRegister,
	handleLogout,
	handleRefreshClaims,
}: AuthPageProps) {
	const emailInputId = useId();
	const passwordInputId = useId();
	const emailErrorId = useId();
	const passwordErrorId = useId();
	const authErrorsId = useId();

	return (
		<div className='page narrow'>
			<h2>{copy.auth.title}</h2>
			<p className='muted'>{copy.auth.intro}</p>
			<div className='card'>
				{authErrors.length > 0 && (
					<div
						className='error-summary'
						role='alert'
						aria-live='assertive'
						id={authErrorsId}
					>
						<p>
							<strong>{copy.auth.errorSummaryTitle}</strong>
						</p>
						<ul>
							{authErrors.map((err, idx) => (
								<li key={idx}>{err}</li>
							))}
						</ul>
					</div>
				)}
				<label className='field'>
					<span>{copy.auth.emailLabel}</span>
					<input
						id={emailInputId}
						type='email'
						inputMode='email'
						pattern={EMAIL_PATTERN.source}
						ref={(el) => setAuthFieldRef('email', el)}
						value={email}
						onFocus={() => setStickyAuthField('email')}
						onChange={(e) => {
							setStickyAuthField('email');
							setEmail(e.target.value);
							setAuthActionError(null);
							setEmailError(getEmailError(e.target.value));
						}}
						placeholder={copy.auth.emailPlaceholder}
						aria-describedby={emailError ? emailErrorId : authErrors.length > 0 ? authErrorsId : undefined}
						aria-invalid={!!emailError}
					/>
					{emailError && (
						<p className='error-text' id={emailErrorId} role='status' aria-live='polite'>
							{emailError}
						</p>
					)}
				</label>
				<label className='field'>
					<span>{copy.auth.passwordLabel}</span>
					<input
						id={passwordInputId}
						type={showPassword ? 'text' : 'password'}
						ref={(el) => setAuthFieldRef('password', el)}
						value={password}
						onFocus={() => setStickyAuthField('password')}
						onChange={(e) => {
							setStickyAuthField('password');
							setPassword(e.target.value);
							setAuthActionError(null);
							setPasswordError(getPasswordError(e.target.value));
						}}
						placeholder={copy.auth.passwordPlaceholder}
						aria-describedby={
							passwordError ? passwordErrorId : authErrors.length > 0 ? authErrorsId : undefined
						}
						aria-invalid={!!passwordError}
					/>
					<div className='field-inline'>
						<label className='toggle'>
							<input
								type='checkbox'
								checked={showPassword}
								onChange={(e) => setShowPassword(e.target.checked)}
							/>
							<span>{copy.auth.passwordToggle}</span>
						</label>
					</div>
					{passwordError && (
						<p className='error-text' id={passwordErrorId} role='status' aria-live='polite'>
							{passwordError}
						</p>
					)}
				</label>
				<div className='actions'>
					<button
						className={`btn primary ${authPending ? 'is-loading' : ''}`}
						disabled={loading || authPending}
						onClick={handleLogin}
					>
						{authPending ? copy.auth.loginPending : copy.auth.login}
					</button>
					<button
						className={`btn ${authPending ? 'is-loading' : ''}`}
						disabled={loading || authPending}
						onClick={handleRegister}
					>
						{authPending ? copy.auth.registerPending : copy.auth.register}
					</button>
					{user && (
						<button className='btn ghost' disabled={loading || authPending} onClick={handleLogout}>
							{copy.auth.logout}
						</button>
					)}
				</div>
				<div className='inline-info'>
					<div>
						<strong>{copy.auth.infoUid}</strong> <code>{user ? user.uid : copy.auth.notLogged}</code>
					</div>
					<div>
						<strong>{copy.auth.infoClaims}</strong> <code>{JSON.stringify(claims)}</code>
					</div>
				</div>
				<button className='link' disabled={loading} onClick={handleRefreshClaims}>
					{copy.auth.refreshClaims}
				</button>
			</div>
		</div>
	);
}
