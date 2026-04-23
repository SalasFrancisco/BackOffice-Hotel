import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { supabase, Salon, Distribucion, Servicio } from './supabase/client';

type PresupuestoServicio = {
  servicio: Servicio;
  cantidad: number;
};

type PdfInlineFragment = {
  text: string;
  bold?: boolean;
  italics?: boolean;
};

export type PresupuestoPayload = {
  reservaId: number;
  salon: Salon;
  distribucion?: Distribucion | null;
  cliente: {
    nombre: string;
    email?: string | null;
    telefono?: string | null;
  };
  fechaInicio: string;
  fechaFin: string;
  tipoEvento?: string | null;
  totalSalon: number;
  precioSalonDiario?: number;
  diasSalon?: number;
  cantidadPersonas: number;
  servicios: PresupuestoServicio[];
  storagePath?: string;
};

const PRESUPUESTOS_BUCKET = 'presupuestos';
const HOTEL_TIME_ZONE = 'America/Argentina/Cordoba';
const SALONES_HEADER_LOGO_URL = 'https://files-p.pxsol.com/5019/company/library/user/134083827848ff026d70b27373fe71d73b64459f1e7.png';
const LOCAL_LOGO_PATH = `${import.meta.env.BASE_URL}QuintoCente.png`;
const LOGO_PATH_CANDIDATES = [SALONES_HEADER_LOGO_URL, LOCAL_LOGO_PATH];
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
let pdfFontsReady = false;
let logoDataUrlCache: string | null | undefined;

const ensurePdfFonts = () => {
  if (pdfFontsReady) return;

  const fontsSource =
    (pdfFonts as any)?.pdfMake?.vfs ||
    (pdfFonts as any)?.default?.pdfMake?.vfs ||
    (pdfFonts as any)?.default ||
    (pdfFonts as any);

  if (!fontsSource) {
    throw new Error('No se pudieron cargar las fuentes para generar el PDF.');
  }

  (pdfMake as any).vfs = fontsSource;
  pdfFontsReady = true;
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }
      reject(new Error('No se pudo convertir el logo a data URL.'));
    };
    reader.onerror = () => reject(new Error('No se pudo leer el logo del hotel.'));
    reader.readAsDataURL(blob);
  });

const loadLogoDataUrl = async (): Promise<string | null> => {
  if (logoDataUrlCache !== undefined) {
    return logoDataUrlCache;
  }

  for (const logoPath of LOGO_PATH_CANDIDATES) {
    try {
      const response = await fetch(logoPath, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const blob = await response.blob();
      const dataUrl = await blobToDataUrl(blob);
      logoDataUrlCache = dataUrl;
      return dataUrl;
    } catch (error) {
      console.warn(`No se pudo cargar el logo (${logoPath}):`, error);
    }
  }

  logoDataUrlCache = null;
  return null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(value);

const formatBillableDayUnits = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

const formatDate = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: HOTEL_TIME_ZONE,
  });
};

const formatTime = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: HOTEL_TIME_ZONE,
  });
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const formatDateValue = (date: Date) =>
  date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: HOTEL_TIME_ZONE,
  });

const sanitizeFileNamePart = (value: string) =>
  (value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 80);

