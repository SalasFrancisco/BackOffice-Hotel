import { useState, useEffect, useMemo } from 'react';
import { supabase, Reserva, Salon, Distribucion, CategoriaServicio, Servicio } from '../utils/supabase/client';
import { AlertCircle, CalendarDays, CheckCircle, ChevronLeft, ChevronRight, Package, X } from 'lucide-react';
import { projectId } from '../utils/supabase/info';
import {
  hasNonWhitespaceValue,
  preventInvalidNumberKeys,
  sanitizeIntegerInput,
  sanitizePhoneInput,
} from '../utils/formSanitizers';
import { InfoDialog } from './InfoDialog';
import { RichTextDescription } from './RichTextDescription';
import {
  RESERVA_ESTADO_BACKOFFICE_INICIAL,
  RESERVA_ESTADO_TRANSITION_ERROR_MESSAGE,
  RESERVA_ESTADOS_BLOQUEANTES,
  getAllowedReservaEstadoTransitions,
  isReservaEstadoPendienteGestion,
  isReservaEstadoTransitionAllowed,
} from '../utils/reservaEstadoTransitions';

type ReservaFormProps = {
  reserva?: Reserva | null;
  onClose: (success?: boolean) => void;
  onDirtyChange?: (isDirty: boolean) => void;
};

const HORARIO_OPCIONES = Array.from({ length: 48 }, (_, index) => {
  const hora = String(Math.floor(index / 2)).padStart(2, '0');
  const minutos = index % 2 === 0 ? '00' : '30';
  return `${hora}:${minutos}`;
});

const isoDateToShortDate = (isoDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return '';
  const [, year, month, day] = match;
  return `${day}/${month}/${year.slice(-2)}`;
};

const parseShortDateToIso = (value: string): string | null => {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const fullYear = 2000 + Number(yearText);

  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const candidate = new Date(fullYear, month - 1, day);
  if (
    candidate.getFullYear() !== fullYear
    || candidate.getMonth() !== month - 1
    || candidate.getDate() !== day
  ) {
    return null;
  }

  return `${String(fullYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const PARTIAL_SALON_DAY_RATE = 0.65;
const PARTIAL_SALON_DAY_THRESHOLD_MINUTES = 15 * 60;

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

  return Math.floor((endTimestamp - startTimestamp) / MILLISECONDS_PER_DAY) + 1;
};

const parseTimeToMinutes = (value: string | null | undefined): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? '').trim());
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

const roundBillableDayUnits = (value: number): number =>
  Math.round(value * 100) / 100;

const formatBillableDayUnits = (value: number): string =>
  new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);

const calculateSalonBillableDayUnits = ({
  startIsoDate,
  endIsoDate,
  startTime,
  endTime,
}: {
  startIsoDate: string | null;
  endIsoDate: string | null;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
}): number => {
  const totalDays = getEventDaysCount(startIsoDate, endIsoDate);
  if (totalDays <= 1) return 1;

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const startDayRate =
    startMinutes !== null && startMinutes >= PARTIAL_SALON_DAY_THRESHOLD_MINUTES
      ? PARTIAL_SALON_DAY_RATE
      : 1;
  const endDayRate =
    endMinutes !== null && endMinutes < PARTIAL_SALON_DAY_THRESHOLD_MINUTES
      ? PARTIAL_SALON_DAY_RATE
      : 1;

  return roundBillableDayUnits(
    Math.max(1, Math.max(0, totalDays - 2) + startDayRate + endDayRate),
  );
};

const HOTEL_TIME_ZONE = 'America/Argentina/Cordoba';
const ESTADOS_BLOQUEANTES = new Set<Reserva['estado']>(RESERVA_ESTADOS_BLOQUEANTES);

type ReservaOverlapComparable = {
  id: number;
  id_salon: number;
  estado: Reserva['estado'];
  fecha_inicio: string;
  fecha_fin: string;
};

type AvailabilityReserva = ReservaOverlapComparable & {
  cliente_nombre?: string | null;
};

type DatePickerTarget = 'inicio' | 'fin';

type CalendarDayAvailability = {
  available: Salon[];
  pending: Salon[];
  occupied: Salon[];
};

const toReservaTimeTimestamp = (value: string): number | null => {
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

const hasReservaTimeOverlap = (
  startA: string,
  endA: string,
  startB: string,
  endB: string,
) => {
  const startATimestamp = toReservaTimeTimestamp(startA);
  const endATimestamp = toReservaTimeTimestamp(endA);
  const startBTimestamp = toReservaTimeTimestamp(startB);
  const endBTimestamp = toReservaTimeTimestamp(endB);

  if (
    startATimestamp === null
    || endATimestamp === null
    || startBTimestamp === null
    || endBTimestamp === null
  ) {
    return false;
  }

  return startATimestamp < endBTimestamp && startBTimestamp < endATimestamp;
};

const getBlockingReservas = (
  targetReserva: ReservaOverlapComparable,
  reservas: ReservaOverlapComparable[],
) => {
  if (targetReserva.estado === 'Cancelado') {
    return [];
  }

  return reservas
    .filter((item) => item.id !== targetReserva.id)
    .filter((item) => Number(item.id_salon) === Number(targetReserva.id_salon))
    .filter((item) => ESTADOS_BLOQUEANTES.has(item.estado))
    .filter((item) => hasReservaTimeOverlap(
      targetReserva.fecha_inicio,
      targetReserva.fecha_fin,
      item.fecha_inicio,
      item.fecha_fin,
    ))
    .sort((a, b) => a.id - b.id);
};

const getDateTimePartsInHotelTimeZone = (value?: string | null) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOTEL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;

  if (!year || !month || !day || !hour || !minute) {
    return null;
  }

  return {
    isoDate: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
};

const AVAILABILITY_WEEK_DAYS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

const padDatePart = (value: number) => String(value).padStart(2, '0');

const buildIsoDateFromParts = (year: number, monthIndex: number, day: number) =>
  `${year}-${padDatePart(monthIndex + 1)}-${padDatePart(day)}`;

const buildLocalDateFromIsoDate = (isoDate: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  return new Date(Number(yearText), Number(monthText) - 1, Number(dayText));
};

const formatAvailabilityMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
  }).format(date);

const formatLongAvailabilityDate = (isoDate: string) => {
  const date = buildLocalDateFromIsoDate(isoDate);
  if (!date) return '';

  return new Intl.DateTimeFormat('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(date);
};

const buildProtectedFunctionEndpoints = (path: string) => [
  `https://${projectId}.supabase.co/functions/v1/server/${path}`,
  `https://${projectId}.supabase.co/functions/v1/${path}`,
  `https://${projectId}.supabase.co/functions/v1/server/make-server-484a241a/${path}`,
  `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/${path}`,
];

