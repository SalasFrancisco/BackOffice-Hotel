-- ============================================
-- FIX RLS POLICIES - Eliminar Recursión
-- Ejecutar este SQL si hay errores de recursión
-- ============================================

-- Crear función helper (si no existe)
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT rol FROM public.perfiles WHERE user_id = auth.uid();
$$;

-- ============================================
-- ELIMINAR TODAS LAS POLÍTICAS EXISTENTES
-- ============================================

-- SALONES
DROP POLICY IF EXISTS admin_all_salones ON public.salones;
DROP POLICY IF EXISTS operador_read_salones ON public.salones;

-- DISTRIBUCIONES
DROP POLICY IF EXISTS admin_all_distribuciones ON public.distribuciones;
DROP POLICY IF EXISTS operador_read_distribuciones ON public.distribuciones;

-- CLIENTES
DROP POLICY IF EXISTS admin_all_clientes ON public.clientes;
DROP POLICY IF EXISTS operador_all_clientes ON public.clientes;

-- RESERVAS
DROP POLICY IF EXISTS admin_all_reservas ON public.reservas;
DROP POLICY IF EXISTS operador_read_reservas ON public.reservas;
DROP POLICY IF EXISTS operador_write_reservas ON public.reservas;
DROP POLICY IF EXISTS operador_update_reservas ON public.reservas;

-- PAGOS
DROP POLICY IF EXISTS admin_all_pagos ON public.pagos;
DROP POLICY IF EXISTS operador_read_pagos ON public.pagos;

-- CATEGORIAS_SERVICIOS
DROP POLICY IF EXISTS admin_all_categorias_servicios ON public.categorias_servicios;
DROP POLICY IF EXISTS operador_read_categorias_servicios ON public.categorias_servicios;

-- SERVICIOS
DROP POLICY IF EXISTS admin_all_servicios ON public.servicios;
DROP POLICY IF EXISTS operador_read_servicios ON public.servicios;

-- RESERVA_SERVICIOS
DROP POLICY IF EXISTS admin_all_reserva_servicios ON public.reserva_servicios;
DROP POLICY IF EXISTS operador_all_reserva_servicios ON public.reserva_servicios;

-- PERFILES
DROP POLICY IF EXISTS admin_all_perfiles ON public.perfiles;
DROP POLICY IF EXISTS users_read_own_perfil ON public.perfiles;
DROP POLICY IF EXISTS users_read_all_perfiles ON public.perfiles;
DROP POLICY IF EXISTS authenticated_read_perfiles ON public.perfiles;
DROP POLICY IF EXISTS users_update_own_perfil ON public.perfiles;
DROP POLICY IF EXISTS service_role_all_perfiles ON public.perfiles;

-- ============================================
-- CREAR NUEVAS POLÍTICAS SIN RECURSIÓN
-- ============================================

-- SALONES
CREATE POLICY admin_all_salones ON public.salones
  FOR ALL USING (public.get_user_role() = 'ADMIN');

CREATE POLICY operador_read_salones ON public.salones
  FOR SELECT USING (public.get_user_role() IN ('ADMIN', 'OPERADOR'));

-- DISTRIBUCIONES
CREATE POLICY admin_all_distribuciones ON public.distribuciones
  FOR ALL USING (public.get_user_role() = 'ADMIN');

CREATE POLICY operador_read_distribuciones ON public.distribuciones
  FOR SELECT USING (public.get_user_role() IN ('ADMIN', 'OPERADOR'));

-- CLIENTES
CREATE POLICY admin_all_clientes ON public.clientes
  FOR ALL USING (public.get_user_role() = 'ADMIN');

CREATE POLICY operador_all_clientes ON public.clientes
  FOR ALL USING (public.get_user_role() IN ('ADMIN', 'OPERADOR'));

-- RESERVAS
CREATE POLICY admin_all_reservas ON public.reservas
  FOR ALL USING (public.get_user_role() = 'ADMIN');

CREATE POLICY operador_read_reservas ON public.reservas
  FOR SELECT USING (public.get_user_role() IN ('ADMIN', 'OPERADOR'));

CREATE POLICY operador_write_reservas ON public.reservas
  FOR INSERT WITH CHECK (public.get_user_role() IN ('ADMIN', 'OPERADOR'));

CREATE POLICY operador_update_reservas ON public.reservas
  FOR UPDATE USING (public.get_user_role() IN ('ADMIN', 'OPERADOR'));

-- PAGOS
CREATE POLICY admin_all_pagos ON public.pagos
  FOR ALL USING (public.get_user_role() = 'ADMIN');

CREATE POLICY operador_read_pagos ON public.pagos
  FOR SELECT USING (public.get_user_role() IN ('ADMIN', 'OPERADOR'));

-- CATEGORIAS_SERVICIOS
CREATE POLICY admin_all_categorias_servicios ON public.categorias_servicios
  FOR ALL USING (public.get_user_role() = 'ADMIN');

CREATE POLICY operador_read_categorias_servicios ON public.categorias_servicios
  FOR SELECT USING (public.get_user_role() IN ('ADMIN', 'OPERADOR'));

-- SERVICIOS
CREATE POLICY admin_all_servicios ON public.servicios
  FOR ALL USING (public.get_user_role() = 'ADMIN');

CREATE POLICY operador_read_servicios ON public.servicios
  FOR SELECT USING (public.get_user_role() IN ('ADMIN', 'OPERADOR'));

-- RESERVA_SERVICIOS
CREATE POLICY admin_all_reserva_servicios ON public.reserva_servicios
  FOR ALL USING (public.get_user_role() = 'ADMIN');

CREATE POLICY operador_all_reserva_servicios ON public.reserva_servicios
  FOR ALL USING (public.get_user_role() IN ('ADMIN', 'OPERADOR'));

-- PERFILES (sin recursión - todos pueden leer, solo dueño puede actualizar)
CREATE POLICY authenticated_read_perfiles ON public.perfiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY users_update_own_perfil ON public.perfiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY service_role_all_perfiles ON public.perfiles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- LISTO ✅
-- ============================================
