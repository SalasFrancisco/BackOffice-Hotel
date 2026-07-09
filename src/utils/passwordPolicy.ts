// Política de contraseña ÚNICA para todo el sistema (alta/edición de usuario,
// recuperación y cambio forzado). Así los requisitos son siempre los mismos.

export const PASSWORD_MIN_LENGTH = 8;

// Un "carácter especial" = cualquier cosa que no sea letra, número ni espacio.
const SPECIAL_CHAR_RE = /[^A-Za-z0-9\s]/;

export type PasswordRequirement = { key: string; label: string; ok: boolean };

export const getPasswordRequirements = (password: string): PasswordRequirement[] => [
  { key: 'length', label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`, ok: password.length >= PASSWORD_MIN_LENGTH },
  { key: 'upper', label: 'Una letra mayúscula', ok: /[A-Z]/.test(password) },
  { key: 'lower', label: 'Una letra minúscula', ok: /[a-z]/.test(password) },
  { key: 'number', label: 'Un número', ok: /\d/.test(password) },
  { key: 'special', label: 'Un carácter especial (!@#$…)', ok: SPECIAL_CHAR_RE.test(password) },
];

export const isValidPassword = (password: string): boolean =>
  getPasswordRequirements(password).every((requirement) => requirement.ok);

// Mensaje único de requisitos, para usar en validaciones.
export const PASSWORD_POLICY_MESSAGE =
  `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres e incluir mayúscula, minúscula, número y un carácter especial.`;

export type PasswordStrength = {
  level: 'empty' | 'weak' | 'medium' | 'good' | 'strong';
  label: string;
  tone: '' | 'red' | 'yellow' | 'green' | 'blue';
  // 0..4 para pintar la barra
  score: number;
};

// Fuerza de la contraseña para el medidor de color:
//  - rojo (Débil): no cumple los requisitos (le falta bastante)
//  - amarillo (Media): casi cumple (le falta poco)
//  - verde (Buena): cumple todos los requisitos
//  - azul (Muy fuerte): cumple todos + es larga (>= 12)
export const getPasswordStrength = (password: string): PasswordStrength => {
  if (!password) return { level: 'empty', label: '', tone: '', score: 0 };

  const requirements = getPasswordRequirements(password);
  const met = requirements.filter((requirement) => requirement.ok).length;

  if (met < requirements.length) {
    return met <= 2
      ? { level: 'weak', label: 'Débil', tone: 'red', score: 1 }
      : { level: 'medium', label: 'Media', tone: 'yellow', score: 2 };
  }

  return password.length >= 12
    ? { level: 'strong', label: 'Muy fuerte', tone: 'blue', score: 4 }
    : { level: 'good', label: 'Buena', tone: 'green', score: 3 };
};