const parseServerResponse = async (response: Response) => {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const invokeProtectedFunction = async (path: string, body: Record<string, unknown>) => {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error('No se pudo obtener la sesión actual.');
  }

  let lastError: Error | null = null;

  for (const endpoint of buildProtectedFunctionEndpoints(path)) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const payload = await parseServerResponse(response);
      if (response.ok) {
        return payload;
      }

      lastError = new Error(payload?.error || `HTTP ${response.status}`);
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('No se pudo completar la operacion solicitada.');
};

export function ReservaForm({ reserva, onClose, onDirtyChange }: ReservaFormProps) {
  const CAPACITY_WARNING_STYLES = {
    borderColor: '#f5c57a',
    backgroundColor: '#fff8ed',
    textColor: '#8a4b08',
  };
  const DATE_TIME_FIELD_CLASS =
    'w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent';

  const [salones, setSalones] = useState<Salon[]>([]);
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([]);
  const [categorias, setCategorias] = useState<CategoriaServicio[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [activeDatePicker, setActiveDatePicker] = useState<DatePickerTarget | null>(null);
  const [availabilityCalendarDate, setAvailabilityCalendarDate] = useState(() => new Date());
  const [calendarPreviewIsoDate, setCalendarPreviewIsoDate] = useState('');
  const [loadingCalendarAvailability, setLoadingCalendarAvailability] = useState(false);
  const [calendarAvailabilityError, setCalendarAvailabilityError] = useState('');
  const [calendarMonthReservas, setCalendarMonthReservas] = useState<AvailabilityReserva[]>([]);
  const [message, setMessage] = useState<{ text: string } | null>(null);
  const [warningDialog, setWarningDialog] = useState<{ title: string; description: string } | null>(null);
  
  // Selected services: Map<servicioId, cantidad>
  const [selectedServicios, setSelectedServicios] = useState<Map<number, number>>(new Map());
  const [expandedServicioCategorias, setExpandedServicioCategorias] = useState<Set<number>>(() => new Set());

  // Form fields
  const [nombreCliente, setNombreCliente] = useState(reserva?.cliente_nombre || '');
  const [emailCliente, setEmailCliente] = useState(reserva?.cliente_email || '');
  const [telefonoCliente, setTelefonoCliente] = useState(sanitizePhoneInput(reserva?.cliente_telefono || ''));
  const [idSalon, setIdSalon] = useState(reserva?.id_salon || 0);
  const [idDistribucion, setIdDistribucion] = useState(reserva?.id_distribucion || 0);
  const initialFechaInicioParts = reserva ? getDateTimePartsInHotelTimeZone(reserva.fecha_inicio) : null;
  const initialFechaFinParts = reserva ? getDateTimePartsInHotelTimeZone(reserva.fecha_fin) : null;
  const [fechaInicioDate, setFechaInicioDate] = useState(
    initialFechaInicioParts ? isoDateToShortDate(initialFechaInicioParts.isoDate) : '',
  );
  const [fechaInicioHora, setFechaInicioHora] = useState(
    initialFechaInicioParts?.time || '',
  );
  const [fechaFinDate, setFechaFinDate] = useState(
    initialFechaFinParts ? isoDateToShortDate(initialFechaFinParts.isoDate) : '',
  );
  const [fechaFinHora, setFechaFinHora] = useState(
    initialFechaFinParts?.time || '',
  );
  const [estado, setEstado] = useState<Reserva['estado']>(reserva?.estado || RESERVA_ESTADO_BACKOFFICE_INICIAL);

  useEffect(() => {
    setEstado(reserva?.estado || RESERVA_ESTADO_BACKOFFICE_INICIAL);
  }, [reserva]);
  const [observaciones, setObservaciones] = useState(reserva?.observaciones || '');
  const [cantidadPersonas, setCantidadPersonas] = useState(
    reserva?.cantidad_personas ? reserva.cantidad_personas.toString() : ''
  );
  const [initialFormSnapshot, setInitialFormSnapshot] = useState<string | null>(null);

  const selectedServiciosSnapshot = useMemo(
    () => Array.from(selectedServicios.entries())
      .sort(([a], [b]) => a - b)
      .map(([servicioId, cantidad]) => `${servicioId}:${cantidad}`)
      .join('|'),
    [selectedServicios],
  );

  const currentFormSnapshot = useMemo(
    () => JSON.stringify({
      nombreCliente,
      emailCliente,
      telefonoCliente,
      idSalon,
      idDistribucion,
      fechaInicioDate,
      fechaInicioHora,
      fechaFinDate,
      fechaFinHora,
      estado,
      observaciones,
      cantidadPersonas,
      selectedServicios: selectedServiciosSnapshot,
    }),
    [
      nombreCliente,
      emailCliente,
      telefonoCliente,
      idSalon,
      idDistribucion,
      fechaInicioDate,
      fechaInicioHora,
      fechaFinDate,
      fechaFinHora,
      estado,
      observaciones,
      cantidadPersonas,
      selectedServiciosSnapshot,
    ],
  );

  const isFormDirty = initialFormSnapshot !== null && currentFormSnapshot !== initialFormSnapshot;

  const fechaInicioIsoFromInput = parseShortDateToIso(fechaInicioDate);
  const fechaFinIsoFromInput = parseShortDateToIso(fechaFinDate);
  const availabilityCalendarCells = useMemo(() => {
    const year = availabilityCalendarDate.getFullYear();
    const monthIndex = availabilityCalendarDate.getMonth();
    const firstDayOfMonth = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const leadingEmptyDays = firstDayOfMonth.getDay();

    return [
      ...Array.from({ length: leadingEmptyDays }, () => null as number | null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [availabilityCalendarDate]);
  const selectedPickerIsoDate = activeDatePicker === 'inicio'
    ? fechaInicioIsoFromInput
    : activeDatePicker === 'fin'
      ? fechaFinIsoFromInput
      : null;
  const eventCalendarDaysCount = getEventDaysCount(fechaInicioIsoFromInput, fechaFinIsoFromInput);
  const eventBillableDayUnits = calculateSalonBillableDayUnits({
    startIsoDate: fechaInicioIsoFromInput,
    endIsoDate: fechaFinIsoFromInput,
    startTime: fechaInicioHora,
    endTime: fechaFinHora,
  });

  const currentSalon = salones.find(s => s.id === idSalon) || null;
  const currentSalonDailyPrice = currentSalon?.precio_base || 0;
  const currentReservaTotal = currentSalonDailyPrice * eventBillableDayUnits;
  const currentDistribucion = idDistribucion
    ? distribuciones.find(d => d.id === idDistribucion) || null
    : null;
  const startDayIsPartial = eventCalendarDaysCount > 1 && (
    (parseTimeToMinutes(fechaInicioHora) ?? -1) >= PARTIAL_SALON_DAY_THRESHOLD_MINUTES
  );
  const endDayIsPartial = eventCalendarDaysCount > 1 && (
    (parseTimeToMinutes(fechaFinHora) ?? PARTIAL_SALON_DAY_THRESHOLD_MINUTES) < PARTIAL_SALON_DAY_THRESHOLD_MINUTES
  );
  const billingAdjustments = [
    startDayIsPartial ? 'día inicial al 65%' : null,
    endDayIsPartial ? 'día final al 65%' : null,
  ].filter((value): value is string => Boolean(value));
  const totalPersonasNumber = parseInt(cantidadPersonas, 10) || 0;
  const salonesRecomendadosData = useMemo(() => {
    const salonesOrdenadosPorNombre = [...salones].sort((a, b) =>
      String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'),
    );

    if (totalPersonasNumber <= 0) {
      return {
        hasPersonas: false,
        recommended: salonesOrdenadosPorNombre,
        others: [] as Salon[],
        suggested: null as Salon | null,
      };
    }

    const recommended = salonesOrdenadosPorNombre
      .filter((salon) => Number(salon.capacidad || 0) >= totalPersonasNumber)
      .sort((a, b) => {
        const capacityDiff = Number(a.capacidad || 0) - Number(b.capacidad || 0);
        if (capacityDiff !== 0) return capacityDiff;
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
      });

    const recommendedIds = new Set(recommended.map((salon) => salon.id));
    const others = salonesOrdenadosPorNombre.filter((salon) => !recommendedIds.has(salon.id));

    return {
      hasPersonas: true,
      recommended,
      others,
      suggested: recommended[0] || null,
    };
  }, [salones, totalPersonasNumber]);
  const categoriasConServicios = useMemo(
    () => categorias
      .map((categoria) => ({
        categoria,
        servicios: servicios.filter((servicio) => (
          servicio.id_categoria === categoria.id && servicio.activo !== false
        )),
      }))
      .filter((item) => item.servicios.length > 0),
    [categorias, servicios],
  );
  const formatSalonOptionLabel = (salon: Salon) => (
    `${salon.nombre} - Cap: ${salon.capacidad} - ${
      Number(salon.precio_base || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })
    }`
  );
  const exceedsSalonCapacity = Boolean(
    currentSalon && totalPersonasNumber > currentSalon.capacidad,
  );
  const exceedsDistribucionCapacity = Boolean(
    currentDistribucion && totalPersonasNumber > currentDistribucion.capacidad,
  );
  const hasCapacityWarning = totalPersonasNumber > 0 && (
    exceedsSalonCapacity || exceedsDistribucionCapacity
  );

  const capacityWarningDetails: string[] = [];
  if (exceedsSalonCapacity && currentSalon) {
    capacityWarningDetails.push(`supera la capacidad del salón (${currentSalon.capacidad} personas)`);
  }
  if (exceedsDistribucionCapacity && currentDistribucion) {
    capacityWarningDetails.push(`supera la capacidad de la distribución seleccionada (${currentDistribucion.capacidad} personas)`);
  }

  const capacityWarningText = hasCapacityWarning
    ? `Advertencia: la cantidad ingresada ${capacityWarningDetails.join(' y ')}. Podés guardar la reserva igualmente.`
    : '';
  const allowedEstadoTransitions = reserva
    ? getAllowedReservaEstadoTransitions(reserva.estado)
    : [RESERVA_ESTADO_BACKOFFICE_INICIAL];

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!activeDatePicker || !idSalon) {
      setCalendarMonthReservas([]);
      setCalendarAvailabilityError('');
      setLoadingCalendarAvailability(false);
      return;
    }

    let isActive = true;
    const monthStart = new Date(
      availabilityCalendarDate.getFullYear(),
      availabilityCalendarDate.getMonth(),
      1,
      0,
      0,
      0,
      0,
    );
    const monthEnd = new Date(
      availabilityCalendarDate.getFullYear(),
      availabilityCalendarDate.getMonth() + 1,
      1,
      0,
      0,
      0,
      0,
    );

    const loadCalendarAvailability = async () => {
      try {
        setLoadingCalendarAvailability(true);
        setCalendarAvailabilityError('');

        const { data, error } = await supabase
          .from('reservas')
          .select('id, id_salon, estado, fecha_inicio, fecha_fin, cliente_nombre')
          .lt('fecha_inicio', monthEnd.toISOString())
          .gt('fecha_fin', monthStart.toISOString())
          .neq('estado', 'Cancelado')
          .eq('id_salon', idSalon);

        if (error) throw error;
        if (isActive) {
          setCalendarMonthReservas(
            ((data || []) as AvailabilityReserva[]).filter((item) => item.estado !== 'Cancelado'),
          );
        }
      } catch (err: any) {
        console.error('Error loading calendar availability:', err);
        if (isActive) {
          setCalendarAvailabilityError(err?.message || 'No se pudo consultar la disponibilidad.');
          setCalendarMonthReservas([]);
        }
      } finally {
        if (isActive) {
          setLoadingCalendarAvailability(false);
        }
      }
    };

    void loadCalendarAvailability();

    return () => {
      isActive = false;
    };
  }, [activeDatePicker, availabilityCalendarDate, idSalon]);

  useEffect(() => {
    if (idSalon) {
      loadDistribuciones(idSalon);
    } else {
      setDistribuciones([]);
      setIdDistribucion(0);
    }
  }, [idSalon]);

  useEffect(() => {
    setInitialFormSnapshot(null);
    onDirtyChange?.(false);
  }, [reserva?.id, onDirtyChange]);

  useEffect(() => {
    if (loadingData || initialFormSnapshot !== null) return;
    setInitialFormSnapshot(currentFormSnapshot);
  }, [loadingData, initialFormSnapshot, currentFormSnapshot]);

  useEffect(() => {
    if (loadingData) {
      onDirtyChange?.(false);
      return;
    }

    onDirtyChange?.(isFormDirty);
  }, [loadingData, isFormDirty, onDirtyChange]);

  const showWarningDialog = (description: string, title = 'Revisá la reserva') => {
    setWarningDialog({
      title,
      description,
    });
  };

  const loadInitialData = async () => {
    try {
      setLoadingData(true);

      const { data: salonesData, error: salonesError } = await supabase
        .from('salones')
        .select('*')
        .or('activo.is.null,activo.eq.true')
        .order('nombre');

      if (salonesError) throw salonesError;
      setSalones((salonesData || []).filter((salon) => salon.activo !== false));

      // Load servicios y categorías
      const { data: categoriasData, error: categoriasError } = await supabase
        .from('categorias_servicios')
        .select('*')
        .order('nombre');

      if (categoriasError) throw categoriasError;
      setCategorias(categoriasData || []);

      const { data: serviciosData, error: serviciosError } = await supabase
        .from('servicios')
        .select('*, categoria:categorias_servicios(*)')
        .or('activo.is.null,activo.eq.true')
        .order('nombre');

      if (serviciosError) throw serviciosError;
      const serviciosActivos = (serviciosData || []).filter((servicio) => servicio.activo !== false);
      const serviciosActivosIds = new Set(serviciosActivos.map((servicio) => servicio.id));
      setServicios(serviciosActivos);

      // Si estamos editando, cargar distribuciones y servicios
      if (reserva) {
        setNombreCliente(reserva.cliente_nombre || '');
        setEmailCliente(reserva.cliente_email || '');
        setTelefonoCliente(sanitizePhoneInput(reserva.cliente_telefono || ''));
        setCantidadPersonas(reserva.cantidad_personas ? reserva.cantidad_personas.toString() : '');
        
        if (reserva.id_salon) {
          await loadDistribuciones(reserva.id_salon);
        }

        // Load servicios de la reserva
        const { data: reservaServiciosData, error: rsError } = await supabase
          .from('reserva_servicios')
          .select('id_servicio, cantidad')
          .eq('id_reserva', reserva.id);

        if (!rsError && reservaServiciosData) {
          const map = new Map<number, number>();
          reservaServiciosData.forEach(rs => {
            if (serviciosActivosIds.has(rs.id_servicio)) {
              map.set(rs.id_servicio, rs.cantidad);
            }
          });
          setSelectedServicios(map);
        }
      }
    } catch (err: any) {
      console.error('Error loading data:', err);
      showWarningDialog(err.message, 'No se pudo cargar el formulario');
    } finally {
      setLoadingData(false);
    }
  };

  const loadDistribuciones = async (salonId: number) => {
    try {
      const { data, error } = await supabase
        .from('distribuciones')
        .select('*')
        .eq('id_salon', salonId)
        .order('nombre');

      if (error) throw error;
      setDistribuciones(data || []);
    } catch (err: any) {
      console.error('Error loading distribuciones:', err);
    }
  };

  const toggleServicio = (servicioId: number) => {
    const newMap = new Map(selectedServicios);
    if (newMap.has(servicioId)) {
      newMap.delete(servicioId);
    } else {
      newMap.set(servicioId, 1);
    }
    setSelectedServicios(newMap);
  };

  const updateCantidadServicio = (servicioId: number, cantidad: number) => {
    if (cantidad <= 0) {
      const newMap = new Map(selectedServicios);
      newMap.delete(servicioId);
      setSelectedServicios(newMap);
    } else {
      const newMap = new Map(selectedServicios);
      newMap.set(servicioId, cantidad);
      setSelectedServicios(newMap);
    }
  };

  const toggleServicioCategoria = (categoriaId: number) => {
    setExpandedServicioCategorias((prev) => {
      const next = new Set(prev);
      if (next.has(categoriaId)) {
        next.delete(categoriaId);
      } else {
        next.add(categoriaId);
      }
      return next;
    });
  };

  const getAvailabilityForIsoDate = (isoDate: string): CalendarDayAvailability => {
    const availabilitySalones = currentSalon ? [currentSalon] : [];
    const date = buildLocalDateFromIsoDate(isoDate);
    if (!date) {
      return {
        available: availabilitySalones,
        pending: [],
        occupied: [],
      };
    }

    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
    const dayStartIso = dayStart.toISOString();
    const dayEndIso = dayEnd.toISOString();
    const currentReservaId = reserva?.id || 0;

    return availabilitySalones.reduce<CalendarDayAvailability>(
      (summary, salon) => {
        const overlappingReservas = calendarMonthReservas
          .filter((item) => item.id !== currentReservaId)
          .filter((item) => Number(item.id_salon) === Number(salon.id))
          .filter((item) => hasReservaTimeOverlap(
            dayStartIso,
            dayEndIso,
            item.fecha_inicio,
            item.fecha_fin,
          ));
        const hasBlockingReserva = overlappingReservas.some((item) => ESTADOS_BLOQUEANTES.has(item.estado));
        const hasPendingReserva = overlappingReservas.some((item) => isReservaEstadoPendienteGestion(item.estado));

        if (hasBlockingReserva) {
          summary.occupied.push(salon);
        } else if (hasPendingReserva) {
          summary.pending.push(salon);
        } else {
          summary.available.push(salon);
        }

        return summary;
      },
      {
        available: [],
        pending: [],
        occupied: [],
      },
    );
  };

  const getSelectedSalonStatus = (availability: CalendarDayAvailability) => {
    if (!currentSalon) {
      return {
        label: 'Sin salon',
        className: 'is-neutral',
      };
    }

    if (availability.occupied.length > 0) {
      return {
        label: 'Ocupado',
        className: 'is-occupied',
      };
    }

    if (availability.pending.length > 0) {
      return {
        label: 'En consulta',
        className: 'is-pending',
      };
    }

    return {
      label: 'Disponible',
      className: 'is-available',
    };
  };

  const getAvailabilityTitle = (availability: CalendarDayAvailability) => [
    currentSalon ? `Salon: ${currentSalon.nombre}` : 'Seleccione un salon',
    `Estado: ${getSelectedSalonStatus(availability).label}`,
  ].join('\n');

  const openAvailabilityCalendar = (target: DatePickerTarget) => {
    const isoDate = target === 'inicio' ? fechaInicioIsoFromInput : fechaFinIsoFromInput;
    const relatedIsoDate = target === 'inicio' ? fechaFinIsoFromInput : fechaInicioIsoFromInput;
    const now = new Date();
    const fallbackIsoDate = buildIsoDateFromParts(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const nextIsoDate = isoDate || relatedIsoDate || fallbackIsoDate;
    const nextDate = buildLocalDateFromIsoDate(nextIsoDate) || new Date();

    setActiveDatePicker(target);
    setAvailabilityCalendarDate(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    setCalendarPreviewIsoDate(nextIsoDate);
  };

  const closeAvailabilityCalendar = () => {
    setActiveDatePicker(null);
  };

  const moveAvailabilityCalendarMonth = (offset: number) => {
    const nextDate = new Date(
      availabilityCalendarDate.getFullYear(),
      availabilityCalendarDate.getMonth() + offset,
      1,
    );
    setAvailabilityCalendarDate(nextDate);
    setCalendarPreviewIsoDate(buildIsoDateFromParts(
      nextDate.getFullYear(),
      nextDate.getMonth(),
      1,
    ));
  };

  const selectAvailabilityCalendarDate = (day: number) => {
    if (!activeDatePicker) return;

    const isoDate = buildIsoDateFromParts(
      availabilityCalendarDate.getFullYear(),
      availabilityCalendarDate.getMonth(),
      day,
    );
    const shortDate = isoDateToShortDate(isoDate);

    if (activeDatePicker === 'inicio') {
      setFechaInicioDate(shortDate);
      if (!fechaFinIsoFromInput || fechaFinIsoFromInput < isoDate) {
        setFechaFinDate(shortDate);
      }
    } else {
      setFechaFinDate(shortDate);
      if (!fechaInicioIsoFromInput) {
        setFechaInicioDate(shortDate);
      }
    }

    setCalendarPreviewIsoDate(isoDate);
    setActiveDatePicker(null);
  };

  const previewDayAvailability = calendarPreviewIsoDate
    ? getAvailabilityForIsoDate(calendarPreviewIsoDate)
    : null;

  const renderAvailabilityCalendar = (target: DatePickerTarget) => {
    if (activeDatePicker !== target) return null;

    return (
      <div className="bo-date-picker-popover" role="dialog" aria-label="Calendario de disponibilidad">
        <div className="bo-date-picker-header">
          <button
            type="button"
            onClick={() => moveAvailabilityCalendarMonth(-1)}
            className="bo-date-picker-nav-button"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="bo-date-picker-title">
              {target === 'inicio' ? 'Fecha de inicio' : 'Fecha de fin'}
            </p>
            <p className="bo-date-picker-month">
              {formatAvailabilityMonthLabel(availabilityCalendarDate)}
            </p>
          </div>
          <div className="bo-date-picker-header-actions">
            <button
              type="button"
              onClick={() => moveAvailabilityCalendarMonth(1)}
              className="bo-date-picker-nav-button"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={closeAvailabilityCalendar}
              className="bo-date-picker-nav-button"
              aria-label="Cerrar calendario"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="bo-date-picker-weekdays" aria-hidden="true">
          {AVAILABILITY_WEEK_DAYS.map((dayName) => (
            <span key={dayName}>{dayName}</span>
          ))}
        </div>

        <div className="bo-date-picker-calendar-grid">
          {availabilityCalendarCells.map((day, index) => {
            if (day === null) {
              return <span key={`empty-${index}`} className="bo-date-picker-empty-day" />;
            }

            const isoDate = buildIsoDateFromParts(
              availabilityCalendarDate.getFullYear(),
              availabilityCalendarDate.getMonth(),
              day,
            );
            const availability = getAvailabilityForIsoDate(isoDate);
            const salonStatus = getSelectedSalonStatus(availability);
            const isSelected = selectedPickerIsoDate === isoDate;
            const isPreviewed = calendarPreviewIsoDate === isoDate;

            return (
              <button
                key={isoDate}
                type="button"
                onClick={() => selectAvailabilityCalendarDate(day)}
                onMouseEnter={() => setCalendarPreviewIsoDate(isoDate)}
                onFocus={() => setCalendarPreviewIsoDate(isoDate)}
                className={`bo-date-picker-day${isSelected ? ' is-selected' : ''}${isPreviewed ? ' is-previewed' : ''}`}
                title={getAvailabilityTitle(availability)}
              >
                <span className="bo-date-picker-day-number">{day}</span>
                <span className={`bo-date-picker-day-status ${salonStatus.className}`}>
                  {salonStatus.label}
                </span>
              </button>
            );
          })}
        </div>

        {calendarAvailabilityError ? (
          <div className="bo-date-picker-message is-error">
            {calendarAvailabilityError}
          </div>
        ) : loadingCalendarAvailability ? (
          <div className="bo-date-picker-message">Consultando disponibilidad...</div>
        ) : previewDayAvailability && calendarPreviewIsoDate ? (
          <div className="bo-date-picker-summary">
            <p className="bo-date-picker-summary-date">
              {formatLongAvailabilityDate(calendarPreviewIsoDate)}
            </p>
            {currentSalon ? (
              <>
                <p><strong>Salon:</strong> {currentSalon.nombre}</p>
                <p><strong>Estado:</strong> {getSelectedSalonStatus(previewDayAvailability).label}</p>
              </>
            ) : (
              <p>Seleccione un salon para ver su disponibilidad.</p>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setWarningDialog(null);

    const nombreClienteSanitizado = nombreCliente.trim();
    const emailClienteSanitizado = emailCliente.trim();
    const telefonoClienteSanitizado = sanitizePhoneInput(telefonoCliente);
    const cantidadPersonasSanitizada = sanitizeIntegerInput(cantidadPersonas);
    const observacionesSanitizadas = observaciones.trim();
    const fechaInicioIso = fechaInicioIsoFromInput;
    const fechaFinIso = fechaFinIsoFromInput;
    const fechaInicio = (
      fechaInicioIso && fechaInicioHora ? `${fechaInicioIso}T${fechaInicioHora}` : ''
    );
    const fechaFin = fechaFinIso && fechaFinHora ? `${fechaFinIso}T${fechaFinHora}` : '';

    // Validations
    if (
      !hasNonWhitespaceValue(nombreClienteSanitizado)
      || !hasNonWhitespaceValue(emailClienteSanitizado)
      || !telefonoClienteSanitizado
      || !idSalon
      || !fechaInicio
      || !fechaFin
      || !cantidadPersonasSanitizada
    ) {
      showWarningDialog('Por favor complete todos los campos requeridos');
      return;
    }

    if (!fechaInicioIso || !fechaFinIso) {
      showWarningDialog('Use formato de fecha dd/mm/aa en inicio y fin.');
      return;
    }

    const totalPersonas = parseInt(cantidadPersonasSanitizada, 10);
    if (!totalPersonas || totalPersonas <= 0) {
      showWarningDialog('Ingrese una cantidad de personas válida');
      return;
    }

    const selectedSalon = salones.find(s => s.id === idSalon) || null;
    const fechaInicioIsoString = new Date(fechaInicio).toISOString();
    const fechaFinIsoString = new Date(fechaFin).toISOString();

    const now = new Date();
    now.setSeconds(0, 0);

    if (new Date(fechaInicio) < now) {
      showWarningDialog('La fecha de inicio no puede ser anterior al momento actual');
      return;
    }

    if (new Date(fechaFin) <= new Date(fechaInicio)) {
      showWarningDialog('La fecha de fin debe ser posterior a la fecha de inicio');
      return;
    }

    if (reserva && !isReservaEstadoTransitionAllowed(reserva.estado, estado)) {
      showWarningDialog(RESERVA_ESTADO_TRANSITION_ERROR_MESSAGE);
      return;
    }

    try {
      setLoading(true);

      const { data: reservasSalonData, error: reservasSalonError } = await supabase
        .from('reservas')
        .select('id, id_salon, estado, fecha_inicio, fecha_fin')
        .eq('id_salon', idSalon);

      if (reservasSalonError) {
        throw reservasSalonError;
      }

      const blockingReservas = getBlockingReservas(
        {
          id: reserva?.id || 0,
          id_salon: idSalon,
          estado,
          fecha_inicio: fechaInicioIsoString,
          fecha_fin: fechaFinIsoString,
        },
        (reservasSalonData || []) as ReservaOverlapComparable[],
      );

      if (blockingReservas.length > 0) {
        const blockingReservasText = blockingReservas
          .map((item) => `#${item.id} (${item.estado})`)
          .join(', ');

        showWarningDialog(
          `El salón ya está bloqueado en ese rango por la(s) reserva(s): ${blockingReservasText}.`,
          'Horario no disponible',
        );
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const eventDaysForMonto = calculateSalonBillableDayUnits({
        startIsoDate: fechaInicioIso,
        endIsoDate: fechaFinIso,
        startTime: fechaInicioHora,
        endTime: fechaFinHora,
      });
      const salonDailyPrice = selectedSalon?.precio_base || 0;
      const monto = salonDailyPrice * eventDaysForMonto;

      const reservaData = {
        cliente_nombre: nombreClienteSanitizado,
        cliente_email: emailClienteSanitizado,
        cliente_telefono: telefonoClienteSanitizado,
        id_salon: idSalon,
        id_distribucion: idDistribucion || null,
        fecha_inicio: fechaInicioIsoString,
        fecha_fin: fechaFinIsoString,
        estado,
        monto,
        cantidad_personas: totalPersonas,
        observaciones: hasNonWhitespaceValue(observacionesSanitizadas) ? observacionesSanitizadas : null,
      };

      let error;
      let reservaId = reserva?.id;

      if (reserva) {
        const { error: updateError } = await supabase
          .from('reservas')
          .update(reservaData)
          .eq('id', reserva.id);
        error = updateError;
      } else {
        const { data: newReserva, error: insertError } = await supabase
          .from('reservas')
          .insert([{ ...reservaData, creado_por: userData.user?.id || null }])
          .select()
          .single();
        error = insertError;
        reservaId = newReserva?.id;
      }

      if (error) {
        if (error.code === '23P01' || error.message.includes('reservas_no_solape_excl')) {
          throw new Error(
            error.message?.includes('Ya existe una reserva bloqueante')
              ? error.message
              : 'Ya existe una reserva bloqueante en ese rango para el salón seleccionado. Por favor elija otro horario.',
          );
        }
        throw error;
      }

      // Guardar servicios seleccionados
      if (reservaId) {
        // Primero eliminar servicios existentes si estamos editando
        if (reserva) {
          await supabase
            .from('reserva_servicios')
            .delete()
            .eq('id_reserva', reservaId);
        }

        // Insertar servicios seleccionados
        if (selectedServicios.size > 0) {
          const serviciosToInsert = Array.from(selectedServicios.entries()).map(([id_servicio, cantidad]) => ({
            id_reserva: reservaId,
            id_servicio,
            cantidad,
          }));

          const { error: serviciosError } = await supabase
            .from('reserva_servicios')
            .insert(serviciosToInsert);

          if (serviciosError) {
            console.error('Error saving servicios:', serviciosError);
            // No lanzamos error aqui, la reserva ya fue creada
          }
        }
      }

      let presupuestoErrorMessage: string | null = null;

      if (reservaId) {
        if (!selectedSalon) {
          presupuestoErrorMessage =
            'No se encontró el salón seleccionado para generar el presupuesto.';
        } else {
          try {
            await invokeProtectedFunction('upsert-presupuesto', {
              reservaId,
              presupuestoPath: reserva?.presupuesto_url || null,
            });
          } catch (error: any) {
            presupuestoErrorMessage =
              error?.message || 'Ocurrio un error inesperado al generar el presupuesto.';
            console.error('Error generating presupuesto:', error);
          }
        }
      }

      if (presupuestoErrorMessage) {
        setInitialFormSnapshot(currentFormSnapshot);
        onDirtyChange?.(false);
        showWarningDialog(
          reserva
            ? `Reserva actualizada, pero no se pudo regenerar el presupuesto: ${presupuestoErrorMessage}`
            : `Reserva creada, pero no se pudo generar el presupuesto: ${presupuestoErrorMessage}`,
          reserva ? 'Reserva actualizada con advertencias' : 'Reserva creada con advertencias',
        );
      } else {
        setInitialFormSnapshot(currentFormSnapshot);
        onDirtyChange?.(false);
        setMessage({ text: reserva ? 'Reserva actualizada correctamente' : 'Reserva creada correctamente' });

        setTimeout(() => {
          onClose(true);
        }, 1500);
      }
    } catch (err: any) {
      console.error('Error saving reserva:', err);
      showWarningDialog(
        err.message,
        reserva ? 'No se pudo actualizar la reserva' : 'No se pudo crear la reserva',
      );
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bo-public-form-embed p-2">
      {message && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg mb-6 bg-green-50 border border-green-200"
        >
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">{message.text}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bo-card-compact bg-gray-50 p-4 rounded-lg">
          <h4 className="text-gray-900 mb-4">Datos del cliente</h4>
          <div className="bo-form-grid-3">
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Nombre <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Nombre del cliente o empresa"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={emailCliente}
                onChange={(e) => setEmailCliente(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="cliente@dominio.com"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Teléfono <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={telefonoCliente}
                onChange={(e) => setTelefonoCliente(sanitizePhoneInput(e.target.value))}
                onKeyDown={preventInvalidNumberKeys}
                inputMode="numeric"
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="5491100000000"
              />
            </div>
          </div>
        </div>
        {/* Salon, Distribucion y Capacidad */}
        <div className="bo-form-grid-3">
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Cantidad de personas <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={cantidadPersonas}
              onChange={(e) => setCantidadPersonas(sanitizeIntegerInput(e.target.value))}
              onKeyDown={preventInvalidNumberKeys}
              inputMode="numeric"
              placeholder="Ej: 120"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Salón <span className="text-red-500">*</span>
            </label>
            <select
              value={idSalon}
              onChange={(e) => setIdSalon(Number(e.target.value))}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={0}>Seleccione un salón</option>
              {!salonesRecomendadosData.hasPersonas && salonesRecomendadosData.recommended.map((salon) => (
                <option key={salon.id} value={salon.id}>
                  {formatSalonOptionLabel(salon)}
                </option>
              ))}
              {salonesRecomendadosData.hasPersonas && salonesRecomendadosData.recommended.length > 0 && (
                <optgroup label="Recomendados">
                  {salonesRecomendadosData.recommended.map((salon) => (
                    <option key={salon.id} value={salon.id}>
                      {formatSalonOptionLabel(salon)}
                    </option>
                  ))}
                </optgroup>
              )}
              {salonesRecomendadosData.hasPersonas && salonesRecomendadosData.others.length > 0 && (
                <optgroup label="Otros">
                  {salonesRecomendadosData.others.map((salon) => (
                    <option key={salon.id} value={salon.id}>
                      {formatSalonOptionLabel(salon)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {salonesRecomendadosData.hasPersonas && salonesRecomendadosData.suggested && (
              <p className="text-xs text-blue-700 mt-1">
                Recomendado para {totalPersonasNumber} personas: {salonesRecomendadosData.suggested.nombre}
                {' '}({salonesRecomendadosData.suggested.capacidad} personas)
              </p>
            )}
            {salonesRecomendadosData.hasPersonas && !salonesRecomendadosData.suggested && (
              <p className="text-xs text-amber-700 mt-1">
                No hay salones con capacidad para {totalPersonasNumber} personas. Se muestran opciones alternativas.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Distribución
            </label>
            <select
              value={idDistribucion}
              onChange={(e) => setIdDistribucion(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!idSalon || distribuciones.length === 0}
            >
              <option value={0}>Sin distribución específica</option>
              {distribuciones.map(dist => (
                <option key={dist.id} value={dist.id}>
                  {dist.nombre} - Cap: {dist.capacidad} personas
                </option>

              ))}
            </select>
            {idSalon && distribuciones.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Este salón no tiene distribuciones configuradas
              </p>
            )}
          </div>

          
        </div>

        {hasCapacityWarning && (
          <div
            className="flex items-start gap-2 p-3 rounded-lg"
            style={{
              border: `1px solid ${CAPACITY_WARNING_STYLES.borderColor}`,
              backgroundColor: CAPACITY_WARNING_STYLES.backgroundColor,
            }}
          >
            <AlertCircle
              className="w-5 h-5 flex-shrink-0"
              style={{ color: CAPACITY_WARNING_STYLES.textColor }}
            />
            <p className="text-sm" style={{ color: CAPACITY_WARNING_STYLES.textColor }}>
              {capacityWarningText}
            </p>
          </div>
        )}

        {/* Fecha y Hora */}
        <div className="bo-form-grid-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="block text-sm text-gray-700 mb-2">
              Inicio <span className="text-red-500">*</span>
            </label>
            <div className="bo-date-time-grid">
              <div className="bo-date-picker-field">
                <label className="block text-xs text-gray-600 mb-1">Fecha</label>
                <button
                  type="button"
                  onClick={() => openAvailabilityCalendar('inicio')}
                  className={`${DATE_TIME_FIELD_CLASS} bo-date-picker-trigger`}
                  aria-expanded={activeDatePicker === 'inicio'}
                >
                  <span className={fechaInicioDate ? 'text-gray-900' : 'text-gray-500'}>
                    {fechaInicioDate || 'Seleccionar fecha'}
                  </span>
                  <CalendarDays className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Horario</label>
                <select
                  value={fechaInicioHora}
                  onChange={(e) => setFechaInicioHora(e.target.value)}
                  required
                  className={DATE_TIME_FIELD_CLASS}
                >
                  <option value="">Seleccionar horario</option>
                  {HORARIO_OPCIONES.map((horario) => (
                    <option key={`inicio-${horario}`} value={horario}>
                      {horario}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="block text-sm text-gray-700 mb-2">
              Fin <span className="text-red-500">*</span>
            </label>
            <div className="bo-date-time-grid">
              <div className="bo-date-picker-field">
                <label className="block text-xs text-gray-600 mb-1">Fecha</label>
                <button
                  type="button"
                  onClick={() => openAvailabilityCalendar('fin')}
                  className={`${DATE_TIME_FIELD_CLASS} bo-date-picker-trigger`}
                  aria-expanded={activeDatePicker === 'fin'}
                >
                  <span className={fechaFinDate ? 'text-gray-900' : 'text-gray-500'}>
                    {fechaFinDate || 'Seleccionar fecha'}
                  </span>
                  <CalendarDays className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Horario</label>
                <select
                  value={fechaFinHora}
                  onChange={(e) => setFechaFinHora(e.target.value)}
                  required
                  className={DATE_TIME_FIELD_CLASS}
                >
                  <option value="">Seleccionar horario</option>
                  {HORARIO_OPCIONES.map((horario) => (
                    <option key={`fin-${horario}`} value={horario}>
                      {horario}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {activeDatePicker && renderAvailabilityCalendar(activeDatePicker)}

        {/* Estado (solo editable cuando se está editando una reserva) */}
        {reserva && (
          <div className="bo-form-grid-2">
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Estado
              </label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value as Reserva['estado'])}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {allowedEstadoTransitions.map((optionEstado) => (
                  <option key={optionEstado} value={optionEstado}>
                    {optionEstado}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Precio Info */}
        {idSalon > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Monto de la reserva:</strong> ${currentReservaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              <span className="text-xs block mt-1">
                ({currentSalonDailyPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })} por día x {formatBillableDayUnits(eventBillableDayUnits)} días facturables)
              </span>
              {billingAdjustments.length > 0 && (
                <span className="text-xs block mt-1">
                  Aplicando {billingAdjustments.join(' y ')}
                  {eventCalendarDaysCount > 2 ? '. Los días entre el inicial y el final se cobran al 100%.' : '.'}
                </span>
              )}
            </p>
          </div>
        )}

        {/* Servicios Adicionales */}
        <div className="bo-card-compact bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-green-600" />
            <h4 className="text-gray-900">Servicios Adicionales</h4>
          </div>

          {categoriasConServicios.length === 0 ? (
            <p className="text-sm text-gray-500">No hay servicios disponibles</p>
          ) : (
            <div className="bo-reserva-services-list">
              {categoriasConServicios.map(({ categoria, servicios: serviciosCategoria }) => {
                const isOpen = expandedServicioCategorias.has(categoria.id);
                const selectedCount = serviciosCategoria.reduce(
                  (count, servicio) => count + (selectedServicios.has(servicio.id) ? 1 : 0),
                  0,
                );

                return (
                  <div
                    key={categoria.id}
                    className={`bo-reserva-service-category${isOpen ? ' is-open' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleServicioCategoria(categoria.id)}
                      className="bo-reserva-service-category-toggle"
                      aria-expanded={isOpen}
                    >
                      <div className="bo-reserva-service-category-text">
                        <span className="bo-reserva-service-category-title">{categoria.nombre}</span>
                        {categoria.descripcion && (
                          <span className="bo-reserva-service-category-description">
                            {categoria.descripcion}
                          </span>
                        )}
                      </div>
                      <span className="bo-reserva-service-category-meta">
                        {selectedCount > 0 && (
                          <span className="bo-reserva-service-category-selected">
                            {selectedCount} sel.
                          </span>
                        )}
                        <span className="bo-reserva-service-category-count">
                          {serviciosCategoria.length}
                        </span>
                        <ChevronRight className="bo-reserva-service-category-icon" />
                      </span>
                    </button>

                    {isOpen && (
                      <div className="bo-reserva-service-category-content">
                        {serviciosCategoria.map(servicio => {
                          const isSelected = selectedServicios.has(servicio.id);
                          const cantidad = selectedServicios.get(servicio.id) || 1;

                          return (
                            <div
                              key={servicio.id}
                              className={`bo-reserva-service-item${isSelected ? ' is-selected' : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleServicio(servicio.id)}
                                className="bo-reserva-service-checkbox"
                              />
                              <div className="bo-reserva-service-text">
                                <p className="bo-reserva-service-name">{servicio.nombre}</p>
                                {servicio.descripcion && (
                                  <RichTextDescription
                                    value={servicio.descripcion}
                                    className="bo-reserva-service-description"
                                  />
                                )}
                              </div>
                              <div className="bo-reserva-service-controls">
                                <p className="bo-reserva-service-price">
                                  ${servicio.precio.toLocaleString('es-AR')}
                                </p>
                                {isSelected && (
                                  <div className="bo-reserva-service-quantity">
                                    <label className="text-xs text-gray-700">Cantidad:</label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={cantidad}
                                      onChange={(e) => updateCantidadServicio(servicio.id, parseInt(sanitizeIntegerInput(e.target.value), 10) || 1)}
                                      onKeyDown={preventInvalidNumberKeys}
                                      inputMode="numeric"
                                      className="bo-reserva-service-quantity-input"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {selectedServicios.size > 0 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
              <p className="text-sm text-green-800">
                <strong>{selectedServicios.size}</strong> servicio(s) seleccionado(s)
              </p>
            </div>
          )}
        </div>

        {/* Observaciones */}
        <div>
          <label className="block text-sm text-gray-700 mb-2">
            Observaciones
          </label>
          <textarea
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            placeholder="Detalles adicionales de la reserva..."
          ></textarea>
        </div>

        {/* Actions */}
        <div className="bo-form-actions pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={() => onClose()}
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Guardando...' : reserva ? 'Actualizar' : 'Crear Reserva'}
          </button>
        </div>
      </form>

      <InfoDialog
        open={warningDialog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setWarningDialog(null);
          }
        }}
        title={warningDialog?.title || 'Advertencia'}
        description={warningDialog?.description || ''}
        actionText="Cerrar"
      />
    </div>
  );
}

