import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { supabase, Salon, Distribucion, Servicio } from './supabase/client';

type PresupuestoServicio = {
  servicio: Servicio;
  cantidad: number;
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
  cantidadPersonas: number;
  servicios: PresupuestoServicio[];
  storagePath?: string;
};

const PRESUPUESTOS_BUCKET = 'presupuestos';
const LOCAL_LOGO_PATH = `${import.meta.env.BASE_URL}QuintoCente.png`;
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

  try {
    const response = await fetch(LOCAL_LOGO_PATH, { cache: 'force-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    logoDataUrlCache = dataUrl;
    return dataUrl;
  } catch (error) {
    console.warn(`No se pudo cargar el logo local (${LOCAL_LOGO_PATH}):`, error);
    logoDataUrlCache = null;
    return null;
  }
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(value);

const formatDate = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

const formatTime = (isoDate: string) => {
  const date = new Date(isoDate);
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

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

const buildServiciosBody = (servicios: PresupuestoServicio[]) => {
  const headerRow = [
    { text: 'Servicio', style: 'tableHeader' },
    { text: 'Descripcion', style: 'tableHeader' },
    { text: 'Cantidad', style: 'tableHeader', alignment: 'center' },
    { text: 'Precio unitario', style: 'tableHeader', alignment: 'right' },
    { text: 'Subtotal', style: 'tableHeader', alignment: 'right' },
  ];

  if (servicios.length === 0) {
    return [
      headerRow,
      [
        {
          text: 'No se agregaron servicios adicionales para esta reserva.',
          colSpan: 5,
          style: 'tableCell',
        },
        {},
        {},
        {},
        {},
      ],
    ];
  }

  return [
    headerRow,
    ...servicios.map(({ servicio, cantidad }) => {
      const unit = Number(servicio.precio) || 0;
      const subtotal = unit * cantidad;

      return [
        { text: servicio.nombre, style: 'tableCell' },
        { text: servicio.descripcion || 'Sin descripcion', style: 'tableCell' },
        { text: String(cantidad), style: 'tableCell', alignment: 'center' },
        { text: formatCurrency(unit), style: 'tableCell', alignment: 'right' },
        { text: formatCurrency(subtotal), style: 'tableCell', alignment: 'right' },
      ];
    }),
  ];
};

export async function generatePresupuestoDocumento({
  reservaId,
  salon,
  distribucion,
  cliente,
  fechaInicio,
  fechaFin,
  totalSalon,
  cantidadPersonas,
  servicios,
  storagePath: storagePathInput,
}: PresupuestoPayload) {
  ensurePdfFonts();
  const logoDataUrl = await loadLogoDataUrl();

  const totalServicios = servicios.reduce((acc, { servicio, cantidad }) => {
    const unit = Number(servicio.precio) || 0;
    return acc + unit * cantidad;
  }, 0);

  const totalGeneral = totalSalon + totalServicios;

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
        columns: [
          [
            { text: 'Informacion del cliente', style: 'sectionTitle' },
            {
              table: {
                widths: ['auto', '*'],
                body: [
                  ['Nombre:', cliente.nombre],
                  ['Email:', cliente.email || 'No informado'],
                  ['Telefono:', cliente.telefono || 'No informado'],
                ],
              },
              layout: 'noBorders',
            },
          ],
          [
            { text: 'Detalles del evento', style: 'sectionTitle' },
            {
              table: {
                widths: ['auto', '*'],
                body: [
                  ['Fecha de inicio:', formatDate(fechaInicio)],
                  ['Fecha de fin:', formatDate(fechaFin)],
                  ['Horario de inicio:', formatTime(fechaInicio)],
                  ['Horario de fin:', formatTime(fechaFin)],
                  ['Salon:', salon.nombre],
                  ['Distribucion:', distribucion?.nombre || 'Sin distribucion definida'],
                  ['Cantidad de asistentes:', String(cantidadPersonas)],
                ],
              },
              layout: 'noBorders',
            },
          ],
        ],
        columnGap: 30,
        margin: [0, 0, 0, 25],
      },
      { text: 'Salon contratado', style: 'sectionTitle' },
      {
        table: {
          widths: ['*', 'auto', 'auto', 'auto'],
          body: [
            [
              { text: 'Descripcion', style: 'tableHeader' },
              { text: 'Cantidad', style: 'tableHeader', alignment: 'center' },
              { text: 'Precio unitario', style: 'tableHeader', alignment: 'right' },
              { text: 'Subtotal', style: 'tableHeader', alignment: 'right' },
            ],
            [
              { text: salon.descripcion || 'Sin descripcion', style: 'tableCell' },
              { text: '1', style: 'tableCell', alignment: 'center' },
              { text: formatCurrency(totalSalon), style: 'tableCell', alignment: 'right' },
              { text: formatCurrency(totalSalon), style: 'tableCell', alignment: 'right' },
            ],
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 20],
      },
      { text: 'Servicios adicionales', style: 'sectionTitle' },
      {
        table: {
          widths: ['*', '*', 'auto', 'auto', 'auto'],
          body: buildServiciosBody(servicios),
        },
        layout: 'lightHorizontalLines',
      },
      {
        table: {
          widths: ['*', 'auto'],
          body: [
            [
              { text: 'Total salon', alignment: 'right', style: 'totalLabel' },
              { text: formatCurrency(totalSalon), alignment: 'right', style: 'totalValue' },
            ],
            [
              { text: 'Total servicios', alignment: 'right', style: 'totalLabel' },
              { text: formatCurrency(totalServicios), alignment: 'right', style: 'totalValue' },
            ],
            [
              { text: 'Total general', alignment: 'right', style: 'grandTotalLabel' },
              { text: formatCurrency(totalGeneral), alignment: 'right', style: 'grandTotalValue' },
            ],
          ],
        },
        layout: 'noBorders',
        margin: [0, 20, 0, 0],
      },
    ],
    styles: {
      header: { fontSize: 20, bold: true },
      subheader: { fontSize: 14, color: '#666666' },
      sectionTitle: { fontSize: 12, bold: true, margin: [0, 10, 0, 6] },
      tableHeader: { bold: true, fillColor: '#f5f5f5' },
      tableCell: { fontSize: 10 },
      totalLabel: { fontSize: 11, bold: true, margin: [0, 4, 0, 4] },
      totalValue: { fontSize: 11, margin: [0, 4, 0, 4] },
      grandTotalLabel: { fontSize: 12, bold: true, margin: [0, 8, 0, 0] },
      grandTotalValue: { fontSize: 12, bold: true, margin: [0, 8, 0, 0] },
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
