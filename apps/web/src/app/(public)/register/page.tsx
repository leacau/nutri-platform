'use client';

import { useEffect, useState } from 'react';

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
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const schema = z.object({
	name: z.string().min(2, 'Ingresá tu nombre'),
	email: z.string().email(),
	password: z.string().min(6),
	dni: z
		.string()
		.min(7, 'El DNI debe tener min 7 dígitos')
		.max(8, 'El DNI debe tener max 8 dígitos')
		.regex(/^\d+$/, 'Solo números'),
	legalAccepted: z.boolean().refine((value) => value === true, {
		message: 'Debes aceptar los terminos y la politica de privacidad.',
	}),
});

type RegisterForm = z.infer<typeof schema>;

export default function RegisterPage() {
	const { registerWithEmail } = useAuth();
	const router = useRouter();
	const { t } = useI18n();
	const [error, setError] = useState<string | null>(null);
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
			setError('No pudimos crear la cuenta. Probá con otro email.');
		}
	};

	return (
		<div className='mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-12'>
			<div className='mb-8 space-y-2 text-center'>
				<div className='inline-flex items-center gap-2 rounded-full bg-secondary/10 px-4 py-1 text-xs font-semibold text-secondary'>
					Onboarding
				</div>
				<h1 className='text-3xl font-semibold text-primary'>Creá tu cuenta</h1>
				<p className='text-sm text-muted-foreground'>
					{t('auth.subtitle')} Elegí contraseña segura y luego vinculá tu
					clínica.
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
						placeholder='Tu nombre'
						{...register('name')}
						required
					/>
				</div>
				<div className='space-y-2'>
					<Label htmlFor='email'>{t('auth.email')}</Label>
					<Input
						id='email'
						placeholder='vos@amsa.core'
						type='email'
						{...register('email')}
						required
					/>
				</div>
				<div className='space-y-2'>
					<Label htmlFor='password'>{t('auth.password')}</Label>
					<Input
						id='password'
						placeholder='•••••••'
						type='password'
						{...register('password')}
						required
					/>
				</div>
				<div className='space-y-2'>
					<Label htmlFor='dni'>DNI</Label>
					<Input
						id='dni'
						placeholder='12345678'
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
						Acepto los{' '}
						<Link href='/terms' className='text-primary hover:underline'>
							terminos de uso
						</Link>
						, la{' '}
						<Link href='/privacy' className='text-primary hover:underline'>
							politica de privacidad y tratamiento de datos de salud
						</Link>
						, incluyendo el uso de infraestructura cloud informada.
					</span>
				</label>
				{error ? <p className='text-sm text-destructive'>{error}</p> : null}
				<Button type='submit' className='w-full' disabled={isSubmitting}>
					<UserPlus className='mr-2 h-4 w-4' />
					{t('action.register')}
				</Button>
			</form>
			<p className='mt-6 text-center text-sm text-muted-foreground'>
				¿Ya tenés cuenta?{' '}
				<Link href='/login' className='text-primary hover:underline'>
					{t('action.login')}
				</Link>
			</p>
		</div>
	);
}
