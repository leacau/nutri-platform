'use client';

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { RoleGuard } from '../../../../components/guards';
import { ShieldPlus } from 'lucide-react';
import { UserAccount } from '../../../../lib/types';
import { apiClient } from '../../../../lib/api-client';
import { useAuth } from '../../../../providers/auth-provider';
import { useAuthedQuery } from '../../../../hooks/use-authed-query';
import { useClinic } from '../../../../providers/clinic-provider';
import { useForm } from 'react-hook-form';
import { useI18n } from '../../../../providers/i18n-provider';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

type InviteForm = {
	name: string;
	email: string;
	dni: string;
};

export default function StaffPage() {
	const qc = useQueryClient();
	const { activeClinicId } = useClinic();
	const { idToken } = useAuth();
	const { t } = useI18n();

	const inviteSchema = z.object({
		name: z.string().min(2, t('validation.nameRequired')),
		email: z.string().email(t('team.emailInvalid')),
		dni: z
			.string()
			.min(7, t('team.dniMin'))
			.max(8, t('team.dniMax'))
			.regex(/^\d+$/, t('team.onlyNumbers')),
	});

	const staffQuery = useAuthedQuery({
		queryKey: ['staff', activeClinicId],
		queryFn: (token, clinicId) => apiClient.staff(clinicId, token),
	});

	const {
		register,
		handleSubmit,
		reset,
		setValue,
		formState: { errors, isSubmitting },
	} = useForm<InviteForm>({
		resolver: zodResolver(inviteSchema),
	});

	const inviteMutation = useMutation({
		mutationFn: async (data: InviteForm) => {
			if (!activeClinicId) return;
			return apiClient.inviteMember(
				activeClinicId,
				{ ...data, role: 'staff' },
				idToken || undefined
			);
		},
		onSuccess: (data: any) => {
			qc.invalidateQueries({ queryKey: ['staff'] });
			reset();
			alert(data?.message || t('staff.invited'));
		},
		onError: () => alert(t('staff.inviteError')),
	});

	const handleDniBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
		const val = e.target.value;
		if (val.length < 7) return;
		try {
			const user = await apiClient.lookupUser(val, idToken || undefined);
			if (user) {
				setValue('name', user.name);
				setValue('email', user.email);
				alert(t('team.lookupFound', { name: user.name }));
			}
		} catch (e) {
			console.error(e);
		}
	};

	return (
		<RoleGuard allowed={['clinic_admin']}>
			<div className='space-y-6'>
				<div>
					<p className='text-sm text-muted-foreground'>
						{t('staff.management')}
					</p>
					<h1 className='text-2xl font-semibold text-primary'>
						{t('staff.title')}
					</h1>
				</div>
				<div className='grid gap-6 lg:grid-cols-[1.3fr,1fr]'>
					<Card>
						<CardHeader>
							<CardTitle>{t('staff.team')}</CardTitle>
						</CardHeader>
						<CardContent className='divide-y p-0'>
							{staffQuery.data?.map((member: UserAccount) => (
								<div
									key={member.id}
									className='flex items-center justify-between p-4'
								>
									<div>
										<p className='font-semibold'>{member.name}</p>
										<p className='text-xs text-muted-foreground'>
											{member.email}
										</p>
									</div>
									<span className='text-xs text-muted-foreground capitalize'>
										{member.role}
									</span>
								</div>
							))}
							{!staffQuery.data?.length ? (
								<p className='p-4 text-sm text-muted-foreground'>
									{t('staff.empty')}
								</p>
							) : null}
						</CardContent>
					</Card>

					<Card className='self-start border-primary/10 shadow-lg'>
						<CardHeader>
							<CardTitle className='flex items-center gap-2 text-lg'>
								<ShieldPlus className='h-4 w-4' />
								{t('staff.invite')}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<form
								onSubmit={handleSubmit((d) => inviteMutation.mutate(d))}
								className='space-y-3'
							>
								<div className='space-y-1'>
									<Label>DNI</Label>
									<Input
										placeholder={t('common.dniPlaceholder')}
										{...register('dni')}
										onBlur={handleDniBlur}
									/>
									{errors.dni && (
										<p className='text-xs text-red-500'>{errors.dni.message}</p>
									)}
								</div>

								<div className='space-y-1'>
									<Label>{t('common.name')}</Label>
									<Input placeholder={t('team.namePlaceholder')} {...register('name')} />
									{errors.name && (
										<p className='text-xs text-red-500'>
											{errors.name.message}
										</p>
									)}
								</div>

								<div className='space-y-1'>
									<Label>Email</Label>
									<Input
										type='email'
										placeholder={t('common.staffEmailPlaceholder')}
										{...register('email')}
									/>
									{errors.email && (
										<p className='text-xs text-red-500'>
											{errors.email.message}
										</p>
									)}
								</div>

								<Button
									className='w-full'
									type='submit'
									disabled={isSubmitting}
								>
									{t('team.sendInvitation')}
								</Button>
							</form>
						</CardContent>
					</Card>
				</div>
			</div>
		</RoleGuard>
	);
}
