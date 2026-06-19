import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { Buffer } from "node:buffer";
import nodemailer from "npm:nodemailer@6.9.16";
import { createClient } from "npm:@supabase/supabase-js@2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
// pdfmake is imported dynamically at runtime only when PDF generation is needed

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const parseCsvEnv = (value?: string | null) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parsePositiveIntegerEnv = (
  value: string | undefined,
  fallback: number,
) => {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ALLOWED_ORIGINS = parseCsvEnv(Deno.env.get("ALLOWED_ORIGINS"));
const RATE_LIMIT_HASH_SECRET =
  Deno.env.get("RATE_LIMIT_HASH_SECRET") || SUPABASE_SERVICE_ROLE_KEY;

const isOriginAllowed = (origin: string) => {
  if (!ALLOWED_ORIGINS.length) return true;
  return ALLOWED_ORIGINS.includes(origin);
};

const app = new Hono();

app.use("*", logger(console.log));

app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) return ALLOWED_ORIGINS.length ? "" : "*";
      return isOriginAllowed(origin) ? origin : "";
    },
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length", "Retry-After"],
    maxAge: 600,
  }),
);

app.get("/make-server-484a241a/health", (c) => c.json({ status: "ok" }));
// Also expose the same health route under /server prefix (some invocations
// arrive with the function name included in the path).
app.get("/server/make-server-484a241a/health", (c) => c.json({ status: "ok" }));

// PDF font loading and pdfmake are performed lazily inside the PDF builder

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(value);

const formatBillableDayUnits = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

const PRESUPUESTO_TEXT_REPLACEMENTS: Array<[string, string]> = [
  ["TelÃ©fono", "Teléfono"],
  ["SalÃ³n", "Salón"],
  ["DistribuciÃ³n", "Distribución"],
  ["Sin distribuciÃ³n definida", "Sin distribución definida"],
  ["Capacidad mÃ¡xima", "Capacidad máxima"],
  ["Fecha de emisiÃ³n", "Fecha de emisión"],
  ["VÃ¡lido hasta", "Válido hasta"],
  ["7 dÃ­as corridos", "7 días corridos"],
  ["InformaciÃ³n del cliente", "Información del cliente"],
  ["InformaciÃ³n del evento", "Información del evento"],
  ["SalÃ³n contratado", "Salón contratado"],
  ["SalÃ³n y descripciÃ³n", "Salón y descripción"],
  ["Cantidad (dÃƒÂ­as)", "Reserva exacta"],
  ["Cantidad (dÃ­as)", "Reserva exacta"],
  ["Servicio y descripciÃ³n", "Servicio y descripción"],
  ["Total salÃ³n", "Total salón"],
];

const PRESUPUESTO_MOJIBAKE_REPLACEMENTS: Array<[string, string]> = [
  ["\u00C3\u00A1", "\u00E1"],
  ["\u00C3\u00A9", "\u00E9"],
  ["\u00C3\u00AD", "\u00ED"],
  ["\u00C3\u00B3", "\u00F3"],
  ["\u00C3\u00BA", "\u00FA"],
  ["\u00C3\u00B1", "\u00F1"],
  ["\u00C3\u0081", "\u00C1"],
  ["\u00C3\u0089", "\u00C9"],
  ["\u00C3\u008D", "\u00CD"],
  ["\u00C3\u0093", "\u00D3"],
  ["\u00C3\u009A", "\u00DA"],
  ["\u00C3\u0091", "\u00D1"],
  ["\u00C3\u0192\u00C2\u00A1", "\u00E1"],
  ["\u00C3\u0192\u00C2\u00A9", "\u00E9"],
  ["\u00C3\u0192\u00C2\u00AD", "\u00ED"],
  ["\u00C3\u0192\u00C2\u00B3", "\u00F3"],
  ["\u00C3\u0192\u00C2\u00BA", "\u00FA"],
  ["\u00C3\u0192\u00C2\u00B1", "\u00F1"],
  ["\u00C3\u0192\u00E2\u20AC\u0161", "\u00C1"],
  ["\u00C3\u0192\u2030", "\u00C9"],
  ["\u00C3\u0192\u00C2\u008D", "\u00CD"],
  ["\u00C3\u0192\u00C2\u0093", "\u00D3"],
  ["\u00C3\u0192\u00C2\u009A", "\u00DA"],
  ["\u00C3\u0192\u00C2\u0091", "\u00D1"],
];

const normalizePresupuestoText = (value: string): string =>
  PRESUPUESTO_MOJIBAKE_REPLACEMENTS.reduce(
    (acc, [searchValue, replaceValue]) => acc.split(searchValue).join(replaceValue),
    PRESUPUESTO_TEXT_REPLACEMENTS.reduce(
      (acc, [searchValue, replaceValue]) => acc.split(searchValue).join(replaceValue),
      value,
    ),
  );

const normalizePdfDocumentNode = (value: unknown): unknown => {
  if (typeof value === "string") {
    return normalizePresupuestoText(value);
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      value[index] = normalizePdfDocumentNode(item);
    });
    return value;
  }

  if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, nestedValue]) => {
      (value as Record<string, unknown>)[key] = normalizePdfDocumentNode(nestedValue);
    });
  }

  return value;
};

const normalizeSalonContractTable = (docDefinition: Record<string, unknown>) => {
  const content = Array.isArray(docDefinition.content) ? docDefinition.content : [];

  content.forEach((item) => {
    if (!item || typeof item !== "object" || !("table" in item)) return;

    const table = (item as { table?: { widths?: unknown[]; body?: unknown[] } }).table;
    const widths = Array.isArray(table?.widths) ? table.widths : null;
    const body = Array.isArray(table?.body) ? table.body : null;
    const headerRow = Array.isArray(body?.[0]) ? body[0] as unknown[] : null;

    if (!widths || !body || !headerRow) return;
    if (widths.length !== 3 || headerRow.length !== 4) return;

    body[0] = [headerRow[0], headerRow[2], headerRow[3]];
  });
};

const formatDate = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: HOTEL_TIME_ZONE,
  });
};

const formatTime = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: HOTEL_TIME_ZONE,
  });
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const formatDateValue = (date: Date) =>
  date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: HOTEL_TIME_ZONE,
  });

const sanitizeFileNamePart = (value: string) =>
  (value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);

const formatDateForFileName = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "sin-fecha";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
};

const buildPresupuestoFileName = (input: {
  nombreBase?: string | null;
  tipoEvento?: string | null;
  fechaInicio: string;
  fallbackEvento?: string | null;
}) => {
  const evento =
    sanitizeFileNamePart(input.nombreBase || "") ||
    sanitizeFileNamePart(input.tipoEvento || "") ||
    sanitizeFileNamePart(input.fallbackEvento || "") ||
    "Evento";
  const fecha = formatDateForFileName(input.fechaInicio);
  return `${evento} - ${fecha}.pdf`;
};

const hasNonWhitespaceValue = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const extractTipoEventoFromObservaciones = (observaciones?: string | null) => {
  if (!hasNonWhitespaceValue(observaciones)) return null;

  const firstLine = observaciones
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine || null;
};

const formatDatePartInTimeZone = (value: string | Date, timeZone = HOTEL_TIME_ZONE) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
};

const formatTimePartInTimeZone = (value: string | Date, timeZone = HOTEL_TIME_ZONE) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  if (!hour || !minute) return null;

  return `${hour}:${minute}`;
};

const parseIsoDateToUtcTimestamp = (isoDate: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const utcTimestamp = Date.UTC(year, month - 1, day);
  const parsedDate = new Date(utcTimestamp);
  if (
    parsedDate.getUTCFullYear() !== year
    || parsedDate.getUTCMonth() !== month - 1
    || parsedDate.getUTCDate() !== day
  ) {
    return null;
  }

  return utcTimestamp;
};

const getEventDaysCount = (startIsoDate: string | null, endIsoDate: string | null): number => {
  if (!startIsoDate || !endIsoDate) return 1;

  const startTimestamp = parseIsoDateToUtcTimestamp(startIsoDate);
  const endTimestamp = parseIsoDateToUtcTimestamp(endIsoDate);
  if (startTimestamp === null || endTimestamp === null || endTimestamp < startTimestamp) {
    return 1;
  }

  return Math.floor((endTimestamp - startTimestamp) / DAY_MS) + 1;
};

const parseTimeTextToMinutes = (value?: string | null): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours)
    || !Number.isInteger(minutes)
    || hours < 0
    || hours > 23
    || minutes < 0
    || minutes > 59
  ) {
    return null;
  }

  return (hours * 60) + minutes;
};

const roundBillableDayUnits = (value: number) =>
  Math.round(value * 100) / 100;

const calculateSalonBillableDayUnits = (input: {
  startIsoDate: string | null;
  endIsoDate: string | null;
  startTime?: string | null;
  endTime?: string | null;
}) => {
  const totalDays = getEventDaysCount(input.startIsoDate, input.endIsoDate);
  if (totalDays <= 1) return 1;

  const startMinutes = parseTimeTextToMinutes(input.startTime);
  const endMinutes = parseTimeTextToMinutes(input.endTime);
  const startDayRate = startMinutes !== null && startMinutes >= (15 * 60) ? 0.65 : 1;
  const endDayRate = endMinutes !== null && endMinutes < (15 * 60) ? 0.65 : 1;

  return roundBillableDayUnits(
    Math.max(1, Math.max(0, totalDays - 2) + startDayRate + endDayRate),
  );
};

const getEventDaysCountFromDateTimes = (
  startValue?: string | null,
  endValue?: string | null,
  timeZone = HOTEL_TIME_ZONE,
) => {
  const startDatePart = startValue ? formatDatePartInTimeZone(startValue, timeZone) : null;
  const endDatePart = endValue ? formatDatePartInTimeZone(endValue, timeZone) : null;
  return getEventDaysCount(startDatePart, endDatePart);
};

const calculateSalonBillableDayUnitsFromDateTimes = (
  startValue?: string | null,
  endValue?: string | null,
  timeZone = HOTEL_TIME_ZONE,
) => {
  const startDatePart = startValue ? formatDatePartInTimeZone(startValue, timeZone) : null;
  const endDatePart = endValue ? formatDatePartInTimeZone(endValue, timeZone) : null;
  const startTimePart = startValue ? formatTimePartInTimeZone(startValue, timeZone) : null;
  const endTimePart = endValue ? formatTimePartInTimeZone(endValue, timeZone) : null;

  return calculateSalonBillableDayUnits({
    startIsoDate: startDatePart,
    endIsoDate: endDatePart,
    startTime: startTimePart,
    endTime: endTimePart,
  });
};

const getSalonBillingNotes = (fechaInicio: string, fechaFin: string) => {
  const startDatePart = formatDatePartInTimeZone(fechaInicio);
  const endDatePart = formatDatePartInTimeZone(fechaFin);
  if (!startDatePart || !endDatePart || startDatePart === endDatePart) {
    return [] as string[];
  }

  const notes: string[] = [];
  const startMinutes = parseTimeTextToMinutes(formatTimePartInTimeZone(fechaInicio) || "");
  const endMinutes = parseTimeTextToMinutes(formatTimePartInTimeZone(fechaFin) || "");

  if (startMinutes !== null && startMinutes >= (15 * 60)) {
    notes.push("Día inicial: se cobra el 65% del salón por media jornada.");
  }

  if (endMinutes !== null && endMinutes < (15 * 60)) {
    notes.push("Día final: se cobra el 65% del salón por media jornada.");
  }

  const totalDays = getEventDaysCountFromDateTimes(fechaInicio, fechaFin);
  if (totalDays > 2) {
    notes.push("Los días intermedios se cobran al 100% del valor diario del salón.");
  }

  return notes;
};

const resolveSalonDays = (
  requestedDays: unknown,
  startValue?: string | null,
  endValue?: string | null,
) => {
  const calculatedDays = calculateSalonBillableDayUnitsFromDateTimes(startValue, endValue);
  if (calculatedDays > 0) return calculatedDays;

  const parsedRequestedDays = Number(requestedDays);
  if (Number.isFinite(parsedRequestedDays) && parsedRequestedDays > 0) {
    return roundBillableDayUnits(parsedRequestedDays);
  }

  return 1;
};

const RESERVA_ESTADO_PENDIENTE_VALIDACION = "Pendiente validación";
const RESERVA_ESTADO_VALIDADO = "Validado";
const RESERVA_ESTADOS_PENDIENTES_GESTION = [
  RESERVA_ESTADO_PENDIENTE_VALIDACION,
  RESERVA_ESTADO_VALIDADO,
];
const PUBLIC_RESERVA_NOTIFICATION_ORIGIN = "salones_form";
const RESERVA_EXPIRATION_NOTIFICATION_ORIGIN = "reserva_vencimiento_auto";
const RESERVA_AUTO_CANCEL_DAYS = 7;
const RESERVA_EXPIRATION_WARNING_DAYS = [3, 2, 1] as const;
const RESERVA_ALERTA_PRESUPUESTO = "vencimiento_presupuesto";
const RESERVA_ALERTA_INACTIVIDAD_LEGACY = "vencimiento_inactividad";
const RESERVA_ALERTA_INACTIVIDAD_LEGACY_ALT = "vencimiento";
const RESERVA_ALERTA_INICIO_EVENTO = "vencimiento_inicio_evento";
const RESERVA_ALERTA_CANCELACION_AUTOMATICA = "cancelacion_automatica";
const DAY_MS = 24 * 60 * 60 * 1000;
const PRESUPUESTOS_BUCKET = "presupuestos";
const HOTEL_TIME_ZONE = "America/Argentina/Cordoba";
const PRESUPUESTO_EMAIL_LINK_TTL_SECONDS = parsePositiveIntegerEnv(
  Deno.env.get("PRESUPUESTO_EMAIL_LINK_TTL_SECONDS"),
  60 * 60 * 24 * 7,
);
const PRESUPUESTO_PUBLIC_LINK_TTL_SECONDS = parsePositiveIntegerEnv(
  Deno.env.get("PRESUPUESTO_PUBLIC_LINK_TTL_SECONDS"),
  60 * 15,
);
const PRESUPUESTO_SHORT_LINK_MIN_TTL_SECONDS = 60;
const PRESUPUESTO_SHORT_LINK_SIGNED_URL_TTL_SECONDS = 90;
const PRESUPUESTO_SHORT_LINK_SIGNATURE_LENGTH = 16;
const PRESUPUESTO_SHORT_LINK_ROUTE_SEGMENT = "p";
const TEXT_ENCODER = new TextEncoder();
const PUBLIC_RESERVA_RATE_LIMIT = {
  maxCount: parsePositiveIntegerEnv(Deno.env.get("PUBLIC_RESERVA_RATE_LIMIT_MAX"), 5),
  windowSeconds: parsePositiveIntegerEnv(Deno.env.get("PUBLIC_RESERVA_RATE_LIMIT_WINDOW_SECONDS"), 600),
  blockSeconds: parsePositiveIntegerEnv(Deno.env.get("PUBLIC_RESERVA_RATE_LIMIT_BLOCK_SECONDS"), 600),
};
const PASSWORD_RESET_RATE_LIMIT = {
  maxCount: parsePositiveIntegerEnv(Deno.env.get("PASSWORD_RESET_RATE_LIMIT_MAX"), 3),
  windowSeconds: parsePositiveIntegerEnv(Deno.env.get("PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS"), 900),
  blockSeconds: parsePositiveIntegerEnv(Deno.env.get("PASSWORD_RESET_RATE_LIMIT_BLOCK_SECONDS"), 900),
};
const PUBLIC_CATALOG_RATE_LIMIT = {
  maxCount: parsePositiveIntegerEnv(Deno.env.get("PUBLIC_CATALOG_RATE_LIMIT_MAX"), 120),
  windowSeconds: parsePositiveIntegerEnv(Deno.env.get("PUBLIC_CATALOG_RATE_LIMIT_WINDOW_SECONDS"), 60),
  blockSeconds: parsePositiveIntegerEnv(Deno.env.get("PUBLIC_CATALOG_RATE_LIMIT_BLOCK_SECONDS"), 60),
};

const SALONES_HEADER_LOGO_URL = "https://files-p.pxsol.com/5019/company/library/user/134083827848ff026d70b27373fe71d73b64459f1e7.png";
const LOCAL_LOGO_URL = new URL("./assets/QuintoCente.png", import.meta.url);
const TERMINOS_CONDICIONES_TEXT = `
<b>Valores expresados en dólares, convertibles a pesos según tipo de cambio del día en que se realice el
depósito según cotización del Banco de la Nación Argentina a tipo vendedor.</b>

El precio estipulado por la contratación de las prestaciones se abonará de la siguiente manera:
a) Para garantizar el bloqueo de salones y servicios del evento: 30% del total de los servicios contratados
mediante transferencia bancaria o tarjeta de crédito aceptada por QUINTO CENTENARIO HOTEL.

b) El saldo restante mediante transferencia bancaria o con tarjeta de crédito aceptada por QUINTO
CENTENARIO HOTEL 10 días hábiles anteriores a la realización del evento.

<b>La presente es sólo una cotización y no representa de manera alguna una reserva.</b>

La posibilidad de confirmar el espacio requerido será verificada al momento de confirmar la reserva y estará
sujeto a cambios según disponibilidad.

Los precios de la presente cotización tienen validez por el término de 7 (siete) días corridos desde la fecha del
presente presupuesto. Una vez concluido ese período, la cotización será dada de baja en forma automática.

<b>SERVICIO TÉCNICO</b>
El equipamiento de audio y video, como así también de traducción simultánea, videoconferencia y fotografía,
deberá ser provisto por el cliente.

<b>IMPUESTOS</b>
En caso de reproducción musical se deberá contemplar el pago de los aranceles de Aadicapif y Sadaic.
Los mismos deben ser solicitados a cada entidad y abonados por el cliente.
A continuación se detallan los contactos de cada uno:
*SADAIC
SERGIO AGUSTÍN BRUNO (SADAIC) - Cel: + 54 9 351 157 010836 - mail: ab.sadaic@hotmail.com
*ADICAPIF
GUSTAVO SARASOLA (AADI-CAPIF) - Cel: + 54 9 351 155 410264

www.quintocentenariohotel.com
`.trim();
let logoDataUrlCache: string | null | undefined = undefined;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const bytesToDataUrl = (bytes: Uint8Array, mimeType = "image/png") => {
  const base64 = bytesToBase64(bytes);
  return `data:${mimeType};base64,${base64}`;
};

