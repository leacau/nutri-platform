'use client';

import { BellRing, Loader2, Palette, Save } from 'lucide-react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { apiClient } from '../../../../lib/api-client';
import { useAuth } from '../../../../providers/auth-provider';
import { useClinic } from '../../../../providers/clinic-provider';
import { useI18n } from '../../../../providers/i18n-provider';

export default function SettingsPage() {
	const { activeClinicId, activeClinic } = useClinic();
	const { idToken } = useAuth();
	const { t } = useI18n();
	const qc = useQueryClient();

	const [accentColor, setAccentColor] = useState('#2F8F7B');
	const [logoUrl, setLogoUrl] = useState('');
	const [whatsappEnabled, setWhatsappEnabled] = useState(true);
	const [emailEnabled, setEmailEnabled] = useState(true);

	const { data: settings, isLoading } = useQuery({
		queryKey: ['clinic-settings', activeClinicId],
		queryFn: () =>
			apiClient.clinicSettings(activeClinicId!, idToken ?? undefined),
		enabled: Boolean(activeClinicId && idToken),
	});

	useEffect(() => {
		if (settings) {
			if (settings.branding?.accentColor) {
				setAccentColor(settings.branding.accentColor);
			}
			if (settings.branding?.logoUrl) setLogoUrl(settings.branding.logoUrl);
			if (settings.reminderPreferences) {
				setWhatsappEnabled(settings.reminderPreferences.whatsappEnabled);
				setEmailEnabled(settings.reminderPreferences.emailEnabled);
			}
		}
	}, [settings]);

	const mutation = useMutation({
		mutationFn: async () => {
			return apiClient.saveClinicSettings(
				activeClinicId!,
				{
					branding: { accentColor, logoUrl: logoUrl || null },
					reminderPreferences: { whatsappEnabled, emailEnabled },
				},
				idToken ?? undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['clinic-settings', activeClinicId] });
			alert(t('settings.saveSuccess'));
		},
		onError: () => {
			alert(t('settings.permissionSaveError'));
		},
	});

	if (isLoading) {
		return (
			<div className='flex justify-center py-20'>
				<Loader2 className='h-8 w-8 animate-spin text-primary' />
			</div>
		);
	}

	return (
		<main className='mx-auto max-w-4xl px-6 py-8'>
			<div className='mb-8'>
				<h1 className='text-3xl font-bold text-slate-900 tracking-tight'>
					{t('settings.pageTitle')}
				</h1>
				<p className='text-slate-500 mt-1'>
					{t('settings.pageSubtitle', {
						name: activeClinic?.name || t('common.workspace'),
					})}
				</p>
			</div>

			<div className='space-y-6'>
				<Card className='border-slate-200 shadow-sm'>
					<CardHeader className='bg-slate-50/50 border-b border-slate-100 pb-4'>
						<CardTitle className='text-lg flex items-center gap-2'>
							<Palette className='h-5 w-5 text-blue-600' /> {t('settings.branding')}
						</CardTitle>
						<CardDescription>{t('settings.visualIdentityDetail')}</CardDescription>
					</CardHeader>
					<CardContent className='p-6 space-y-6'>
						<div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
							<div className='space-y-2'>
								<Label>{t('settings.accentColorLabel')}</Label>
								<div className='flex items-center gap-3'>
									<Input
										type='color'
										value={accentColor}
										onChange={(e) => setAccentColor(e.target.value)}
										className='w-14 h-10 p-1 cursor-pointer'
									/>
									<Input
										type='text'
										value={accentColor}
										onChange={(e) => setAccentColor(e.target.value)}
										className='font-mono uppercase'
									/>
								</div>
								<p className='text-xs text-muted-foreground mt-1'>
									{t('settings.accentColorHelp')}
								</p>
							</div>

							<div className='space-y-2'>
								<Label>{t('settings.logoUrl')}</Label>
								<Input
									type='url'
									placeholder='https://example.com/logo.png'
									value={logoUrl}
									onChange={(e) => setLogoUrl(e.target.value)}
								/>
								<p className='text-xs text-muted-foreground mt-1'>
									{t('settings.logoUrlHelp')}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card className='border-slate-200 shadow-sm'>
					<CardHeader className='bg-slate-50/50 border-b border-slate-100 pb-4'>
						<CardTitle className='text-lg flex items-center gap-2'>
							<BellRing className='h-5 w-5 text-amber-500' /> {t('settings.reminders')}
						</CardTitle>
						<CardDescription>{t('settings.remindersDetail')}</CardDescription>
					</CardHeader>
					<CardContent className='p-6 space-y-6'>
						<div className='flex items-center justify-between p-4 border border-slate-200 rounded-lg'>
							<div>
								<p className='font-semibold text-slate-900'>
									{t('settings.whatsappReminders')}
								</p>
								<p className='text-sm text-slate-500'>
									{t('settings.whatsappRemindersDetail')}
								</p>
							</div>
							<label className='relative inline-flex items-center cursor-pointer'>
								<input
									type='checkbox'
									className='sr-only peer'
									checked={whatsappEnabled}
									onChange={() => setWhatsappEnabled(!whatsappEnabled)}
								/>
								<div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
							</label>
						</div>

						<div className='flex items-center justify-between p-4 border border-slate-200 rounded-lg'>
							<div>
								<p className='font-semibold text-slate-900'>
									{t('settings.emailReminders')}
								</p>
								<p className='text-sm text-slate-500'>
									{t('settings.emailRemindersDetail')}
								</p>
							</div>
							<label className='relative inline-flex items-center cursor-pointer'>
								<input
									type='checkbox'
									className='sr-only peer'
									checked={emailEnabled}
									onChange={() => setEmailEnabled(!emailEnabled)}
								/>
								<div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
							</label>
						</div>
					</CardContent>
				</Card>

				<div className='flex justify-end pt-4'>
					<Button
						size='lg'
						onClick={() => mutation.mutate()}
						disabled={mutation.isPending}
						className='px-8'
					>
						{mutation.isPending ? (
							<Loader2 className='mr-2 h-5 w-5 animate-spin' />
						) : (
							<Save className='mr-2 h-5 w-5' />
						)}
						{t('settings.saveSettings')}
					</Button>
				</div>
			</div>
		</main>
	);
}
