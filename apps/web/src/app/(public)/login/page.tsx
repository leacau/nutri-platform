'use client';

import { LogIn, ShieldCheck } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import Link from 'next/link';
import { NoriaLogo } from '../../../components/brand/noria-logo';
import { apiClient } from '../../../lib/api-client';
import { useAuth } from '../../../providers/auth-provider';
import { useForm } from 'react-hook-form';
import { useI18n } from '../../../providers/i18n-provider';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(6),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginContent() {
	const { loginWithEmail, loginWithGoogle, refreshToken, updateCurrentPassword } =
		useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { t } = useI18n();
	const [error, setError] = useState<string | null>(null);
	const [pendingPasswordToken, setPendingPasswordToken] = useState<string | null>(
		null,
	);
	const [newPassword, setNewPassword] = useState('');
	const [newPasswordRepeat, setNewPasswordRepeat] = useState('');
	const [isChangingPassword, setIsChangingPassword] = useState(false);
	const {
		register,
		handleSubmit,
		formState: { isSubmitting },
	} = useForm<LoginForm>({
		resolver: zodResolver(loginSchema),
	});

	const next = searchParams.get('next') || '/select-clinic';

	const onSubmit = async (data: LoginForm) => {
		setError(null);
		try {
			const result = await loginWithEmail(data.email, data.password);
			if (result.claims.forcePasswordChange === true) {
				setPendingPasswordToken(result.token);
				return;
			}
			router.push(next);
		} catch {
			setError(t('auth.firebaseLoginError'));
		}
	};

	const handleRequiredPasswordChange = async () => {
		setError(null);
		if (newPassword.length < 8) {
			setError(t('auth.newPasswordMin'));
			return;
		}
		if (newPassword !== newPasswordRepeat) {
			setError(t('auth.passwordsDoNotMatch'));
			return;
		}
		setIsChangingPassword(true);
		try {
			await updateCurrentPassword(newPassword);
			await apiClient.completeRequiredPasswordChange(
				pendingPasswordToken ?? undefined,
			);
			await refreshToken();
			router.push(next);
		} catch {
			setError(t('auth.passwordChangeError'));
		} finally {
			setIsChangingPassword(false);
		}
	};

	const handleGoogle = async () => {
		setError(null);
		try {
			await loginWithGoogle();
			router.push(next);
		} catch {
			setError(t('auth.googleLoginError'));
		}
	};

	return (
		<div className='flex min-h-screen'>
			<div className='relative hidden w-1/2 items-center justify-center bg-primary text-white lg:flex'>
				<div className='relative z-10 max-w-md space-y-6 p-12'>
{/* 					<NoriaLogo variant='dark' className='h-20 w-auto' />
 */}					<div className='inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold'>
						<ShieldCheck className='h-4 w-4' />
						{t('auth.featureBadge')}
					</div>
					<h2 className='font-display text-4xl font-semibold leading-tight'>
						{t('home.title')}
					</h2>
					<p className='text-lg text-white/80'>{t('auth.subtitle')}</p>
					<ul className='space-y-2 text-sm text-white/80'>
						<li>{t('auth.featureFirebase')}</li>
						<li>{t('auth.featurePermissions')}</li>
						<li>{t('auth.featureManagement')}</li>
					</ul>
				</div>
			</div>
			<div className='mx-auto flex w-full max-w-xl flex-col justify-center px-8 py-16'>
				<div className='mb-8 space-y-2 text-center'>
					<NoriaLogo className='mx-auto mb-6 h-14 w-auto' />
					<div className='inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold text-primary'>
						{t('auth.access')}
					</div>
					<h1 className='text-3xl font-semibold text-primary'>
						{t('auth.loginTitle')}
					</h1>
					<p className='text-sm text-muted-foreground'>
						{t('auth.loginSubtitle')}
					</p>
				</div>

				{pendingPasswordToken ? (
					<div className='space-y-5 rounded-xl border bg-white p-5 shadow-sm'>
						<div>
							<h2 className='text-xl font-semibold text-primary'>
								{t('auth.requiredPasswordTitle')}
							</h2>
							<p className='mt-1 text-sm text-muted-foreground'>
								{t('auth.requiredPasswordDetail')}
							</p>
						</div>
						<div className='space-y-2'>
							<Label>{t('auth.newPassword')}</Label>
							<Input
								type='password'
								value={newPassword}
								onChange={(event) => setNewPassword(event.target.value)}
							/>
						</div>
						<div className='space-y-2'>
							<Label>{t('auth.repeatPassword')}</Label>
							<Input
								type='password'
								value={newPasswordRepeat}
								onChange={(event) => setNewPasswordRepeat(event.target.value)}
							/>
						</div>
						{error ? (
							<div className='rounded-md bg-destructive/15 p-3'>
								<p className='text-sm font-medium text-destructive'>{error}</p>
							</div>
						) : null}
						<Button
							type='button'
							className='w-full'
							onClick={handleRequiredPasswordChange}
							disabled={isChangingPassword}
						>
							{isChangingPassword
								? t('common.processing')
								: t('auth.saveNewPassword')}
						</Button>
					</div>
				) : (
				<form onSubmit={handleSubmit(onSubmit)} className='space-y-6'>
					<div className='space-y-2'>
						<Label htmlFor='email'>{t('auth.email')}</Label>
						<Input
							id='email'
							placeholder={t('auth.emailPlaceholder')}
							type='email'
							required
							{...register('email')}
						/>
					</div>
					<div className='space-y-2'>
						<Label htmlFor='password'>{t('auth.password')}</Label>
						<Input
							id='password'
							type='password'
							placeholder={t('auth.passwordPlaceholder')}
							required
							{...register('password')}
						/>
					</div>

					{error ? (
						<div className='rounded-md bg-destructive/15 p-3'>
							<p className='text-sm font-medium text-destructive'>{error}</p>
						</div>
					) : null}

					<div className='space-y-3'>
						<Button type='submit' className='w-full' disabled={isSubmitting}>
							<LogIn className='mr-2 h-4 w-4' />
							{isSubmitting ? t('auth.loading') : t('action.login')}
						</Button>
						<Button
							type='button'
							variant='outline'
							className='w-full'
							onClick={handleGoogle}
						>
							{t('auth.google')}
						</Button>
					</div>
				</form>
				)}
				<div className='mt-6 flex flex-wrap justify-between text-sm text-muted-foreground'>
					<Link href='/register' className='text-primary hover:underline'>
						{t('action.register')}
					</Link>
					<Link href='/forgot-password' className='text-primary hover:underline'>
						{t('action.forgot')}
					</Link>
				</div>
				<div className='mt-4 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground'>
					<Link href='/terms' className='hover:text-primary hover:underline'>
						{t('auth.terms')}
					</Link>
					<Link href='/privacy' className='hover:text-primary hover:underline'>
						{t('auth.privacy')}
					</Link>
				</div>
			</div>
		</div>
	);
}

export default function LoginPage() {
	const { t } = useI18n();
	return (
		<Suspense
			fallback={
				<div className='flex min-h-screen items-center justify-center'>
					{t('auth.loading')}
				</div>
			}
		>
			<LoginContent />
		</Suspense>
	);
}