const parseTerminosLines = (text: string) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let boldActive = false;

  return lines.map((rawLine) => {
    let line = rawLine.trim();
    if (!line) {
      return { text: "", bold: false };
    }

    let bold = boldActive;

    if (/<b>/i.test(line)) {
      line = line.replace(/<b>/gi, "");
      bold = true;
      boldActive = true;
    }

    if (/<\/b>/i.test(line)) {
      line = line.replace(/<\/b>/gi, "");
      bold = true;
      boldActive = false;
    }

    return { text: line.trim(), bold };
  });
};

const resolveTermsLink = (line: string): string | null => {
  const trimmed = line.trim();

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;

  return null;
};

const buildTerminosCondicionesContent = () => {
  const lineNodes = parseTerminosLines(TERMINOS_CONDICIONES_TEXT).map(({ text, bold }) => {
    if (!text) {
      return { text: " ", margin: [0, 0, 0, 4] as [number, number, number, number] };
    }

    const termsLink = resolveTermsLink(text);
    if (termsLink) {
      return {
        text,
        link: termsLink,
        style: "termsLink",
      };
    }

    const isAsteriskBullet = /^\*/.test(text);
    const isClause = /^[a-z]\)\s+/i.test(text);
    const cleanText = isAsteriskBullet ? text.replace(/^\*\s*/, "• ") : text;
    const isShortBoldHeading = bold && cleanText.length <= 35;

    return {
      text: cleanText,
      style: isShortBoldHeading ? "termsHeading" : "termsText",
      bold,
      margin: [isAsteriskBullet || isClause ? 12 : 0, 0, 0, 4] as [number, number, number, number],
    };
  });

  return [
    { text: "Términos y condiciones", style: "termsTitle", pageBreak: "before" as const, margin: [0, 0, 0, 10] },
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#D1D5DB" }],
      margin: [0, 0, 0, 10],
    },
    ...lineNodes,
  ];
};

const loadLogoDataUrl = async (): Promise<string | null> => {
  if (logoDataUrlCache !== undefined) {
    return logoDataUrlCache;
  }

  try {
    const remoteLogoResponse = await fetch(SALONES_HEADER_LOGO_URL);
    if (!remoteLogoResponse.ok) {
      throw new Error(`HTTP ${remoteLogoResponse.status}`);
    }

    const logoBytes = new Uint8Array(await remoteLogoResponse.arrayBuffer());
    const dataUrl = bytesToDataUrl(logoBytes, "image/png");
    logoDataUrlCache = dataUrl;
    return dataUrl;
  } catch (error) {
    console.warn(`No se pudo cargar el logo del header de salones (${SALONES_HEADER_LOGO_URL}):`, error);
  }

  try {
    const logoBytes = await Deno.readFile(LOCAL_LOGO_URL);
    const dataUrl = bytesToDataUrl(logoBytes, "image/png");
    logoDataUrlCache = dataUrl;
    return dataUrl;
  } catch (error) {
    console.warn(`No se pudo cargar el logo local (${LOCAL_LOGO_URL.pathname}):`, error);
  }

  logoDataUrlCache = null;
  return null;
};

type PublicServicioPayload = {
  id_servicio: number;
  cantidad: number;
};

type PublicReservaPayload = {
  nombre?: string | null;
  email?: string | null;
  telefono?: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  tipo_evento?: string | null;
  cantidad: number;
  dias_salon?: number | null;
  id_distribucion?: number | null;
  salon_id?: number | null;
  salon_nombre?: string | null;
  observaciones?: string | null;
  servicios?: PublicServicioPayload[] | null;
};

type PresupuestoServicio = {
  servicio: {
    id: number;
    nombre: string;
    descripcion?: string | null;
    precio: number;
    categoria?: {
      id: number;
      nombre: string;
      descripcion?: string | null;
    } | null;
  };
  cantidad: number;
};

type PresupuestoContacto = {
  nombre: string;
  email: string;
};

type PdfInlineFragment = {
  text: string;
  bold?: boolean;
  italics?: boolean;
};

const decodeSupportedHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const parseInlineRichText = (value?: string | null): PdfInlineFragment[] => {
  const source = (value || "").replace(/\r\n/g, "\n");
  if (!source) return [{ text: "" }];

  const tokens = source.split(/(<\/?(?:strong|b|em|i)\s*>|<br\s*\/?>)/gi);
  const fragments: PdfInlineFragment[] = [];
  let boldDepth = 0;
  let italicDepth = 0;

  const pushText = (text: string) => {
    if (!text) return;

    const decodedText = decodeSupportedHtmlEntities(text);
    if (!decodedText) return;

    fragments.push({
      text: decodedText,
      ...(boldDepth > 0 ? { bold: true } : {}),
      ...(italicDepth > 0 ? { italics: true } : {}),
    });
  };

  tokens.forEach((token) => {
    const normalizedToken = token.toLowerCase();

    if (/^<br\s*\/?>$/.test(normalizedToken)) {
      pushText("\n");
      return;
    }

    if (/^<(strong|b)\s*>$/.test(normalizedToken)) {
      boldDepth += 1;
      return;
    }

    if (/^<\/(strong|b)\s*>$/.test(normalizedToken)) {
      boldDepth = Math.max(0, boldDepth - 1);
      return;
    }

    if (/^<(em|i)\s*>$/.test(normalizedToken)) {
      italicDepth += 1;
      return;
    }

    if (/^<\/(em|i)\s*>$/.test(normalizedToken)) {
      italicDepth = Math.max(0, italicDepth - 1);
      return;
    }

    pushText(token);
  });

  return fragments.length > 0 ? fragments : [{ text: "" }];
};

const buildServiciosRows = (servicios: PresupuestoServicio[]) => {
  if (servicios.length === 0) {
    return [
      [
        {
          text: "No se agregaron servicios adicionales para esta reserva.",
          colSpan: 4,
          style: "tableCell",
        },
        {},
        {},
        {},
      ],
    ];
  }

  const groupedServicios = new Map<string, PresupuestoServicio[]>();

  servicios.forEach((item) => {
    const categoriaNombre = item.servicio.categoria?.nombre?.trim() || "Sin categoría";
    const categoriaServicios = groupedServicios.get(categoriaNombre);

    if (categoriaServicios) {
      categoriaServicios.push(item);
      return;
    }

    groupedServicios.set(categoriaNombre, [item]);
  });

  const rows: Array<Array<Record<string, unknown>>> = [];

  groupedServicios.forEach((categoriaServicios, categoriaNombre) => {
    rows.push([
      {
        text: categoriaNombre,
        colSpan: 4,
        style: "serviceCategoryHeader",
      },
      {},
      {},
      {},
    ]);

    categoriaServicios.forEach(({ servicio, cantidad }) => {
      const unit = Number(servicio.precio) || 0;
      const subtotal = unit * cantidad;
      const servicioStack: Array<{
        text: string | PdfInlineFragment[];
        style: string;
        bold?: boolean;
        margin?: [number, number, number, number];
      }> = [
        { text: servicio.nombre, style: "tableCell", bold: true },
      ];

      if (servicio.descripcion) {
        servicioStack.push({
          text: parseInlineRichText(servicio.descripcion),
          style: "tableCellSecondary",
          margin: [0, 3, 0, 0],
        });
      }

      rows.push([
        { stack: servicioStack },
        { text: String(cantidad), style: "tableCell", alignment: "center" },
        { text: formatCurrency(unit), style: "tableCell", alignment: "right" },
        { text: formatCurrency(subtotal), style: "tableCell", alignment: "right" },
      ]);
    });
  });

  return rows;
};

const buildPresupuestoPdf = async (
  input: {
    reservaId: number;
    salon: { nombre: string; descripcion?: string | null; precio_base: number; capacidad: number };
    distribucion?: { nombre: string; capacidad: number } | null;
    cliente: { nombre: string; email?: string | null; telefono?: string | null };
    fechaInicio: string;
    fechaFin: string;
    tipoEvento?: string | null;
    totalSalon: number;
    precioSalonDiario?: number | null;
    diasSalon?: number | null;
    cantidadPersonas: number;
    servicios: PresupuestoServicio[];
    contacto: PresupuestoContacto;
  },
) => {
  // Import pdfmake and its fonts lazily so the function can boot when PDF generation
  // is not required (e.g. public-catalog). If import fails, surface a clear error.
  let pdfMake: any;
  let pdfFonts: any;
  // Prefer a vendored copy (bundled with the function) to avoid relying on
  // npm resolution in the edge runtime. If not present, fall back to the
  // npm: specifier (for local testing or environments that resolve npm:).
  try {
    try {
      const localMod = await import('./vendor/pdfmake/build/pdfmake.js');
      const localFonts = await import('./vendor/pdfmake/build/vfs_fonts.js');
      pdfMake = (localMod && (localMod as any).default) || localMod;
      pdfFonts = (localFonts && (localFonts as any).default) || localFonts;
    } catch (localErr) {
      // Local vendor not available; attempt to load from npm specifier.
      try {
        const mod = await import('npm:pdfmake@0.2.20/build/pdfmake.js');
        const fonts = await import('npm:pdfmake@0.2.20/build/vfs_fonts.js');
        pdfMake = (mod && (mod as any).default) || mod;
        pdfFonts = (fonts && (fonts as any).default) || fonts;
      } catch (err) {
        const localMessage = getErrorMessage(localErr, "");
        const details = localMessage ? ` (local: ${localMessage})` : "";
        throw new Error(`PDF generation is not available in this environment: ${getErrorMessage(err, String(err))}${details}`);
      }
    }
  } catch (err) {
    throw err;
  }

  // Ensure fonts are loaded into pdfMake
  const fontsSource =
    (pdfFonts as any)?.pdfMake?.vfs ||
    (pdfFonts as any)?.default?.pdfMake?.vfs ||
    (pdfFonts as any)?.default ||
    (pdfFonts as any);

  if (!fontsSource) {
    throw new Error('No se pudieron cargar las fuentes para generar el PDF.');
  }

  (pdfMake as any).vfs = fontsSource;

  const capacidadMaxima =
    input.distribucion?.capacidad && input.distribucion.capacidad > 0
      ? input.distribucion.capacidad
      : input.salon.capacidad;

  const totalServicios = input.servicios.reduce((acc, { servicio, cantidad }) => {
    const unit = Number(servicio.precio) || 0;
    return acc + unit * cantidad;
  }, 0);

  const salonDailyPrice = Number(input.precioSalonDiario ?? input.salon.precio_base) || 0;
  const parsedSalonDays = Number(input.diasSalon);
  const salonDays = Number.isFinite(parsedSalonDays) && parsedSalonDays > 0
    ? roundBillableDayUnits(parsedSalonDays)
    : 1;
  const totalSalon = Number.isFinite(Number(input.totalSalon))
    ? Number(input.totalSalon)
    : salonDailyPrice * salonDays;
  const totalGeneral = totalSalon + totalServicios;
  const salonBillingNotes = getSalonBillingNotes(input.fechaInicio, input.fechaFin);
  const logoDataUrl = await loadLogoDataUrl();
  const fechaEmision = new Date();
  const fechaVencimiento = addDays(fechaEmision, 7);

  const presupuestoFooter = (currentPage: number, pageCount: number) => {
    if (currentPage !== pageCount) return { text: "" };

    return {
      margin: [40, 6, 40, 0],
      table: {
        widths: ["*", 250, "*"],
        body: [[
          { text: "" },
          {
            table: {
              widths: [70, 180],
              body: [[
                logoDataUrl
                  ? { image: logoDataUrl, fit: [54, 54], alignment: "center" }
                  : { text: "QUINTO\nCENTENARIO", bold: true, fontSize: 8, alignment: "center", margin: [0, 15, 0, 0] },
                {
                  stack: [
                    { text: input.contacto.nombre, bold: true, fontSize: 12, color: "#1F2937" },
                    { text: "Ejecutivo comercial", fontSize: 9, color: "#4B5563", margin: [0, 3, 0, 0] },
                    {
                      text: input.contacto.email,
                      link: `mailto:${input.contacto.email}`,
                      fontSize: 9,
                      color: "#1D4ED8",
                      decoration: "underline",
                      margin: [0, 6, 0, 0],
                    },
                  ],
                  margin: [14, 2, 0, 0],
                },
              ]],
            },
            layout: {
              hLineWidth: () => 0,
              vLineWidth: (index: number) => index === 1 ? 1 : 0,
              vLineColor: () => "#6B7280",
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 0,
              paddingBottom: () => 0,
            },
          },
          { text: "" },
        ]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    };
  };

  const cardTableLayout = {
    hLineColor: () => "#E5E7EB",
    vLineColor: () => "#E5E7EB",
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    paddingTop: () => 6,
    paddingBottom: () => 6,
    paddingLeft: () => 8,
    paddingRight: () => 8,
  };

  const buildInfoTable = (rows: Array<[string, string]>) => ({
    table: {
      widths: ["40%", "*"],
      body: rows.map(([label, value]) => [
        { text: label, style: "infoLabel" },
        { text: value, style: "infoValue" },
      ]),
    },
    layout: cardTableLayout,
  });

  const clienteRows: Array<[string, string]> = [
    ["Nombre", input.cliente.nombre],
    ["Email", input.cliente.email || "No informado"],
    ["Teléfono", input.cliente.telefono || "No informado"],
    ["Tipo de evento", input.tipoEvento?.trim() || "Evento"],
  ];

  const eventoRows: Array<[string, string]> = [
    ["Salón", input.salon.nombre],
    ["Distribución", input.distribucion?.nombre || "Sin distribución definida"],
    ["Asistentes previstos", String(input.cantidadPersonas)],
    ["Capacidad máxima", String(capacidadMaxima)],
    ["Inicio", `${formatDate(input.fechaInicio)} ${formatTime(input.fechaInicio)}`],
    ["Fin", `${formatDate(input.fechaFin)} ${formatTime(input.fechaFin)}`],
  ];

  const headerContent = logoDataUrl
    ? [
        { image: logoDataUrl, fit: [190, 80], alignment: "center", margin: [0, 0, 0, 8] },
        { text: "Presupuesto de Evento", style: "header", alignment: "center" },
        { text: `Reserva #${input.reservaId}`, style: "subheader", alignment: "center", margin: [0, 4, 0, 20] },
      ]
    : [
        { text: "Presupuesto de Evento", style: "header", alignment: "center" },
        { text: `Reserva #${input.reservaId}`, style: "subheader", alignment: "center", margin: [0, 0, 0, 20] },
      ];

  const docDefinition = {
    pageMargins: [40, 50, 40, 100],
    footer: presupuestoFooter,
    content: [
      ...headerContent,
      {
        table: {
          widths: ["*", "*", "*"],
          body: [
            [
              {
                style: "metaCard",
                stack: [
                  { text: "Fecha de emisión", style: "metaLabel" },
                  { text: formatDateValue(fechaEmision), style: "metaValue" },
                ],
              },
              {
                style: "metaCard",
                stack: [
                  { text: "Válido hasta", style: "metaLabel" },
                  { text: formatDateValue(fechaVencimiento), style: "metaValue" },
                ],
              },
              {
                style: "metaCard",
                stack: [
                  { text: "Vigencia", style: "metaLabel" },
                  { text: "7 días corridos", style: "metaValue" },
                ],
              },
            ],
          ],
        },
        layout: "noBorders",
        margin: [0, 0, 0, 18],
      },
      {
        stack: [
          { text: "Información del cliente", style: "infoTitle" },
          buildInfoTable(clienteRows),
          { text: "Información del evento", style: "infoTitle", margin: [0, 14, 0, 6] },
          buildInfoTable(eventoRows),
        ],
        margin: [0, 0, 0, 25],
      },
      { text: "Detalle del presupuesto", style: "detailPageTitle", pageBreak: "before", margin: [0, 0, 0, 10] },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: "#D1D5DB" }],
        margin: [0, 0, 0, 10],
      },
      { text: "Salón contratado", style: "infoTitle" },
      {
        table: {
          widths: ["*", "auto", "auto"],
          body: [
            [
              { text: "Salón y descripción", style: "detailTableHeader" },
              { text: "Cantidad (dÃ­as)", style: "detailTableHeader", alignment: "center" },
              { text: "Precio unitario", style: "detailTableHeader", alignment: "right" },
              { text: "Subtotal", style: "detailTableHeader", alignment: "right" },
            ],
            [
              {
                stack: [
                  input.salon.descripcion
                    ? { text: [{ text: input.salon.nombre, bold: true }, `\n${input.salon.descripcion}`], style: "tableCell" }
                    : { text: [{ text: input.salon.nombre, bold: true }], style: "tableCell" },
                  ...salonBillingNotes.map((note) => ({
                    text: note,
                    style: "tableCellSecondary",
                    margin: [0, 4, 0, 0] as [number, number, number, number],
                  })),
                ],
              },
              { text: formatCurrency(salonDailyPrice), style: "tableCell", alignment: "right" },
              { text: formatCurrency(totalSalon), style: "tableCell", alignment: "right" },
            ],
          ],
        },
        layout: cardTableLayout,
        margin: [0, 0, 0, 16],
      },
      { text: "Servicios adicionales", style: "infoTitle" },
      {
        table: {
          widths: ["*", "auto", "auto", "auto"],
          body: [
            [
              { text: "Servicio y descripción", style: "detailTableHeader" },
              { text: "Cantidad", style: "detailTableHeader", alignment: "center" },
              { text: "Precio unitario", style: "detailTableHeader", alignment: "right" },
              { text: "Subtotal", style: "detailTableHeader", alignment: "right" },
            ],
            ...buildServiciosRows(input.servicios),
          ],
        },
        layout: cardTableLayout,
      },
      {
        table: {
          widths: ["*", "auto"],
          body: [
            [
              { text: "Total salón", alignment: "right", style: "totalLabelCard" },
              { text: formatCurrency(totalSalon), alignment: "right", style: "totalValueCard" },
            ],
            [
              { text: "Total servicios", alignment: "right", style: "totalLabelCard" },
              { text: formatCurrency(totalServicios), alignment: "right", style: "totalValueCard" },
            ],
            [
              { text: "Total general", alignment: "right", style: "grandTotalLabelCard" },
              { text: formatCurrency(totalGeneral), alignment: "right", style: "grandTotalValueCard" },
            ],
          ],
        },
        layout: cardTableLayout,
        margin: [0, 16, 0, 0],
      },
      ...buildTerminosCondicionesContent(),
    ],
    styles: {
      header: { fontSize: 20, bold: true },
      subheader: { fontSize: 14, color: "#666666" },
      sectionTitle: { fontSize: 12, bold: true, margin: [0, 10, 0, 6] },
      detailPageTitle: { fontSize: 15, bold: true, color: "#111827" },
      metaCard: { fillColor: "#F8FAFC", margin: [8, 8, 8, 8] },
      metaLabel: { fontSize: 9, color: "#6B7280" },
      metaValue: { fontSize: 12, bold: true, color: "#111827", margin: [0, 2, 0, 0] },
      infoTitle: { fontSize: 12, bold: true, color: "#111827", margin: [0, 0, 0, 6] },
      infoLabel: { fontSize: 10, bold: true, color: "#374151" },
      infoValue: { fontSize: 10, color: "#111827" },
      detailTableHeader: { fontSize: 10, bold: true, fillColor: "#EEF2FF", color: "#1F2937" },
      serviceCategoryHeader: { fontSize: 10, bold: true, fillColor: "#F3F4F6", color: "#111827" },
      tableHeader: { bold: true, fillColor: "#f5f5f5" },
      tableCell: { fontSize: 10 },
      tableCellSecondary: { fontSize: 9, color: "#4B5563" },
      totalLabel: { fontSize: 11, bold: true, margin: [0, 4, 0, 4] },
      totalValue: { fontSize: 11, margin: [0, 4, 0, 4] },
      grandTotalLabel: { fontSize: 12, bold: true, margin: [0, 8, 0, 0] },
      grandTotalValue: { fontSize: 12, bold: true, margin: [0, 8, 0, 0] },
      totalLabelCard: { fontSize: 10, bold: true, color: "#374151" },
      totalValueCard: { fontSize: 10, bold: true, color: "#111827" },
      grandTotalLabelCard: { fontSize: 12, bold: true, color: "#111827" },
      grandTotalValueCard: { fontSize: 12, bold: true, color: "#111827" },
      termsTitle: { fontSize: 16, bold: true },
      termsHeading: { fontSize: 11, bold: true, lineHeight: 1.25 },
      termsText: { fontSize: 10, lineHeight: 1.25, color: "#1F2937" },
      termsLink: {
        fontSize: 12,
        lineHeight: 1.3,
        color: "#1D4ED8",
        decoration: "underline",
        alignment: "center",
        margin: [0, 8, 0, 0],
      },
    },
    defaultStyle: { fontSize: 10 },
  };

  normalizeSalonContractTable(docDefinition as Record<string, unknown>);
  normalizePdfDocumentNode(docDefinition);

  const pdfBuffer = await new Promise<Uint8Array>((resolve, reject) => {
    try {
      const pdfDoc = pdfMake.createPdf(docDefinition);
      (pdfDoc as any).getBuffer((buffer: ArrayBuffer) => {
        resolve(new Uint8Array(buffer));
      });
    } catch (error) {
      reject(error);
    }
  });

  return pdfBuffer;
};

function createServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type RateLimitConfig = {
  maxCount: number;
  windowSeconds: number;
  blockSeconds: number;
};

const bytesToHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

const getClientIp = (c: any) => {
  const forwardedFor = c.req.header("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  return (
    c.req.header("cf-connecting-ip")
    || c.req.header("x-real-ip")
    || "unknown"
  );
};

const buildRateLimitKey = async (scope: string, identifiers: string[]) => {
  const normalizedIdentifiers = identifiers
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .join(":");
  const source = `${RATE_LIMIT_HASH_SECRET}:${scope}:${normalizedIdentifiers}`;
  const digest = await crypto.subtle.digest("SHA-256", TEXT_ENCODER.encode(source));
  return `${scope}:${bytesToHex(new Uint8Array(digest))}`;
};

const applyRateLimit = async (
  c: any,
  supabaseAdmin: SupabaseClient,
  scope: string,
  identifiers: string[],
  config: RateLimitConfig,
) => {
  const key = await buildRateLimitKey(scope, identifiers);
  const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
    p_key: key,
    p_max_count: config.maxCount,
    p_window_seconds: config.windowSeconds,
    p_block_seconds: config.blockSeconds,
  });

  if (error) {
    console.warn(`Rate limit skipped for ${scope}:`, error.message);
    return null;
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || result.allowed !== false) {
    return null;
  }

  const retryAfterSeconds = Number(result.retry_after_seconds) || config.blockSeconds;
  const response = c.json(
    {
      error: "Demasiadas solicitudes. Intente nuevamente mas tarde.",
      retryAfterSeconds,
    },
    429,
  );
  response.headers.set("Retry-After", String(retryAfterSeconds));
  return response;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

type SmtpAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

function getSmtpConfig(): SmtpConfig {
  const host = Deno.env.get("SMTP_HOST")?.trim() || "";
  const portRaw = Deno.env.get("SMTP_PORT")?.trim() || "";
  const user = Deno.env.get("SMTP_USER")?.trim() || "";
  const pass = Deno.env.get("SMTP_PASS")?.trim() || "";
  const fromOverride = Deno.env.get("SMTP_FROM")?.trim() || "";
  const fromName = Deno.env.get("SMTP_FROM_NAME")?.trim() || "Quinto Centenario Hotel";
  const secureOverride = Deno.env.get("SMTP_SECURE")?.trim()?.toLowerCase();

  if (!host || !portRaw || !user || !pass) {
    throw new Error("SMTP environment variables are not fully configured");
  }

  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("SMTP_PORT is invalid");
  }

  const secure =
    secureOverride === "true"
      ? true
      : secureOverride === "false"
        ? false
        : port === 465;

  const from = fromOverride || `${fromName} <${user}>`;

  return {
    host,
    port,
    secure,
    user,
    pass,
    from,
  };
}

function getRequestOrigin(c: any): string | null {
  const originHeader = c.req.header("origin");
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      // ignore invalid origin header and continue
    }
  }

  const refererHeader = c.req.header("referer");
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin;
    } catch {
      // ignore invalid referer header and continue
    }
  }

  return null;
}

function isLocalhostUrl(url: URL) {
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

const PASSWORD_RECOVERY_PATH = "/reservas/";

function toPasswordRecoveryUrl(value?: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    url.pathname = PASSWORD_RECOVERY_PATH;
    url.search = "";
    url.hash = "";
    url.searchParams.set("recovery", "1");
    return url;
  } catch {
    return null;
  }
}

function getConfiguredPasswordRecoveryRedirectUrl() {
  const configuredUrl = toPasswordRecoveryUrl(Deno.env.get("PASSWORD_RECOVERY_REDIRECT_URL"));
  if (configuredUrl && !isLocalhostUrl(configuredUrl)) {
    return configuredUrl.toString();
  }

  for (const origin of ALLOWED_ORIGINS) {
    const allowedUrl = toPasswordRecoveryUrl(origin);
    if (allowedUrl && !isLocalhostUrl(allowedUrl)) {
      return allowedUrl.toString();
    }
  }

  return null;
}

function buildPasswordRecoveryRedirectUrl(c: any, requestedRedirectTo: unknown): string | null {
  const requestOrigin = getRequestOrigin(c);

  if (typeof requestedRedirectTo === "string" && requestedRedirectTo.trim()) {
    const redirectUrl = toPasswordRecoveryUrl(requestedRedirectTo);
    const requestedOriginIsAllowed = Boolean(
      redirectUrl
      && ALLOWED_ORIGINS.includes(redirectUrl.origin)
      && (!requestOrigin || redirectUrl.origin === requestOrigin),
    );

    if (
      redirectUrl
      && !isLocalhostUrl(redirectUrl)
      && requestedOriginIsAllowed
    ) {
      return redirectUrl.toString();
    }
  }

  const configuredRedirectUrl = getConfiguredPasswordRecoveryRedirectUrl();
  if (configuredRedirectUrl) {
    return configuredRedirectUrl;
  }

  if (!requestOrigin) {
    return null;
  }

  return toPasswordRecoveryUrl(requestOrigin)?.toString() || null;
}

function buildPasswordRecoveryAppLink(redirectTo: string, tokenHash: string) {
  const recoveryUrl = new URL(redirectTo);
  recoveryUrl.searchParams.set("token_hash", tokenHash);
  recoveryUrl.searchParams.set("type", "recovery");
  return recoveryUrl.toString();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPasswordRecoveryEmail(actionLink: string) {
  const safeActionLink = escapeHtml(actionLink);

  return {
    subject: "Recuperación de contraseña - Hotel Back-Office",
    text:
      "Recibimos una solicitud para cambiar tu contraseña.\n\n"
      + `Usá este enlace para definir una nueva contraseña:\n${actionLink}\n\n`
      + "Si no solicitaste este cambio, podés ignorar este correo.",
    html: `
      <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #0f172a;">
        <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px;">
          <h1 style="margin: 0 0 12px; font-size: 24px; color: #0f172a;">Recuperación de contraseña</h1>
          <p style="margin: 0 0 16px; line-height: 1.6;">
            Recibimos una solicitud para cambiar tu contraseña de acceso al back-office.
          </p>
          <p style="margin: 0 0 24px; line-height: 1.6;">
            Hacé clic en el siguiente botón para definir una nueva contraseña.
          </p>
          <a
            href="${safeActionLink}"
            style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;"
          >
            Cambiar contraseña
          </a>
          <p style="margin: 24px 0 8px; line-height: 1.6;">
            Si el botón no funciona, copiá y pegá este enlace en tu navegador:
          </p>
          <p style="margin: 0; line-height: 1.6; word-break: break-all;">
            <a href="${safeActionLink}" style="color: #2563eb;">${safeActionLink}</a>
          </p>
          <p style="margin: 24px 0 0; line-height: 1.6; color: #475569;">
            Si no solicitaste este cambio, podés ignorar este correo.
          </p>
        </div>
      </div>
    `.trim(),
  };
}

async function sendSmtpEmail(
  smtpConfig: SmtpConfig,
  input: {
    to: string;
    bcc?: string;
    subject: string;
    text: string;
    html: string;
    attachments?: SmtpAttachment[];
  },
) {
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass,
    },
  });

  try {
    await transporter.sendMail({
      from: smtpConfig.from,
      to: input.to,
      bcc: input.bcc,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments,
    });
  } finally {
    transporter.close();
  }
}

async function sendPasswordRecoveryEmail(smtpConfig: SmtpConfig, to: string, actionLink: string) {
  const emailContent = buildPasswordRecoveryEmail(actionLink);

  await sendSmtpEmail(smtpConfig, {
    to,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });
}

function buildPresupuestoReservationEmail(input: {
  reservaId: number;
  clienteNombre?: string | null;
  fechaInicio: string;
  fechaFin: string;
  downloadUrl: string;
  hasChanges?: boolean;
}) {
  const clienteNombre = input.clienteNombre?.trim() || "cliente";
  const safeClienteNombre = escapeHtml(clienteNombre);
  const safeDownloadUrl = escapeHtml(input.downloadUrl);
  const fechaInicioLabel = `${formatDate(input.fechaInicio)} ${formatTime(input.fechaInicio)}`;
  const fechaFinLabel = `${formatDate(input.fechaFin)} ${formatTime(input.fechaFin)}`;
  const reservaLabel = `#${input.reservaId}`;
  const title = input.hasChanges
    ? "Aquí está el presupuesto de la reserva con los cambios aplicados"
    : "Aquí está el presupuesto de la reserva";
  const description = input.hasChanges
    ? `Adjuntamos el presupuesto actualizado de tu reserva ${reservaLabel}, con los cambios aplicados.`
    : `Adjuntamos el presupuesto correspondiente a tu reserva ${reservaLabel}.`;

  return {
    subject: `${title} ${reservaLabel} - Quinto Centenario Hotel`,
    text:
      `Hola ${clienteNombre},\n\n`
      + `${title}.\n\n`
      + `${description}\n`
      + `Inicio: ${fechaInicioLabel}\n`
      + `Fin: ${fechaFinLabel}\n\n`
      + "También podés descargarlo desde el siguiente enlace, válido por 7 días:\n"
      + `${input.downloadUrl}\n\n`
      + "Saludos,\nQuinto Centenario Hotel",
    html: `
      <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #0f172a;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px;">
          <h1 style="margin: 0 0 12px; font-size: 24px; color: #0f172a;">${escapeHtml(title)}</h1>
          <p style="margin: 0 0 16px; line-height: 1.6;">Hola ${safeClienteNombre},</p>
          <p style="margin: 0 0 16px; line-height: 1.6;">
            ${escapeHtml(description)}
          </p>
          <div style="margin: 0 0 20px; padding: 16px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px; line-height: 1.5;"><strong>Inicio:</strong> ${escapeHtml(fechaInicioLabel)}</p>
            <p style="margin: 0; line-height: 1.5;"><strong>Fin:</strong> ${escapeHtml(fechaFinLabel)}</p>
          </div>
          <p style="margin: 0 0 24px; line-height: 1.6;">
            También podés abrir el PDF desde el siguiente botón. El enlace estará disponible durante 7 días.
          </p>
          <a
            href="${safeDownloadUrl}"
            style="display: inline-block; background: #0f766e; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 8px; font-weight: 600;"
          >
            Abrir presupuesto
          </a>
          <p style="margin: 24px 0 8px; line-height: 1.6;">
            Si el botón no funciona, accedé desde el siguiente enlace:
          </p>
          <p style="margin: 0; line-height: 1.6; word-break: break-all;">
            <a href="${safeDownloadUrl}" style="color: #0f766e;">${safeDownloadUrl}</a>
          </p>
          <p style="margin: 24px 0 0; line-height: 1.6; color: #475569;">
            También vas a encontrar el presupuesto adjunto en este correo.
          </p>
        </div>
      </div>
    `.trim(),
  };
}

async function sendPresupuestoReservationEmail(
  smtpConfig: SmtpConfig,
  input: {
    to: string;
    reservaId: number;
    clienteNombre?: string | null;
    fechaInicio: string;
    fechaFin: string;
    downloadUrl: string;
    attachmentFileName: string;
    attachmentContent: Buffer;
    hasChanges?: boolean;
  },
) {
  const emailContent = buildPresupuestoReservationEmail({
    reservaId: input.reservaId,
    clienteNombre: input.clienteNombre,
    fechaInicio: input.fechaInicio,
    fechaFin: input.fechaFin,
    downloadUrl: input.downloadUrl,
    hasChanges: input.hasChanges,
  });

  await sendSmtpEmail(smtpConfig, {
    to: input.to,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
    attachments: [{
      filename: input.attachmentFileName,
      content: input.attachmentContent,
      contentType: "application/pdf",
    }],
  });
}

type BackofficeNotificationRecipient = {
  userId: string;
  nombre: string;
  rol: string;
  email: string;
};

const normalizeEmail = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

function getErrorMessage(error: unknown, fallback = "Internal server error") {
  if (error instanceof Error) return error.message;

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  const text = String(error ?? "");
  return text.length > 0 ? text : fallback;
}

