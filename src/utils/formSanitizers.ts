import type { KeyboardEvent } from 'react';

const INVALID_NUMBER_KEYS = new Set(['e', 'E', '+', '-', ' ']);

export const preventInvalidNumberKeys = (event: KeyboardEvent<HTMLInputElement>) => {
  if (INVALID_NUMBER_KEYS.has(event.key)) {
    event.preventDefault();
  }
};

export const sanitizeIntegerInput = (value: string) => value.replace(/\D/g, '');

export const sanitizeDecimalInput = (value: string) => {
  const sanitized = value.replace(/[^\d.]/g, '');
  const [integerPart, ...decimalParts] = sanitized.split('.');

  if (!decimalParts.length) {
    return integerPart;
  }

  return `${integerPart}.${decimalParts.join('')}`;
};

export const sanitizePhoneInput = (value: string) => value.replace(/\D/g, '');

export const hasNonWhitespaceValue = (value?: string | null) => (value ?? '').trim().length > 0;