const formatDateForFileName = (isoDate: string) => {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'sin-fecha';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${day}-${month}-${year}`;
};

export const buildPresupuestoFileName = ({
  nombreBase,
  tipoEvento,
  fechaInicio,
  fallbackEvento,
}: {
  nombreBase?: string | null;
  tipoEvento?: string | null;
  fechaInicio: string;
  fallbackEvento?: string | null;
}) => {
  const evento =
    sanitizeFileNamePart(nombreBase || '') ||
    sanitizeFileNamePart(tipoEvento || '') ||
    sanitizeFileNamePart(fallbackEvento || '') ||
    'Evento';
  const fecha = formatDateForFileName(fechaInicio);
  return `${evento} - ${fecha}.pdf`;
};

const decodeSupportedHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

const parseInlineRichText = (value?: string | null): PdfInlineFragment[] => {
  const source = (value || '').replace(/\r\n/g, '\n');
  if (!source) return [{ text: '' }];

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
      pushText('\n');
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

  return fragments.length > 0 ? fragments : [{ text: '' }];
};

const buildServiciosRows = (servicios: PresupuestoServicio[]) => {
  if (servicios.length === 0) {
    return [
      [
        {
          text: 'No se agregaron servicios adicionales para esta reserva.',
          colSpan: 4,
          style: 'tableCell',
        },
        {},
        {},
        {},
      ],
    ];
  }

  return servicios.map(({ servicio, cantidad }) => {
    const unit = Number(servicio.precio) || 0;
    const subtotal = unit * cantidad;
    const servicioStack: Array<{
      text: string | PdfInlineFragment[];
      style: string;
      bold?: boolean;
      margin?: [number, number, number, number];
    }> = [
      { text: servicio.nombre, style: 'tableCell', bold: true },
    ];

    if (servicio.descripcion) {
      servicioStack.push({
        text: parseInlineRichText(servicio.descripcion),
        style: 'tableCellSecondary',
        margin: [0, 3, 0, 0],
      });
    }

    return [
      { stack: servicioStack },
      { text: String(cantidad), style: 'tableCell', alignment: 'center' },
      { text: formatCurrency(unit), style: 'tableCell', alignment: 'right' },
      { text: formatCurrency(subtotal), style: 'tableCell', alignment: 'right' },
    ];
  });
};

const parseTerminosLines = (text: string) => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let boldActive = false;

  return lines.map((rawLine) => {
    let line = rawLine.trim();
    if (!line) {
      return { text: '', bold: false };
    }

    let bold = boldActive;

    if (/<b>/i.test(line)) {
      line = line.replace(/<b>/gi, '');
      bold = true;
      boldActive = true;
    }

    if (/<\/b>/i.test(line)) {
      line = line.replace(/<\/b>/gi, '');
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
      return { text: ' ', margin: [0, 0, 0, 4] as [number, number, number, number] };
    }

    const termsLink = resolveTermsLink(text);
    if (termsLink) {
      return {
        text,
        link: termsLink,
        style: 'termsLink',
      };
    }

    const isAsteriskBullet = /^\*/.test(text);
    const isClause = /^[a-z]\)\s+/i.test(text);
    const cleanText = isAsteriskBullet ? text.replace(/^\*\s*/, '• ') : text;
    const isShortBoldHeading = bold && cleanText.length <= 35;

    return {
      text: cleanText,
      style: isShortBoldHeading ? 'termsHeading' : 'termsText',
      bold,
      margin: [isAsteriskBullet || isClause ? 12 : 0, 0, 0, 4] as [number, number, number, number],
    };
  });

  return [
    { text: 'Términos y condiciones', style: 'termsTitle', pageBreak: 'before' as const, margin: [0, 0, 0, 10] },
    {
      canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#D1D5DB' }],
      margin: [0, 0, 0, 10],
    },
    ...lineNodes,
  ];
};

export async function generatePresupuestoDocumento({
  reservaId,
  salon,
  distribucion,
  cliente,
  fechaInicio,
  fechaFin,
  tipoEvento,
  totalSalon,
  precioSalonDiario: precioSalonDiarioInput,
  diasSalon: diasSalonInput,
  cantidadPersonas,
  servicios,
  storagePath: storagePathInput,
}: PresupuestoPayload) {
  ensurePdfFonts();
  const logoDataUrl = await loadLogoDataUrl();
  const fechaEmision = new Date();
  const fechaVencimiento = addDays(fechaEmision, 7);

  const totalServicios = servicios.reduce((acc, { servicio, cantidad }) => {
    const unit = Number(servicio.precio) || 0;
    return acc + unit * cantidad;
  }, 0);

  const salonDailyPrice = Number(precioSalonDiarioInput ?? salon.precio_base) || 0;
  const parsedSalonDays = Number(diasSalonInput);
  const salonDays = Number.isFinite(parsedSalonDays) && parsedSalonDays > 0
    ? Math.round(parsedSalonDays * 100) / 100
    : 1;
  const totalGeneral = totalSalon + totalServicios;
  const capacidadMaxima =
    distribucion?.capacidad && distribucion.capacidad > 0
      ? distribucion.capacidad
      : salon.capacidad;

  const cardTableLayout = {
    hLineColor: () => '#E5E7EB',
    vLineColor: () => '#E5E7EB',
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    paddingTop: () => 6,
    paddingBottom: () => 6,
    paddingLeft: () => 8,
    paddingRight: () => 8,
  };

  const buildInfoTable = (rows: Array<[string, string]>) => ({
    table: {
      widths: ['40%', '*'],
      body: rows.map(([label, value]) => [
        { text: label, style: 'infoLabel' },
        { text: value, style: 'infoValue' },
      ]),
    },
    layout: cardTableLayout,
  });

  const clienteRows: Array<[string, string]> = [
    ['Nombre', cliente.nombre],
    ['Email', cliente.email || 'No informado'],
    ['Teléfono', cliente.telefono || 'No informado'],
    ['Tipo de evento', tipoEvento?.trim() || 'Evento'],
  ];

  const eventoRows: Array<[string, string]> = [
    ['Salón', salon.nombre],
    ['Distribución', distribucion?.nombre || 'Sin distribución definida'],
    ['Asistentes previstos', String(cantidadPersonas)],
    ['Capacidad máxima', String(capacidadMaxima)],
    ['Inicio', `${formatDate(fechaInicio)} ${formatTime(fechaInicio)}`],
    ['Fin', `${formatDate(fechaFin)} ${formatTime(fechaFin)}`],
  ];

  const headerContent = logoDataUrl
    ? [
        { image: logoDataUrl, fit: [190, 80], alignment: 'center', margin: [0, 0, 0, 8] },
        { text: 'Presupuesto de Evento', style: 'header', alignment: 'center' },
        { text: `Reserva #${reservaId}`, style: 'subheader', alignment: 'center', margin: [0, 4, 0, 20] },
      ]
    : [
        { text: 'Presupuesto de Evento', style: 'header', alignment: 'center' },
        { text: `Reserva #${reservaId}`, style: 'subheader', alignment: 'center', margin: [0, 0, 0, 20] },
      ];

  const docDefinition: TDocumentDefinitions = {
    pageMargins: [40, 50, 40, 60],
    content: [
      ...headerContent,
      {
        table: {
          widths: ['*', '*', '*'],
          body: [
            [
              {
                style: 'metaCard',
                stack: [
                  { text: 'Fecha de emisión', style: 'metaLabel' },
                  { text: formatDateValue(fechaEmision), style: 'metaValue' },
                ],
              },
              {
                style: 'metaCard',
                stack: [
                  { text: 'Válido hasta', style: 'metaLabel' },
                  { text: formatDateValue(fechaVencimiento), style: 'metaValue' },
                ],
              },
              {
                style: 'metaCard',
                stack: [
                  { text: 'Vigencia', style: 'metaLabel' },
                  { text: '7 días corridos', style: 'metaValue' },
                ],
              },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 18],
      },
      {
        stack: [
          { text: 'Información del cliente', style: 'infoTitle' },
          buildInfoTable(clienteRows),
          { text: 'Información del evento', style: 'infoTitle', margin: [0, 14, 0, 6] },
          buildInfoTable(eventoRows),
        ],
        margin: [0, 0, 0, 25],
      },
      { text: 'Detalle del presupuesto', style: 'detailPageTitle', pageBreak: 'before', margin: [0, 0, 0, 10] },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#D1D5DB' }],
        margin: [0, 0, 0, 10],
      },
      { text: 'Salón contratado', style: 'infoTitle' },
      {
        table: {
          widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Salón y descripción', style: 'detailTableHeader' },
              { text: 'Cantidad (días)', style: 'detailTableHeader', alignment: 'center' },
              { text: 'Precio unitario', style: 'detailTableHeader', alignment: 'right' },
              { text: 'Subtotal', style: 'detailTableHeader', alignment: 'right' },
            ],
            [
              {
                text: salon.descripcion
                  ? [{ text: salon.nombre, bold: true }, `\n${salon.descripcion}`]
                  : [{ text: salon.nombre, bold: true }],
                style: 'tableCell',
              },
              { text: formatBillableDayUnits(salonDays), style: 'tableCell', alignment: 'center' },
              { text: formatCurrency(salonDailyPrice), style: 'tableCell', alignment: 'right' },
              { text: formatCurrency(totalSalon), style: 'tableCell', alignment: 'right' },
            ],
          ],
        },
        layout: cardTableLayout,
        margin: [0, 0, 0, 16],
      },
      { text: 'Servicios adicionales', style: 'infoTitle' },
      {
        table: {
          widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Servicio y descripción', style: 'detailTableHeader' },
              { text: 'Cantidad', style: 'detailTableHeader', alignment: 'center' },
              { text: 'Precio unitario', style: 'detailTableHeader', alignment: 'right' },
              { text: 'Subtotal', style: 'detailTableHeader', alignment: 'right' },
            ],
            ...buildServiciosRows(servicios),
          ],
        },
        layout: cardTableLayout,
      },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              { text: 'Total salón', alignment: 'right', style: 'totalLabelCard' },
              { text: formatCurrency(totalSalon), alignment: 'right', style: 'totalValueCard' },
            ],
            [
              { text: 'Total servicios', alignment: 'right', style: 'totalLabelCard' },
              { text: formatCurrency(totalServicios), alignment: 'right', style: 'totalValueCard' },
            ],
            [
              { text: 'Total general', alignment: 'right', style: 'grandTotalLabelCard' },
              { text: formatCurrency(totalGeneral), alignment: 'right', style: 'grandTotalValueCard' },
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
      subheader: { fontSize: 14, color: '#666666' },
      sectionTitle: { fontSize: 12, bold: true, margin: [0, 10, 0, 6] },
      detailPageTitle: { fontSize: 15, bold: true, color: '#111827' },
      metaCard: { fillColor: '#F8FAFC', margin: [8, 8, 8, 8] },
      metaLabel: { fontSize: 9, color: '#6B7280' },
      metaValue: { fontSize: 12, bold: true, color: '#111827', margin: [0, 2, 0, 0] },
      infoTitle: { fontSize: 12, bold: true, color: '#111827', margin: [0, 0, 0, 6] },
      infoLabel: { fontSize: 10, bold: true, color: '#374151' },
      infoValue: { fontSize: 10, color: '#111827' },
      detailTableHeader: { fontSize: 10, bold: true, fillColor: '#EEF2FF', color: '#1F2937' },
      tableHeader: { bold: true, fillColor: '#f5f5f5' },
      tableCell: { fontSize: 10 },
      tableCellSecondary: { fontSize: 9, color: '#4B5563' },
      totalLabel: { fontSize: 11, bold: true, margin: [0, 4, 0, 4] },
      totalValue: { fontSize: 11, margin: [0, 4, 0, 4] },
      grandTotalLabel: { fontSize: 12, bold: true, margin: [0, 8, 0, 0] },
      grandTotalValue: { fontSize: 12, bold: true, margin: [0, 8, 0, 0] },
      totalLabelCard: { fontSize: 10, bold: true, color: '#374151' },
      totalValueCard: { fontSize: 10, bold: true, color: '#111827' },
      grandTotalLabelCard: { fontSize: 12, bold: true, color: '#111827' },
      grandTotalValueCard: { fontSize: 12, bold: true, color: '#111827' },
      termsTitle: { fontSize: 16, bold: true },
      termsHeading: { fontSize: 11, bold: true, lineHeight: 1.25 },
      termsText: { fontSize: 10, lineHeight: 1.25, color: '#1F2937' },
      termsLink: {
        fontSize: 12,
        lineHeight: 1.3,
        color: '#1D4ED8',
        decoration: 'underline',
        alignment: 'center',
        margin: [0, 8, 0, 0],
      },
    },
    defaultStyle: { fontSize: 10 },
  };

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

  const storagePath = storagePathInput || `reservas/reserva-${reservaId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(PRESUPUESTOS_BUCKET)
    .upload(storagePath, pdfBuffer, {
      cacheControl: '3600',
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`No se pudo subir el presupuesto al storage (${uploadError.message}).`);
  }

  const { error: updateError } = await supabase
    .from('reservas')
    .update({ presupuesto_url: storagePath })
    .eq('id', reservaId);

  if (updateError) {
    console.warn('Presupuesto generado pero no se pudo actualizar la reserva:', updateError);
  }

  return storagePath;
}
