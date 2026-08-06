'use client';

import {
	Activity,
	Calculator,
	Hash,
	LayoutTemplate,
	Link as LinkIcon,
	Loader2,
	Pencil,
	Plus,
	Save,
	Trash2,
	Type,
} from 'lucide-react';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '../../../../components/ui/card';
import {
	MeasurementTemplate,
	TemplateField,
	TemplateFieldType,
} from '../../../../lib/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '../../../../components/ui/badge';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Select } from '../../../../components/ui/select';
import { apiClient } from '../../../../lib/api-client';
import { useAuth } from '../../../../providers/auth-provider';
import { useClinic } from '../../../../providers/clinic-provider';
import { useI18n } from '../../../../providers/i18n-provider';
import { useState } from 'react';

const generateSafeId = (label: string) => {
	return label
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
};

const STANDARD_MAPPINGS = [
	{ id: '', labelKey: 'measurement.mapping.none' },
	{ id: 'weight', labelKey: 'measurement.mapping.weight' },
	{ id: 'height', labelKey: 'measurement.mapping.height' },
	{ id: 'bmi', labelKey: 'measurement.mapping.bmi' },
	{ id: 'body_fat', labelKey: 'measurement.mapping.bodyFat' },
	{ id: 'visceral_fat', labelKey: 'measurement.mapping.visceralFat' },
	{ id: 'muscle', labelKey: 'measurement.mapping.muscle' },
];

