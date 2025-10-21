import { useState, useEffect } from 'react';
import { supabase, Reserva, Salon, Distribucion, CategoriaServicio, Servicio } from '../utils/supabase/client';
import { AlertCircle, CheckCircle, Package } from 'lucide-react';

type ReservaFormProps = {
  reserva?: Reserva | null;
  onClose: (success?: boolean) => void;
};

export function ReservaForm({ reserva, onClose }: ReservaFormProps) {
  const [salones, setSalones] = useState<Salon[]>([]);
  const [distribuciones, setDistribuciones] = useState<Distribucion[]>([]);
  const [categorias, setCategorias] = useState<CategoriaServicio[]>([]);
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Selected services: Map<servicioId, cantidad>
  const [selectedServicios, setSelectedServicios] = useState<Map<number, number>>(new Map());

  // Form fields
  const [nombreCliente, setNombreCliente] = useState('');
  const [emailCliente, setEmailCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [idSalon, setIdSalon] = useState(reserva?.id_salon || 0);
  const [idDistribucion, setIdDistribucion] = useState(reserva?.id_distribucion || 0);
  const [fechaInicio, setFechaInicio] = useState(
    reserva ? new Date(reserva.fecha_inicio).toISOString().slice(0, 16) : ''
  );
  const [fechaFin, setFechaFin] = useState(
    reserva ? new Date(reserva.fecha_fin).toISOString().slice(0, 16) : ''
  );
  const [estado, setEstado] = useState<Reserva['estado']>(reserva?.estado || 'Pendiente');
  const [observaciones, setObservaciones] = useState(reserva?.observaciones || '');

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

      // Si estamos editando, cargar datos del cliente, distribuciones y servicios
      if (reserva) {
        if (reserva.cliente) {
          setNombreCliente(reserva.cliente.nombre);
          setEmailCliente(reserva.cliente.email || '');
          setTelefonoCliente(reserva.cliente.telefono || '');
        }
        
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
      setMessage({ type: 'error', text: err.message });
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
    const newMap = new Map(selectedServicios);
    serviciosCategoria.forEach(s => {
      if (!newMap.has(s.id)) {
        newMap.set(s.id, 1);
      }
    });
    setSelectedServicios(newMap);
  };

  const getServiciosByCategoria = (categoriaId: number) => {
    return servicios.filter(s => s.id_categoria === categoriaId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    // Validations
    if (!nombreCliente || !idSalon || !fechaInicio || !fechaFin) {
      setMessage({ type: 'error', text: 'Por favor complete todos los campos requeridos' });
      return;
    }

    if (new Date(fechaFin) <= new Date(fechaInicio)) {
      setMessage({ type: 'error', text: 'La fecha de fin debe ser posterior a la fecha de inicio' });
      return;
    }

    try {
      setLoading(true);

      const { data: userData } = await supabase.auth.getUser();
      let clienteId = reserva?.id_cliente;

      // Si estamos creando una nueva reserva, buscar o crear el cliente
      if (!reserva) {
        let { data: clienteExistente, error: searchError } = await supabase
          .from('clientes')
          .select('*')
          .or(`email.eq.${emailCliente || 'NULL_EMAIL_NEVER_MATCH'},nombre.eq.${nombreCliente}`)
          .limit(1)
          .maybeSingle();

        if (searchError && searchError.code !== 'PGRST116') {
          throw searchError;
        }

        if (clienteExistente) {
          clienteId = clienteExistente.id;
          
          const updateData: any = {};
          if (emailCliente && emailCliente !== clienteExistente.email) {
            updateData.email = emailCliente;
          }
          if (telefonoCliente && telefonoCliente !== clienteExistente.telefono) {
            updateData.telefono = telefonoCliente;
          }
          
          if (Object.keys(updateData).length > 0) {
            await supabase
              .from('clientes')
              .update(updateData)
              .eq('id', clienteId);
          }
        } else {
          const { data: nuevoCliente, error: createClienteError } = await supabase
            .from('clientes')
            .insert([{
              nombre: nombreCliente,
              email: emailCliente || null,
              telefono: telefonoCliente || null,
            }])
            .select()
            .single();

          if (createClienteError) throw createClienteError;
          clienteId = nuevoCliente.id;
        }
      } else {
        await supabase
          .from('clientes')
          .update({
            nombre: nombreCliente,
            email: emailCliente || null,
            telefono: telefonoCliente || null,
          })
          .eq('id', reserva.id_cliente);
      }

      // Obtener precio base del salón seleccionado
      const selectedSalon = salones.find(s => s.id === idSalon);
      const monto = selectedSalon?.precio_base || 0;

      const reservaData = {
        id_cliente: clienteId,
        id_salon: idSalon,
        id_distribucion: idDistribucion || null,
        fecha_inicio: new Date(fechaInicio).toISOString(),
        fecha_fin: new Date(fechaFin).toISOString(),
        estado,
        monto,
        observaciones: observaciones || null,
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
            // No lanzamos error aquí, la reserva ya fue creada
          }
        }
      }

      setMessage({
        type: 'success',
        text: reserva ? 'Reserva actualizada correctamente' : 'Reserva creada correctamente',
      });

      setTimeout(() => {
        onClose(true);
      }, 1500);
    } catch (err: any) {
      console.error('Error saving reserva:', err);
      setMessage({ type: 'error', text: err.message });
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos del Cliente */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="text-gray-900 mb-4">Datos del Cliente</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Nombre Completo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nombreCliente}
                onChange={(e) => setNombreCliente(e.target.value)}
                required
                placeholder="Juan Pérez"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={emailCliente}
                onChange={(e) => setEmailCliente(e.target.value)}
                placeholder="juan@ejemplo.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-700 mb-2">
                Teléfono
              </label>
              <input
                type="tel"
                value={telefonoCliente}
                onChange={(e) => setTelefonoCliente(e.target.value)}
                placeholder="+54 11 1234-5678"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          {!reserva && (
            <p className="text-xs text-gray-500 mt-2">
              Si el cliente ya existe (por email o nombre), se actualizarán sus datos. Si no existe, se creará automáticamente.
            </p>
          )}
        </div>

        {/* Salón y Distribución */}
        <div className="grid grid-cols-2 gap-4">
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
              {salones.map(salon => (
                <option key={salon.id} value={salon.id}>
                  {salon.nombre} - ${salon.precio_base}
                </option>
              ))}
            </select>
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

        {/* Fecha y Hora */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Fecha y Hora de Inicio <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={fechaInicio}
              onChange={(e) => setFechaInicio(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-2">
              Fecha y Hora de Fin <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={fechaFin}
              onChange={(e) => setFechaFin(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Estado */}
        <div>
          <label className="block text-sm text-gray-700 mb-2">
            Estado <span className="text-red-500">*</span>
          </label>
          <select
            value={estado}
            onChange={(e) => setEstado(e.target.value as Reserva['estado'])}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="Pendiente">Pendiente</option>
            <option value="Confirmado">Confirmado</option>
            <option value="Pagado">Pagado</option>
            <option value="Cancelado">Cancelado</option>
          </select>
        </div>

        {/* Precio Info */}
        {idSalon > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              <strong>Monto de la reserva:</strong> ${salones.find(s => s.id === idSalon)?.precio_base.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              <span className="text-xs block mt-1">(Precio base del salón seleccionado)</span>
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
                                  <p className="text-xs text-gray-600 mt-1">{servicio.descripcion}</p>
                                )}
                                {isSelected && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <label className="text-xs text-gray-700">Cantidad:</label>
                                    <input
                                      type="number"
                                      min="1"
                                      value={cantidad}
                                      onChange={(e) => updateCantidadServicio(servicio.id, parseInt(e.target.value) || 1)}
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

      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Nota:</strong> El sistema valida automáticamente que no haya solapamientos de reservas en el mismo salón. Si intenta crear una reserva que se solapa con otra existente (no cancelada), recibirá un error.
        </p>
      </div>
    </div>
  );
}
