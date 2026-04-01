import { Fragment, useState, useEffect, useRef } from 'react';
import { Perfil, supabase, Reserva } from '../utils/supabase/client';
import { projectId } from '../utils/supabase/info';
import { Plus, Search, Edit, AlertCircle, CheckCircle, FileText, X, AlertTriangle, Loader2, Trash2, ChevronUp, ChevronDown, Send } from 'lucide-react';
import { ReservaForm } from './ReservaForm';
import { ConfirmDialog } from './ConfirmDialog';
import { InfoDialog } from './InfoDialog';
import { getReservaCapacityWarningText } from '../utils/reservaCapacity';
import { deleteReservaWithPresupuesto } from '../utils/reservaDeletion';
import {
  getReservaPendingConflictIds,
  getReservaPendingConflictText,
  ReservaPendingConflictComparable,
} from '../utils/reservaPendingConflict';
import {
  getReservaExpirationWarningText,
  getReservaStartWarningText,
} from '../utils/reservaExpiration';

type ReservasProps = {
  perfil: Perfil;
  onUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
  highlightRequest?: {
    reservaId: number;
    nonce: number;
  } | null;
};

type SortKey = 'id' | 'cliente' | 'salon' | 'fechaInicio' | 'fechaFin' | 'estado' | 'monto';
type SortDirection = 'asc' | 'desc';

