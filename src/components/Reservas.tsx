import { Fragment, useState, useEffect, useRef } from 'react';
import { Perfil, supabase, Reserva } from '../utils/supabase/client';
import { projectId } from '../utils/supabase/info';
import { Plus, Search, Edit, AlertCircle, CheckCircle, FileText, X, AlertTriangle, Loader2, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, CalendarCheck, Mail, History, FileSpreadsheet, MoreHorizontal, Clock, DollarSign, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ReservaForm } from './ReservaForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import type { SheetData as XlsxSheetData } from 'write-excel-file/universal';
import { ReservaCalendar } from './ReservaCalendar';
import { WelcomeBanner } from './WelcomeBanner';
import { ModuleInfoBanner } from './ModuleInfoBanner';
import { ConfirmDialog } from './ConfirmDialog';
import { InfoDialog } from './InfoDialog';
import { ReservaEstadoGestionDialog } from './ReservaEstadoGestionDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  ReservaExportDialog,
  type ReservaExportFilters,
} from './ReservaExportDialog';
import { getReservaCapacityWarningText } from '../utils/reservaCapacity';
import { formatUSD } from '../utils/currency';
import { deleteReservaWithPresupuesto } from '../utils/reservaDeletion';
import { createInternalNotification } from '../utils/notifications';
import {
  getReservaConflictIds,
  getReservaConflictText,
  ReservaConflictComparable,
} from '../utils/reservaConflict';
import {
  getReservaExpirationWarningText,
  getReservaStartWarningText,
} from '../utils/reservaExpiration';
import {
  getReservaEstados,
  RESERVA_ESTADO_COLORS,
  RESERVA_ESTADO_CANCELADO,
} from '../utils/reservaEstadoTransitions';

type ReservasProps = {
  perfil: Perfil;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  highlightRequest?: {
    reservaId: number;
    nonce: number;
  } | null;
};

type SortKey = 'id' | 'cliente' | 'registradaPor' | 'salon' | 'fechaInicio' | 'fechaFin' | 'estado' | 'montoInicial' | 'monto';
type SortDirection = 'asc' | 'desc';

// Elige texto claro u oscuro según la luminancia del color de fondo, para que
// el estado se lea bien sobre su color sólido (ej. amarillo → texto oscuro).
const getReadableTextColor = (hexColor: string) => {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
};

// Ícono acorde a cada estado, para los KPI del encabezado del módulo.
const ESTADO_KPI_ICONS: Record<string, LucideIcon> = {
  'Pendiente validación': Clock,
  'Validado': CheckCircle,
  'Confirmado': CalendarCheck,
  'Pagado': DollarSign,
  'Cancelado': XCircle,
};

const getMonthStart = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

const formatMonthTitle = (monthStart: Date) =>
  monthStart.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

// Solapamiento con el mes, igual criterio que usa el calendario: un evento que
// cruza de un mes al otro aparece en el listado de los dos.
const isReservaInMonth = (reserva: Reserva, monthStart: Date) => {
  const desde = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1).getTime();
  const hastaExclusivo = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() + 1,
    1,
  ).getTime();
  const inicio = new Date(reserva.fecha_inicio).getTime();
  const fin = new Date(reserva.fecha_fin).getTime();

  if (Number.isNaN(inicio) || Number.isNaN(fin)) return false;
  return inicio < hastaExclusivo && fin > desde;
};

const getReservaServiciosTotal = (reserva: Reserva) =>
  (reserva.reserva_servicios || []).reduce((acc, item) => {
    const cantidad = Number(item?.cantidad) || 0;
    const precio = Number(item?.servicio?.precio) || 0;
    return acc + (cantidad * precio);
  }, 0);

const getReservaMontoTotal = (reserva: Reserva) =>
  (Number(reserva.monto) || 0) + getReservaServiciosTotal(reserva);

const getReservaMontoInicial = (reserva: Reserva) => {
  if (reserva.monto_inicial === null || reserva.monto_inicial === undefined) {
    return null;
  }

  const value = Number(reserva.monto_inicial);
  return Number.isFinite(value) ? value : null;
};

// Celdas de la planilla. Los importes y las fechas van con su tipo real (no
// como texto), así Excel los puede sumar, ordenar y filtrar sin reconvertir
// nada a mano.
const EXCEL_AMOUNT_FORMAT = '#,##0.00';
const EXCEL_DATETIME_FORMAT = 'dd/mm/yyyy hh:mm';

const excelText = (value?: string | null) => ({
  type: String,
  value: value ? String(value) : '',
});

const excelInteger = (value: unknown) => {
  // Sin este corte, Number(null) daría 0 y un dato ausente se exportaría como
  // un cero real, que en una planilla no es lo mismo que "vacío".
  if (value === null || value === undefined || value === '') {
    return { type: Number, value: null };
  }
  const parsed = Number(value);
  return {
    type: Number,
    value: Number.isFinite(parsed) ? parsed : null,
  };
};

const excelAmount = (value: number | null) => ({
  type: Number,
  value: value === null || !Number.isFinite(value) ? null : value,
  format: EXCEL_AMOUNT_FORMAT,
});

const EXPORT_TIME_ZONE = 'America/Argentina/Cordoba';

// La planilla guarda las fechas como número de serie a partir de los
// componentes UTC. Sin esta conversión, un evento que arranca 21:30 en Córdoba
// se exportaría como 00:30 del día siguiente. Se corre la fecha para que sus
// componentes UTC coincidan con la hora local del hotel, que es la que muestra
// el resto del sistema.
const toExportZoneDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EXPORT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // Algunos motores devuelven "24" para la medianoche.
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  ));
};

const excelDate = (value?: string | null) => {
  if (!value) return { type: Date, value: null, format: EXCEL_DATETIME_FORMAT };
  const date = new Date(value);
  return {
    type: Date,
    value: Number.isNaN(date.getTime()) ? null : toExportZoneDate(date),
    format: EXCEL_DATETIME_FORMAT,
  };
};

