import { useEffect, useState } from 'react';
import { AlertCircle, BarChart3, Building2, CheckCircle2, ReceiptText, Wallet } from 'lucide-react';
import { Perfil, Reserva, supabase } from '../utils/supabase/client';

type DashboardProps = {
  perfil: Perfil;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(value);

const buildDayKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isReservaCerrada = (estado: Reserva['estado']) => estado === 'Confirmado' || estado === 'Pagado';

export function Dashboard({ perfil: _perfil }: DashboardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [totalSolicitudes, setTotalSolicitudes] = useState(0);
  const [totalConfirmadas, setTotalConfirmadas] = useState(0);
  const [porcentajeConfirmacion, setPorcentajeConfirmacion] = useState(0);
  const [capitalObtenido, setCapitalObtenido] = useState(0);
  const [ticketPromedioPagado, setTicketPromedioPagado] = useState(0);
  const [porcentajeOcupacionMensual, setPorcentajeOcupacionMensual] = useState(0);
  const [salonesOcupadosMensual, setSalonesOcupadosMensual] = useState(0);
  const [totalSalonesMensual, setTotalSalonesMensual] = useState(0);
  const [porcentajeFacturacionMensual, setPorcentajeFacturacionMensual] = useState(0);
  const [facturacionMensualActual, setFacturacionMensualActual] = useState(0);
  const [facturacionMensualPotencial, setFacturacionMensualPotencial] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');

        const currentDate = new Date();
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

        const [
          { data: salonesData, error: salonesError },
          { data: reservasMensualesData, error: reservasMensualesError },
        ] = await Promise.all([
          supabase
            .from('salones')
            .select('*')
            .or('activo.is.null,activo.eq.true')
            .order('nombre'),
          supabase
            .from('reservas')
            .select('id_salon, estado, monto, fecha_inicio, fecha_fin')
            .lte('fecha_inicio', endOfMonth)
            .gte('fecha_fin', startOfMonth),
        ]);

        if (salonesError) throw salonesError;
        if (reservasMensualesError) throw reservasMensualesError;

        const salonesActivos = (salonesData || []).filter((salon) => salon.activo !== false);
        const reservasMensuales = (reservasMensualesData || []) as Array<Pick<Reserva, 'id_salon' | 'estado' | 'monto' | 'fecha_inicio' | 'fecha_fin'>>;
        const reservasMensualesCerradas = reservasMensuales.filter((reservaMensual) => isReservaCerrada(reservaMensual.estado));

        const monthStartDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEndDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const daysInCurrentMonth = monthEndDate.getDate();
        const ocupacionPorSalon = new Map<number, Set<string>>();

        salonesActivos.forEach((salon) => {
          ocupacionPorSalon.set(Number(salon.id), new Set<string>());
        });

        reservasMensualesCerradas.forEach((reservaMensual) => {
          const salonId = Number(reservaMensual.id_salon);
          if (!Number.isFinite(salonId) || !ocupacionPorSalon.has(salonId)) return;

          const inicioReserva = new Date(reservaMensual.fecha_inicio);
          const finReserva = new Date(reservaMensual.fecha_fin);
          if (Number.isNaN(inicioReserva.getTime()) || Number.isNaN(finReserva.getTime())) return;

          const inicioReservaDia = new Date(inicioReserva.getFullYear(), inicioReserva.getMonth(), inicioReserva.getDate());
          const finReservaDia = new Date(finReserva.getFullYear(), finReserva.getMonth(), finReserva.getDate());
          const inicioEfectivo = inicioReservaDia > monthStartDate ? inicioReservaDia : monthStartDate;
          const finEfectivo = finReservaDia < monthEndDate ? finReservaDia : monthEndDate;
          if (inicioEfectivo > finEfectivo) return;

          const diasOcupadosSalon = ocupacionPorSalon.get(salonId);
          if (!diasOcupadosSalon) return;

          const cursor = new Date(inicioEfectivo);
          while (cursor <= finEfectivo) {
            diasOcupadosSalon.add(buildDayKey(cursor));
            cursor.setDate(cursor.getDate() + 1);
          }
        });

        const totalSalonesCalc = salonesActivos.length;
        const diasOcupadosCalc = Array.from(ocupacionPorSalon.values()).reduce(
          (acc, diasOcupadosSalon) => acc + diasOcupadosSalon.size,
          0,
        );
        const baseTotalOcupacionCalc = totalSalonesCalc * daysInCurrentMonth;
        const porcentajeOcupacionCalc = baseTotalOcupacionCalc > 0
          ? (diasOcupadosCalc / baseTotalOcupacionCalc) * 100
          : 0;

        const facturacionMensualActualCalc = reservasMensualesCerradas.reduce(
          (acc, reservaMensual) => acc + Number(reservaMensual.monto || 0),
          0,
        );
        const precioDiarioTotalSalonesCalc = salonesActivos.reduce(
          (acc, salon) => acc + Number(salon.precio_base || 0),
          0,
        );
        const facturacionMensualPotencialCalc = precioDiarioTotalSalonesCalc * daysInCurrentMonth;
        const porcentajeFacturacionMensualCalc = facturacionMensualPotencialCalc > 0
          ? (facturacionMensualActualCalc / facturacionMensualPotencialCalc) * 100
          : 0;

        const totalSolicitudesCalc = reservasMensuales.length;
        const totalConfirmadasCalc = reservasMensuales.filter((reservaMetrica) => isReservaCerrada(reservaMetrica.estado)).length;
        const porcentajeConfirmacionCalc = totalSolicitudesCalc > 0
          ? (totalConfirmadasCalc / totalSolicitudesCalc) * 100
          : 0;
        const reservasConCapital = reservasMensuales.filter((reservaMetrica) => isReservaCerrada(reservaMetrica.estado));
        const capitalObtenidoCalc = reservasConCapital.reduce(
          (acc, reservaMetrica) => acc + Number(reservaMetrica.monto || 0),
          0,
        );
        const ticketPromedioCalc = reservasConCapital.length > 0
          ? capitalObtenidoCalc / reservasConCapital.length
          : 0;

        setTotalSolicitudes(totalSolicitudesCalc);
        setTotalConfirmadas(totalConfirmadasCalc);
        setPorcentajeConfirmacion(porcentajeConfirmacionCalc);
        setCapitalObtenido(capitalObtenidoCalc);
        setTicketPromedioPagado(ticketPromedioCalc);
        setPorcentajeOcupacionMensual(porcentajeOcupacionCalc);
        setSalonesOcupadosMensual(diasOcupadosCalc);
        setTotalSalonesMensual(baseTotalOcupacionCalc);
        setPorcentajeFacturacionMensual(porcentajeFacturacionMensualCalc);
        setFacturacionMensualActual(facturacionMensualActualCalc);
        setFacturacionMensualPotencial(facturacionMensualPotencialCalc);
      } catch (err: any) {
        console.error('Error loading dashboard:', err);
        setError(err?.message || 'No se pudo cargar el dashboard.');
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  if (loading) {
    return (
      <div className="bo-page">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="bo-kpi-grid gap-6">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="h-32 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bo-page">
      <div className="bo-page-header mb-6">
        <div>
          <h2 className="text-gray-900">Dashboard</h2>
          <p className="text-sm text-gray-600 mt-1">Resumen del mes actual</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-6">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div className="bo-kpi-grid gap-6">
        <div className="bo-kpi-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Reservas Confirmadas / Solicitadas (Mes)</p>
          <p className="text-3xl text-gray-900">{totalConfirmadas} / {totalSolicitudes}</p>
          <p className="text-sm text-blue-700 mt-1">{porcentajeConfirmacion.toFixed(1)}% de conversion</p>
        </div>

        <div className="bo-kpi-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Capital Obtenido (Mes)</p>
          <p className="text-3xl text-gray-900">{formatCurrency(capitalObtenido)}</p>
        </div>

        <div className="bo-kpi-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <ReceiptText className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Ticket Promedio (Mes)</p>
          <p className="text-3xl text-gray-900">{formatCurrency(ticketPromedioPagado)}</p>
        </div>

        <div className="bo-kpi-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Ocupacion Mensual de Salones</p>
          <p className="text-3xl text-gray-900">{porcentajeOcupacionMensual.toFixed(1)}%</p>
          <p className="text-sm text-amber-700 mt-1">
            {salonesOcupadosMensual} / {totalSalonesMensual} dias de todos los salones ocupados
          </p>
        </div>

        <div className="bo-kpi-card bo-card-compact bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-cyan-600" />
            </div>
          </div>
          <p className="text-gray-600 text-sm mb-1">Facturacion Mensual vs Potencial</p>
          <p className="text-3xl text-gray-900">{porcentajeFacturacionMensual.toFixed(1)}%</p>
          <p className="text-sm text-cyan-700 mt-1">
            {formatCurrency(facturacionMensualActual)} / {formatCurrency(facturacionMensualPotencial)}
          </p>
        </div>
      </div>
    </div>
  );
}
