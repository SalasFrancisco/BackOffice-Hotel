import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase, Reserva, Salon, Distribucion, CategoriaServicio, Servicio } from '../utils/supabase/client';
import { AlertCircle, CalendarDays, CheckCircle, Package } from 'lucide-react';
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
  getAllowedReservaEstadoTransitions,
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

const formatShortDateInput = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 6)}`;
};

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

const HOTEL_TIME_ZONE = 'America/Argentina/Cordoba';

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
    throw new Error('No se pudo obtener la sesion actual.');
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
  const [message, setMessage] = useState<{ text: string } | null>(null);
  const [warningDialog, setWarningDialog] = useState<{ title: string; description: string } | null>(null);
  
  // Selected services: Map<servicioId, cantidad>
  const [selectedServicios, setSelectedServicios] = useState<Map<number, number>>(new Map());

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
  const [estado, setEstado] = useState<Reserva['estado']>(reserva?.estado || 'Pendiente');
  const fechaInicioPickerRef = useRef<HTMLInputElement | null>(null);
  const fechaFinPickerRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setEstado(reserva?.estado || 'Pendiente');
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
  const eventDaysCount = getEventDaysCount(fechaInicioIsoFromInput, fechaFinIsoFromInput);

  const currentSalon = salones.find(s => s.id === idSalon) || null;
  const currentSalonDailyPrice = currentSalon?.precio_base || 0;
  const currentReservaTotal = currentSalonDailyPrice * eventDaysCount;
  const currentDistribucion = idDistribucion
    ? distribuciones.find(d => d.id === idDistribucion) || null
    : null;
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
    : ['Pendiente'];

  useEffect(() => {
    loadInitialData();
  }, []);

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
        .order('nombre');

      if (salonesError) throw salonesError;
      setSalones(salonesData || []);

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
        .order('nombre');

      if (serviciosError) throw serviciosError;
      setServicios(serviciosData || []);

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
            map.set(rs.id_servicio, rs.cantidad);
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

  const selectTodosCategoria = (categoriaId: number) => {
    const serviciosCategoria = servicios.filter(s => s.id_categoria === categoriaId);
    setSelectedServicios((prev) => {
      const newMap = new Map(prev);
      const todosSeleccionados = serviciosCategoria.every((servicio) => newMap.has(servicio.id));

      if (todosSeleccionados) {
        serviciosCategoria.forEach((servicio) => {
          newMap.delete(servicio.id);
        });
      } else {
        serviciosCategoria.forEach((servicio) => {
          if (!newMap.has(servicio.id)) {
            newMap.set(servicio.id, 1);
          }
        });
      }

      return newMap;
    });
  };

  const getServiciosByCategoria = (categoriaId: number) => {
    return servicios.filter(s => s.id_categoria === categoriaId);
  };

  const openNativeDatePicker = (pickerRef: { current: HTMLInputElement | null }) => {
    const picker = pickerRef.current;
    if (!picker) return;

    if (typeof picker.showPicker === 'function') {
      picker.showPicker();
      return;
    }

    picker.click();
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
      showWarningDialog('Ingrese una cantidad de personas valida');
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
      showWarningDialog(
        'Transición no permitida. Pendiente solo puede pasar a Confirmado o Cancelado; para pasar a Pagado debe estar Confirmado y Pagado no puede volver a estados anteriores.',
      );
      return;
    }

    try {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      const eventDaysForMonto = getEventDaysCount(fechaInicioIso, fechaFinIso);
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
        creado_por: userData.user?.id,
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
          .insert([reservaData])
          .select()
          .single();
        error = insertError;
        reservaId = newReserva?.id;
      }

      if (error) {
        if (error.code === '23P01' || error.message.includes('reservas_no_solape_excl')) {
          throw new Error('Ya existe una reserva en ese rango de fechas para el salón seleccionado. Por favor elija otro horario.');
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
    <div className="p-2">
      {message && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg mb-6 bg-green-50 border border-green-200"
        >
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="text-sm text-green-800">{message.text}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="text-gray-900 mb-4">Datos del cliente</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                Telefono <span className="text-red-500">*</span>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="block text-sm text-gray-700 mb-2">
              Inicio <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Fecha</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={fechaInicioDate}
                    onChange={(e) => setFechaInicioDate(formatShortDateInput(e.target.value))}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="dd/mm/aa"
                    required
                    className={`${DATE_TIME_FIELD_CLASS} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => openNativeDatePicker(fechaInicioPickerRef)}
                    className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    title="Seleccionar fecha"
                    aria-label="Seleccionar fecha de inicio"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </button>
                  <input
                    ref={fechaInicioPickerRef}
                    type="date"
                    value={fechaInicioIsoFromInput || ''}
                    onChange={(e) => setFechaInicioDate(isoDateToShortDate(e.target.value))}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Fecha</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={fechaFinDate}
                    onChange={(e) => setFechaFinDate(formatShortDateInput(e.target.value))}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="dd/mm/aa"
                    required
                    className={`${DATE_TIME_FIELD_CLASS} flex-1`}
                  />
                  <button
                    type="button"
                    onClick={() => openNativeDatePicker(fechaFinPickerRef)}
                    className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    title="Seleccionar fecha"
                    aria-label="Seleccionar fecha de fin"
                  >
                    <CalendarDays className="h-4 w-4" />
                  </button>
                  <input
                    ref={fechaFinPickerRef}
                    type="date"
                    value={fechaFinIsoFromInput || ''}
                    onChange={(e) => setFechaFinDate(isoDateToShortDate(e.target.value))}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </div>
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

        {/* Estado (solo editable cuando se está editando una reserva) */}
        {reserva && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                ({currentSalonDailyPrice.toLocaleString('es-AR', { minimumFractionDigits: 2 })} por dia x {eventDaysCount} {eventDaysCount === 1 ? 'dia' : 'dias'})
              </span>
            </p>
          </div>
        )}

        {/* Servicios Adicionales */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-5 h-5 text-green-600" />
            <h4 className="text-gray-900">Servicios Adicionales</h4>
          </div>

          {categorias.length === 0 ? (
            <p className="text-sm text-gray-500">No hay servicios disponibles</p>
          ) : (
            <div className="space-y-4">
              {categorias.map(categoria => {
                const serviciosCategoria = getServiciosByCategoria(categoria.id);
                if (serviciosCategoria.length === 0) return null;

                const todosSeleccionados = serviciosCategoria.every(s => selectedServicios.has(s.id));

                return (
                  <div key={categoria.id} className="border border-gray-200 rounded-lg p-3 bg-white">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h5 className="text-gray-900 text-sm">{categoria.nombre}</h5>
                        {categoria.descripcion && (
                          <p className="text-xs text-gray-600">{categoria.descripcion}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => selectTodosCategoria(categoria.id)}
                        className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                      >
                        {todosSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {serviciosCategoria.map(servicio => {
                        const isSelected = selectedServicios.has(servicio.id);
                        const cantidad = selectedServicios.get(servicio.id) || 1;

                        return (
                          <div
                            key={servicio.id}
                            className={`border rounded p-2 transition-all ${
                              isSelected
                                ? 'border-green-400 bg-green-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleServicio(servicio.id)}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm text-gray-900 truncate">{servicio.nombre}</p>
                                  <p className="text-sm text-green-600 flex-shrink-0">
                                    ${servicio.precio.toLocaleString('es-AR')}
                                  </p>
                                </div>
                                {servicio.descripcion && (
                                  <RichTextDescription
                                    value={servicio.descripcion}
                                    className="text-xs text-gray-600 mt-1 leading-relaxed"
                                  />
                                )}
                                {isSelected && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <label className="text-xs text-gray-700">Cantidad:</label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={cantidad}
                                      onChange={(e) => updateCantidadServicio(servicio.id, parseInt(sanitizeIntegerInput(e.target.value), 10) || 1)}
                                      onKeyDown={preventInvalidNumberKeys}
                                      inputMode="numeric"
                                      className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-green-500 focus:border-transparent"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
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
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
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