const ESTADO_COLORS = {
  Pendiente: '#F7C948',
  Confirmado: '#4C7AF2',
  Pagado: '#35B679',
  Cancelado: '#B0B7C3',
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
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<string | null>(null);
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
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [reservasPendientes, setReservasPendientes] = useState<ReservaPendingConflictComparable[]>([]);
  const [warningDialog, setWarningDialog] = useState<{ title: string; description: string } | null>(null);
  const [highlightedReservaId, setHighlightedReservaId] = useState<number | null>(null);
  const [pendingHighlight, setPendingHighlight] = useState<{ reservaId: number; nonce: number } | null>(null);
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
          distribucion:distribuciones(*)
        `)
        .order('fecha_inicio', { ascending: false });

      if (filterEstado) {
        query = query.eq('estado', filterEstado);
      }

      const [{ data, error: queryError }, { data: pendientesData, error: pendientesError }] = await Promise.all([
        query,
        supabase
          .from('reservas')
          .select('id, id_salon, estado, fecha_inicio, fecha_fin')
          .eq('estado', 'Pendiente'),
      ]);

      if (queryError) throw queryError;
      if (pendientesError) throw pendientesError;
      setReservas(data || []);
      setReservasPendientes((pendientesData || []) as ReservaPendingConflictComparable[]);
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
      loadReservas();
    }
  };

  const showTemporaryMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 3000);
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
      const { data, error: signedUrlError } = await supabase.storage
        .from('presupuestos')
        .createSignedUrl(reserva.presupuesto_url, 60);

      if (signedUrlError) throw signedUrlError;
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener');
      } else {
        throw new Error('Signed URL not available from storage client');
      }
    } catch (err: any) {
      try {
        const payload = await invokeProtectedFunction('get-presupuesto-url', {
          reservaId: reserva.id,
          presupuestoPath: reserva.presupuesto_url,
        });

        if (!payload?.signedUrl) {
          throw new Error('No se pudo obtener la URL del presupuesto.');
        }

        window.open(payload.signedUrl, '_blank', 'noopener');
        return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('No hay sesión activa para solicitar la URL del presupuesto.');
        }

        const endpoints = [
          `https://${projectId}.supabase.co/functions/v1/server/get-presupuesto-url`,
          `https://${projectId}.supabase.co/functions/v1/get-presupuesto-url`,
          `https://${projectId}.supabase.co/functions/v1/server/make-server-484a241a/get-presupuesto-url`,
          `https://${projectId}.supabase.co/functions/v1/make-server-484a241a/get-presupuesto-url`,
        ];

        let signedUrl: string | null = null;
        let lastError = 'No se pudo obtener la URL del presupuesto.';

        for (const endpoint of endpoints) {
          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                reservaId: reserva.id,
                presupuestoPath: reserva.presupuesto_url,
              }),
            });

            const text = await response.text();
            let payload: any = {};
            try {
              payload = text ? JSON.parse(text) : {};
            } catch {
              payload = { error: text };
            }

            if (response.ok && payload?.signedUrl) {
              signedUrl = payload.signedUrl;
              break;
            }

            lastError = payload?.error || `HTTP ${response.status} en ${endpoint}`;
          } catch (fetchError: any) {
            lastError = fetchError?.message || String(fetchError);
          }
        }

        if (!signedUrl) {
          throw new Error(lastError);
        }

        window.open(signedUrl, '_blank', 'noopener');
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
      setMessage({ type: 'success', text: 'Reserva eliminada correctamente' });
      setTimeout(() => setMessage(null), 3000);
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const filteredReservas = reservas.filter(r => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.cliente_nombre || '').toLowerCase().includes(term) ||
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
      case 'salon':
        return reserva.salon?.nombre || '';
      case 'fechaInicio':
        return new Date(reserva.fecha_inicio).getTime() || 0;
      case 'fechaFin':
        return new Date(reserva.fecha_fin).getTime() || 0;
      case 'estado':
        return reserva.estado || '';
      case 'monto':
        return Number(reserva.monto) || 0;
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

  const defaultDirectionByColumn = (column: SortKey): SortDirection => (
    column === 'id'
      || column === 'fechaInicio'
      || column === 'fechaFin'
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
      return null;
    }

    return sortDirection === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" />
      : <ChevronDown className="w-3.5 h-3.5 text-blue-600" />;
  };

  const handleOpenWarningDialog = (reserva: Reserva, warningMessages: string[]) => {
    if (warningMessages.length === 0) return;

    setWarningDialog({
      title: `Advertencias de la reserva #${reserva.id}`,
      description: warningMessages.map((message) => `- ${message}`).join('\n'),
    });
  };

  useEffect(() => {
    if (!pendingHighlight || loading) return;

    const targetId = Number(pendingHighlight.reservaId);
    if (!Number.isFinite(targetId)) {
      setPendingHighlight(null);
      return;
    }

    const targetExists = sortedReservas.some((item) => Number(item.id) === targetId);
    if (!targetExists) return;

    setHighlightedReservaId(targetId);
    setPendingHighlight(null);

    window.setTimeout(() => {
      const row = document.getElementById(`reserva-row-${targetId}`);
      row?.scrollIntoView({ behavior: 'auto', block: 'center' });
    }, 0);

    if (highlightTimeoutRef.current) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedReservaId(null);
    }, 1000);
  }, [pendingHighlight, sortedReservas, loading]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-gray-900">Gestion de Reservas</h2>
        <button
          onClick={handleCreateNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nueva Reserva
        </button>
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

      {showDialog && !editingReserva && (
        <div className="sticky top-0 z-20 mb-6 bg-white rounded-lg shadow border border-gray-200">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Nueva Reserva</h3>
            <button
              onClick={() => handleDialogClose()}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title="Cerrar"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6">
            <ReservaForm
              reserva={editingReserva}
              onClose={handleDialogClose}
              onDirtyChange={setIsReservaFormDirty}
            />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por cliente, salón, estado o ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <select
          value={filterEstado || ''}
          onChange={(e) => setFilterEstado(e.target.value || null)}
          className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Confirmado">Confirmado</option>
          <option value="Pagado">Pagado</option>
          <option value="Cancelado">Cancelado</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
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
                    onClick={() => handleSort('salon')}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    Salon
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
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  <button
                    type="button"
                    onClick={() => handleSort('monto')}
                    className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
                  >
                    Monto
                    {renderSortIcon('monto')}
                  </button>
                </th>
                <th className="px-6 py-3 text-right text-xs text-gray-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    Cargando reservas...
                  </td>
                </tr>
              ) : filteredReservas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    No se encontraron reservas
                  </td>
                </tr>
              ) : (
                sortedReservas.map(reserva => {
                  const reservaRowId = Number(reserva.id);
                  const capacityWarningText = getReservaCapacityWarningText(reserva);
                  const pendingConflictIds = getReservaPendingConflictIds(reserva, reservasPendientes);
                  const pendingConflictText = getReservaPendingConflictText(pendingConflictIds);
                  const expirationWarningText = getReservaExpirationWarningText(reserva);
                  const startWarningText = getReservaStartWarningText(reserva);
                  const warningMessages = [capacityWarningText, pendingConflictText, expirationWarningText, startWarningText].filter(
                    (message): message is string => Boolean(message),
                  );
                  const warningText = warningMessages.join(' ');
                  const hasWarning = warningMessages.length > 0;
                  const isEditingCurrentRow = showDialog && editingReserva?.id === reserva.id;
                  const isHighlightedRow = Number.isFinite(reservaRowId) && highlightedReservaId === reservaRowId;
                  const clienteEmail = reserva.cliente_email?.trim() || '';
                  const canSendPresupuestoEmail = Boolean(reserva.presupuesto_url && clienteEmail);
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
                          isHighlightedRow ? 'bg-yellow-200 hover:bg-yellow-200' : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className="px-6 py-4 text-sm text-gray-900">#{reserva.id}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {reserva.cliente_nombre || 'Sin nombre'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">{reserva.salon?.nombre}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{formatDate(reserva.fecha_inicio)}</td>
                        <td className="px-6 py-4 text-sm text-gray-900">{formatDate(reserva.fecha_fin)}</td>
                        <td className="px-6 py-4">
                          <span
                            className="inline-block px-3 py-1 rounded-full text-xs text-white"
                            style={{ backgroundColor: ESTADO_COLORS[reserva.estado] }}
                          >
                            {reserva.estado}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          ${Number(reserva.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
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
                                    <Send className={ACTION_ICON_BASE} />
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
                        </td>
                      </tr>
                      {isEditingCurrentRow && (
                        <tr className="bg-gray-50/70">
                          <td colSpan={8} className="px-6 py-5">
                            <div className="rounded-lg bg-white">
                              <div className="flex items-center justify-between px-5 py-3">
                                <h3 className="text-base font-semibold text-gray-900">Editar Reserva #{reserva.id}</h3>
                                <button
                                  onClick={() => handleDialogClose()}
                                  className="text-gray-500 hover:text-gray-700 transition-colors"
                                  title="Cerrar"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                              </div>
                              <div className="p-5">
                                <ReservaForm
                                  reserva={editingReserva}
                                  onClose={handleDialogClose}
                                  onDirtyChange={setIsReservaFormDirty}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 text-sm text-gray-600">
        Mostrando {filteredReservas.length} de {reservas.length} reservas
      </div>

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
        description={warningDialog?.description || ''}
        actionText="Cerrar"
      />
    </div>
  );
}

