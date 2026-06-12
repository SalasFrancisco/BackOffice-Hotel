export const SERVICE_INCOME_CATEGORY = {
  ALIMENTOS_BEBIDAS: 'ALIMENTOS_BEBIDAS',
  EQUIPAMIENTO_TECNICO: 'EQUIPAMIENTO_TECNICO',
  DECORACION: 'DECORACION',
  OTROS_SERVICIOS: 'OTROS_SERVICIOS',
} as const;

export type ServiceIncomeCategory =
  typeof SERVICE_INCOME_CATEGORY[keyof typeof SERVICE_INCOME_CATEGORY];

export const SERVICE_INCOME_CATEGORY_OPTIONS: ReadonlyArray<{
  value: ServiceIncomeCategory;
  label: string;
}> = [
  {
    value: SERVICE_INCOME_CATEGORY.ALIMENTOS_BEBIDAS,
    label: 'Alimentos y bebidas',
  },
  {
    value: SERVICE_INCOME_CATEGORY.EQUIPAMIENTO_TECNICO,
    label: 'Equipamiento técnico',
  },
  {
    value: SERVICE_INCOME_CATEGORY.DECORACION,
    label: 'Decoración',
  },
  {
    value: SERVICE_INCOME_CATEGORY.OTROS_SERVICIOS,
    label: 'Otros servicios',
  },
];

export const DEFAULT_SERVICE_INCOME_CATEGORY =
  SERVICE_INCOME_CATEGORY.OTROS_SERVICIOS;

export const normalizeServiceIncomeCategory = (
  value?: string | null,
): ServiceIncomeCategory => {
  const matchingOption = SERVICE_INCOME_CATEGORY_OPTIONS.find(
    (option) => option.value === value,
  );

  return matchingOption?.value || DEFAULT_SERVICE_INCOME_CATEGORY;
};

export const getServiceIncomeCategoryLabel = (value?: string | null) => {
  const normalizedValue = normalizeServiceIncomeCategory(value);
  return SERVICE_INCOME_CATEGORY_OPTIONS.find(
    (option) => option.value === normalizedValue,
  )?.label || 'Otros servicios';
};