export default function MeasurementTemplatesPage() {
	const { activeClinicId } = useClinic();
	const { idToken } = useAuth();
	const { t } = useI18n();
	const qc = useQueryClient();

	const [isCreating, setIsCreating] = useState(false);
	const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
		null,
	);

	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [fields, setFields] = useState<TemplateField[]>([]);

	const { data: templates, isLoading } = useQuery({
		queryKey: ['measurement-templates', activeClinicId],
		queryFn: () =>
			apiClient.getTemplates(activeClinicId!, idToken ?? undefined),
		enabled: Boolean(activeClinicId && idToken),
	});

	const saveMutation = useMutation({
		mutationFn: async () => {
			if (!name) throw new Error(t('measurement.nameRequired'));
			if (fields.length === 0)
				throw new Error(t('measurement.fieldRequired'));

			const safeFields = fields.map((f: TemplateField) => ({
				...f,
				id: generateSafeId(f.label) || f.id,
			}));

			const payload = { name, description, fields: safeFields };

			if (editingTemplateId) {
				return apiClient.updateTemplate(
					editingTemplateId,
					payload,
					activeClinicId!,
					idToken ?? undefined,
				);
			} else {
				return apiClient.createTemplate(
					payload,
					activeClinicId!,
					idToken ?? undefined,
				);
			}
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['measurement-templates'] });
			resetForm();
		},
		onError: (err: any) =>
			alert(err.message || t('measurement.saveError')),
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.deleteTemplate(id, activeClinicId!, idToken ?? undefined),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ['measurement-templates'] }),
	});

	const resetForm = () => {
		setIsCreating(false);
		setEditingTemplateId(null);
		setName('');
		setDescription('');
		setFields([]);
	};

	const startEditing = (template: MeasurementTemplate) => {
		setEditingTemplateId(template.id);
		setName(template.name);
		setDescription(template.description || '');
		setFields(template.fields);
		setIsCreating(true);
	};

	const addField = (type: TemplateFieldType) => {
		const newField: TemplateField = {
			id: `campo_${Date.now()}`,
			label: '',
			type,
			required: false,
			unit: '',
			decimals: type === 'formula' || type === 'number' ? 2 : undefined,
			standardMapping: '',
		};
		setFields([...fields, newField]);
	};

	const updateField = (index: number, updates: Partial<TemplateField>) => {
		const newFields = [...fields];
		newFields[index] = { ...newFields[index], ...updates };
		setFields(newFields);
	};

	const removeField = (index: number) => {
		setFields(fields.filter((_, i) => i !== index));
	};

	if (isLoading)
		return (
			<div className='flex justify-center py-20'>
				<Loader2 className='h-8 w-8 animate-spin text-primary' />
			</div>
		);

	return (
		<main className='mx-auto max-w-5xl px-6 py-8'>
			<div className='mb-8 flex justify-between items-center'>
				<div>
					<h1 className='text-3xl font-bold text-slate-900 flex items-center gap-3'>
						<Activity className='h-8 w-8 text-primary' /> {t('measurement.title')}
					</h1>
					<p className='text-slate-500 mt-1'>
						{t('measurement.subtitle')}
					</p>
				</div>
				{!isCreating && (
					<Button
						onClick={() => setIsCreating(true)}
						className='bg-primary hover:bg-primary/90'
					>
						<Plus className='h-4 w-4 mr-2' /> {t('measurement.newTemplate')}
					</Button>
				)}
			</div>

			{isCreating ? (
				<div className='space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500'>
					<Card className='border-primary/20 shadow-md'>
						<CardHeader className='bg-slate-50/50 border-b border-slate-100'>
							<CardTitle>
								{editingTemplateId
									? t('measurement.editTemplate')
									: t('measurement.templateConfig')}
							</CardTitle>
							<CardDescription>
								{t('measurement.templateHelp')}
							</CardDescription>
						</CardHeader>
						<CardContent className='p-6 space-y-4'>
							<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label>{t('measurement.templateName')}</Label>
									<Input
										value={name}
										onChange={(e) => setName(e.target.value)}
										placeholder={t('measurement.templateNamePlaceholder')}
									/>
								</div>
								<div className='space-y-2'>
									<Label>{t('measurement.description')}</Label>
									<Input
										value={description}
										onChange={(e) => setDescription(e.target.value)}
										placeholder={t('measurement.descriptionPlaceholder')}
									/>
								</div>
							</div>
						</CardContent>
					</Card>

					<div className='space-y-4'>
						<h3 className='text-lg font-semibold text-slate-800'>
							{t('measurement.dynamicFields')}
						</h3>
						{fields.map((field, index) => {
							const availableVars = fields.filter(
								(f, i) => f.type === 'number' && i !== index && f.label,
							);
							return (
								<Card
									key={index}
									className='border-slate-200 overflow-hidden relative'
								>
									<div className='flex flex-col md:flex-row items-stretch'>
										<div
											className={`w-full md:w-2 ${field.type === 'formula' ? 'bg-purple-500' : field.type === 'number' ? 'bg-blue-500' : 'bg-slate-300'}`}
										></div>
										<div className='flex-1 p-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-start'>
											<div className='md:col-span-4 space-y-2'>
												<Label>{t('measurement.fieldName')}</Label>
												<Input
													value={field.label}
													onChange={(e) =>
														updateField(index, { label: e.target.value })
													}
													placeholder={
														field.type === 'formula'
															? 'Ej: IMC'
															: 'Ej: Peso Actual'
													}
												/>
												{field.label && field.type !== 'formula' && (
													<p className='text-[10px] text-slate-400 font-mono'>
														Variable: {'{'} {generateSafeId(field.label)} {'}'}
													</p>
												)}
											</div>

											{/* NUEVO: MAPEO DE ESTÁNDARES MÉDICOS */}
											{(field.type === 'number' ||
												field.type === 'formula') && (
												<div className='md:col-span-4 space-y-2'>
													<Label className='flex items-center gap-1 text-emerald-700'>
														<LinkIcon className='h-3 w-3' /> {t('measurement.standardMapping')}
													</Label>
													<Select
														value={field.standardMapping || ''}
														onChange={(e) =>
															updateField(index, {
																standardMapping: e.target.value,
															})
														}
													>
														{STANDARD_MAPPINGS.map((map) => (
															<option key={map.id} value={map.id}>
																{t(map.labelKey)}
															</option>
														))}
													</Select>
													<p className='text-[10px] text-muted-foreground leading-tight'>
														{t('measurement.mappingHelp')}
													</p>
												</div>
											)}

											{field.type === 'number' && (
												<div className='md:col-span-3 space-y-2'>
													<Label>{t('measurement.unit')}</Label>
													<Input
														value={field.unit || ''}
														onChange={(e) =>
															updateField(index, { unit: e.target.value })
														}
														placeholder='Ej: kg, cm'
													/>
												</div>
											)}

											{field.type === 'formula' && (
												<div className='md:col-span-8 space-y-2 mt-2'>
													<Label className='text-purple-700'>
														{t('measurement.equation')}
													</Label>
													<Input
														value={field.formula || ''}
														onChange={(e) =>
															updateField(index, { formula: e.target.value })
														}
														placeholder='Ej: {peso} / (({altura}/100) * ({altura}/100))'
														className='font-mono text-sm border-purple-200 bg-purple-50 focus-visible:ring-purple-500'
													/>
													<div className='pt-2'>
														{availableVars.length > 0 ? (
															<>
																<p className='text-[11px] text-muted-foreground mb-2'>
																	{t('measurement.availableVariables')}
																</p>
																<div className='flex flex-wrap gap-2'>
																	{availableVars.map((v) => {
																		const varName = `{${generateSafeId(v.label)}}`;
																		return (
																			<Badge
																				key={v.id}
																				variant='outline'
																				className='cursor-grab active:cursor-grabbing border-purple-200 bg-purple-100/50 text-purple-700 hover:bg-purple-200 transition-colors select-none'
																				draggable
																				onDragStart={(e) =>
																					e.dataTransfer.setData(
																						'text/plain',
																						varName,
																					)
																				}
																				onClick={() => {
																					const current = field.formula || '';
																					const prefix =
																						current && !current.endsWith(' ')
																							? current + ' '
																							: current;
																					updateField(index, {
																						formula: prefix + varName,
																					});
																				}}
																			>
																				{v.label}
																			</Badge>
																		);
																	})}
																</div>
															</>
														) : (
															<p className='text-[11px] text-amber-600 mt-1'>
																{t('measurement.addNumberFirst')}
															</p>
														)}
													</div>
												</div>
											)}

											{(field.type === 'formula' ||
												field.type === 'number') && (
												<div
													className={`md:col-span-2 space-y-2 ${field.type === 'formula' ? 'mt-2' : ''}`}
												>
													<Label>{t('measurement.decimals')}</Label>
													<Input
														type='number'
														min='0'
														max='4'
														value={field.decimals || 0}
														onChange={(e) =>
															updateField(index, {
																decimals: parseInt(e.target.value),
															})
														}
													/>
												</div>
											)}

											<div className='absolute top-2 right-2'>
												<Button
													variant='ghost'
													size='icon'
													className='text-red-400 hover:text-red-700 hover:bg-red-50 h-8 w-8'
													onClick={() => removeField(index)}
												>
													<Trash2 className='h-4 w-4' />
												</Button>
											</div>
										</div>
									</div>
								</Card>
							);
						})}

						<div className='flex flex-wrap gap-3 pt-2'>
							<Button
								variant='outline'
								onClick={() => addField('number')}
								className='border-blue-200 text-blue-700 hover:bg-blue-50'
							>
								<Hash className='mr-2 h-4 w-4' /> {t('measurement.addNumber')}
							</Button>
							<Button
								variant='outline'
								onClick={() => addField('text')}
								className='border-slate-200 text-slate-700 hover:bg-slate-50'
							>
								<Type className='mr-2 h-4 w-4' /> {t('measurement.addText')}
							</Button>
							<Button
								variant='outline'
								onClick={() => addField('formula')}
								className='border-purple-200 text-purple-700 hover:bg-purple-50'
							>
								<Calculator className='mr-2 h-4 w-4' /> {t('measurement.addFormula')}
							</Button>
						</div>
					</div>

					<div className='flex justify-end gap-3 pt-6 border-t'>
						<Button variant='ghost' onClick={resetForm}>
							{t('action.cancel')}
						</Button>
						<Button
							onClick={() => saveMutation.mutate()}
							disabled={saveMutation.isPending || fields.length === 0 || !name}
						>
							{saveMutation.isPending ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<Save className='mr-2 h-4 w-4' />
							)}
							{editingTemplateId ? t('measurement.saveChanges') : t('measurement.saveTemplate')}
						</Button>
					</div>
				</div>
			) : (
				<div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
					{templates?.map((template) => (
						<Card
							key={template.id}
							className='border-slate-200 hover:border-primary/30 transition-colors shadow-sm group'
						>
							<CardHeader>
								<CardTitle className='text-lg flex justify-between items-start'>
									<span className='truncate pr-2'>{template.name}</span>
									<div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
										<Button
											variant='ghost'
											size='icon'
											className='h-8 w-8 text-slate-400 hover:text-blue-600'
											onClick={() => startEditing(template)}
										>
											<Pencil className='h-4 w-4' />
										</Button>
										<Button
											variant='ghost'
											size='icon'
											className='h-8 w-8 text-slate-400 hover:text-red-600'
											onClick={() => {
												if (
													confirm(
														t('measurement.deleteConfirm'),
													)
												)
													deleteMutation.mutate(template.id);
											}}
										>
											<Trash2 className='h-4 w-4' />
										</Button>
									</div>
								</CardTitle>
								{template.description && (
									<CardDescription className='truncate'>
										{template.description}
									</CardDescription>
								)}
							</CardHeader>
							<CardContent>
								<div className='flex flex-wrap gap-2'>
									<Badge
										variant='secondary'
										className='bg-slate-100 text-slate-600'
									>
										{t('measurement.fieldsCount', { count: template.fields.length })}
									</Badge>
									{template.fields.some((f) => f.standardMapping) && (
										<Badge
											variant='outline'
											className='border-emerald-200 text-emerald-700 bg-emerald-50'
										>
											<LinkIcon className='h-3 w-3 mr-1' /> {t('measurement.omsIntelligence')}
										</Badge>
									)}
								</div>
							</CardContent>
						</Card>
					))}
					{templates?.length === 0 && (
						<div className='col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50'>
							<LayoutTemplate className='h-10 w-10 text-slate-300 mx-auto mb-3' />
							<h3 className='text-lg font-medium text-slate-700'>
								{t('measurement.emptyTitle')}
							</h3>
							<p className='text-sm text-slate-500 mt-1'>
								{t('measurement.emptyDetail')}
							</p>
						</div>
					)}
				</div>
			)}
		</main>
	);
}