// Ancho de cada columna de la planilla, en caracteres, en el mismo orden que
// los encabezados de la exportación.
const EXPORT_COLUMN_WIDTHS = [
  { width: 10 },  // ID reserva
  { width: 32 },  // Cliente
  { width: 30 },  // Email
  { width: 16 },  // Teléfono
  { width: 20 },  // Registrada por
  { width: 20 },  // Salón
  { width: 16 },  // Distribución
  { width: 18 },  // Fecha inicio
  { width: 18 },  // Fecha fin
  { width: 20 },  // Estado
  { width: 12 },  // Cantidad de personas
  { width: 14 },  // Monto inicial
  { width: 14 },  // Monto salón
  { width: 44 },  // Servicios
  { width: 16 },  // Monto servicios
  { width: 14 },  // Monto total
  { width: 50 },  // Observaciones
  { width: 18 },  // Fecha de creación
];

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getExportDateRange = (filters: ReservaExportFilters) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (filters.period === 'last30') {
    const start = new Date(today);
    start.setDate(start.getDate() - 29);
    return { start, endExclusive: tomorrow, fileSuffix: 'ultimos-30-dias' };
  }

  if (filters.period === 'currentMonth') {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      endExclusive: new Date(today.getFullYear(), today.getMonth() + 1, 1),
      fileSuffix: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`,
    };
  }

  if (filters.period === 'specificMonth') {
    const [year, month] = filters.month.split('-').map(Number);
    return {
      start: new Date(year, month - 1, 1),
      endExclusive: new Date(year, month, 1),
      fileSuffix: filters.month,
    };
  }

  if (filters.period === 'dateRange') {
    const endExclusive = parseLocalDate(filters.dateTo);
    endExclusive.setDate(endExclusive.getDate() + 1);
    return {
      start: parseLocalDate(filters.dateFrom),
      endExclusive,
      fileSuffix: `${filters.dateFrom}-a-${filters.dateTo}`,
    };
  }

  if (filters.period === 'last12Months') {
    const start = new Date(today);
    start.setFullYear(start.getFullYear() - 1);
    return { start, endExclusive: tomorrow, fileSuffix: 'ultimos-12-meses' };
  }

  return {
    start: null,
    endExclusive: null,
    fileSuffix: 'todas',
  };
};

export function Reservas({ perfil, onUnsavedChangesChange, highlightRequest }: ReservasProps) {
  const CAPACITY_WARNING_STYLES = {
    borderColor: '#f5c57a',
    backgroundColor: '#fff8ed',
    textColor: '#8a4b08',
  };
  const ACTION_BUTTON_BASE =
    'group inline-flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 active:scale-95 disabled:translate-y-0 disabled:scale-100 disabled:shadow-none';
  const ACTION_ICON_BASE = 'h-4 w-4 transition-transform duration-200 group-hover:scale-110 group-active:scale-95';

  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creadorNamesById, setCreadorNamesById] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<string | null>(null);
  const [prioritizeWarnings, setPrioritizeWarnings] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingReserva, setEditingReserva] = useState<Reserva | null>(null);
  const [isReservaFormDirty, setIsReservaFormDirty] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [openingPresupuestoId, setOpeningPresupuestoId] = useState<number | null>(null);
  const [sendingPresupuestoId, setSendingPresupuestoId] = useState<number | null>(null);
  const [deletingReservaId, setDeletingReservaId] = useState<number | null>(null);
  const [reservaToDelete, setReservaToDelete] = useState<Reserva | null>(null);
  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('fechaInicio');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  // Fila de reserva expandida en la lista mobile (acordeón compacto).
  const [expandedReservaId, setExpandedReservaId] = useState<number | null>(null);
  const [reservasActivas, setReservasActivas] = useState<ReservaConflictComparable[]>([]);
  const [warningDialog, setWarningDialog] = useState<{ title: string; description: string[] } | null>(null);
  const [highlightedReservaId, setHighlightedReservaId] = useState<number | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<{ reservaId: number; nonce: number } | null>(null);
  // Mes que muestra el calendario; el listado de abajo lo acompaña.
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => getMonthStart(new Date()));
  // Reserva elegida en el calendario. A diferencia de highlightedReservaId (que
  // es un destello de 1 s para las notificaciones), ésta queda marcada hasta que
  // se elija otra: si no, al cerrar el detalle ya no se vería.
  const [selectedCalendarReservaId, setSelectedCalendarReservaId] = useState<number | null>(null);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [estadoDialogReserva, setEstadoDialogReserva] = useState<Reserva | null>(null);
  const [estadoSeleccionado, setEstadoSeleccionado] = useState<Reserva['estado'] | null>(null);
  const [estadoChangeDetalle, setEstadoChangeDetalle] = useState('');
  const [estadoDialogFeedback, setEstadoDialogFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [estadoHistoryRefreshKey, setEstadoHistoryRefreshKey] = useState(0);
  const [changingEstadoId, setChangingEstadoId] = useState<number | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportingReservas, setExportingReservas] = useState(false);
  const [exportError, setExportError] = useState('');
  const highlightTimeoutRef = useRef<number | null>(null);
  const isAdmin = perfil.rol === 'ADMIN';

  useEffect(() => {
    loadReservas();
  }, [filterEstado]);

  useEffect(() => {
    onUnsavedChangesChange?.(showDialog && isReservaFormDirty);
  }, [showDialog, isReservaFormDirty, onUnsavedChangesChange]);

  useEffect(() => () => {
    onUnsavedChangesChange?.(false);
  }, [onUnsavedChangesChange]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!highlightRequest?.reservaId) return;
    const normalizedReservaId = Number(highlightRequest.reservaId);
    if (!Number.isFinite(normalizedReservaId)) return;

    setSearchTerm('');
    setFilterEstado(null);
    setPendingHighlight({ reservaId: normalizedReservaId, nonce: highlightRequest.nonce });
    loadReservas();
  }, [highlightRequest]);

  const loadReservas = async () => {
    try {
      setLoading(true);
      setError('');

      let query = supabase
        .from('reservas')
        .select(`
          *,
          salon:salones(*),
          distribucion:distribuciones(*),
          reserva_servicios(
            id_servicio,
            cantidad,
            servicio:servicios(
              nombre,
              precio
            )
          )
        `)
        .order('fecha_inicio', { ascending: false });

      if (filterEstado) {
        query = query.eq('estado', filterEstado);
      }

      const [{ data, error: queryError }, { data: reservasActivasData, error: reservasActivasError }] = await Promise.all([
        query,
        supabase
          .from('reservas')
          .select('id, id_salon, estado, fecha_inicio, fecha_fin')
          .neq('estado', RESERVA_ESTADO_CANCELADO),
      ]);

      if (queryError) throw queryError;
      if (reservasActivasError) throw reservasActivasError;
      const reservasData = data || [];
      setReservas(reservasData);
      setReservasActivas((reservasActivasData || []) as ReservaConflictComparable[]);

      const creadorIds = Array.from(
        new Set(
          reservasData
            .map((reserva) => reserva.creado_por)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      if (creadorIds.length === 0) {
        setCreadorNamesById({});
      } else {
        const { data: perfilesData, error: perfilesError } = await supabase
          .from('perfiles')
          .select('user_id, nombre')
          .in('user_id', creadorIds);

        if (perfilesError) {
          console.warn('Error loading reserva creators:', perfilesError);
          setCreadorNamesById({});
        } else {
          setCreadorNamesById(
            (perfilesData || []).reduce<Record<string, string>>((acc, perfil) => {
              if (perfil.user_id) {
                acc[perfil.user_id] = perfil.nombre || 'Usuario back office';
              }
              return acc;
            }, {}),
          );
        }
      }
    } catch (err: any) {
      console.error('Error loading reservas:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (reserva: Reserva) => {
    if (showDialog && editingReserva?.id === reserva.id) {
      handleDialogClose();
      return;
    }

    setEditingReserva(reserva);
    setIsReservaFormDirty(false);
    setShowDialog(true);
  };

  const handleCreateNew = () => {
    setIsReservaFormDirty(false);
    setEditingReserva(null);
    setShowDialog(true);
  };

  const handleDialogClose = (success?: boolean) => {
    setShowDialog(false);
    setEditingReserva(null);
    setIsReservaFormDirty(false);
    if (success) {
      void loadReservas();
      setCalendarRefreshKey((key) => key + 1);
    }
  };

  const showTemporaryMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 3000);
  };

  const getReservaRegistradaPor = (reserva: Reserva) => {
    const creadoPor = reserva.creado_por?.trim();
    if (!creadoPor) return 'Formulario WEB';
    return creadorNamesById[creadoPor] || 'Usuario back office';
  };

  const buildProtectedFunctionEndpoints = (path: string) => [
    `https://${projectId}.supabase.co/functions/v1/server/${path}`,
    `https://${projectId}.supabase.co/functions/v1/${path}`,
    `https://${projectId}.supabase.co/functions/v1/server/make-server-484a241a/${path}`,
    `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/${path}`,
  ];

  const invokeProtectedFunction = async (path: string, body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('No hay sesión activa para completar esta acción.');
    }

    let lastError = `No se pudo completar la solicitud (${path}).`;

    for (const endpoint of buildProtectedFunctionEndpoints(path)) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        });

        const text = await response.text();
        let payload: any = {};

        try {
          payload = text ? JSON.parse(text) : {};
        } catch {
          payload = { error: text };
        }

        if (response.ok) {
          return payload;
        }

        lastError = payload?.error || `HTTP ${response.status} en ${endpoint}`;
      } catch (fetchError: any) {
        lastError = fetchError?.message || String(fetchError);
      }
    }

    throw new Error(lastError);
  };

  const handleOpenPresupuesto = async (reserva: Reserva) => {
    if (!reserva.presupuesto_url) return;
    setOpeningPresupuestoId(reserva.id);

    try {
      const payload = await invokeProtectedFunction('get-presupuesto-url', {
        reservaId: reserva.id,
        presupuestoPath: reserva.presupuesto_url,
      });

      const accessUrl = typeof payload?.accessUrl === 'string' && payload.accessUrl.trim()
        ? payload.accessUrl.trim()
        : typeof payload?.shortUrl === 'string' && payload.shortUrl.trim()
          ? payload.shortUrl.trim()
          : typeof payload?.signedUrl === 'string' && payload.signedUrl.trim()
            ? payload.signedUrl.trim()
            : '';

      if (!accessUrl) {
        throw new Error('No se pudo obtener la URL del presupuesto.');
      }

      window.open(accessUrl, '_blank', 'noopener');
    } catch (err: any) {
      try {
        const { data, error: signedUrlError } = await supabase.storage
          .from('presupuestos')
          .createSignedUrl(reserva.presupuesto_url, 60);

        if (signedUrlError) throw signedUrlError;
        if (!data?.signedUrl) {
          throw new Error('No se pudo obtener la URL del presupuesto.');
        }

        window.open(data.signedUrl, '_blank', 'noopener');
      } catch (fallbackError: any) {
        console.error('Error opening presupuesto:', err, fallbackError);
        setMessage({
          type: 'error',
          text: 'No se pudo abrir el presupuesto. Intente nuevamente.',
        });
        setTimeout(() => setMessage(null), 3000);
      }
    } finally {
      setOpeningPresupuestoId((currentId) => (currentId === reserva.id ? null : currentId));
    }
  };

  const handleSendPresupuestoEmail = async (reserva: Reserva) => {
    const clienteEmail = reserva.cliente_email?.trim();

    if (!reserva.presupuesto_url) {
      showTemporaryMessage('error', 'La reserva no tiene presupuesto generado.');
      return;
    }

    if (!clienteEmail) {
      showTemporaryMessage('error', 'La reserva no tiene un email asociado.');
      return;
    }

    try {
      setSendingPresupuestoId(reserva.id);
      setMessage(null);

      const payload = await invokeProtectedFunction('send-presupuesto-email', {
        reservaId: reserva.id,
        presupuestoPath: reserva.presupuesto_url,
      });

      const sentTo = typeof payload?.sentTo === 'string' && payload.sentTo.trim()
        ? payload.sentTo.trim()
        : clienteEmail;

      showTemporaryMessage('success', `Presupuesto enviado a ${sentTo}.`);
    } catch (err: any) {
      console.error('Error sending presupuesto email:', err);
      showTemporaryMessage(
        'error',
        err?.message || 'No se pudo enviar el presupuesto por email. Intente nuevamente.',
      );
    } finally {
      setSendingPresupuestoId((currentId) => (currentId === reserva.id ? null : currentId));
    }
  };

  const handleDeleteReserva = (reserva: Reserva) => {
    if (!isAdmin) return;
    setReservaToDelete(reserva);
    setShowDeleteConfirmDialog(true);
  };

  const confirmDeleteReserva = async () => {
    if (!reservaToDelete) return;
    const reserva = reservaToDelete;
    setShowDeleteConfirmDialog(false);
    setReservaToDelete(null);

    try {
      setDeletingReservaId(reserva.id);
      setMessage(null);

      await deleteReservaWithPresupuesto(reserva);
      setReservas((prev) => prev.filter((item) => item.id !== reserva.id));
      setCalendarRefreshKey((key) => key + 1);
      setMessage({ type: 'success', text: 'Reserva eliminada correctamente' });
      setTimeout(() => setMessage(null), 3000);
      // Aviso interno (solo para administradores). Sin reservaId porque la
      // reserva ya no existe (evita una notificación que apunte a nada).
      void createInternalNotification({
        tipo: 'RESERVA_ELIMINADA',
        titulo: 'Reserva eliminada',
        mensaje: `${perfil.nombre || 'Un usuario'} eliminó la reserva #${reserva.id}${reserva.cliente_nombre ? ` de ${reserva.cliente_nombre}` : ''}.`,
        reservaId: null,
        audiencia: 'admin',
        actor: { user_id: perfil.user_id, nombre: perfil.nombre },
      });
    } catch (err: any) {
      console.error('Error deleting reserva:', err);
      setMessage({
        type: 'error',
        text: err?.message || 'No se pudo eliminar la reserva. Intente nuevamente.',
      });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setDeletingReservaId((currentId) => (currentId === reserva.id ? null : currentId));
    }
  };

  const handleDeleteDialogOpenChange = (open: boolean) => {
    setShowDeleteConfirmDialog(open);
    if (!open) {
      setReservaToDelete(null);
    }
  };

  const openEstadoDialog = (reserva: Reserva) => {
    setEstadoDialogReserva(reserva);
    setEstadoSeleccionado(reserva.estado);
    setEstadoChangeDetalle('');
    setEstadoDialogFeedback(null);
  };

  const handleEstadoDialogOpenChange = (open: boolean) => {
    if (open) return;
    setEstadoDialogReserva(null);
    setEstadoSeleccionado(null);
    setEstadoChangeDetalle('');
    setEstadoDialogFeedback(null);
  };

  const confirmEstadoChange = async () => {
    if (!estadoDialogReserva || !estadoSeleccionado) return;

    try {
      const estadoAnterior = estadoDialogReserva.estado;
      const hayCambioEstado = estadoSeleccionado !== estadoAnterior;
      const detalle = estadoChangeDetalle.trim();
      if (!hayCambioEstado && !detalle) return;

      setChangingEstadoId(estadoDialogReserva.id);
      setEstadoDialogFeedback(null);

      const { error: changeError } = await supabase.rpc('cambiar_estado_reserva', {
        p_reserva_id: estadoDialogReserva.id,
        p_nuevo_estado: estadoSeleccionado,
        p_detalle: detalle || null,
      });

      if (changeError) throw changeError;

      setEstadoDialogReserva((current) => (
        current ? { ...current, estado: estadoSeleccionado } : current
      ));
      setEstadoChangeDetalle('');
      setEstadoHistoryRefreshKey((key) => key + 1);
      if (hayCambioEstado) {
        setCalendarRefreshKey((key) => key + 1);
        void createInternalNotification({
          tipo: 'ESTADO_CAMBIADO',
          titulo: 'Cambio de estado',
          mensaje: `${perfil.nombre || 'Un usuario'} cambió la reserva #${estadoDialogReserva.id}${estadoDialogReserva.cliente_nombre ? ` de ${estadoDialogReserva.cliente_nombre}` : ''} de ${estadoAnterior} a ${estadoSeleccionado}.`,
          reservaId: estadoDialogReserva.id,
          audiencia: 'todos',
          actor: { user_id: perfil.user_id, nombre: perfil.nombre },
        });
      }
      await loadReservas();
      setEstadoDialogFeedback({
        type: 'success',
        text: hayCambioEstado
          ? `Estado actualizado a ${estadoSeleccionado}.`
          : 'Anotación agregada al historial.',
      });
    } catch (err: any) {
      console.error('Error updating reserva estado:', err);
      setEstadoDialogFeedback({
        type: 'error',
        text: err?.message || 'No se pudo actualizar el estado de la reserva.',
      });
    } finally {
      setChangingEstadoId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Argentina/Cordoba',
    });
  };

  const renderEstadoControl = (reserva: Reserva, mobile = false) => {
    const isChanging = changingEstadoId === reserva.id;
    const estadoColor = RESERVA_ESTADO_COLORS[reserva.estado];
    const estadoTextColor = getReadableTextColor(estadoColor);

    return (
      <button
        type="button"
        onClick={() => openEstadoDialog(reserva)}
        disabled={isChanging}
        className={`bo-estado-btn group inline-flex min-h-10 items-center justify-between gap-3 rounded-lg border-2 px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-70 ${
          mobile ? 'w-full' : 'min-w-[190px] max-w-[230px]'
        }`}
        style={{
          borderColor: estadoColor,
          backgroundColor: estadoColor,
          color: estadoTextColor,
        }}
        title="Gestionar estado, notas e historial"
        aria-label={`Gestionar estado e historial de la reserva ${reserva.id}`}
      >
        <span className="truncate">{reserva.estado}</span>
        {isChanging ? (
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin" />
        ) : (
          <History className="h-4 w-4 flex-shrink-0 transition-transform group-hover:scale-110" />
        )}
      </button>
    );
  };

  const getReservaWarningMessages = (reserva: Reserva): string[] => {
    const conflictIds = getReservaConflictIds(reserva, reservasActivas);
    return [
      getReservaCapacityWarningText(reserva),
      getReservaConflictText(conflictIds),
      getReservaExpirationWarningText(reserva),
      getReservaStartWarningText(reserva),
    ].filter((message): message is string => Boolean(message));
  };

  // El listado acompaña al calendario: sólo las reservas del mes que está a la
  // vista arriba.
  const reservasDelMes = reservas.filter((reserva) => isReservaInMonth(reserva, calendarMonth));

  const filteredReservas = reservasDelMes.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.cliente_nombre || '').toLowerCase().includes(term) ||
      getReservaRegistradaPor(r).toLowerCase().includes(term) ||
      r.salon?.nombre.toLowerCase().includes(term) ||
      r.estado.toLowerCase().includes(term) ||
      r.id.toString().includes(term)
    );
  });

  const getSortValue = (reserva: Reserva, key: SortKey) => {
    switch (key) {
      case 'id':
        return reserva.id || 0;
      case 'cliente':
        return reserva.cliente_nombre || '';
      case 'registradaPor':
        return getReservaRegistradaPor(reserva);
      case 'salon':
        return reserva.salon?.nombre || '';
      case 'fechaInicio':
        return new Date(reserva.fecha_inicio).getTime() || 0;
      case 'fechaFin':
        return new Date(reserva.fecha_fin).getTime() || 0;
      case 'estado':
        return reserva.estado || '';
      case 'montoInicial':
        return getReservaMontoInicial(reserva) ?? 0;
      case 'monto':
        return getReservaMontoTotal(reserva);
      default:
        return '';
    }
  };

  const sortedReservas = [...filteredReservas].sort((a, b) => {
    const aValue = getSortValue(a, sortBy);
    const bValue = getSortValue(b, sortBy);

    let compareResult = 0;

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      compareResult = aValue - bValue;
    } else {
      compareResult = String(aValue).localeCompare(String(bValue), 'es', {
        sensitivity: 'base',
        numeric: true,
      });
    }

    if (compareResult === 0) {
      compareResult = a.id - b.id;
    }

    return sortDirection === 'asc' ? compareResult : -compareResult;
  });

  const reservasConAdvertencia = filteredReservas.filter(
    (reserva) => getReservaWarningMessages(reserva).length > 0,
  );
  const advertenciasCount = reservasConAdvertencia.length;
  const warningIdSet = new Set(reservasConAdvertencia.map((reserva) => reserva.id));

  // Al activar el KPI, las reservas con advertencia se muestran primero
  // (orden estable: mantiene el orden actual dentro de cada grupo).
  const displayedReservas = prioritizeWarnings
    ? [...sortedReservas].sort(
        (a, b) => (warningIdSet.has(a.id) ? 0 : 1) - (warningIdSet.has(b.id) ? 0 : 1),
      )
    : sortedReservas;

  // Distingue "este mes no tiene reservas" de "la búsqueda no encontró nada",
  // para que el listado vacío no se lea como que se perdieron las reservas.
  const emptyListMessage = reservasDelMes.length === 0
    ? `No hay reservas en ${formatMonthTitle(calendarMonth)}. Cambie el mes en el calendario para ver otras.`
    : 'No se encontraron reservas con los filtros aplicados.';

  // Los KPI cuentan el mismo universo que el listado: el mes del calendario.
  const estadoCounts = reservasDelMes.reduce<Record<string, number>>((acc, reserva) => {
    acc[reserva.estado] = (acc[reserva.estado] || 0) + 1;
    return acc;
  }, {});

  const handleExportReservas = async (filters: ReservaExportFilters) => {
    const headers = [
      'ID reserva',
      'Cliente',
      'Email',
      'Teléfono',
      'Registrada por',
      'Salón',
      'Distribución',
      'Fecha inicio',
      'Fecha fin',
      'Estado',
      'Cantidad de personas',
      'Monto inicial',
      'Monto salón',
      'Servicios',
      'Monto servicios',
      'Monto total',
      'Observaciones',
      'Fecha de creación',
    ];

    try {
      setExportingReservas(true);
      setExportError('');

      const { start, endExclusive, fileSuffix } = getExportDateRange(filters);
      const pageSize = 1000;
      const exportReservas: Reserva[] = [];
      let page = 0;

      while (true) {
        let query = supabase
          .from('reservas')
          .select(`
            *,
            salon:salones(*),
            distribucion:distribuciones(*),
            reserva_servicios(
              id_servicio,
              cantidad,
              servicio:servicios(
                nombre,
                precio
              )
            )
          `)
          .order('fecha_inicio', { ascending: true })
          .order('id', { ascending: true })
          .range(page * pageSize, ((page + 1) * pageSize) - 1);

        if (start) {
          query = query.gte('fecha_inicio', start.toISOString());
        }
        if (endExclusive) {
          query = query.lt('fecha_inicio', endExclusive.toISOString());
        }
        if (filters.estado) {
          query = query.eq('estado', filters.estado);
        }
        if (filters.origen === 'web') {
          query = query.is('creado_por', null);
        } else if (filters.origen === 'backoffice') {
          query = query.not('creado_por', 'is', null);
        }

        const { data, error: exportQueryError } = await query;
        if (exportQueryError) throw exportQueryError;

        const pageData = (data || []) as Reserva[];
        exportReservas.push(...pageData);
        if (pageData.length < pageSize) break;
        page += 1;
      }

      if (exportReservas.length === 0) {
        setExportError('No se encontraron reservas para los filtros seleccionados.');
        return;
      }

      const creatorIds = Array.from(new Set(
        exportReservas
          .map((reserva) => reserva.creado_por)
          .filter((value): value is string => Boolean(value)),
      ));
      const exportCreatorNames: Record<string, string> = {};

      if (creatorIds.length > 0) {
        const { data: perfilesData, error: perfilesError } = await supabase
          .from('perfiles')
          .select('user_id, nombre')
          .in('user_id', creatorIds);

        if (perfilesError) throw perfilesError;
        (perfilesData || []).forEach((creator) => {
          if (creator.user_id) {
            exportCreatorNames[creator.user_id] = creator.nombre || 'Usuario back office';
          }
        });
      }

      const rows = exportReservas.map((reserva) => {
        const servicios = (reserva.reserva_servicios || [])
          .map((item) => {
            const nombre = item.servicio?.nombre || `Servicio #${item.id_servicio || ''}`;
            return `${nombre} x${Number(item.cantidad) || 0}`;
          })
          .join(' | ');
        const montoSalon = Number(reserva.monto) || 0;
        const montoServicios = getReservaServiciosTotal(reserva);

        return [
          excelInteger(reserva.id),
          excelText(reserva.cliente_nombre),
          excelText(reserva.cliente_email),
          excelText(reserva.cliente_telefono),
          excelText(
            reserva.creado_por
              ? exportCreatorNames[reserva.creado_por] || 'Usuario back office'
              : 'Formulario WEB',
          ),
          excelText(reserva.salon?.nombre),
          excelText(reserva.distribucion?.nombre),
          excelDate(reserva.fecha_inicio),
          excelDate(reserva.fecha_fin),
          excelText(reserva.estado),
          excelInteger(reserva.cantidad_personas),
          excelAmount(getReservaMontoInicial(reserva)),
          excelAmount(montoSalon),
          excelText(servicios),
          excelAmount(montoServicios),
          excelAmount(montoSalon + montoServicios),
          excelText(reserva.observaciones),
          excelDate(reserva.creado_en),
        ];
      });

      // La librer\u00EDa se carga reci\u00E9n ac\u00E1, igual que pdfmake: no tiene sentido
      // sumarla al bundle inicial por una acci\u00F3n puntual.
      const { default: writeXlsxFile } = await import('write-excel-file/universal');

      const sheetData: XlsxSheetData = [
        headers.map((header) => ({
          value: header,
          fontWeight: 'bold' as const,
          backgroundColor: '#e5e7eb',
          align: 'left' as const,
        })),
        ...rows,
      ];

      const blob = await writeXlsxFile(sheetData, {
        sheet: 'Reservas',
        stickyRowsCount: 1,
        columns: EXPORT_COLUMN_WIDTHS,
      }).toBlob();

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = downloadUrl;
      link.download = `reservas-${fileSuffix}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(downloadUrl);

      setExportDialogOpen(false);
      showTemporaryMessage(
        'success',
        `${exportReservas.length} reserva(s) exportada(s) correctamente.`,
      );
    } catch (err: any) {
      console.error('Error exporting reservas:', err);
      setExportError(err?.message || 'No se pudo generar la exportación.');
    } finally {
      setExportingReservas(false);
    }
  };

  const defaultDirectionByColumn = (column: SortKey): SortDirection => (
    column === 'id'
    || column === 'fechaInicio'
    || column === 'fechaFin'
    || column === 'montoInicial'
    || column === 'monto'
      ? 'desc'
      : 'asc'
  );

  const handleSort = (column: SortKey) => {
    if (sortBy === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortBy(column);
    setSortDirection(defaultDirectionByColumn(column));
  };

  const renderSortIcon = (column: SortKey) => {
    if (sortBy !== column) {
      // Ícono atenuado en todas las columnas ordenables, para que se note
      // que se puede ordenar por cualquiera de ellas.
      return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400" />;
    }

    return sortDirection === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
      : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />;
  };

  const handleOpenWarningDialog = (reserva: Reserva, warningMessages: string[]) => {
    if (warningMessages.length === 0) return;

    setWarningDialog({
      title: `Advertencias de la reserva #${reserva.id}`,
      description: warningMessages,
    });
  };

  const scrollToReservaRow = (reservaId: number) => {
    window.setTimeout(() => {
      const row = document.getElementById(`reserva-row-${reservaId}`);
      const card = document.getElementById(`reserva-card-${reservaId}`);
      const target = row && row.offsetParent !== null ? row : card;
      target?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }, 0);
  };

  const handleCalendarMonthChange = (monthStart: Date) => {
    setCalendarMonth(monthStart);
    // La marca pierde sentido al cambiar de mes: la reserva elegida ya no está.
    setSelectedCalendarReservaId(null);
  };

  const handleCalendarReservaSelect = (reserva: Reserva) => {
    const reservaId = Number(reserva.id);
    if (!Number.isFinite(reservaId)) return;

    setSelectedCalendarReservaId(reservaId);
    // Si una búsqueda o un filtro de estado la dejaban afuera del listado, se
    // limpian: la reserva elegida tiene que quedar visible sí o sí.
    setSearchTerm('');
    setFilterEstado(null);
    scrollToReservaRow(reservaId);
  };

  useEffect(() => {
    if (!pendingHighlight || loading) return;

    const targetId = Number(pendingHighlight.reservaId);
    if (!Number.isFinite(targetId)) {
      setPendingHighlight(null);
      return;
    }

    const targetReserva = reservas.find((item) => Number(item.id) === targetId);
    if (!targetReserva) return;

    // El listado sólo muestra el mes del calendario, así que una reserva que
    // llega desde una notificación puede caer fuera. Se mueve el calendario a
    // su mes y el resaltado sigue en el render siguiente.
    if (!isReservaInMonth(targetReserva, calendarMonth)) {
      const targetStart = new Date(targetReserva.fecha_inicio);
      const targetMonth = Number.isNaN(targetStart.getTime())
        ? null
        : getMonthStart(targetStart);

      // Sin la comparación de mes se entraría en bucle: cada intento crea un
      // Date nuevo, así que el estado siempre cambiaría de referencia.
      if (targetMonth && targetMonth.getTime() !== calendarMonth.getTime()) {
        setCalendarMonth(targetMonth);
        return;
      }

      setPendingHighlight(null);
      return;
    }

    const targetExists = sortedReservas.some((item) => Number(item.id) === targetId);
    if (!targetExists) return;

    setHighlightedReservaId(targetId);
    setPendingHighlight(null);

    scrollToReservaRow(targetId);

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedReservaId(null);
    }, 1000);
  }, [pendingHighlight, sortedReservas, loading, reservas, calendarMonth]);

  return (
    <div className="bo-page">
      {perfil.rol === 'OPERADOR' && <WelcomeBanner nombre={perfil.nombre} />}
      <div className="bo-page-header mb-4">
        <div className="bo-module-heading">
          <h2 className="bo-module-title text-gray-900">
            <span className="bo-module-title-icon">
              <CalendarCheck className="h-6 w-6" />
            </span>
            Gestión de Reservas
          </h2>
          <p className="bo-module-subtitle">Alta, seguimiento y estados de las reservas de salones</p>
        </div>
        <div className="bo-page-actions bo-page-actions--pair flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setExportError('');
              setExportDialogOpen(true);
            }}
            disabled={loading}
            className="bo-csv-btn bo-mobile-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            title="Exportar reservas a una planilla de Excel (.xlsx)"
            aria-label="Exportar a Excel"
          >
            <FileSpreadsheet className="h-5 w-5" />
            <span className="bo-btn-label">Exportar a Excel</span>
          </button>
          <button
            type="button"
            onClick={handleCreateNew}
            className="bo-action-button flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            title="Nueva reserva"
            aria-label="Nueva reserva"
          >
            <Plus className="w-5 h-5" />
            <span className="bo-btn-label">Nueva Reserva</span>
          </button>
        </div>
      </div>

      <div className="mb-6">
        <ModuleInfoBanner>
          Cree y edite reservas de los salones y controle su estado (pendiente de validación,
          validado, confirmado, pagado o cancelado). Los KPI y el calendario ofrecen una vista
          rápida del período, y las advertencias le avisan sobre conflictos de agenda, exceso de
          capacidad o vencimientos próximos.
        </ModuleInfoBanner>
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 p-3 rounded-lg mb-6 ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          )}
          <p className={`text-sm ${message.type === 'success' ? 'text-green-800' : 'text-red-800'}`}>
            {message.text}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Los KPI van arriba del calendario, así que sin esta línea serían
          números sin contexto: no se vería de qué mes son. */}
      <p className="bo-estado-kpis-caption">
        Estados de{' '}
        <span style={{ textTransform: 'capitalize' }}>{formatMonthTitle(calendarMonth)}</span>
        {' '}· {reservasDelMes.length} {reservasDelMes.length === 1 ? 'reserva' : 'reservas'}
      </p>

      <div className="bo-estado-kpis">
        {getReservaEstados().map((estado) => {
          const color = RESERVA_ESTADO_COLORS[estado];
          const EstadoIcon = ESTADO_KPI_ICONS[estado] || FileText;
          return (
            <div
              key={estado}
              className="bo-estado-kpi"
              style={{ ['--kpi-color']: color } as React.CSSProperties}
            >
              <span className="bo-estado-kpi-icon" aria-hidden="true">
                <EstadoIcon className="h-[1.05rem] w-[1.05rem]" />
              </span>
              <div className="bo-estado-kpi-body">
                <div className="bo-estado-kpi-count">{estadoCounts[estado] || 0}</div>
                <div className="bo-estado-kpi-label">{estado}</div>
              </div>
            </div>
          );
        })}
      </div>

      <ReservaCalendar
        refreshKey={calendarRefreshKey}
        month={calendarMonth}
        onMonthChange={handleCalendarMonthChange}
        onReservaSelect={handleCalendarReservaSelect}
      />

      {/* Filters */}
      <div className="bo-filter-bar mb-6">
        <div className="bo-filter-search flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, salón, registrada por, estado o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bo-search-input w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <select
          value={filterEstado || ''}
          onChange={(e) => setFilterEstado(e.target.value || null)}
          className="bo-select px-4 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="">Todos los estados</option>
          {getReservaEstados().map((estado) => (
            <option key={estado} value={estado}>{estado}</option>
          ))}
        </select>
      </div>

      {advertenciasCount > 0 && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => setPrioritizeWarnings((prev) => !prev)}
            className={`bo-warning-kpi${prioritizeWarnings ? ' is-active' : ''}`}
            aria-pressed={prioritizeWarnings}
            title={
              prioritizeWarnings
                ? 'Restablecer el orden de la tabla'
                : 'Mostrar primero las reservas con advertencia'
            }
          >
            <span className="bo-warning-kpi-icon">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <span className="bo-warning-kpi-body">
              <span className="bo-warning-kpi-main">
                <span className="bo-warning-kpi-count">{advertenciasCount}</span>
                <span className="bo-warning-kpi-label">
                  {advertenciasCount === 1 ? 'reserva con advertencia' : 'reservas con advertencia'}
                </span>
              </span>
              <span className="bo-warning-kpi-hint">Clic para ver</span>
            </span>
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bo-reservas-table bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bo-reservas-table-scroll overflow-x-auto">
          <table className="bo-reservas-table-content w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSort('id')}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    ID
                    {renderSortIcon('id')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSort('cliente')}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    Cliente
                    {renderSortIcon('cliente')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSort('registradaPor')}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    Registrada por
                    {renderSortIcon('registradaPor')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSort('salon')}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    Salón
                    {renderSortIcon('salon')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSort('fechaInicio')}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    Fecha Inicio
                    {renderSortIcon('fechaInicio')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSort('fechaFin')}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    Fecha Fin
                    {renderSortIcon('fechaFin')}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSort('estado')}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    Estado
                    {renderSortIcon('estado')}
                  </button>
                </th>
                <th className="px-6 py-3 text-right text-xs text-gray-600 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSort('montoInicial')}
                    className="inline-flex w-full items-center justify-end gap-1 hover:text-gray-900 transition-colors"
                  >
                    Monto inicial
                    {renderSortIcon('montoInicial')}
                  </button>
                </th>
                <th className="px-6 py-3 text-right text-xs text-gray-600 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSort('monto')}
                    className="inline-flex w-full items-center justify-end gap-1 hover:text-gray-900 transition-colors"
                  >
                    Monto Total
                    {renderSortIcon('monto')}
                  </button>
                </th>
                <th className="px-6 py-3 text-center text-xs text-gray-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                    Cargando reservas...
                  </td>
                </tr>
              ) : filteredReservas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-6 py-8 text-center text-gray-500">
                    {emptyListMessage}
                  </td>
                </tr>
              ) : (
                displayedReservas.map(reserva => {
                  const reservaRowId = Number(reserva.id);
                  const warningMessages = getReservaWarningMessages(reserva);
                  const warningText = warningMessages.join(' ');
                  const hasWarning = warningMessages.length > 0;
                  const isHighlightedRow = Number.isFinite(reservaRowId) && highlightedReservaId === reservaRowId;
                  const isSelectedRow = Number.isFinite(reservaRowId)
                    && selectedCalendarReservaId === reservaRowId;
                  const clienteEmail = reserva.cliente_email?.trim() || '';
                  const canSendPresupuestoEmail = Boolean(reserva.presupuesto_url && clienteEmail);
                  const totalServicios = getReservaServiciosTotal(reserva);
                  const totalReserva = getReservaMontoTotal(reserva);
                  const montoInicial = getReservaMontoInicial(reserva);
                  const registradaPor = getReservaRegistradaPor(reserva);
                  const sendPresupuestoTitle = sendingPresupuestoId === reserva.id
                    ? 'Enviando presupuesto...'
                    : !reserva.presupuesto_url
                      ? 'La reserva no tiene presupuesto generado'
                      : !clienteEmail
                        ? 'La reserva no tiene email asociado'
                        : `Enviar presupuesto a ${clienteEmail}`;

                  return (
                    <Fragment key={reserva.id}>
                      <tr
                        id={`reserva-row-${reservaRowId}`}
                        className={`transition-colors duration-700 ${
                          isSelectedRow ? 'bo-reserva-row-selected ' : ''
                        }${
                          isHighlightedRow
                            ? 'bg-yellow-200 hover:bg-yellow-200'
                            : hasWarning
                              ? 'bo-row-warning'
                              : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-6 py-4 text-sm text-gray-900">
                          <div className="flex items-center gap-2">
                            {hasWarning && (
                              <button
                                type="button"
                                onClick={() => handleOpenWarningDialog(reserva, warningMessages)}
                                className="bo-warning-chip inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                                title={warningText}
                                aria-label={warningText}
                              >
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <span>#{reserva.id}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {reserva.cliente_nombre || 'Sin nombre'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{registradaPor}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{reserva.salon?.nombre}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{formatDate(reserva.fecha_inicio)}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{formatDate(reserva.fecha_fin)}</td>
                        <td className="px-6 py-4">
                          {renderEstadoControl(reserva)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          {montoInicial === null
                            ? 'Sin presupuesto'
                            : formatUSD(montoInicial)}
                        </td>
                        <td className="px-6 py-4 text-right text-sm text-gray-900">
                          <div className="text-right">
                            <div className="font-medium text-gray-900">
                              {formatUSD(totalReserva)}
                            </div>
                            {totalServicios > 0 && (
                              <div className="mt-1 text-xs text-gray-500">
                                Salón: {formatUSD(Number(reserva.monto) || 0)}
                                {' '}+ Servicios: {formatUSD(totalServicios)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="bo-reserva-actions-wide flex items-center justify-end gap-2">
                            {reserva.presupuesto_url && (
                              <>
                                <button
                                  onClick={() => handleOpenPresupuesto(reserva)}
                                  disabled={openingPresupuestoId === reserva.id}
                                  className={`${ACTION_BUTTON_BASE} text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-100 disabled:bg-indigo-50 disabled:text-indigo-700`}
                                  title={openingPresupuestoId === reserva.id ? 'Abriendo presupuesto...' : 'Ver presupuesto'}
                                >
                                  {openingPresupuestoId === reserva.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <FileText className={ACTION_ICON_BASE} />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleSendPresupuestoEmail(reserva)}
                                  disabled={!canSendPresupuestoEmail || sendingPresupuestoId === reserva.id}
                                  className={`${ACTION_BUTTON_BASE} text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-gray-100 disabled:text-gray-400`}
                                  title={sendPresupuestoTitle}
                                >
                                  {sendingPresupuestoId === reserva.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Mail className={ACTION_ICON_BASE} />
                                  )}
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleEdit(reserva)}
                              className={`${ACTION_BUTTON_BASE} text-blue-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-blue-500`}
                              title="Editar"
                            >
                              <Edit className={ACTION_ICON_BASE} />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteReserva(reserva)}
                                disabled={deletingReservaId === reserva.id}
                                className={`${ACTION_BUTTON_BASE} text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500 disabled:opacity-70 disabled:cursor-wait`}
                                title={deletingReservaId === reserva.id ? 'Eliminando reserva...' : 'Eliminar reserva'}
                              >
                                {deletingReservaId === reserva.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className={ACTION_ICON_BASE} />
                                )}
                              </button>
                            )}
                          </div>
                          <div className="bo-reserva-actions-compact">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className={`${ACTION_BUTTON_BASE} text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-gray-500`}
                                  title="Ver acciones"
                                  aria-label={`Ver acciones de la reserva ${reserva.id}`}
                                >
                                  <MoreHorizontal className={ACTION_ICON_BASE} />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                {reserva.presupuesto_url && (
                                  <>
                                    <DropdownMenuItem
                                      onSelect={() => void handleOpenPresupuesto(reserva)}
                                      disabled={openingPresupuestoId === reserva.id}
                                    >
                                      {openingPresupuestoId === reserva.id ? (
                                        <Loader2 className="animate-spin" />
                                      ) : (
                                        <FileText />
                                      )}
                                      {openingPresupuestoId === reserva.id ? 'Abriendo presupuesto...' : 'Ver presupuesto'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onSelect={() => void handleSendPresupuestoEmail(reserva)}
                                      disabled={!canSendPresupuestoEmail || sendingPresupuestoId === reserva.id}
                                      title={sendPresupuestoTitle}
                                    >
                                      {sendingPresupuestoId === reserva.id ? (
                                        <Loader2 className="animate-spin" />
                                      ) : (
                                        <Mail />
                                      )}
                                      {sendingPresupuestoId === reserva.id ? 'Enviando presupuesto...' : 'Enviar presupuesto'}
                                    </DropdownMenuItem>
                                  </>
                                )}
                                <DropdownMenuItem onSelect={() => handleEdit(reserva)}>
                                  <Edit />
                                  Editar reserva
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onSelect={() => void handleDeleteReserva(reserva)}
                                      disabled={deletingReservaId === reserva.id}
                                    >
                                      {deletingReservaId === reserva.id ? (
                                        <Loader2 className="animate-spin" />
                                      ) : (
                                        <Trash2 />
                                      )}
                                      {deletingReservaId === reserva.id ? 'Eliminando reserva...' : 'Eliminar reserva'}
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bo-reservas-mobile-list bo-stack">
        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
            Cargando reservas...
          </div>
        ) : filteredReservas.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-gray-500">
            {emptyListMessage}
          </div>
        ) : (
          displayedReservas.map((reserva) => {
            const reservaRowId = Number(reserva.id);
            const warningMessages = getReservaWarningMessages(reserva);
            const warningText = warningMessages.join(' ');
            const hasWarning = warningMessages.length > 0;
            const isHighlightedRow = Number.isFinite(reservaRowId) && highlightedReservaId === reservaRowId;
            const isSelectedRow = Number.isFinite(reservaRowId)
              && selectedCalendarReservaId === reservaRowId;
            const clienteEmail = reserva.cliente_email?.trim() || '';
            const canSendPresupuestoEmail = Boolean(reserva.presupuesto_url && clienteEmail);
            const totalServicios = getReservaServiciosTotal(reserva);
            const totalReserva = getReservaMontoTotal(reserva);
            const montoInicial = getReservaMontoInicial(reserva);
            const registradaPor = getReservaRegistradaPor(reserva);
            const sendPresupuestoTitle = sendingPresupuestoId === reserva.id
              ? 'Enviando presupuesto...'
              : !reserva.presupuesto_url
                ? 'La reserva no tiene presupuesto generado'
                : !clienteEmail
                  ? 'La reserva no tiene email asociado'
                  : `Enviar presupuesto a ${clienteEmail}`;
            const isExpanded = expandedReservaId === reserva.id;
            const shortFechaInicio = new Date(reserva.fecha_inicio).toLocaleDateString('es-AR', {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit',
            });

            return (
              <div
                key={`mobile-${reserva.id}`}
                id={`reserva-card-${reservaRowId}`}
                className={`bo-reserva-row-card${isExpanded ? ' is-expanded' : ''}${
                  isHighlightedRow ? ' bo-reserva-card-highlight' : ''
                }${isSelectedRow ? ' bo-reserva-card-selected' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedReservaId((prev) => (prev === reserva.id ? null : reserva.id))}
                  className="bo-reserva-row"
                  aria-expanded={isExpanded}
                >
                  <span
                    className="bo-reserva-row-strip"
                    style={{ backgroundColor: RESERVA_ESTADO_COLORS[reserva.estado] }}
                    aria-hidden="true"
                  />
                  <span className="bo-reserva-row-main">
                    <span className="bo-reserva-row-top">
                      <span className="bo-reserva-row-id">#{reserva.id}</span>
                      <span className="bo-reserva-row-name">{reserva.cliente_nombre || 'Sin nombre'}</span>
                      {hasWarning && <AlertTriangle className="bo-reserva-row-warn" aria-hidden="true" />}
                    </span>
                    <span className="bo-reserva-row-sub">
                      {reserva.salon?.nombre || 'Sin salón'} · {shortFechaInicio} · {formatUSD(totalReserva)}
                    </span>
                  </span>
                  <span
                    className="bo-reserva-row-badge"
                    style={{ backgroundColor: RESERVA_ESTADO_COLORS[reserva.estado] }}
                  >
                    {reserva.estado}
                  </span>
                  <ChevronDown className="bo-reserva-row-chevron" aria-hidden="true" />
                </button>

                {isExpanded && (
                <div className="bo-reserva-row-detail">
                <div className="bo-reserva-card-estado">
                  <span className="bo-reserva-card-estado-label">Estado</span>
                  {renderEstadoControl(reserva, true)}
                </div>

                <dl className="bo-reserva-card-info">
                  <div className="bo-reserva-card-row">
                    <dt>Registrada por</dt>
                    <dd>{registradaPor}</dd>
                  </div>
                  <div className="bo-reserva-card-row">
                    <dt>Salón</dt>
                    <dd>{reserva.salon?.nombre || 'Sin salón'}</dd>
                  </div>
                  <div className="bo-reserva-card-row">
                    <dt>Inicio</dt>
                    <dd>{formatDate(reserva.fecha_inicio)}</dd>
                  </div>
                  <div className="bo-reserva-card-row">
                    <dt>Fin</dt>
                    <dd>{formatDate(reserva.fecha_fin)}</dd>
                  </div>
                  <div className="bo-reserva-card-row">
                    <dt>Monto inicial</dt>
                    <dd>
                      {montoInicial === null ? 'Sin presupuesto' : formatUSD(montoInicial)}
                    </dd>
                  </div>
                  <div className="bo-reserva-card-row">
                    <dt>Monto total</dt>
                    <dd className="bo-reserva-card-total">
                      <span className="bo-reserva-card-total-value">{formatUSD(totalReserva)}</span>
                      {totalServicios > 0 && (
                        <span className="bo-reserva-card-note">
                          Incluye {formatUSD(totalServicios)} en servicios
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="bo-reserva-actions mt-4 border-t border-gray-200 pt-3">
                  {hasWarning && (
                    <button
                      type="button"
                      onClick={() => handleOpenWarningDialog(reserva, warningMessages)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                      title="Ver advertencias"
                      aria-label={warningText}
                      style={{
                        color: CAPACITY_WARNING_STYLES.textColor,
                        borderColor: CAPACITY_WARNING_STYLES.borderColor,
                        backgroundColor: CAPACITY_WARNING_STYLES.backgroundColor,
                      }}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </button>
                  )}
                  {reserva.presupuesto_url && (
                    <>
                      <button
                        onClick={() => handleOpenPresupuesto(reserva)}
                        disabled={openingPresupuestoId === reserva.id}
                        className={`${ACTION_BUTTON_BASE} text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 focus-visible:ring-indigo-500 disabled:cursor-wait disabled:opacity-100 disabled:bg-indigo-50 disabled:text-indigo-700`}
                        title={openingPresupuestoId === reserva.id ? 'Abriendo presupuesto...' : 'Ver presupuesto'}
                      >
                        {openingPresupuestoId === reserva.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <FileText className={ACTION_ICON_BASE} />
                        )}
                      </button>
                      <button
                        onClick={() => handleSendPresupuestoEmail(reserva)}
                        disabled={!canSendPresupuestoEmail || sendingPresupuestoId === reserva.id}
                        className={`${ACTION_BUTTON_BASE} text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-gray-100 disabled:text-gray-400`}
                        title={sendPresupuestoTitle}
                      >
                        {sendingPresupuestoId === reserva.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Mail className={ACTION_ICON_BASE} />
                        )}
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleEdit(reserva)}
                    className={`${ACTION_BUTTON_BASE} text-blue-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-blue-500`}
                    title="Editar"
                  >
                    <Edit className={ACTION_ICON_BASE} />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteReserva(reserva)}
                      disabled={deletingReservaId === reserva.id}
                      className={`${ACTION_BUTTON_BASE} text-red-600 hover:bg-red-50 hover:text-red-700 focus-visible:ring-red-500 disabled:opacity-70 disabled:cursor-wait`}
                      title={deletingReservaId === reserva.id ? 'Eliminando reserva...' : 'Eliminar reserva'}
                    >
                      {deletingReservaId === reserva.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className={ACTION_ICON_BASE} />
                      )}
                    </button>
                  )}
                </div>
                </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Mostrando {filteredReservas.length} de {reservasDelMes.length} reservas de{' '}
        <span style={{ textTransform: 'capitalize' }}>{formatMonthTitle(calendarMonth)}</span>
        {reservas.length !== reservasDelMes.length && (
          <> · {reservas.length} en total. Cambie el mes en el calendario para ver el resto.</>
        )}
      </div>

      {/* Alta / edición de reserva en un modal amplio (antes se abría dentro de
          la fila, con muy poca visibilidad). */}
      <Dialog open={showDialog} onOpenChange={(open) => { if (!open) handleDialogClose(); }}>
        <DialogContent
          className="bo-reserva-form-dialog"
          onInteractOutside={(event) => {
            // No cerrar por click afuera si hay cambios sin guardar (evita perder
            // una edición larga por un click accidental).
            if (isReservaFormDirty) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (isReservaFormDirty) event.preventDefault();
          }}
        >
          <DialogHeader className="bo-reserva-form-dialog-head">
            <DialogTitle>
              {editingReserva ? `Editar Reserva #${editingReserva.id}` : 'Nueva Reserva'}
            </DialogTitle>
          </DialogHeader>
          {showDialog && (
            <ReservaForm
              reserva={editingReserva}
              perfil={perfil}
              onClose={handleDialogClose}
              onDirtyChange={setIsReservaFormDirty}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showDeleteConfirmDialog}
        onOpenChange={handleDeleteDialogOpenChange}
        onConfirm={confirmDeleteReserva}
        title="Eliminar reserva"
        description="¿Está seguro de eliminar esta reserva? También se eliminará el presupuesto asociado."
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="destructive"
      />

      <InfoDialog
        open={warningDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setWarningDialog(null);
          }
        }}
        title={warningDialog?.title || 'Advertencias'}
        description={warningDialog?.description || []}
        actionText="Cerrar"
        variant="warning"
      />

      <ReservaEstadoGestionDialog
        open={estadoDialogReserva !== null}
        reserva={estadoDialogReserva}
        estadoSeleccionado={estadoSeleccionado}
        detalle={estadoChangeDetalle}
        feedback={estadoDialogFeedback}
        loading={changingEstadoId !== null}
        historyRefreshKey={estadoHistoryRefreshKey}
        onEstadoChange={(estado) => {
          setEstadoSeleccionado(estado);
          setEstadoDialogFeedback(null);
        }}
        onDetalleChange={(detalle) => {
          setEstadoChangeDetalle(detalle);
          setEstadoDialogFeedback(null);
        }}
        onConfirm={confirmEstadoChange}
        onOpenChange={handleEstadoDialogOpenChange}
      />

      <ReservaExportDialog
        open={exportDialogOpen}
        loading={exportingReservas}
        error={exportError}
        initialEstado={
          filterEstado && getReservaEstados().includes(filterEstado as Reserva['estado'])
            ? filterEstado as Reserva['estado']
            : ''
        }
        estados={getReservaEstados()}
        onConfirm={handleExportReservas}
        onOpenChange={(open) => {
          setExportDialogOpen(open);
          if (!open) {
            setExportError('');
          }
        }}
      />
    </div>
  );
}

