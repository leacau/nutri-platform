'use client';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { apiClient } from '../../../lib/api-client';
import { useAuth } from '../../../providers/auth-provider';
import { useForm } from 'react-hook-form';
import { useI18n } from '../../../providers/i18n-provider';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

type RegisterForm = {
	name: string;
	email: string;
	password: string;
	dni: string;
	legalAccepted: boolean;
};

export default function RegisterPage() {
	const { registerWithEmail } = useAuth();
	const router = useRouter();
	const { t } = useI18n();
	const [error, setError] = useState<string | null>(null);

	const schema = z.object({
		name: z.string().min(2, t('validation.nameRequired')),
		email: z.string().email(t('validation.invalidEmail')),
		password: z.string().min(6),
		dni: z
			.string()
			.min(7, t('team.dniMin'))
			.max(8, t('team.dniMax'))
			.regex(/^\d+$/, t('team.onlyNumbers')),
		legalAccepted: z.boolean().refine((value) => value === true, {
			message: t('auth.legalRequired'),
		}),
	});

	const {
		register,
		handleSubmit,
		formState: { isSubmitting },
	} = useForm<RegisterForm>({
		resolver: zodResolver(schema),
	});

	const onSubmit = async (data: RegisterForm) => {
		setError(null);
		try {
			const token = await registerWithEmail(data.email, data.password);
			await apiClient.upsertUserProfile(
				{
					name: data.name,
					email: data.email,
					dni: data.dni,
				},
				token
			);
			await apiClient.acceptLegalConsents(token);
			router.push('/select-clinic');
		} catch (err) {
			console.error(err);
			setError(t('auth.registerError'));
		}
	};

	return (
		<div className='mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-12'>
			<div className='mb-8 space-y-2 text-center'>
				<div className='inline-flex items-center gap-2 rounded-full bg-secondary/10 px-4 py-1 text-xs font-semibold text-secondary'>
					{t('auth.onboarding')}
				</div>
				<h1 className='text-3xl font-semibold text-primary'>
					{t('auth.createAccount')}
				</h1>
				<p className='text-sm text-muted-foreground'>
					{t('auth.registerSubtitle', { subtitle: t('auth.subtitle') })}
				</p>
			</div>
			<form
				onSubmit={handleSubmit(onSubmit)}
				className='space-y-5 rounded-xl border bg-card p-8 shadow-sm'
			>
				<div className='space-y-2'>
					<Label htmlFor='name'>{t('auth.name')}</Label>
					<Input
						id='name'
						placeholder={t('auth.yourName')}
						{...register('name')}
						required
					/>
				</div>
				<div className='space-y-2'>
					<Label htmlFor='email'>{t('auth.email')}</Label>
					<Input
						id='email'
						placeholder={t('auth.emailPlaceholder')}
						type='email'
						{...register('email')}
						required
					/>
				</div>
				<div className='space-y-2'>
					<Label htmlFor='password'>{t('auth.password')}</Label>
					<Input
						id='password'
						placeholder={t('auth.passwordPlaceholder')}
						type='password'
						{...register('password')}
						required
					/>
				</div>
				<div className='space-y-2'>
					<Label htmlFor='dni'>DNI</Label>
					<Input
						id='dni'
						placeholder={t('common.dniPlaceholder')}
						{...register('dni')}
						required
					/>
				</div>
				<label className='flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm leading-5'>
					<input
						type='checkbox'
						className='mt-1 h-4 w-4 rounded border-border'
						{...register('legalAccepted')}
					/>
					<span>
						{t('auth.acceptLegalPrefix')}{' '}
						<Link href='/terms' className='text-primary hover:underline'>
							{t('auth.termsOfUse')}
						</Link>
						,{' '}
						<Link href='/privacy' className='text-primary hover:underline'>
							{t('auth.privacyPolicy')}
						</Link>
						, {t('auth.acceptLegalSuffix')}
					</span>
				</label>
				{error ? <p className='text-sm text-destructive'>{error}</p> : null}
				<Button type='submit' className='w-full' disabled={isSubmitting}>
					<UserPlus className='mr-2 h-4 w-4' />
					{t('action.register')}
				</Button>
			</form>
			<p className='mt-6 text-center text-sm text-muted-foreground'>
				{t('auth.alreadyHaveAccount')}{' '}
				<Link href='/login' className='text-primary hover:underline'>
					{t('action.login')}
				</Link>
			</p>
		</div>
	);
}
