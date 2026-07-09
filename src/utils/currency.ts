// Los precios del sistema se cotizan y manejan en DÓLARES (USD).
//
// Formato unificado: "US$ 1,234.56"
//  - separador de miles con coma y decimal con punto (formato en-US), coherente
//    con cómo se cargan los montos (el input usa punto como decimal);
//  - prefijo "US$" explícito para evitar cualquier ambigüedad con pesos.
//
// Usar este helper en todo el sistema en lugar de formatear a mano.
export const formatUSD = (
  value: number | string | null | undefined,
  options?: { decimals?: boolean },
): string => {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : 0;
  const minimumFractionDigits = options?.decimals === false ? 0 : 2;
  return `US$ ${safe.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits: 2,
  })}`;
};
