-- =============================================================================
-- Revierte por completo el lote de reservas de demostracion operacion-2m-v2.
--
-- Borra, en este orden:
--   1. las lecturas / ocultamientos de las notificaciones del lote;
--   2. todo lo que dependa por clave foranea de public.reservas
--      (reserva_servicios, auditoria_reservas, notificaciones, ...), descubierto
--      dinamicamente desde el catalogo, para no depender del esquema exacto;
--   3. las reservas marcadas con '[DEMO_LOTE:operacion-2m-v2]';
--   4. los clientes que el trigger de clientes recurrentes creo a partir del
--      lote. Se reconocen por el TLD reservado `.test` en el email y solo se
--      eliminan si ninguna reserva sobreviviente los referencia.
--
-- No toca ninguna reserva ni ningun cliente que no pertenezca al lote.
-- =============================================================================

begin;

set local timezone = 'America/Argentina/Cordoba';

create temporary table demo_bajas (id bigint primary key);

insert into demo_bajas (id)
select id from public.reservas
where observaciones like '%' || '[DEMO_LOTE:operacion-2m-v2]' || '%';

do $baja$
declare
  v_ids       bigint[];
  v_total     integer;
  v_fk        record;
  v_clientes  integer;
begin
  select count(*), coalesce(array_agg(id order by id), '{}')
  into v_total, v_ids
  from demo_bajas;

  if v_total = 0 then
    raise notice 'No hay reservas del lote operacion-2m-v2: no hay nada que revertir.';
    return;
  end if;

  if v_total > 400 then
    raise exception
      'Proteccion: el lote tiene % reservas, muy por encima de las % esperadas.',
      v_total, 173;
  end if;

  -- 1. Lecturas y ocultamientos de las notificaciones del lote.
  if to_regclass('public.notificaciones') is not null then
    if to_regclass('public.notificaciones_leidas') is not null then
      delete from public.notificaciones_leidas
      where id_notificacion in (
        select id from public.notificaciones where reserva_id = any(v_ids)
      );
    end if;

    if to_regclass('public.notificaciones_ocultas') is not null then
      delete from public.notificaciones_ocultas
      where id_notificacion in (
        select id from public.notificaciones where reserva_id = any(v_ids)
      );
    end if;
  end if;

  -- 2. Dependencias directas de reservas, descubiertas del catalogo.
  for v_fk in
    select child_ns.nspname as schema_name,
           child.relname    as table_name,
           child_col.attname as column_name
    from pg_constraint c
    join pg_class child          on child.oid = c.conrelid
    join pg_namespace child_ns   on child_ns.oid = child.relnamespace
    join pg_attribute child_col  on child_col.attrelid = c.conrelid
                                and child_col.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.reservas'::regclass
      and array_length(c.conkey, 1) = 1
      and c.conrelid <> 'public.reservas'::regclass
  loop
    execute format('delete from %I.%I where %I = any($1)',
                   v_fk.schema_name, v_fk.table_name, v_fk.column_name)
    using v_ids;
  end loop;

  -- 3. Las reservas del lote.
  delete from public.reservas where id = any(v_ids);

  -- 4. Los clientes recurrentes generados por el lote.
  delete from public.clientes cl
  where cl.email_normalizado like '%.test'
    and not exists (select 1 from public.reservas r where r.id_cliente = cl.id);
  get diagnostics v_clientes = row_count;

  raise notice 'Revertidas % reservas y % clientes del lote operacion-2m-v2.', v_total, v_clientes;
end;
$baja$;

select (select count(*) from demo_bajas)                       as reservas_eliminadas,
       (select count(*) from public.reservas
         where observaciones like '%' || '[DEMO_LOTE:operacion-2m-v2]' || '%')       as reservas_restantes,
       (select count(*) from public.clientes
         where email_normalizado like '%.test')                 as clientes_demo_restantes;

drop table demo_bajas;

commit;