async function findAuthUserByEmail(supabaseAdmin: SupabaseClient, email: string) {
  const targetEmail = normalizeEmail(email);
  if (!targetEmail) return null;

  const perPage = 100;

  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });

    if (error) {
      throw error;
    }

    const users = data?.users || [];
    const match = users.find((user) => normalizeEmail(user.email) === targetEmail);

    if (match) {
      return match;
    }

    if (users.length < perPage) {
      return null;
    }
  }

  return null;
}

const formatOptionalText = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
};

type ReservaEmailAction = "created" | "updated";

function buildBackofficeReservaNotificationEmail(input: {
  action: ReservaEmailAction;
  reservaId: number;
  clienteNombre: string;
  clienteEmail: string;
  clienteTelefono?: string | null;
  salonNombre: string;
  distribucionNombre?: string | null;
  tipoEvento?: string | null;
  cantidadPersonas: number;
  fechaInicio: string;
  fechaFin: string;
}) {
  const reservaLabel = `#${input.reservaId}`;
  const clienteNombre = formatOptionalText(input.clienteNombre, "Sin nombre");
  const clienteEmail = formatOptionalText(input.clienteEmail, "No informado");
  const clienteTelefono = formatOptionalText(input.clienteTelefono, "No informado");
  const salonNombre = formatOptionalText(input.salonNombre, "No informado");
  const distribucionNombre = formatOptionalText(input.distribucionNombre, "No informada");
  const tipoEvento = formatOptionalText(input.tipoEvento, "No informado");
  const cantidadPersonas = Number.isFinite(input.cantidadPersonas) ? input.cantidadPersonas : 0;
  const fechaInicioLabel = `${formatDate(input.fechaInicio)} ${formatTime(input.fechaInicio)}`;
  const fechaFinLabel = `${formatDate(input.fechaFin)} ${formatTime(input.fechaFin)}`;
  const title = input.action === "updated"
    ? "Se modificó una reserva"
    : "Se ha registrado una nueva reserva";
  const actionDescription = input.action === "updated"
    ? `Se modificó la reserva ${reservaLabel}.`
    : `Se ha registrado una nueva reserva ${reservaLabel}.`;

  return {
    subject: `${title} ${reservaLabel} - Quinto Centenario Hotel`,
    text:
      `${actionDescription}\n\n`
      + `Reserva: ${reservaLabel}\n`
      + `Cliente: ${clienteNombre}\n`
      + `Email cliente: ${clienteEmail}\n`
      + `Teléfono cliente: ${clienteTelefono}\n`
      + `Salón: ${salonNombre}\n`
      + `Distribución: ${distribucionNombre}\n`
      + `Tipo de evento: ${tipoEvento}\n`
      + `Cantidad de personas: ${cantidadPersonas}\n`
      + `Inicio: ${fechaInicioLabel}\n`
      + `Fin: ${fechaFinLabel}\n\n`
      + "Ingresá al Back Office para revisar y gestionar la reserva.",
    html: `
      <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #0f172a;">
        <div style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px;">
          <h1 style="margin: 0 0 12px; font-size: 24px; color: #0f172a;">${escapeHtml(title)}</h1>
          <p style="margin: 0 0 20px; line-height: 1.6;">
            ${escapeHtml(actionDescription)}
          </p>
          <div style="margin: 0 0 16px; padding: 16px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0;">
            <p style="margin: 0 0 8px; line-height: 1.5;"><strong>Reserva:</strong> ${escapeHtml(reservaLabel)}</p>
            <p style="margin: 0 0 8px; line-height: 1.5;"><strong>Cliente:</strong> ${escapeHtml(clienteNombre)}</p>
            <p style="margin: 0 0 8px; line-height: 1.5;"><strong>Email cliente:</strong> ${escapeHtml(clienteEmail)}</p>
            <p style="margin: 0 0 8px; line-height: 1.5;"><strong>Teléfono cliente:</strong> ${escapeHtml(clienteTelefono)}</p>
            <p style="margin: 0 0 8px; line-height: 1.5;"><strong>Salón:</strong> ${escapeHtml(salonNombre)}</p>
            <p style="margin: 0 0 8px; line-height: 1.5;"><strong>Distribución:</strong> ${escapeHtml(distribucionNombre)}</p>
            <p style="margin: 0 0 8px; line-height: 1.5;"><strong>Tipo de evento:</strong> ${escapeHtml(tipoEvento)}</p>
            <p style="margin: 0 0 8px; line-height: 1.5;"><strong>Cantidad de personas:</strong> ${escapeHtml(String(cantidadPersonas))}</p>
            <p style="margin: 0 0 8px; line-height: 1.5;"><strong>Inicio:</strong> ${escapeHtml(fechaInicioLabel)}</p>
            <p style="margin: 0; line-height: 1.5;"><strong>Fin:</strong> ${escapeHtml(fechaFinLabel)}</p>
          </div>
          <p style="margin: 0; line-height: 1.6; color: #475569;">
            Ingresá al Back Office para revisar y gestionar esta reserva.
          </p>
        </div>
      </div>
    `.trim(),
  };
}

async function getBackofficeNotificationRecipients(
  supabaseAdmin: SupabaseClient,
  excludedUserId?: string | null,
) {
  const { data: perfilesData, error: perfilesError } = await supabaseAdmin
    .from("perfiles")
    .select("user_id, nombre, rol, activo");

  if (perfilesError) {
    throw new Error(`No se pudo cargar perfiles para notificaciones: ${perfilesError.message}`);
  }

  const perfiles = (perfilesData || []).filter((perfil) => {
    const normalizedRol = normalizeRole(perfil?.rol);
    return perfil?.activo !== false
      && perfil?.user_id !== excludedUserId
      && (normalizedRol === "ADMIN" || normalizedRol === "OPERADOR");
  });

  if (perfiles.length === 0) {
    return [] as BackofficeNotificationRecipient[];
  }

  const recipientsByEmail = new Map<string, BackofficeNotificationRecipient>();

  await Promise.all(
    perfiles.map(async (perfil) => {
      const userId = typeof perfil?.user_id === "string" ? perfil.user_id : "";
      if (!userId) return;

      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (userError) {
        console.warn(`No se pudo obtener el usuario ${userId} para notificación de reserva:`, userError);
        return;
      }

      const email = normalizeEmail(userData?.user?.email);
      if (!email) {
        console.warn(`El usuario ${userId} no tiene email para notificación de reserva.`);
        return;
      }

      if (recipientsByEmail.has(email)) {
        return;
      }

      recipientsByEmail.set(email, {
        userId,
        nombre: formatOptionalText(perfil?.nombre, "Usuario Back Office"),
        rol: normalizeRole(perfil?.rol) || "OPERADOR",
        email,
      });
    }),
  );

  return Array.from(recipientsByEmail.values());
}

async function sendBackofficeReservaNotificationEmails(
  smtpConfig: SmtpConfig,
  supabaseAdmin: SupabaseClient,
  input: {
    action: ReservaEmailAction;
    excludedUserId?: string | null;
    reservaId: number;
    clienteNombre: string;
    clienteEmail: string;
    clienteTelefono?: string | null;
    salonNombre: string;
    distribucionNombre?: string | null;
    tipoEvento?: string | null;
    cantidadPersonas: number;
    fechaInicio: string;
    fechaFin: string;
  },
) {
  const recipients = await getBackofficeNotificationRecipients(
    supabaseAdmin,
    input.excludedUserId,
  );
  if (recipients.length === 0) {
    console.info("No hay otros destinatarios ADMIN/OPERADOR para notificar la reserva.");
    return { sent: false, recipientsCount: 0 } as const;
  }

  const primaryRecipient = recipients[0]?.email;
  if (!primaryRecipient) {
    console.warn("No se pudo resolver el destinatario principal para la notificación de reserva.");
    return { sent: false, recipientsCount: 0 } as const;
  }

  const bccRecipients = recipients.slice(1).map((recipient) => recipient.email);
  const emailContent = buildBackofficeReservaNotificationEmail(input);

  await sendSmtpEmail(smtpConfig, {
    to: primaryRecipient,
    bcc: bccRecipients.length > 0 ? bccRecipients.join(", ") : undefined,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });

  return { sent: true, recipientsCount: recipients.length } as const;
}

function normalizeRole(role: unknown) {
  if (typeof role !== "string") return null;
  return role
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

async function requireAdmin(
  supabaseAdmin: SupabaseClient,
  accessToken: string,
  actionDescription: string,
) {
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError) {
    console.error("Failed to resolve user from access token", userError);
    return { status: 401, body: { error: "Invalid authorization token" } } as const;
  }

  const user = userData?.user;

  if (!user) {
    return { status: 401, body: { error: "Invalid authorization token" } } as const;
  }

  const userId = user.id;
  const normalizedMetadataRole = normalizeRole(
    user.app_metadata?.role ??
      (Array.isArray(user.app_metadata?.roles) ? user.app_metadata?.roles[0] : undefined) ??
      user.user_metadata?.role,
  );

  const {
    data: perfil,
    error: perfilError,
  } = await supabaseAdmin
    .from("perfiles")
    .select("rol, activo")
    .eq("user_id", userId)
    .maybeSingle();

  if (perfilError) {
    console.error("Error verifying perfil:", perfilError);
    return { status: 500, body: { error: "Failed to verify user profile" } } as const;
  }

  if (!perfil) {
    console.warn(
      `User ${user.email ?? userId} attempted to ${actionDescription} but no perfil row was found.`,
    );
    return {
      status: 403,
      body: { error: `Administrator profile not found for user ${user.email ?? userId}` },
    } as const;
  }

  const normalizedPerfilRole = normalizeRole(perfil.rol);

  if (perfil.activo === false) {
    console.warn(
      `Inactive user ${user.email ?? userId} attempted to ${actionDescription}.`,
    );
    return {
      status: 403,
      body: { error: "User profile is inactive" },
    } as const;
  }

  if (normalizedPerfilRole !== "ADMIN") {
    console.warn(
      `User ${user.email ?? userId} attempted to ${actionDescription} with role "${perfil.rol}".`,
    );
    return {
      status: 403,
      body: { error: `Only administrators can ${actionDescription}` },
    } as const;
  }

  if (normalizedMetadataRole !== "ADMIN" || user.app_metadata?.active !== true) {
    try {
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...user.app_metadata,
          role: "ADMIN",
          active: true,
        },
      });
    } catch (syncError) {
      console.warn(
        `Failed to sync admin role to app_metadata for ${user.email ?? userId}:`,
        syncError,
      );
    }
  }

  return { userId } as const;
}

async function requireBackofficeUser(
  supabaseAdmin: SupabaseClient,
  accessToken: string,
  actionDescription: string,
) {
  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError) {
    console.error("Failed to resolve user from access token", userError);
    return { status: 401, body: { error: "Invalid authorization token" } } as const;
  }

  const user = userData?.user;

  if (!user) {
    return { status: 401, body: { error: "Invalid authorization token" } } as const;
  }

  const userId = user.id;

  const { data: perfil, error: perfilError } = await supabaseAdmin
    .from("perfiles")
    .select("rol, activo")
    .eq("user_id", userId)
    .maybeSingle();

  if (perfilError) {
    console.error("Error verifying perfil:", perfilError);
    return { status: 500, body: { error: "Failed to verify user profile" } } as const;
  }

  if (!perfil) {
    console.warn(
      `User ${user.email ?? userId} attempted to ${actionDescription} but no perfil row was found.`,
    );
    return {
      status: 403,
      body: { error: `Back-office profile not found for user ${user.email ?? userId}` },
    } as const;
  }

  const normalizedPerfilRole = normalizeRole(perfil.rol);
  if (perfil.activo === false) {
    console.warn(
      `Inactive user ${user.email ?? userId} attempted to ${actionDescription}.`,
    );
    return {
      status: 403,
      body: { error: `Back-office profile is inactive for user ${user.email ?? userId}` },
    } as const;
  }

  if (normalizedPerfilRole !== "ADMIN" && normalizedPerfilRole !== "OPERADOR") {
    console.warn(
      `User ${user.email ?? userId} attempted to ${actionDescription} with role "${perfil.rol}".`,
    );
    return {
      status: 403,
      body: { error: `Only back-office users can ${actionDescription}` },
    } as const;
  }

  return { userId, rol: normalizedPerfilRole } as const;
}

function extractAccessToken(header?: string) {
  const token = header?.split(" ")[1];
  return token && token.length > 0 ? token : null;
}

const isMissingStorageFileError = (message: string) => {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("not found")
    || normalized.includes("does not exist")
    || normalized.includes("no such")
    || normalized.includes("404");
};

