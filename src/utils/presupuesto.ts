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
  };
  fechaInicio: string;
  fechaFin: string;
  tipoEvento?: string | null;
  totalSalon: number;
  cantidadPersonas: number;
  servicios: PresupuestoServicio[];
};

const PRESUPUESTOS_BUCKET = 'presupuestos';
let pdfFontsReady = false;

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
  tipoEvento,
  totalSalon,
  cantidadPersonas,
  servicios,
}: PresupuestoPayload) {
  ensurePdfFonts();

  const capacidadMaxima =
    distribucion?.capacidad && distribucion.capacidad > 0
      ? distribucion.capacidad
      : salon.capacidad;

  const totalServicios = servicios.reduce((acc, { servicio, cantidad }) => {
    const unit = Number(servicio.precio) || 0;
    return acc + unit * cantidad;
  }, 0);

  const totalGeneral = totalSalon + totalServicios;

  const docDefinition: TDocumentDefinitions = {
    pageMargins: [40, 50, 40, 60],
    content: [
      { text: 'Presupuesto de Evento', style: 'header' },
      { text: `Reserva #${reservaId}`, style: 'subheader', margin: [0, 0, 0, 20] },
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
                  ['Tipo de evento:', tipoEvento?.trim() || 'Evento'],
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
                  ['Fecha:', formatDate(fechaInicio)],
                  ['Horario:', `${formatTime(fechaInicio)} a ${formatTime(fechaFin)}`],
                  ['Salon:', salon.nombre],
                  ['Distribucion:', distribucion?.nombre || 'Sin distribucion definida'],
                  ['Cantidad de asistentes:', String(cantidadPersonas)],
                  [
                    'Capacidad maxima:',
                    String(capacidadMaxima),
                  ],
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

  const storagePath = `reservas/reserva-${reservaId}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(PRESUPUESTOS_BUCKET)
    .upload(storagePath, pdfBuffer, {
      cacheControl: '3600',
      contentType: 'application/pdf',
      upsert: true,
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
