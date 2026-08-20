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
	MeasurementReferenceRange,
	MeasurementStandard,
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

type StandardRangeForm = {
	label: string;
	sex: 'all' | 'male' | 'female' | 'other';
	ageMin: string;
	ageMax: string;
	min: string;
	max: string;
	referenceValue: string;
};

const emptyStandardRange = (): StandardRangeForm => ({
	label: '',
	sex: 'all',
	ageMin: '',
	ageMax: '',
	min: '',
	max: '',
	referenceValue: '',
});

const toOptionalNumber = (value: string) => {
	const clean = value.trim();
	if (!clean) return null;
	const parsed = Number(clean);
	return Number.isFinite(parsed) ? parsed : null;
};

const toStandardSnapshot = (standard: MeasurementStandard) => ({
	id: standard.id,
	name: standard.name,
	...(standard.unit ? { unit: standard.unit } : {}),
	...(standard.category ? { category: standard.category } : {}),
	referenceRanges: standard.referenceRanges,
});

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
	const [editingStandardId, setEditingStandardId] = useState<string | null>(null);
	const [standardName, setStandardName] = useState('');
	const [standardUnit, setStandardUnit] = useState('');
	const [standardCategory, setStandardCategory] = useState('');
	const [standardDescription, setStandardDescription] = useState('');
	const [standardRanges, setStandardRanges] = useState<StandardRangeForm[]>([
		emptyStandardRange(),
	]);

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
	const { data: standards, isLoading: isLoadingStandards } = useQuery({
		queryKey: ['measurement-standards', activeClinicId],
		queryFn: () =>
			apiClient.measurementStandards(activeClinicId!, idToken ?? undefined),
		enabled: Boolean(activeClinicId && idToken),
	});

	const standardsByValue = new Map(
		(standards ?? []).map((standard) => [`standard:${standard.id}`, standard]),
	);

	const deleteMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.deleteTemplate(id, activeClinicId!, idToken ?? undefined),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ['measurement-templates'] }),
	});

	const resetStandardForm = () => {
		setEditingStandardId(null);
		setStandardName('');
		setStandardUnit('');
		setStandardCategory('');
		setStandardDescription('');
		setStandardRanges([emptyStandardRange()]);
	};

	const buildStandardPayload = () => {
		const referenceRanges: MeasurementReferenceRange[] = standardRanges
			.map((range) => ({
				label: range.label.trim(),
				sex: range.sex,
				ageMin: toOptionalNumber(range.ageMin),
				ageMax: toOptionalNumber(range.ageMax),
				min: toOptionalNumber(range.min),
				max: toOptionalNumber(range.max),
				referenceValue: toOptionalNumber(range.referenceValue),
			}))
			.filter(
				(range) =>
					range.min !== null ||
					range.max !== null ||
					range.referenceValue !== null,
			);
		if (!standardName.trim()) throw new Error(t('measurement.standardNameRequired'));
		if (!referenceRanges.length) {
			throw new Error(t('measurement.standardRangeRequired'));
		}
		return {
			name: standardName.trim(),
			unit: standardUnit.trim(),
			category: standardCategory.trim(),
			description: standardDescription.trim(),
			referenceRanges,
			isActive: true,
		};
	};

	const saveStandardMutation = useMutation({
		mutationFn: async () => {
			const payload = buildStandardPayload();
			if (editingStandardId) {
				return apiClient.updateMeasurementStandard(
					editingStandardId,
					payload,
					activeClinicId!,
					idToken ?? undefined,
				);
			}
			return apiClient.createMeasurementStandard(
				payload,
				activeClinicId!,
				idToken ?? undefined,
			);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['measurement-standards'] });
			resetStandardForm();
		},
		onError: (err: any) => alert(err.message || t('measurement.standardSaveError')),
	});

	const deleteStandardMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.deleteMeasurementStandard(
				id,
				activeClinicId!,
				idToken ?? undefined,
			),
		onSuccess: () =>
			qc.invalidateQueries({ queryKey: ['measurement-standards'] }),
	});

	const startEditingStandard = (standard: MeasurementStandard) => {
		setEditingStandardId(standard.id);
		setStandardName(standard.name);
		setStandardUnit(standard.unit || '');
		setStandardCategory(standard.category || '');
		setStandardDescription(standard.description || '');
		setStandardRanges(
			standard.referenceRanges.map((range) => ({
				label: range.label || '',
				sex: range.sex || 'all',
				ageMin: range.ageMin == null ? '' : String(range.ageMin),
				ageMax: range.ageMax == null ? '' : String(range.ageMax),
				min: range.min == null ? '' : String(range.min),
				max: range.max == null ? '' : String(range.max),
				referenceValue:
					range.referenceValue == null ? '' : String(range.referenceValue),
			})),
		);
	};

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

			<Card className='mb-8 border-emerald-100'>
				<CardHeader>
					<CardTitle className='flex items-center gap-2 text-lg'>
						<LinkIcon className='h-4 w-4 text-emerald-700' />
						{t('measurement.standardRepository')}
					</CardTitle>
					<CardDescription>
						{t('measurement.standardRepositoryHelp')}
					</CardDescription>
				</CardHeader>
				<CardContent className='space-y-5'>
					<div className='grid gap-3 md:grid-cols-4'>
						<div className='space-y-1 md:col-span-2'>
							<Label>{t('measurement.standardName')}</Label>
							<Input
								value={standardName}
								onChange={(e) => setStandardName(e.target.value)}
								placeholder={t('measurement.standardNamePlaceholder')}
							/>
						</div>
						<div className='space-y-1'>
							<Label>{t('measurement.unit')}</Label>
							<Input
								value={standardUnit}
								onChange={(e) => setStandardUnit(e.target.value)}
								placeholder='mg/dL, %, kg/m2'
							/>
						</div>
						<div className='space-y-1'>
							<Label>{t('measurement.standardCategory')}</Label>
							<Input
								value={standardCategory}
								onChange={(e) => setStandardCategory(e.target.value)}
								placeholder={t('measurement.standardCategoryPlaceholder')}
							/>
						</div>
						<div className='space-y-1 md:col-span-4'>
							<Label>{t('measurement.description')}</Label>
							<Input
								value={standardDescription}
								onChange={(e) => setStandardDescription(e.target.value)}
								placeholder={t('measurement.standardDescriptionPlaceholder')}
							/>
						</div>
					</div>

					<div className='space-y-3'>
						<div className='flex items-center justify-between gap-3'>
							<h3 className='text-sm font-semibold text-slate-800'>
								{t('measurement.referenceRanges')}
							</h3>
							<Button
								type='button'
								variant='outline'
								size='sm'
								onClick={() =>
									setStandardRanges((prev) => [...prev, emptyStandardRange()])
								}
							>
								<Plus className='mr-2 h-4 w-4' />
								{t('measurement.addRange')}
							</Button>
						</div>
						{standardRanges.map((range, index) => (
							<div
								key={index}
								className='grid gap-2 rounded-lg border bg-slate-50/60 p-3 md:grid-cols-8'
							>
								<Input
									className='md:col-span-2'
									value={range.label}
									onChange={(e) =>
										setStandardRanges((prev) =>
											prev.map((item, i) =>
												i === index ? { ...item, label: e.target.value } : item,
											),
										)
									}
									placeholder={t('measurement.rangeLabelPlaceholder')}
								/>
								<Select
									value={range.sex}
									onChange={(e) =>
										setStandardRanges((prev) =>
											prev.map((item, i) =>
												i === index
													? {
															...item,
															sex: e.target.value as StandardRangeForm['sex'],
														}
													: item,
											),
										)
									}
								>
									<option value='all'>{t('measurement.sexAll')}</option>
									<option value='female'>{t('sex.female')}</option>
									<option value='male'>{t('sex.male')}</option>
									<option value='other'>{t('sex.other')}</option>
								</Select>
								<Input
									type='number'
									value={range.ageMin}
									onChange={(e) =>
										setStandardRanges((prev) =>
											prev.map((item, i) =>
												i === index ? { ...item, ageMin: e.target.value } : item,
											),
										)
									}
									placeholder={t('measurement.ageMin')}
								/>
								<Input
									type='number'
									value={range.ageMax}
									onChange={(e) =>
										setStandardRanges((prev) =>
											prev.map((item, i) =>
												i === index ? { ...item, ageMax: e.target.value } : item,
											),
										)
									}
									placeholder={t('measurement.ageMax')}
								/>
								<Input
									type='number'
									value={range.min}
									onChange={(e) =>
										setStandardRanges((prev) =>
											prev.map((item, i) =>
												i === index ? { ...item, min: e.target.value } : item,
											),
										)
									}
									placeholder={t('measurement.normalMin')}
								/>
								<Input
									type='number'
									value={range.max}
									onChange={(e) =>
										setStandardRanges((prev) =>
											prev.map((item, i) =>
												i === index ? { ...item, max: e.target.value } : item,
											),
										)
									}
									placeholder={t('measurement.normalMax')}
								/>
								<div className='flex gap-2'>
									<Input
										type='number'
										value={range.referenceValue}
										onChange={(e) =>
											setStandardRanges((prev) =>
												prev.map((item, i) =>
													i === index
														? { ...item, referenceValue: e.target.value }
														: item,
												),
											)
										}
										placeholder={t('measurement.referenceValue')}
									/>
									<Button
										type='button'
										variant='ghost'
										size='icon'
										disabled={standardRanges.length <= 1}
										onClick={() =>
											setStandardRanges((prev) =>
												prev.filter((_item, i) => i !== index),
											)
										}
									>
										<Trash2 className='h-4 w-4' />
									</Button>
								</div>
							</div>
						))}
					</div>

					<div className='flex flex-wrap justify-end gap-2'>
						{editingStandardId ? (
							<Button type='button' variant='ghost' onClick={resetStandardForm}>
								{t('action.cancel')}
							</Button>
						) : null}
						<Button
							type='button'
							onClick={() => saveStandardMutation.mutate()}
							disabled={saveStandardMutation.isPending}
						>
							{saveStandardMutation.isPending ? (
								<Loader2 className='mr-2 h-4 w-4 animate-spin' />
							) : (
								<Save className='mr-2 h-4 w-4' />
							)}
							{editingStandardId
								? t('measurement.saveStandardChanges')
								: t('measurement.saveStandard')}
						</Button>
					</div>

					<div className='grid gap-3 md:grid-cols-2'>
						{isLoadingStandards ? (
							<p className='text-sm text-muted-foreground'>
								{t('common.loading')}
							</p>
						) : null}
						{standards?.map((standard) => (
							<div
								key={standard.id}
								className='flex items-start justify-between gap-3 rounded-lg border p-3'
							>
								<div>
									<p className='font-semibold text-slate-900'>
										{standard.name}
										{standard.unit ? (
											<span className='text-sm font-normal text-muted-foreground'>
												{' '}
												({standard.unit})
											</span>
										) : null}
									</p>
									<p className='text-xs text-muted-foreground'>
										{standard.category || t('measurement.noCategory')} ·{' '}
										{t('measurement.rangesCount', {
											count: standard.referenceRanges.length,
										})}
									</p>
								</div>
								<div className='flex gap-1'>
									<Button
										type='button'
										variant='ghost'
										size='icon'
										onClick={() => startEditingStandard(standard)}
									>
										<Pencil className='h-4 w-4' />
									</Button>
									<Button
										type='button'
										variant='ghost'
										size='icon'
										onClick={() => deleteStandardMutation.mutate(standard.id)}
									>
										<Trash2 className='h-4 w-4 text-red-500' />
									</Button>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>

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
															? t('measurement.fieldNamePlaceholderFormula')
															: t('measurement.fieldNamePlaceholderNumber')
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
														onChange={(e) => {
															const value = e.target.value;
															const standard = standardsByValue.get(value);
															updateField(index, {
																standardMapping: value,
																standardReference: standard
																	? toStandardSnapshot(standard)
																	: undefined,
															});
														}}
													>
														{STANDARD_MAPPINGS.map((map) => (
															<option key={map.id} value={map.id}>
																{t(map.labelKey)}
															</option>
														))}
														{standards?.length ? (
															<optgroup label={t('measurement.customStandards')}>
																{standards.map((standard) => (
																	<option
																		key={standard.id}
																		value={`standard:${standard.id}`}
																	>
																		{standard.name}
																		{standard.unit ? ` (${standard.unit})` : ''}
																	</option>
																))}
															</optgroup>
														) : null}
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
														placeholder={t('measurement.unitPlaceholder')}
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
														placeholder={t('measurement.equationPlaceholder')}
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