const normalizePresupuestoStoragePath = (rawPath?: string | null) => {
  let path = String(rawPath || "").trim();
  if (!path) return null;

  if (/^https?:\/\//i.test(path)) {
    try {
      const parsedUrl = new URL(path);
      path = parsedUrl.pathname || "";
    } catch {
      // keep original path when URL parsing fails
    }
  }

  path = path.split("?")[0]?.split("#")[0] || path;

  try {
    path = decodeURIComponent(path);
  } catch {
    // ignore malformed URI sequences and continue with raw value
  }

  const marker = "/presupuestos/";
  const markerIndex = path.toLowerCase().indexOf(marker);
  if (markerIndex >= 0) {
    path = path.slice(markerIndex + marker.length);
  }

  path = path
    .replace(/^\/+/, "")
    .replace(/^storage\/v1\/object\/(?:public|sign|authenticated)\/presupuestos\//i, "")
    .replace(/^object\/(?:public|sign|authenticated)\/presupuestos\//i, "")
    .replace(/^presupuestos\//i, "")
    .trim();

  return path || null;
};

const buildPresupuestoStorageCandidates = (rawPath?: string | null) => {
  const candidates = new Set<string>();
  const raw = String(rawPath || "").trim();

  if (!raw) return [];

  const normalized = normalizePresupuestoStoragePath(raw);
  if (normalized) {
    candidates.add(normalized);
  }

  const rawWithoutQuery = raw.split("?")[0]?.split("#")[0] || raw;
  if (rawWithoutQuery && !/^https?:\/\//i.test(rawWithoutQuery)) {
    candidates.add(rawWithoutQuery.replace(/^\/+/, "").replace(/^presupuestos\//i, ""));
  }

  return Array.from(candidates).filter(Boolean);
};

const toBase64Url = (value: string) =>
  value
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");

const timingSafeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
};

let presupuestoShortLinkCryptoKey: Promise<CryptoKey> | null = null;

const getPresupuestoShortLinkCryptoKey = () => {
  if (!presupuestoShortLinkCryptoKey) {
    presupuestoShortLinkCryptoKey = crypto.subtle.importKey(
      "raw",
      TEXT_ENCODER.encode(SUPABASE_SERVICE_ROLE_KEY),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
  }

  return presupuestoShortLinkCryptoKey;
};

const buildPresupuestoShortLinkPayload = (reservaId: number, expiresAtBase36: string) =>
  `${reservaId}.${expiresAtBase36}`;

async function buildPresupuestoShortLinkSignature(payload: string) {
  const cryptoKey = await getPresupuestoShortLinkCryptoKey();
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, TEXT_ENCODER.encode(payload));
  const signatureBase64 = bytesToBase64(new Uint8Array(signature));

  return toBase64Url(signatureBase64).slice(0, PRESUPUESTO_SHORT_LINK_SIGNATURE_LENGTH);
}

const buildPresupuestoShortLinkUrl = (token: string) =>
  new URL(
    `/functions/v1/server/${PRESUPUESTO_SHORT_LINK_ROUTE_SEGMENT}/${token}`,
    SUPABASE_URL,
  ).toString();

async function createPresupuestoShortLink(
  reservaId: number,
  ttlSeconds: number,
) {
  if (!Number.isFinite(reservaId) || reservaId <= 0) {
    return null;
  }

  const safeTtlSeconds = Math.max(
    PRESUPUESTO_SHORT_LINK_MIN_TTL_SECONDS,
    Math.floor(Number(ttlSeconds) || 0),
  );
  const expiresAtUnix = Math.floor(Date.now() / 1000) + safeTtlSeconds;
  const expiresAtBase36 = expiresAtUnix.toString(36);
  const payload = buildPresupuestoShortLinkPayload(reservaId, expiresAtBase36);
  const signature = await buildPresupuestoShortLinkSignature(payload);
  const token = `${payload}.${signature}`;

  return {
    shortUrl: buildPresupuestoShortLinkUrl(token),
    expiresAtUnix,
    token,
  } as const;
}

async function resolvePresupuestoShortLinkToken(token: string) {
  const tokenMatch = String(token || "")
    .trim()
    .match(/^([1-9]\d*)\.([0-9a-z]+)\.([A-Za-z0-9_-]{8,128})$/i);

  if (!tokenMatch) {
    return {
      status: 400,
      error: "Enlace de presupuesto invalido",
    } as const;
  }

  const reservaId = Number.parseInt(tokenMatch[1], 10);
  const expiresAtBase36 = tokenMatch[2].toLowerCase();
  const expiresAtUnix = Number.parseInt(expiresAtBase36, 36);
  const signature = tokenMatch[3];

  if (!Number.isFinite(reservaId) || reservaId <= 0 || !Number.isFinite(expiresAtUnix) || expiresAtUnix <= 0) {
    return {
      status: 400,
      error: "Enlace de presupuesto invalido",
    } as const;
  }

  if (expiresAtUnix < Math.floor(Date.now() / 1000)) {
    return {
      status: 410,
      error: "El enlace del presupuesto expiro",
    } as const;
  }

  const payload = buildPresupuestoShortLinkPayload(reservaId, expiresAtBase36);
  const expectedSignature = await buildPresupuestoShortLinkSignature(payload);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return {
      status: 403,
      error: "Enlace de presupuesto invalido",
    } as const;
  }

  return { reservaId } as const;
}

async function createPresupuestoSignedUrl(
  supabaseAdmin: SupabaseClient,
  rawPath: string | null | undefined,
  expiresInSeconds: number,
) {
  const storagePaths = buildPresupuestoStorageCandidates(rawPath);

  if (!storagePaths.length) {
    return {
      status: 404,
      error: "La reserva no tiene presupuesto generado",
    } as const;
  }

  let lastMissingError = "";

  for (const storagePath of storagePaths) {
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from(PRESUPUESTOS_BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (!signedError && signedData?.signedUrl) {
      return {
        signedUrl: signedData.signedUrl,
        storagePath,
      } as const;
    }

    const errorMessage = signedError?.message || "No se pudo firmar la URL del presupuesto";
    if (isMissingStorageFileError(errorMessage)) {
      lastMissingError = errorMessage;
      continue;
    }

    return {
      status: 500,
      error: errorMessage,
    } as const;
  }

  return {
    status: 404,
    error: lastMissingError || "No se encontro el presupuesto en storage",
  } as const;
}

async function downloadPresupuestoFile(
  supabaseAdmin: SupabaseClient,
  rawPath: string | null | undefined,
) {
  const storagePaths = buildPresupuestoStorageCandidates(rawPath);

  if (!storagePaths.length) {
    return {
      status: 404,
      error: "La reserva no tiene presupuesto generado",
    } as const;
  }

  let lastMissingError = "";

  for (const storagePath of storagePaths) {
    const { data: fileData, error: fileError } = await supabaseAdmin.storage
      .from(PRESUPUESTOS_BUCKET)
      .download(storagePath);

    if (!fileError && fileData) {
      return {
        fileData,
        storagePath,
      } as const;
    }

    const errorMessage = fileError?.message || "No se pudo descargar el presupuesto";
    if (isMissingStorageFileError(errorMessage)) {
      lastMissingError = errorMessage;
      continue;
    }

    return {
      status: 500,
      error: errorMessage,
    } as const;
  }

  return {
    status: 404,
    error: lastMissingError || "No se encontro el presupuesto en storage",
  } as const;
}

const deletePresupuestoFromStorage = async (
  supabaseAdmin: SupabaseClient,
  rawPaths: Array<string | null | undefined>,
) => {
  const storagePaths = Array.from(
    new Set(rawPaths.flatMap((rawPath) => buildPresupuestoStorageCandidates(rawPath))),
  );

  if (!storagePaths.length) {
    return { deleted: false as const };
  }

  for (const storagePath of storagePaths) {
    const { error: storageError } = await supabaseAdmin.storage
      .from(PRESUPUESTOS_BUCKET)
      .remove([storagePath]);

    if (!storageError) {
      return { deleted: true as const, storagePath };
    }

    const storageErrorMessage = storageError.message || String(storageError);
    if (isMissingStorageFileError(storageErrorMessage)) {
      continue;
    }

    return {
      deleted: false as const,
      error: `No se pudo eliminar el presupuesto asociado (${storageErrorMessage}).`,
    };
  }

  return { deleted: false as const };
};

const resolvePresupuestoContacto = async (
  supabaseAdmin: SupabaseClient,
  creadoPor?: string | null,
): Promise<PresupuestoContacto> => {
  const loadContactoFromPerfil = async (perfil: { user_id: string; nombre?: string | null }) => {
    const nombre = String(perfil.nombre || "").trim();
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(perfil.user_id);
    const email = String(userData?.user?.email || "").trim();

    if (userError || !nombre || !email) return null;
    return { nombre, email };
  };

  if (creadoPor) {
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("perfiles")
      .select("user_id, nombre")
      .eq("user_id", creadoPor)
      .maybeSingle();

    if (perfilError) {
      throw new Error(`No se pudo obtener el perfil del creador del presupuesto (${perfilError.message}).`);
    }

    if (!perfil) {
      throw new Error("No se encontrÃ³ el perfil del usuario que creÃ³ la reserva.");
    }

    const contacto = await loadContactoFromPerfil(perfil);
    if (!contacto) {
      throw new Error("El usuario que creÃ³ la reserva no tiene nombre completo o email disponible.");
    }

    return contacto;
  }

  const { data: perfilesAdmin, error: perfilesError } = await supabaseAdmin
    .from("perfiles")
    .select("user_id, nombre, activo, creado_en")
    .eq("rol", "ADMIN")
    .order("creado_en", { ascending: true });

  if (perfilesError) {
    throw new Error(`No se pudo obtener un administrador para el presupuesto pÃºblico (${perfilesError.message}).`);
  }

  for (const perfil of perfilesAdmin || []) {
    if (perfil.activo === false) continue;
    const contacto = await loadContactoFromPerfil(perfil);
    if (contacto) return contacto;
  }

  throw new Error("No hay un usuario administrador activo con nombre completo y email disponible.");
};

const loadReservaPresupuestoContext = async (
  supabaseAdmin: SupabaseClient,
  reservaId: number,
) => {
  const { data: reservaData, error: reservaError } = await supabaseAdmin
    .from("reservas")
    .select(
      "id, id_salon, id_distribucion, cliente_nombre, cliente_email, cliente_telefono, fecha_inicio, fecha_fin, cantidad_personas, monto, observaciones, presupuesto_url, creado_por",
    )
    .eq("id", reservaId)
    .maybeSingle();

  if (reservaError) {
    throw new Error(`No se pudo obtener la reserva (${reservaError.message}).`);
  }

  if (!reservaData) {
    throw new Error("Reserva no encontrada.");
  }

  const { data: salonData, error: salonError } = await supabaseAdmin
    .from("salones")
    .select("id, nombre, descripcion, precio_base, capacidad")
    .eq("id", reservaData.id_salon)
    .maybeSingle();

  if (salonError) {
    throw new Error(`No se pudo obtener el salÃ³n (${salonError.message}).`);
  }

  if (!salonData) {
    throw new Error("No se encontrÃ³ el salÃ³n asociado a la reserva.");
  }

  let distribucionData: { id: number; nombre: string; capacidad: number } | null = null;
  if (reservaData.id_distribucion) {
    const { data, error } = await supabaseAdmin
      .from("distribuciones")
      .select("id, nombre, capacidad")
      .eq("id", reservaData.id_distribucion)
      .maybeSingle();

    if (error) {
      throw new Error(`No se pudo obtener la distribuciÃ³n (${error.message}).`);
    }

    distribucionData = data || null;
  }

  const { data: reservaServiciosData, error: reservaServiciosError } = await supabaseAdmin
    .from("reserva_servicios")
    .select("cantidad, servicio:servicios(id, nombre, descripcion, precio, categoria:categorias_servicios(id, nombre, descripcion))")
    .eq("id_reserva", reservaId);

  if (reservaServiciosError) {
    throw new Error(`No se pudieron obtener los servicios de la reserva (${reservaServiciosError.message}).`);
  }

  const serviciosDetalle: PresupuestoServicio[] = (reservaServiciosData || [])
    .map((item: any) => {
      const servicioInfo = item?.servicio;
      if (!servicioInfo) return null;

      return {
        servicio: servicioInfo,
        cantidad: Number(item?.cantidad) || 1,
      };
    })
    .filter((item): item is PresupuestoServicio => Boolean(item));

  const tipoEvento = extractTipoEventoFromObservaciones(reservaData.observaciones);
  const salonDailyPrice = Number(salonData.precio_base) || 0;
  const totalSalon = Number(reservaData.monto) || 0;
  const salonDaysFromMonto = salonDailyPrice > 0 && totalSalon > 0
    ? roundBillableDayUnits(totalSalon / salonDailyPrice)
    : 0;
  const salonDays = salonDaysFromMonto || calculateSalonBillableDayUnitsFromDateTimes(
    reservaData.fecha_inicio,
    reservaData.fecha_fin,
  );
  const contacto = await resolvePresupuestoContacto(supabaseAdmin, reservaData.creado_por);

  return {
    reserva: reservaData,
    salon: salonData,
    distribucion: distribucionData,
    cliente: {
      nombre: reservaData.cliente_nombre || "Reserva sin cliente",
      email: reservaData.cliente_email || null,
      telefono: reservaData.cliente_telefono || null,
    },
    fechaInicio: reservaData.fecha_inicio,
    fechaFin: reservaData.fecha_fin,
    tipoEvento,
    totalSalon,
    precioSalonDiario: salonDailyPrice,
    diasSalon: salonDays,
    cantidadPersonas: Number(reservaData.cantidad_personas) || 0,
    servicios: serviciosDetalle,
    contacto,
  };
};

const roundCurrencyAmount = (value: number) =>
  Math.round(value * 100) / 100;

const getPresupuestoTotal = ({
  totalSalon,
  servicios,
}: {
  totalSalon: number;
  servicios: PresupuestoServicio[];
}) => roundCurrencyAmount(
  (Number(totalSalon) || 0)
    + servicios.reduce((acc, { servicio, cantidad }) => {
      const unit = Number(servicio?.precio) || 0;
      return acc + unit * (Number(cantidad) || 0);
    }, 0),
);

const upsertPresupuestoForReserva = async (
  supabaseAdmin: SupabaseClient,
  reservaId: number,
  previousStoragePath?: string | null,
) => {
  const context = await loadReservaPresupuestoContext(supabaseAdmin, reservaId);

  const fileName = buildPresupuestoFileName({
    nombreBase: context.cliente.nombre?.trim() || null,
    tipoEvento: context.tipoEvento,
    fechaInicio: context.fechaInicio,
    fallbackEvento: context.salon.nombre,
  });
  const storagePath = `reservas/${reservaId}/${fileName}`;

  const previousNormalizedPath = normalizePresupuestoStoragePath(
    previousStoragePath || context.reserva.presupuesto_url,
  );
  const nextNormalizedPath = normalizePresupuestoStoragePath(storagePath);

  if (
    previousNormalizedPath
    && nextNormalizedPath
    && previousNormalizedPath !== nextNormalizedPath
  ) {
    const deleteStorageResult = await deletePresupuestoFromStorage(supabaseAdmin, [previousNormalizedPath]);
    if ("error" in deleteStorageResult && deleteStorageResult.error) {
      throw new Error(deleteStorageResult.error);
    }
  }

  const pdfBuffer = await buildPresupuestoPdf({
    reservaId,
    salon: context.salon,
    distribucion: context.distribucion,
    cliente: context.cliente,
    fechaInicio: context.fechaInicio,
    fechaFin: context.fechaFin,
    tipoEvento: context.tipoEvento,
    totalSalon: context.totalSalon,
    precioSalonDiario: context.precioSalonDiario,
    diasSalon: context.diasSalon,
    cantidadPersonas: context.cantidadPersonas,
    servicios: context.servicios,
    contacto: context.contacto,
  });

  const { error: uploadError } = await supabaseAdmin.storage
    .from(PRESUPUESTOS_BUCKET)
    .upload(storagePath, pdfBuffer, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`No se pudo subir el presupuesto al storage (${uploadError.message}).`);
  }

  const { error: updateError } = await supabaseAdmin
    .from("reservas")
    .update({
      presupuesto_url: storagePath,
      presupuesto_emitido_en: new Date().toISOString(),
    })
    .eq("id", reservaId);

  if (updateError) {
    throw new Error(`No se pudo actualizar la reserva con el presupuesto (${updateError.message}).`);
  }

  const { error: montoInicialError } = await supabaseAdmin
    .from("reservas")
    .update({ monto_inicial: getPresupuestoTotal(context) })
    .eq("id", reservaId)
    .is("monto_inicial", null);

  if (montoInicialError) {
    throw new Error(`No se pudo registrar el monto inicial del presupuesto (${montoInicialError.message}).`);
  }

  return {
    storagePath,
    fileName,
    pdfBuffer,
    context,
  };
};

async function sendGeneratedPresupuestoToClient(
  smtpConfig: SmtpConfig,
  supabaseAdmin: SupabaseClient,
  input: {
    action: ReservaEmailAction;
    reservaId: number;
    storagePath: string;
    fileName: string;
    pdfBuffer: Uint8Array;
    clienteNombre?: string | null;
    clienteEmail?: string | null;
    fechaInicio: string;
    fechaFin: string;
  },
) {
  const clienteEmail = normalizeEmail(input.clienteEmail);
  if (!clienteEmail) {
    return { sent: false, reason: "missing_client_email" } as const;
  }

  const signedUrlResult = await createPresupuestoSignedUrl(
    supabaseAdmin,
    input.storagePath,
    PRESUPUESTO_EMAIL_LINK_TTL_SECONDS,
  );
  if ("error" in signedUrlResult) {
    throw new Error(signedUrlResult.error);
  }

  let shortUrl: string | null = null;
  try {
    const shortLinkResult = await createPresupuestoShortLink(
      input.reservaId,
      PRESUPUESTO_EMAIL_LINK_TTL_SECONDS,
    );
    shortUrl = shortLinkResult?.shortUrl || null;
  } catch (shortLinkError) {
    console.warn("No se pudo generar enlace corto para el presupuesto por email:", shortLinkError);
  }

  await sendPresupuestoReservationEmail(smtpConfig, {
    to: clienteEmail,
    reservaId: input.reservaId,
    clienteNombre: input.clienteNombre,
    fechaInicio: input.fechaInicio,
    fechaFin: input.fechaFin,
    downloadUrl: shortUrl || signedUrlResult.signedUrl,
    attachmentFileName: input.fileName,
    attachmentContent: Buffer.from(input.pdfBuffer),
    hasChanges: input.action === "updated",
  });

  return { sent: true, sentTo: clienteEmail } as const;
}

const toValidDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getReservaExpirationBaseDate = (
  reserva: { presupuesto_emitido_en?: string | null },
) => toValidDate(reserva.presupuesto_emitido_en);

const asMetadataObject = (metadata: unknown): Record<string, unknown> => {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, unknown>;
};

const getMetadataString = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
};

const getMetadataNumber = (metadata: Record<string, unknown>, key: string) => {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

app.post("/make-server-484a241a/request-password-reset", async (c) => {
  try {
    const supabaseAdmin = createServiceClient();
    const body = await c.req.json();
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!email) {
      return c.json({ error: "Missing required field: email" }, 400);
    }

    const rateLimitResponse = await applyRateLimit(
      c,
      supabaseAdmin,
      "password-reset",
      [getClientIp(c), email],
      PASSWORD_RESET_RATE_LIMIT,
    );
    if (rateLimitResponse) return rateLimitResponse;

    const smtpConfig = getSmtpConfig();

    const redirectTo = buildPasswordRecoveryRedirectUrl(c, body?.redirectTo);
    if (!redirectTo) {
      return c.json({ error: "No se pudo determinar la URL de redirección" }, 400);
    }

    const { data: linkData, error: generateLinkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo,
      },
    });

    if (generateLinkError) {
      const normalizedErrorMessage = String(generateLinkError.message || "").toLowerCase();
      const shouldMaskMissingUserError =
        normalizedErrorMessage.includes("user not found")
        || normalizedErrorMessage.includes("email not found")
        || normalizedErrorMessage.includes("email address not authorized")
        || normalizedErrorMessage.includes("unable to validate email address");

      if (shouldMaskMissingUserError) {
        return c.json({ success: true });
      }

      console.error("Error generating password recovery link:", generateLinkError);
      return c.json(
        { error: generateLinkError.message || "No se pudo generar el enlace de recuperación" },
        500,
      );
    }

    const recoveryUser = linkData.user;
    const hashedToken = linkData.properties?.hashed_token;

    if (!recoveryUser?.id || !recoveryUser.email || !hashedToken) {
      return c.json({ success: true });
    }

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from("perfiles")
      .select("user_id, activo")
      .eq("user_id", recoveryUser.id)
      .maybeSingle();

    if (perfilError) {
      console.error("Error checking perfil for password recovery:", perfilError);
      return c.json({ error: "No se pudo validar el usuario de recuperación" }, 500);
    }

    if (!perfil || perfil.activo === false) {
      return c.json({ success: true });
    }

    const recoveryLink = buildPasswordRecoveryAppLink(redirectTo, hashedToken);
    await sendPasswordRecoveryEmail(smtpConfig, recoveryUser.email, recoveryLink);

    return c.json({ success: true });
  } catch (error: any) {
    console.error("Error in request-password-reset endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

app.post("/server/make-server-484a241a/request-password-reset", async (c) =>
  app.fetch(new Request(new URL("/make-server-484a241a/request-password-reset", c.req.url), c.req.raw)));

app.post("/make-server-484a241a/create-user", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "create users");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const { email, password, nombre, rol } = body ?? {};
    const sanitizedEmail = typeof email === "string" ? email.trim() : "";
    const sanitizedNombre = typeof nombre === "string" ? nombre.trim() : "";
    const normalizedRol = normalizeRole(rol);

    if (!sanitizedEmail || !password || !sanitizedNombre || !normalizedRol) {
      return c.json(
        { error: "Missing required fields: email, password, nombre, rol" },
        400,
      );
    }

    if (!["ADMIN", "OPERADOR"].includes(normalizedRol)) {
      return c.json({ error: "Invalid role. Must be ADMIN or OPERADOR" }, 400);
    }

    const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, sanitizedEmail);

    if (existingAuthUser) {
      const { data: existingPerfil, error: existingPerfilError } = await supabaseAdmin
        .from("perfiles")
        .select("user_id, nombre, rol, activo")
        .eq("user_id", existingAuthUser.id)
        .maybeSingle();

      if (existingPerfilError) {
        console.error("Error loading existing perfil for create-user:", existingPerfilError);
        return c.json({ error: "No se pudo validar el perfil existente" }, 500);
      }

      if (existingPerfil?.activo !== false && existingPerfil) {
        return c.json({ error: "Ya existe un usuario activo con ese email" }, 409);
      }

      const { data: reactivatedUser, error: reactivateAuthError } =
        await supabaseAdmin.auth.admin.updateUserById(existingAuthUser.id, {
          email: sanitizedEmail,
          password,
          email_confirm: true,
          ban_duration: "none",
          user_metadata: {
            ...existingAuthUser.user_metadata,
            nombre: sanitizedNombre,
          },
          app_metadata: {
            ...existingAuthUser.app_metadata,
            role: normalizedRol,
            active: true,
          },
        });

      if (reactivateAuthError || !reactivatedUser?.user) {
        console.error("Error reactivating auth user:", reactivateAuthError);
        return c.json({ error: reactivateAuthError?.message ?? "Failed to reactivate user" }, 400);
      }

      const { error: perfilReactivateError } = await supabaseAdmin
        .from("perfiles")
        .upsert(
          {
            user_id: existingAuthUser.id,
            nombre: sanitizedNombre,
            rol: normalizedRol,
            activo: true,
          },
          { onConflict: "user_id" },
        );

      if (perfilReactivateError) {
        console.error("Error reactivating perfil:", perfilReactivateError);
        return c.json({ error: "Failed to reactivate user profile" }, 500);
      }

      return c.json({
        success: true,
        reactivated: true,
        user: {
          id: reactivatedUser.user.id,
          email: reactivatedUser.user.email,
          nombre: sanitizedNombre,
          rol: normalizedRol,
        },
      });
    }

    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: sanitizedEmail,
      password,
      email_confirm: true,
      user_metadata: { nombre: sanitizedNombre },
      app_metadata: { role: normalizedRol, active: true },
    });

    if (createError || !newUser?.user) {
      console.error("Error creating user:", createError);
      return c.json({ error: createError?.message ?? "Failed to create user" }, 400);
    }

    const { error: perfilCreateError } = await supabaseAdmin
      .from("perfiles")
      .insert([
        {
          user_id: newUser.user.id,
          nombre: sanitizedNombre,
          rol: normalizedRol,
          activo: true,
        },
      ]);

    if (perfilCreateError) {
      console.error("Error creating perfil:", perfilCreateError);
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      return c.json({ error: "Failed to create user profile" }, 500);
    }

    return c.json({
      success: true,
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        nombre: sanitizedNombre,
        rol: normalizedRol,
      },
    });
  } catch (error) {
    console.error("Error in create-user endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

app.post("/make-server-484a241a/update-user-email", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "update user emails");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const { userId, newEmail } = body ?? {};

    if (!userId || !newEmail) {
      return c.json({ error: "Missing required fields: userId, newEmail" }, 400);
    }

    const { data: updatedUser, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { email: newEmail },
    );

    if (updateError || !updatedUser?.user) {
      console.error("Error updating user email:", updateError);
      return c.json({ error: updateError?.message ?? "Failed to update user email" }, 400);
    }

    return c.json({
      success: true,
      user: {
        id: updatedUser.user.id,
        email: updatedUser.user.email,
      },
    });
  } catch (error) {
    console.error("Error in update-user-email endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

app.post("/make-server-484a241a/get-user-email", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "view user emails");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const { userId } = body ?? {};

    if (!userId) {
      return c.json({ error: "Missing required field: userId" }, 400);
    }

    const { data: userData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (getUserError || !userData?.user) {
      console.error("Error getting user:", getUserError);
      return c.json({ error: getUserError?.message ?? "Failed to get user" }, 400);
    }

    return c.json({
      success: true,
      email: userData.user.email,
    });
  } catch (error) {
    console.error("Error in get-user-email endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

app.post("/make-server-484a241a/delete-user", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "delete users");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const { userId } = body ?? {};

    if (!userId) {
      return c.json({ error: "Missing required field: userId" }, 400);
    }

    const { data: targetPerfil, error: targetPerfilError } = await supabaseAdmin
      .from("perfiles")
      .select("user_id, nombre, rol, activo")
      .eq("user_id", userId)
      .maybeSingle();

    if (targetPerfilError) {
      console.error("Error loading perfil to delete:", targetPerfilError);
      return c.json({ error: targetPerfilError.message }, 400);
    }

    if (!targetPerfil) {
      return c.json({ error: "User profile not found" }, 404);
    }

    const targetRole = normalizeRole(targetPerfil.rol);

    if (targetRole === "ADMIN") {
      return c.json({ error: "No se pueden eliminar usuarios administradores" }, 403);
    }

    if (targetRole !== "OPERADOR") {
      return c.json({ error: "Solo se pueden eliminar usuarios operadores" }, 403);
    }

    if (targetPerfil.activo !== false) {
      const { error: updatePerfilError } = await supabaseAdmin
        .from("perfiles")
        .update({ activo: false })
        .eq("user_id", userId)
        .eq("rol", "OPERADOR");

      if (updatePerfilError) {
        console.error("Error soft deleting perfil:", updatePerfilError);
        return c.json({ error: updatePerfilError.message }, 400);
      }
    }

    const { data: authUserData, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (getUserError) {
      console.warn("Perfil was soft deleted, but auth user metadata could not be loaded:", getUserError);
    } else if (authUserData?.user) {
      const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: {
          ...authUserData.user.app_metadata,
          role: targetRole,
          active: false,
        },
      });

      if (updateUserError) {
        console.warn("Perfil was soft deleted, but auth user metadata could not be updated:", updateUserError);
      }
    }

    return c.json({ success: true, userId, activo: false });
  } catch (error) {
    console.error("Error in delete-user endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

app.post("/make-server-484a241a/reset-user-password", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "reset user passwords");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const { userId, newPassword } = body ?? {};

    if (!userId || !newPassword) {
      return c.json({ error: "Missing required fields: userId, newPassword" }, 400);
    }

    if (String(newPassword).length < 6) {
      return c.json({ error: "Password must be at least 6 characters long" }, 400);
    }

    const { error: updatePasswordError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword },
    );

    if (updatePasswordError) {
      console.error("Error resetting user password:", updatePasswordError);
      return c.json({ error: updatePasswordError.message }, 400);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error("Error in reset-user-password endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

const openPresupuestoShortLinkHandler = async (c: any) => {
  try {
    const token = c.req.param("token");
    const tokenResult = await resolvePresupuestoShortLinkToken(token);
    if ("error" in tokenResult) {
      return c.text(tokenResult.error, tokenResult.status);
    }

    const supabaseAdmin = createServiceClient();
    const { data: reservaData, error: reservaError } = await supabaseAdmin
      .from("reservas")
      .select("presupuesto_url")
      .eq("id", tokenResult.reservaId)
      .maybeSingle();

    if (reservaError) {
      console.error("Error resolving presupuesto short link:", reservaError);
      return c.text("No se pudo resolver el enlace del presupuesto", 500);
    }

    if (!reservaData?.presupuesto_url) {
      return c.text("La reserva no tiene presupuesto generado", 404);
    }

    const signedUrlResult = await createPresupuestoSignedUrl(
      supabaseAdmin,
      reservaData.presupuesto_url,
      PRESUPUESTO_SHORT_LINK_SIGNED_URL_TTL_SECONDS,
    );
    if ("error" in signedUrlResult) {
      return c.text(signedUrlResult.error, signedUrlResult.status);
    }

    return c.redirect(signedUrlResult.signedUrl, 302);
  } catch (error) {
    console.error("Error in presupuesto short link endpoint:", error);
    return c.text("No se pudo abrir el presupuesto", 500);
  }
};

app.get("/make-server-484a241a/p/:token", openPresupuestoShortLinkHandler);
app.get("/server/make-server-484a241a/p/:token", openPresupuestoShortLinkHandler);
app.get("/p/:token", openPresupuestoShortLinkHandler);
app.get("/server/p/:token", openPresupuestoShortLinkHandler);

app.post("/make-server-484a241a/get-presupuesto-url", async (c) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const accessCheck = await requireBackofficeUser(
      supabaseAdmin,
      accessToken,
      "open reservation budgets",
    );

    if ("status" in accessCheck) {
      return c.json(accessCheck.body, accessCheck.status);
    }

    const body = await c.req.json();
    const reservaId = Number(body?.reservaId);
    const presupuestoPathFromBody = typeof body?.presupuestoPath === "string" ? body.presupuestoPath.trim() : "";

    let presupuestoPath = presupuestoPathFromBody;

    if (!presupuestoPath) {
      if (!Number.isFinite(reservaId) || reservaId <= 0) {
        return c.json({ error: "Missing required field: reservaId or presupuestoPath" }, 400);
      }

      const { data: reservaData, error: reservaError } = await supabaseAdmin
        .from("reservas")
        .select("presupuesto_url")
        .eq("id", reservaId)
        .single();

      if (reservaError) {
        return c.json({ error: reservaError.message }, 400);
      }

      presupuestoPath = reservaData?.presupuesto_url || "";
    }

    const signedUrlResult = await createPresupuestoSignedUrl(supabaseAdmin, presupuestoPath, 60);
    if ("error" in signedUrlResult) {
      return c.json({ error: signedUrlResult.error }, signedUrlResult.status);
    }

    let shortUrl: string | null = null;
    if (Number.isFinite(reservaId) && reservaId > 0) {
      try {
        const shortLinkResult = await createPresupuestoShortLink(reservaId, 60);
        shortUrl = shortLinkResult?.shortUrl || null;
      } catch (shortLinkError) {
        console.warn("No se pudo generar el enlace corto del presupuesto:", shortLinkError);
      }
    }

    return c.json({
      signedUrl: signedUrlResult.signedUrl,
      shortUrl,
      accessUrl: shortUrl || signedUrlResult.signedUrl,
    });
  } catch (error) {
    console.error("Error in get-presupuesto-url endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
});

const sendPresupuestoEmailHandler = async (c: any) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const accessCheck = await requireBackofficeUser(
      supabaseAdmin,
      accessToken,
      "send reservation budgets by email",
    );

    if ("status" in accessCheck) {
      return c.json(accessCheck.body, accessCheck.status);
    }

    const body = await c.req.json();
    const reservaId = Number(body?.reservaId);
    const presupuestoPathFromBody = typeof body?.presupuestoPath === "string"
      ? body.presupuestoPath.trim()
      : "";
    const hasChanges = body?.hasChanges === true;

    if (!Number.isFinite(reservaId) || reservaId <= 0) {
      return c.json({ error: "Missing required field: reservaId" }, 400);
    }

    const { data: reservaData, error: reservaError } = await supabaseAdmin
      .from("reservas")
      .select("id, cliente_nombre, cliente_email, fecha_inicio, fecha_fin, presupuesto_url")
      .eq("id", reservaId)
      .maybeSingle();

    if (reservaError) {
      return c.json({ error: reservaError.message }, 400);
    }

    if (!reservaData) {
      return c.json({ error: "Reserva no encontrada" }, 404);
    }

    const clienteEmail = typeof reservaData.cliente_email === "string"
      ? reservaData.cliente_email.trim()
      : "";

    if (!clienteEmail) {
      return c.json({ error: "La reserva no tiene un correo electrónico asociado" }, 400);
    }

    const presupuestoPath = presupuestoPathFromBody
      || (typeof reservaData.presupuesto_url === "string" ? reservaData.presupuesto_url.trim() : "");

    const signedUrlResult = await createPresupuestoSignedUrl(
      supabaseAdmin,
      presupuestoPath,
      PRESUPUESTO_EMAIL_LINK_TTL_SECONDS,
    );
    if ("error" in signedUrlResult) {
      return c.json({ error: signedUrlResult.error }, signedUrlResult.status);
    }

    let shortUrl: string | null = null;
    try {
      const shortLinkResult = await createPresupuestoShortLink(
        reservaData.id,
        PRESUPUESTO_EMAIL_LINK_TTL_SECONDS,
      );
      shortUrl = shortLinkResult?.shortUrl || null;
    } catch (shortLinkError) {
      console.warn("No se pudo generar enlace corto para presupuesto por email:", shortLinkError);
    }

    const presupuestoFileResult = await downloadPresupuestoFile(supabaseAdmin, presupuestoPath);
    if ("error" in presupuestoFileResult) {
      return c.json({ error: presupuestoFileResult.error }, presupuestoFileResult.status);
    }

    const smtpConfig = getSmtpConfig();
    const attachmentContent = Buffer.from(await presupuestoFileResult.fileData.arrayBuffer());
    const attachmentFileName = buildPresupuestoFileName({
      nombreBase: `Presupuesto ${reservaData.cliente_nombre || `Reserva ${reservaData.id}`}`,
      fechaInicio: reservaData.fecha_inicio,
      fallbackEvento: `Reserva ${reservaData.id}`,
    });

    await sendPresupuestoReservationEmail(smtpConfig, {
      to: clienteEmail,
      reservaId: reservaData.id,
      clienteNombre: reservaData.cliente_nombre,
      fechaInicio: reservaData.fecha_inicio,
      fechaFin: reservaData.fecha_fin,
      downloadUrl: shortUrl || signedUrlResult.signedUrl,
      attachmentFileName,
      attachmentContent,
      hasChanges,
    });

    return c.json({
      success: true,
      sentTo: clienteEmail,
      shortUrl,
    });
  } catch (error) {
    console.error("Error in send-presupuesto-email endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
};

app.post("/make-server-484a241a/send-presupuesto-email", sendPresupuestoEmailHandler);
app.post("/server/make-server-484a241a/send-presupuesto-email", sendPresupuestoEmailHandler);

const upsertPresupuestoHandler = async (c: any) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const accessCheck = await requireBackofficeUser(
      supabaseAdmin,
      accessToken,
      "regenerate reservation budgets",
    );

    if ("status" in accessCheck) {
      return c.json(accessCheck.body, accessCheck.status);
    }

    const body = await c.req.json();
    const reservaId = Number(body?.reservaId);
    const presupuestoPathFromBody = typeof body?.presupuestoPath === "string"
      ? body.presupuestoPath.trim()
      : "";
    const notificationAction: ReservaEmailAction | null =
      body?.notificationAction === "created" || body?.notificationAction === "updated"
        ? body.notificationAction
        : null;

    if (!Number.isFinite(reservaId) || reservaId <= 0) {
      return c.json({ error: "Missing required field: reservaId" }, 400);
    }

    const result = await upsertPresupuestoForReserva(
      supabaseAdmin,
      reservaId,
      presupuestoPathFromBody || null,
    );

    const emailWarnings: string[] = [];
    let clientEmailSent = false;
    let staffEmailsSent = 0;

    if (notificationAction) {
      try {
        const smtpConfig = getSmtpConfig();

        const [clientEmailResult, staffEmailResult] = await Promise.allSettled([
          sendGeneratedPresupuestoToClient(
            smtpConfig,
            supabaseAdmin,
            {
              action: notificationAction,
              reservaId,
              storagePath: result.storagePath,
              fileName: result.fileName,
              pdfBuffer: result.pdfBuffer,
              clienteNombre: result.context.cliente.nombre,
              clienteEmail: result.context.cliente.email,
              fechaInicio: result.context.fechaInicio,
              fechaFin: result.context.fechaFin,
            },
          ),
          sendBackofficeReservaNotificationEmails(
            smtpConfig,
            supabaseAdmin,
            {
              action: notificationAction,
              excludedUserId: accessCheck.userId,
              reservaId,
              clienteNombre: result.context.cliente.nombre,
              clienteEmail: result.context.cliente.email || "No informado",
              clienteTelefono: result.context.cliente.telefono,
              salonNombre: result.context.salon.nombre,
              distribucionNombre: result.context.distribucion?.nombre,
              tipoEvento: result.context.tipoEvento,
              cantidadPersonas: result.context.cantidadPersonas,
              fechaInicio: result.context.fechaInicio,
              fechaFin: result.context.fechaFin,
            },
          ),
        ]);

        if (clientEmailResult.status === "fulfilled") {
          clientEmailSent = clientEmailResult.value.sent;
          if (
            !clientEmailResult.value.sent
            && clientEmailResult.value.reason === "missing_client_email"
          ) {
            emailWarnings.push("Cliente: la reserva no tiene un correo electrónico asociado.");
          }
        } else {
          const message = getErrorMessage(
            clientEmailResult.reason,
            "No se pudo enviar el presupuesto al cliente.",
          );
          emailWarnings.push(`Cliente: ${message}`);
          console.warn("No se pudo enviar el presupuesto al cliente:", clientEmailResult.reason);
        }

        if (staffEmailResult.status === "fulfilled") {
          staffEmailsSent = staffEmailResult.value.recipientsCount;
        } else {
          const message = getErrorMessage(
            staffEmailResult.reason,
            "No se pudo notificar al personal.",
          );
          emailWarnings.push(`Personal: ${message}`);
          console.warn("No se pudo notificar al personal sobre la reserva:", staffEmailResult.reason);
        }
      } catch (smtpError) {
        const message = getErrorMessage(smtpError, "No se pudo configurar el envío de correos.");
        emailWarnings.push(message);
        console.warn("No se pudieron enviar los correos de la reserva:", smtpError);
      }
    }

    return c.json({
      success: true,
      reservaId,
      storagePath: result.storagePath,
      fileName: result.fileName,
      clientEmailSent,
      staffEmailsSent,
      emailWarnings,
    });
  } catch (error) {
    console.error("Error in upsert-presupuesto endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
};

app.post("/make-server-484a241a/upsert-presupuesto", upsertPresupuestoHandler);
app.post("/server/make-server-484a241a/upsert-presupuesto", upsertPresupuestoHandler);

const deleteReservaHandler = async (c: any) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const adminCheck = await requireAdmin(supabaseAdmin, accessToken, "delete reservations");

    if ("status" in adminCheck) {
      return c.json(adminCheck.body, adminCheck.status);
    }

    const body = await c.req.json();
    const reservaId = Number(body?.reservaId);
    const presupuestoPathFromBody = typeof body?.presupuestoPath === "string"
      ? body.presupuestoPath.trim()
      : "";

    if (!Number.isFinite(reservaId) || reservaId <= 0) {
      return c.json({ error: "Missing required field: reservaId" }, 400);
    }

    const { data: reservaData, error: reservaError } = await supabaseAdmin
      .from("reservas")
      .select("id, presupuesto_url")
      .eq("id", reservaId)
      .maybeSingle();

    if (reservaError) {
      return c.json({ error: reservaError.message }, 400);
    }

    if (!reservaData) {
      return c.json({ error: "Reserva no encontrada" }, 404);
    }

    const deleteStorageResult = await deletePresupuestoFromStorage(supabaseAdmin, [
      presupuestoPathFromBody,
      typeof reservaData.presupuesto_url === "string" ? reservaData.presupuesto_url : "",
    ]);

    if ("error" in deleteStorageResult && deleteStorageResult.error) {
      return c.json({ error: deleteStorageResult.error }, 400);
    }

    const { error: deleteError } = await supabaseAdmin
      .from("reservas")
      .delete()
      .eq("id", reservaId);

    if (deleteError) {
      return c.json({ error: deleteError.message }, 400);
    }

    return c.json({
      success: true,
      reservaId,
      presupuestoDeleted: deleteStorageResult.deleted,
    });
  } catch (error) {
    console.error("Error in delete-reserva endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
};

app.post("/make-server-484a241a/delete-reserva", deleteReservaHandler);
app.post("/server/make-server-484a241a/delete-reserva", deleteReservaHandler);

const processReservaVencimientoHandler = async (c: any) => {
  try {
    const accessToken = extractAccessToken(c.req.header("Authorization"));
    if (!accessToken) {
      return c.json({ error: "No authorization token provided" }, 401);
    }

    const supabaseAdmin = createServiceClient();
    const accessCheck = await requireBackofficeUser(
      supabaseAdmin,
      accessToken,
      "process reservation expirations",
    );

    if ("status" in accessCheck) {
      return c.json(accessCheck.body, accessCheck.status);
    }

    const now = new Date();

    const {
      data: reservasCanceladasPorPresupuesto,
      error: cancelacionPresupuestoError,
    } = await supabaseAdmin.rpc("cancelar_reservas_presupuesto_vencido");

    if (cancelacionPresupuestoError) {
      return c.json({ error: cancelacionPresupuestoError.message }, 500);
    }

    const cancelledByBudgetCount = Array.isArray(reservasCanceladasPorPresupuesto)
      ? reservasCanceladasPorPresupuesto.length
      : 0;

    const { data: reservasPendientes, error: reservasError } = await supabaseAdmin
      .from("reservas")
      .select("id, cliente_nombre, estado, fecha_inicio, presupuesto_emitido_en")
      .in("estado", RESERVA_ESTADOS_PENDIENTES_GESTION);

    if (reservasError) {
      return c.json({ error: reservasError.message }, 500);
    }

    const reservas = reservasPendientes || [];
    if (reservas.length === 0) {
      return c.json({
        success: true,
        pendingCount: 0,
        cancelledCount: cancelledByBudgetCount,
        notificationsCreated: cancelledByBudgetCount,
        warningNotificationsCreated: 0,
        cancellationNotificationsCreated: cancelledByBudgetCount,
      });
    }

    const reservaIds = reservas.map((reserva) => reserva.id);

    const { data: notificacionesExistentes, error: notificacionesError } = await supabaseAdmin
      .from("notificaciones")
      .select("id, reserva_id, metadata")
      .in("reserva_id", reservaIds)
      .eq("tipo", "ESTADO_CAMBIADO");

    if (notificacionesError) {
      return c.json({ error: notificacionesError.message }, 500);
    }

    const existingByReserva = new Map<
      number,
      Array<{ id: number; metadata: Record<string, unknown> }>
    >();

    for (const notification of notificacionesExistentes || []) {
      if (!notification?.reserva_id) continue;

      const metadata = asMetadataObject(notification.metadata);
      const origin = getMetadataString(metadata, "origen");
      if (origin !== RESERVA_EXPIRATION_NOTIFICATION_ORIGIN) continue;

      const list = existingByReserva.get(notification.reserva_id) || [];
      list.push({
        id: notification.id,
        metadata,
      });
      existingByReserva.set(notification.reserva_id, list);
    }

    const staleWarningNotificationIds = new Set<number>();
    const warningNotificationsToInsert: Array<Record<string, unknown>> = [];
    const autoCancelNotificationsToInsert: Array<Record<string, unknown>> = [];
    const cancelCandidatesByReservaId = new Map<
      number,
      {
        reason: "inicio_evento";
        cycleKey: string;
        clienteNombre: string;
        estado: string;
      }
    >();

    for (const reserva of reservas) {
      const baseDate = getReservaExpirationBaseDate(reserva);
      const startDate = toValidDate(reserva.fecha_inicio);
      const presupuestoCycleKey = baseDate?.toISOString() || "";
      const startCycleKey = startDate?.toISOString() || "";
      const clienteNombre = (reserva.cliente_nombre || "Sin nombre").trim() || "Sin nombre";

      const existingNotifications = existingByReserva.get(reserva.id) || [];

      for (const existingNotification of existingNotifications) {
        const alertType = getMetadataString(existingNotification.metadata, "alerta");
        const notificationCycleKey = getMetadataString(existingNotification.metadata, "cycle_key");
        const isPresupuestoAlert = alertType === RESERVA_ALERTA_PRESUPUESTO
          || alertType === RESERVA_ALERTA_INACTIVIDAD_LEGACY
          || alertType === RESERVA_ALERTA_INACTIVIDAD_LEGACY_ALT;
        const isInicioAlert = alertType === RESERVA_ALERTA_INICIO_EVENTO;

        if (isPresupuestoAlert && notificationCycleKey !== presupuestoCycleKey) {
          staleWarningNotificationIds.add(existingNotification.id);
          continue;
        }

        if (isInicioAlert && notificationCycleKey !== startCycleKey) {
          staleWarningNotificationIds.add(existingNotification.id);
        }
      }

      let presupuestoDaysRemaining: number | null = null;

      if (baseDate) {
        const expiresAt = new Date(baseDate.getTime() + (RESERVA_AUTO_CANCEL_DAYS * DAY_MS));
        const remainingMs = expiresAt.getTime() - now.getTime();

        if (remainingMs > 0) {
          presupuestoDaysRemaining = Math.ceil(remainingMs / DAY_MS);
        }
      }

      let startDaysRemaining: number | null = null;
      let startReached = false;

      if (startDate) {
        const remainingStartMs = startDate.getTime() - now.getTime();
        if (remainingStartMs <= 0) {
          startReached = true;
        } else {
          startDaysRemaining = Math.ceil(remainingStartMs / DAY_MS);
        }
      }

      if (startReached) {
        cancelCandidatesByReservaId.set(reserva.id, {
          reason: "inicio_evento",
          cycleKey: startCycleKey,
          clienteNombre,
          estado: String(reserva.estado || ""),
        });
        continue;
      }

      if (
        presupuestoDaysRemaining !== null
        && RESERVA_EXPIRATION_WARNING_DAYS.includes(presupuestoDaysRemaining as 1 | 2 | 3)
      ) {
        const warningAlreadyExists = existingNotifications.some((notification) => {
          const alertType = getMetadataString(notification.metadata, "alerta");
          const notificationCycleKey = getMetadataString(notification.metadata, "cycle_key");
          const notificationDays = getMetadataNumber(notification.metadata, "dias_restantes");
          const isPresupuestoAlert = alertType === RESERVA_ALERTA_PRESUPUESTO
            || alertType === RESERVA_ALERTA_INACTIVIDAD_LEGACY
            || alertType === RESERVA_ALERTA_INACTIVIDAD_LEGACY_ALT;

          return isPresupuestoAlert
            && notificationCycleKey === presupuestoCycleKey
            && notificationDays === presupuestoDaysRemaining;
        });

        if (!warningAlreadyExists) {
          const title = presupuestoDaysRemaining === 1
            ? `Reserva #${reserva.id}: último día de vigencia del presupuesto`
            : `Reserva #${reserva.id}: el presupuesto vence en ${presupuestoDaysRemaining} días`;
          const message = presupuestoDaysRemaining === 1
            ? `Último día de vigencia del presupuesto de la reserva #${reserva.id} de ${clienteNombre}. Si continúa pendiente, se cancelará automáticamente.`
            : `El presupuesto de la reserva #${reserva.id} de ${clienteNombre} vence en ${presupuestoDaysRemaining} días. Si continúa pendiente, se cancelará automáticamente.`;

          warningNotificationsToInsert.push({
            tipo: "ESTADO_CAMBIADO",
            titulo: title,
            mensaje: message,
            reserva_id: reserva.id,
            metadata: {
              origen: RESERVA_EXPIRATION_NOTIFICATION_ORIGIN,
              alerta: RESERVA_ALERTA_PRESUPUESTO,
              dias_restantes: presupuestoDaysRemaining,
              cycle_key: presupuestoCycleKey,
              regla_dias: RESERVA_AUTO_CANCEL_DAYS,
              regla_tipo: "vigencia_presupuesto",
              estado: reserva.estado,
            },
          });
        }
      }

      if (
        startDaysRemaining !== null
        && RESERVA_EXPIRATION_WARNING_DAYS.includes(startDaysRemaining as 1 | 2 | 3)
      ) {
        const warningAlreadyExists = existingNotifications.some((notification) => {
          const alertType = getMetadataString(notification.metadata, "alerta");
          const notificationCycleKey = getMetadataString(notification.metadata, "cycle_key");
          const notificationDays = getMetadataNumber(notification.metadata, "dias_restantes");

          return alertType === RESERVA_ALERTA_INICIO_EVENTO
            && notificationCycleKey === startCycleKey
            && notificationDays === startDaysRemaining;
        });

        if (!warningAlreadyExists) {
          const title = startDaysRemaining === 1
            ? `Reserva #${reserva.id}: último día antes de la fecha de inicio`
            : `Reserva #${reserva.id}: inicia en ${startDaysRemaining} días y sigue pendiente`;
          const message = startDaysRemaining === 1
            ? `Último día para confirmar la reserva #${reserva.id} de ${clienteNombre}. Si llega la fecha de inicio en estado pendiente de gestión, se cancelará automáticamente.`
            : `La reserva #${reserva.id} de ${clienteNombre} inicia en ${startDaysRemaining} días y sigue pendiente de gestión. Si llega la fecha de inicio sin confirmarse, se cancelará automáticamente.`;

          warningNotificationsToInsert.push({
            tipo: "ESTADO_CAMBIADO",
            titulo: title,
            mensaje: message,
            reserva_id: reserva.id,
            metadata: {
              origen: RESERVA_EXPIRATION_NOTIFICATION_ORIGIN,
              alerta: RESERVA_ALERTA_INICIO_EVENTO,
              dias_restantes: startDaysRemaining,
              cycle_key: startCycleKey,
              regla_tipo: "fecha_inicio",
              estado: reserva.estado,
            },
          });
        }
      }
    }

    if (staleWarningNotificationIds.size > 0) {
      const staleIds = Array.from(staleWarningNotificationIds);
      const { error: staleDeleteError } = await supabaseAdmin
        .from("notificaciones")
        .delete()
        .in("id", staleIds);

      if (staleDeleteError) {
        console.warn("No se pudieron limpiar notificaciones de vencimiento antiguas:", staleDeleteError);
      }
    }

    let cancelledCount = cancelledByBudgetCount;
    const reservasToCancel = Array.from(cancelCandidatesByReservaId.keys());
    if (reservasToCancel.length > 0) {
      const { data: cancelledRows, error: cancelError } = await supabaseAdmin
        .from("reservas")
        .update({ estado: "Cancelado" })
        .in("id", reservasToCancel)
        .in("estado", RESERVA_ESTADOS_PENDIENTES_GESTION)
        .select("id, cliente_nombre");

      if (cancelError) {
        return c.json({ error: cancelError.message }, 500);
      }

      const cancelledReservas = cancelledRows || [];
      cancelledCount += cancelledReservas.length;

      for (const cancelledReserva of cancelledReservas) {
        const reservaId = cancelledReserva.id;
        const cancelCandidate = cancelCandidatesByReservaId.get(reservaId);
        if (!cancelCandidate) continue;

        const cycleKey = cancelCandidate.cycleKey;
        const existingNotifications = existingByReserva.get(reservaId) || [];

        const cancellationAlreadyExists = existingNotifications.some((notification) => {
          const alertType = getMetadataString(notification.metadata, "alerta");
          const notificationCycleKey = getMetadataString(notification.metadata, "cycle_key");
          const notificationReason = getMetadataString(notification.metadata, "motivo");
          return alertType === RESERVA_ALERTA_CANCELACION_AUTOMATICA
            && notificationCycleKey === cycleKey
            && notificationReason === cancelCandidate.reason;
        });

        if (cancellationAlreadyExists) {
          continue;
        }

        const clienteNombre = cancelCandidate.clienteNombre;
        const cancellationMessage =
          `La reserva #${reservaId} de ${clienteNombre} fue cancelada automáticamente porque llegó su fecha de inicio y continuaba en estado ${cancelCandidate.estado || "pendiente de gestión"}.`;

        autoCancelNotificationsToInsert.push({
          tipo: "ESTADO_CAMBIADO",
          titulo: `Reserva #${reservaId} cancelada automáticamente`,
          mensaje: cancellationMessage,
          reserva_id: reservaId,
          metadata: {
            origen: RESERVA_EXPIRATION_NOTIFICATION_ORIGIN,
            alerta: RESERVA_ALERTA_CANCELACION_AUTOMATICA,
            dias_restantes: 0,
            cycle_key: cycleKey,
            motivo: cancelCandidate.reason,
            regla_dias: null,
            regla_tipo: "fecha_inicio",
            estado: "Cancelado",
          },
        });
      }
    }

    const notificationsToInsert = [
      ...warningNotificationsToInsert,
      ...autoCancelNotificationsToInsert,
    ];

    if (notificationsToInsert.length > 0) {
      const { error: insertNotificationsError } = await supabaseAdmin
        .from("notificaciones")
        .insert(notificationsToInsert);

      if (insertNotificationsError) {
        return c.json({ error: insertNotificationsError.message }, 500);
      }
    }

    return c.json({
      success: true,
      pendingCount: reservas.length,
      cancelledCount,
      notificationsCreated: notificationsToInsert.length + cancelledByBudgetCount,
      warningNotificationsCreated: warningNotificationsToInsert.length,
      cancellationNotificationsCreated:
        autoCancelNotificationsToInsert.length + cancelledByBudgetCount,
    });
  } catch (error) {
    console.error("Error in process-reserva-vencimiento endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
};

app.post("/make-server-484a241a/process-reserva-vencimiento", processReservaVencimientoHandler);
app.post("/server/make-server-484a241a/process-reserva-vencimiento", processReservaVencimientoHandler);

const publicCatalogHandler = async (c: any) => {
  try {
    const supabaseAdmin = createServiceClient();
    const rateLimitResponse = await applyRateLimit(
      c,
      supabaseAdmin,
      "public-catalog",
      [getClientIp(c)],
      PUBLIC_CATALOG_RATE_LIMIT,
    );
    if (rateLimitResponse) return rateLimitResponse;

    const [{ data: salones, error: salonesError }, { data: distribuciones, error: distError }, { data: categorias, error: catError }, { data: servicios, error: servError }] =
      await Promise.all([
        supabaseAdmin.from("salones").select("*").or("activo.is.null,activo.eq.true").order("nombre"),
        supabaseAdmin.from("distribuciones").select("*").order("nombre"),
        supabaseAdmin.from("categorias_servicios").select("*").order("nombre"),
        supabaseAdmin
          .from("servicios")
          .select("id, id_categoria, nombre, descripcion, activo, categoria:categorias_servicios(id, nombre, descripcion)")
          .or("activo.is.null,activo.eq.true")
          .order("nombre"),
      ]);

    if (salonesError || distError || catError || servError) {
      console.error("Error loading catalog:", salonesError || distError || catError || servError);
      return c.json({ error: "No se pudo cargar el catalogo" }, 500);
    }

    return c.json({
      salones: salones ?? [],
      distribuciones: distribuciones ?? [],
      categorias: categorias ?? [],
      servicios: servicios ?? [],
    });
  } catch (error) {
    console.error("Error in public-catalog endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
};

app.get("/make-server-484a241a/public-catalog", publicCatalogHandler);
app.get("/server/make-server-484a241a/public-catalog", publicCatalogHandler);

const registerPublicReservaNotification = async (
  supabaseAdmin: SupabaseClient,
  input: {
    reservaId: number;
    clienteNombre: string;
    estado: string;
    salonId: number;
  },
) => {
  try {
    const { error: deleteError } = await supabaseAdmin
      .from("notificaciones")
      .delete()
      .eq("reserva_id", input.reservaId)
      .eq("tipo", "RESERVA_NUEVA");

    if (deleteError) {
      console.warn("No se pudo limpiar notificaciones previas de la reserva:", deleteError);
    }

    const { error: insertError } = await supabaseAdmin
      .from("notificaciones")
      .insert([
        {
          tipo: "RESERVA_NUEVA",
          titulo: "Nueva reserva desde Salones",
          mensaje: `Se creo la reserva #${input.reservaId} de ${input.clienteNombre} en estado ${input.estado}.`,
          reserva_id: input.reservaId,
          metadata: {
            cliente_nombre: input.clienteNombre,
            estado: input.estado,
            id_salon: input.salonId,
            origen: PUBLIC_RESERVA_NOTIFICATION_ORIGIN,
            canal: "web_publica",
          },
        },
      ]);

    if (insertError) {
      console.warn("No se pudo registrar notificacion de reserva publica:", insertError);
    }
  } catch (error) {
    console.warn("Error inesperado registrando notificacion de reserva publica:", error);
  }
};

const publicReservaHandler = async (c: any) => {
  try {
    const body = (await c.req.json()) as PublicReservaPayload;

    const {
      nombre,
      email,
      telefono,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      tipo_evento: tipoEvento,
      cantidad,
      dias_salon: diasSalon,
      id_distribucion: idDistribucion,
      salon_id: salonId,
      salon_nombre: salonNombre,
      observaciones,
      servicios,
    } = body ?? {};

    const supabaseAdmin = createServiceClient();
    const rateLimitResponse = await applyRateLimit(
      c,
      supabaseAdmin,
      "public-reserva",
      [getClientIp(c), String(email || telefono || nombre || "anonymous")],
      PUBLIC_RESERVA_RATE_LIMIT,
    );
    if (rateLimitResponse) return rateLimitResponse;

    if (!nombre || !email || !telefono || !fechaInicio || !fechaFin || !cantidad) {
      return c.json(
        { error: "Missing required fields: nombre, email, telefono, fecha_inicio, fecha_fin, cantidad" },
        400,
      );
    }

    if (!salonId && !salonNombre) {
      return c.json({ error: "Missing required field: salon" }, 400);
    }

    const totalPersonas = Number(cantidad);
    if (!totalPersonas || totalPersonas <= 0) {
      return c.json({ error: "Cantidad de personas invalida" }, 400);
    }

    const fechaInicioDate = new Date(fechaInicio);
    const fechaFinDate = new Date(fechaFin);
    if (Number.isNaN(fechaInicioDate.getTime()) || Number.isNaN(fechaFinDate.getTime())) {
      return c.json({ error: "Formato de fecha inválido" }, 400);
    }

    const now = new Date();
    if (fechaInicioDate <= now) {
      return c.json({ error: "La fecha de inicio debe ser posterior al momento actual" }, 400);
    }

    if (fechaFinDate <= fechaInicioDate) {
      return c.json({ error: "La fecha de fin debe ser posterior a la fecha de inicio" }, 400);
    }

    let salonQuery = supabaseAdmin.from("salones").select("*").limit(1);
    if (salonId) {
      salonQuery = salonQuery.eq("id", salonId);
    } else if (salonNombre) {
      salonQuery = salonQuery.ilike("nombre", salonNombre);
    }

    const { data: salonData, error: salonError } = await salonQuery.maybeSingle();

    if (salonError) {
      console.error("Error buscando salon:", salonError);
      return c.json({ error: "No se pudo validar el salón seleccionado" }, 500);
    }

    if (!salonData) {
      return c.json({ error: "No se encontró el salón seleccionado" }, 404);
    }

    let distribucionData: { id: number; nombre: string; capacidad: number } | null = null;
    if (idDistribucion) {
      const { data: distData, error: distError } = await supabaseAdmin
        .from("distribuciones")
        .select("id, nombre, capacidad")
        .eq("id", idDistribucion)
        .eq("id_salon", salonData.id)
        .limit(1)
        .maybeSingle();

      if (distError) {
        console.warn("Error buscando distribucion:", distError);
      } else if (distData) {
        distribucionData = distData;
      }
    }

    const exceedsSalonCapacity = totalPersonas > salonData.capacidad;
    const exceedsDistribucionCapacity = Boolean(
      distribucionData && totalPersonas > distribucionData.capacidad,
    );

    if (exceedsSalonCapacity || exceedsDistribucionCapacity) {
      console.warn("Reserva creada con advertencia de capacidad", {
        salonId: salonData.id,
        distribucionId: distribucionData?.id ?? null,
        totalPersonas,
        salonCapacidad: salonData.capacidad,
        distribucionCapacidad: distribucionData?.capacidad ?? null,
        exceedsSalonCapacity,
        exceedsDistribucionCapacity,
      });
    }

    const observacionesText = hasNonWhitespaceValue(observaciones) ? observaciones.trim() : null;
    const tipoEventoReserva =
      extractTipoEventoFromObservaciones(observacionesText)
      || (hasNonWhitespaceValue(tipoEvento) ? tipoEvento.trim() : null);
    const salonDays = resolveSalonDays(diasSalon, fechaInicio, fechaFin);
    const salonTotal = (Number(salonData.precio_base) || 0) * salonDays;

    const reservaPayload = {
      cliente_nombre: nombre,
      cliente_email: email,
      cliente_telefono: telefono,
      id_salon: salonData.id,
      id_distribucion: distribucionData?.id ?? null,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      estado: RESERVA_ESTADO_PENDIENTE_VALIDACION,
      monto: salonTotal,
      cantidad_personas: totalPersonas,
      observaciones: observacionesText,
      creado_por: null,
    };

    const { data: reservaData, error: reservaError } = await supabaseAdmin
      .from("reservas")
      .insert([reservaPayload])
      .select()
      .single();

    if (reservaError || !reservaData) {
      console.error("Error creando reserva:", reservaError);
      return c.json({ error: "No se pudo registrar la solicitud" }, 500);
    }

    await registerPublicReservaNotification(supabaseAdmin, {
      reservaId: reservaData.id,
      clienteNombre: (nombre || "Sin nombre").trim() || "Sin nombre",
      estado: RESERVA_ESTADO_PENDIENTE_VALIDACION,
      salonId: salonData.id,
    });

    try {
      const smtpConfig = getSmtpConfig();
      const notificationEmailResult = await sendBackofficeReservaNotificationEmails(
        smtpConfig,
        supabaseAdmin,
        {
          action: "created",
          reservaId: reservaData.id,
          clienteNombre: formatOptionalText(nombre, "Sin nombre"),
          clienteEmail: formatOptionalText(email, "No informado"),
          clienteTelefono: formatOptionalText(telefono, "No informado"),
          salonNombre: formatOptionalText(salonData.nombre, "No informado"),
          distribucionNombre: distribucionData?.nombre ?? null,
          tipoEvento: tipoEventoReserva,
          cantidadPersonas: totalPersonas,
          fechaInicio,
          fechaFin,
        },
      );

      if (notificationEmailResult.sent) {
        console.info(
          `Notificación por email de reserva pública enviada a ${notificationEmailResult.recipientsCount} destinatario(s).`,
        );
      }
    } catch (emailNotificationError) {
      console.warn("No se pudo enviar la notificación por email de reserva pública:", emailNotificationError);
    }

    const selectedServicios = Array.isArray(servicios) ? servicios : [];
    const selectedServiciosNormalizados: Array<{ id_servicio: number; cantidad: number }> = [];

    for (const item of selectedServicios) {
      const servicioId = Number(item?.id_servicio);
      const cantidadServicio = Number(item?.cantidad);

      if (!Number.isInteger(servicioId) || servicioId <= 0) {
        return c.json({ error: "Servicio adicional invalido" }, 400);
      }

      if (!Number.isInteger(cantidadServicio) || cantidadServicio <= 0) {
        return c.json({ error: "Complete la cantidad de todos los servicios adicionales seleccionados" }, 400);
      }

      selectedServiciosNormalizados.push({
        id_servicio: servicioId,
        cantidad: cantidadServicio,
      });
    }

    const serviciosIds = selectedServiciosNormalizados.map((item) => item.id_servicio);

    const serviciosDetalle: PresupuestoServicio[] = [];
    if (serviciosIds.length > 0) {
      const { data: serviciosData, error: serviciosError } = await supabaseAdmin
        .from("servicios")
        .select("id, nombre, descripcion, precio, categoria:categorias_servicios(id, nombre, descripcion)")
        .in("id", serviciosIds);

      if (serviciosError) {
        console.warn("Error cargando servicios:", serviciosError);
      } else {
        const serviciosMap = new Map<number, typeof serviciosData[number]>();
        (serviciosData || []).forEach((item) => serviciosMap.set(item.id, item));
        selectedServiciosNormalizados.forEach((item) => {
          const servicioInfoRaw = serviciosMap.get(item.id_servicio);
          if (!servicioInfoRaw) return;
          const categoriaRaw = (servicioInfoRaw as any).categoria;
          const categoria = Array.isArray(categoriaRaw) ? (categoriaRaw[0] ?? null) : (categoriaRaw ?? null);
          const servicioInfo = {
            ...servicioInfoRaw,
            categoria,
          };

          serviciosDetalle.push({
            servicio: servicioInfo,
            cantidad: item.cantidad,
          });
        });
      }
    }

    if (serviciosDetalle.length > 0) {
      const reservaServiciosPayload = serviciosDetalle.map((item) => ({
        id_reserva: reservaData.id,
        id_servicio: item.servicio.id,
        cantidad: item.cantidad,
      }));

      const { error: reservaServiciosError } = await supabaseAdmin
        .from("reserva_servicios")
        .insert(reservaServiciosPayload);

      if (reservaServiciosError) {
        console.warn("Error guardando servicios de la reserva:", reservaServiciosError);
      }
    }

    let downloadUrl: string | undefined = undefined;
    let pdfError: string | undefined = undefined;
    let pdfGenerated = false;
    let uploaded = false;
    let uploadErrorMsg: string | undefined = undefined;
    let signed = false;
    let signedErrorMsg: string | undefined = undefined;
    let shortDownloadUrl: string | undefined = undefined;
    let storagePath: string | undefined = undefined;
    let fileName: string | undefined = undefined;
    let clientEmailSent = false;
    let clientEmailError: string | undefined = undefined;

    try {
      const upsertResult = await upsertPresupuestoForReserva(supabaseAdmin, reservaData.id);
      storagePath = upsertResult.storagePath;
      fileName = upsertResult.fileName;
      uploaded = true;

      const signedUrlResult = await createPresupuestoSignedUrl(
        supabaseAdmin,
        upsertResult.storagePath,
        PRESUPUESTO_PUBLIC_LINK_TTL_SECONDS,
      );
      if ("error" in signedUrlResult) {
        signedErrorMsg = signedUrlResult.error;
        console.error("Error creando URL firmada:", signedErrorMsg);
      } else {
        signed = true;
        downloadUrl = signedUrlResult.signedUrl;
        try {
          const shortLinkResult = await createPresupuestoShortLink(
            reservaData.id,
            PRESUPUESTO_PUBLIC_LINK_TTL_SECONDS,
          );
          shortDownloadUrl = shortLinkResult?.shortUrl;
        } catch (shortLinkError) {
          console.warn(
            "No se pudo generar enlace corto para descarga de presupuesto publico:",
            shortLinkError,
          );
        }
      }

      pdfGenerated = true;

      try {
        const smtpConfig = getSmtpConfig();
        const clientEmailResult = await sendGeneratedPresupuestoToClient(
          smtpConfig,
          supabaseAdmin,
          {
            action: "created",
            reservaId: reservaData.id,
            storagePath: upsertResult.storagePath,
            fileName: upsertResult.fileName,
            pdfBuffer: upsertResult.pdfBuffer,
            clienteNombre: upsertResult.context.cliente.nombre,
            clienteEmail: upsertResult.context.cliente.email,
            fechaInicio: upsertResult.context.fechaInicio,
            fechaFin: upsertResult.context.fechaFin,
          },
        );
        clientEmailSent = clientEmailResult.sent;
      } catch (clientEmailSendError) {
        clientEmailError = getErrorMessage(
          clientEmailSendError,
          "No se pudo enviar el presupuesto al cliente.",
        );
        console.warn(
          "No se pudo enviar por email el presupuesto de la reserva pública:",
          clientEmailSendError,
        );
      }
    } catch (err) {
      pdfError = getErrorMessage(err, String(err));
      uploadErrorMsg = pdfError;
      console.warn("PDF generation failed or not available:", pdfError);
      // proceed without downloadUrl
    }

    const responseBody: Record<string, unknown> = {
      success: true,
      reservaId: reservaData.id,
      fileName,
      downloadUrl,
      shortUrl: shortDownloadUrl,
      accessUrl: shortDownloadUrl || downloadUrl,
      pdfGenerated,
      uploaded,
      signed,
      clientEmailSent,
      capacityWarning: exceedsSalonCapacity || exceedsDistribucionCapacity,
      capacityWarningDetail: {
        exceedsSalonCapacity,
        exceedsDistribucionCapacity,
      },
    };

    if (pdfError) responseBody.pdfError = pdfError;
    if (uploadErrorMsg) responseBody.uploadError = uploadErrorMsg;
    if (signedErrorMsg) responseBody.signedError = signedErrorMsg;
    if (clientEmailError) responseBody.clientEmailError = clientEmailError;

    return c.json(responseBody);
  } catch (error) {
    console.error("Error in public-reserva endpoint:", error);
    return c.json({ error: getErrorMessage(error) }, 500);
  }
};

app.post("/make-server-484a241a/public-reserva", publicReservaHandler);
app.post("/server/make-server-484a241a/public-reserva", publicReservaHandler);

// Alias de compatibilidad: algunos despliegues exponen rutas sin el
// segmento make-server. Estas rutas se redirigen a los handlers canónicos.
const proxyTo = (path: string) => (c: any) =>
  app.fetch(new Request(new URL(path, c.req.url), c.req.raw));

app.get("/health", proxyTo("/make-server-484a241a/health"));
app.post("/request-password-reset", proxyTo("/make-server-484a241a/request-password-reset"));
app.post("/create-user", proxyTo("/make-server-484a241a/create-user"));
app.post("/update-user-email", proxyTo("/make-server-484a241a/update-user-email"));
app.post("/get-user-email", proxyTo("/make-server-484a241a/get-user-email"));
app.post("/delete-user", proxyTo("/make-server-484a241a/delete-user"));
app.post("/reset-user-password", proxyTo("/make-server-484a241a/reset-user-password"));
app.post("/get-presupuesto-url", proxyTo("/make-server-484a241a/get-presupuesto-url"));
app.post("/send-presupuesto-email", proxyTo("/make-server-484a241a/send-presupuesto-email"));
app.post("/upsert-presupuesto", proxyTo("/make-server-484a241a/upsert-presupuesto"));
app.post("/delete-reserva", proxyTo("/make-server-484a241a/delete-reserva"));
app.post("/process-reserva-vencimiento", proxyTo("/make-server-484a241a/process-reserva-vencimiento"));
app.get("/public-catalog", proxyTo("/make-server-484a241a/public-catalog"));
app.post("/public-reserva", proxyTo("/make-server-484a241a/public-reserva"));

app.get("/server/health", proxyTo("/make-server-484a241a/health"));
app.post("/server/request-password-reset", proxyTo("/make-server-484a241a/request-password-reset"));
app.post("/server/create-user", proxyTo("/make-server-484a241a/create-user"));
app.post("/server/update-user-email", proxyTo("/make-server-484a241a/update-user-email"));
app.post("/server/get-user-email", proxyTo("/make-server-484a241a/get-user-email"));
app.post("/server/delete-user", proxyTo("/make-server-484a241a/delete-user"));
app.post("/server/reset-user-password", proxyTo("/make-server-484a241a/reset-user-password"));
app.post("/server/get-presupuesto-url", proxyTo("/make-server-484a241a/get-presupuesto-url"));
app.post("/server/send-presupuesto-email", proxyTo("/make-server-484a241a/send-presupuesto-email"));
app.post("/server/upsert-presupuesto", proxyTo("/make-server-484a241a/upsert-presupuesto"));
app.post("/server/delete-reserva", proxyTo("/make-server-484a241a/delete-reserva"));
app.post("/server/process-reserva-vencimiento", proxyTo("/make-server-484a241a/process-reserva-vencimiento"));
app.get("/server/public-catalog", proxyTo("/make-server-484a241a/public-catalog"));
app.post("/server/public-reserva", proxyTo("/make-server-484a241a/public-reserva"));

Deno.serve(app.fetch);
