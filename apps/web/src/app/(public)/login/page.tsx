'use client';

import { LogIn, ShieldCheck } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import Link from 'next/link';
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
	const { loginWithEmail, loginWithGoogle } = useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { t } = useI18n();
	const [error, setError] = useState<string | null>(null);
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
			await loginWithEmail(data.email, data.password);
			router.push(next);
		} catch (err: any) {
			console.error('[Login Error Detallado]:', err);
			const firebaseError = err?.code || err?.message || 'Error desconocido';
			setError(t('auth.firebaseLoginError', { error: firebaseError }));
		}
	};

	const handleGoogle = async () => {
		setError(null);
		try {
			await loginWithGoogle();
			router.push(next);
		} catch (err: any) {
			console.error('[Google Login Error]:', err);
			setError(t('auth.googleLoginError', { error: err?.code || err?.message }));
		}
	};

	return (
		<div className='flex min-h-screen'>
			<div className='relative hidden w-1/2 items-center justify-center bg-gradient-to-br from-primary via-primary to-secondary text-white lg:flex'>
				<div className='absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(47,143,123,0.35),_transparent_50%)]' />
				<div className='relative z-10 max-w-md space-y-6 p-12'>
					<div className='inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold'>
						<ShieldCheck className='h-4 w-4' />
						{t('auth.featureBadge')}
					</div>
					<h2 className='text-4xl font-bold leading-tight'>AMSA Core</h2>
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
					<div className='inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold text-primary'>
						{t('auth.access')}
					</div>
					<h1 className='text-3xl font-semibold text-primary'>
						{t('hero.welcome')}
					</h1>
					<p className='text-sm text-muted-foreground'>
						{t('auth.loginSubtitle')}
					</p>
				</div>

				<form onSubmit={handleSubmit(onSubmit)} className='space-y-6'>
					<div className='space-y-2'>
						<Label htmlFor='email'>{t('auth.email')}</Label>
						<Input
							id='email'
							placeholder='vos@amsa.core'
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
							placeholder='********'
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
