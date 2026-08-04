'use client';

import { Loader2, LogIn, ShieldCheck, UserCheck } from 'lucide-react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import Link from 'next/link';
import { QaUserRole } from '../../../lib/types';
import { Select } from '../../../components/ui/select';
import { apiClient } from '../../../lib/api-client';
import { useAuth } from '../../../providers/auth-provider';
import { useForm } from 'react-hook-form';
import { useI18n } from '../../../providers/i18n-provider';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(6),
});

type LoginForm = z.infer<typeof loginSchema>;
type QaRoleFilter = QaUserRole | 'unassigned';

const qaLoginEnabled =
	process.env.NEXT_PUBLIC_ENABLE_QA_LOGIN === 'true' ||
	process.env.NODE_ENV !== 'production';

const qaRoles: Array<{ value: QaRoleFilter; label: string }> = [
	{ value: 'platform_admin', label: 'Superadmin' },
	{ value: 'clinic_admin', label: 'Admin clinica' },
	{ value: 'staff', label: 'Staff' },
	{ value: 'professional', label: 'Profesional' },
	{ value: 'patient', label: 'Paciente' },
	{ value: 'unassigned', label: 'Sin rol' },
];

function LoginContent() {
	const { loginWithEmail, loginWithGoogle, qaLogin } = useAuth();
	const router = useRouter();
	const searchParams = useSearchParams();
	const { t } = useI18n();
	const [error, setError] = useState<string | null>(null);
	const [selectedQaRole, setSelectedQaRole] =
		useState<QaRoleFilter>('platform_admin');
	const [selectedQaUid, setSelectedQaUid] = useState('');
	const {
		register,
		handleSubmit,
		formState: { isSubmitting },
	} = useForm<LoginForm>({
		resolver: zodResolver(loginSchema),
	});

	const next = searchParams.get('next') || '/select-clinic';
	const qaUsersQuery = useQuery({
		queryKey: ['qa-users'],
		queryFn: () => apiClient.qaUsers(),
		enabled: qaLoginEnabled,
	});

	const selectedQaUsers = useMemo(
		() => qaUsersQuery.data?.roles[selectedQaRole] ?? [],
		[qaUsersQuery.data, selectedQaRole],
	);

	useEffect(() => {
		const firstUser = selectedQaUsers[0];
		queueMicrotask(() => setSelectedQaUid(firstUser?.uid ?? ''));
	}, [selectedQaUsers]);

	const onSubmit = async (data: LoginForm) => {
		setError(null);
		try {
			await loginWithEmail(data.email, data.password);
			router.push(next);
		} catch (err: any) {
			console.error('[Login Error Detallado]:', err);
			const firebaseError = err?.code || err?.message || 'Error desconocido';
			setError(`Error devuelto por Firebase: ${firebaseError}`);
		}
	};

	const handleGoogle = async () => {
		setError(null);
		try {
			await loginWithGoogle();
			router.push(next);
		} catch (err: any) {
			console.error('[Google Login Error]:', err);
			setError(`Error con Google: ${err?.code || err?.message}`);
		}
	};

	const handleQaLogin = () => {
		const selectedUser = selectedQaUsers.find((user) => user.uid === selectedQaUid);
		if (!selectedUser) {
			setError('Elegi un usuario QA para continuar.');
			return;
		}
		setError(null);
		qaLogin(selectedUser.uid, selectedUser.email);
		router.push(next);
	};

	return (
		<div className='flex min-h-screen'>
			<div className='relative hidden w-1/2 items-center justify-center bg-gradient-to-br from-primary via-primary to-secondary text-white lg:flex'>
				<div className='absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(47,143,123,0.35),_transparent_50%)]' />
				<div className='relative z-10 max-w-md space-y-6 p-12'>
					<div className='inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold'>
						<ShieldCheck className='h-4 w-4' />
						Multi-rol y multi-clinica
					</div>
					<h2 className='text-4xl font-bold leading-tight'>AMSA Core</h2>
					<p className='text-lg text-white/80'>{t('auth.subtitle')}</p>
					<ul className='space-y-2 text-sm text-white/80'>
						<li>Login real con Firebase cuando haga falta.</li>
						<li>Acceso QA directo por rol para probar mas rapido.</li>
						<li>Creacion real de clinicas, usuarios, pacientes y turnos.</li>
					</ul>
				</div>
			</div>
			<div className='mx-auto flex w-full max-w-xl flex-col justify-center px-8 py-16'>
				<div className='mb-8 space-y-2 text-center'>
					<div className='inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold text-primary'>
						Acceso
					</div>
					<h1 className='text-3xl font-semibold text-primary'>
						{t('hero.welcome')}
					</h1>
					<p className='text-sm text-muted-foreground'>
						Entrá como un usuario real o usá Firebase Auth.
					</p>
				</div>

				{qaLoginEnabled ? (
					<div className='mb-8 rounded-lg border border-primary/15 bg-primary/5 p-4'>
						<div className='mb-4 flex items-center gap-2'>
							<div className='flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary'>
								<UserCheck className='h-5 w-5' />
							</div>
							<div>
								<h2 className='font-semibold text-primary'>Acceso rapido QA</h2>
								<p className='text-xs text-muted-foreground'>
									Impersona usuarios reales sin escribir email ni password.
								</p>
							</div>
						</div>

						<div className='mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3'>
							{qaRoles.map((role) => {
								const count = qaUsersQuery.data?.roles[role.value]?.length ?? 0;
								const active = selectedQaRole === role.value;
								return (
									<Button
										key={role.value}
										type='button'
										variant={active ? 'default' : 'outline'}
										size='sm'
										onClick={() => setSelectedQaRole(role.value)}
										className='justify-between'
									>
										<span>{role.label}</span>
										<span className='text-xs opacity-70'>{count}</span>
									</Button>
								);
							})}
						</div>

						<div className='grid gap-3 sm:grid-cols-[1fr_auto]'>
							<Select
								value={selectedQaUid}
								onChange={(event) => setSelectedQaUid(event.target.value)}
								disabled={qaUsersQuery.isLoading || selectedQaUsers.length === 0}
							>
								{qaUsersQuery.isLoading ? (
									<option>Cargando usuarios...</option>
								) : selectedQaUsers.length ? (
									selectedQaUsers.map((user) => (
										<option key={user.uid} value={user.uid}>
											{user.name} - {user.email ?? user.uid}
										</option>
									))
								) : (
									<option>No hay usuarios para este rol</option>
								)}
							</Select>
							<Button
								type='button'
								onClick={handleQaLogin}
								disabled={qaUsersQuery.isLoading || !selectedQaUid}
							>
								{qaUsersQuery.isLoading ? (
									<Loader2 className='mr-2 h-4 w-4 animate-spin' />
								) : (
									<UserCheck className='mr-2 h-4 w-4' />
								)}
								Entrar
							</Button>
						</div>

						{qaUsersQuery.error ? (
							<p className='mt-3 text-sm text-destructive'>
								No pude cargar usuarios QA. Revisá ENABLE_QA_LOGIN.
							</p>
						) : null}
					</div>
				) : null}

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
							{isSubmitting ? 'Cargando...' : t('action.login')}
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
			</div>
		</div>
	);
}

export default function LoginPage() {
	return (
		<Suspense
			fallback={
				<div className='flex min-h-screen items-center justify-center'>
					Cargando...
				</div>
			}
		>
			<LoginContent />
		</Suspense>
	);
}
