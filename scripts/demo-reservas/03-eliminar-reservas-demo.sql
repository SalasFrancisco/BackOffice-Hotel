-- Elimina exclusivamente el lote ficticio operacion-hotel-v1.
--
-- Busca las reservas por el marcador DEMO_LOTE y elimina primero todas
-- las tablas que tengan una FK directa a public.reservas. Tambien limpia
-- lecturas de notificaciones si esa tabla existe.

begin;

set local timezone = 'America/Argentina/Buenos_Aires';

create temporary table demo_reservas_a_eliminar (
  id bigint primary key
) on commit drop;

insert into demo_reservas_a_eliminar (id)
select id
from public.reservas
where observaciones like '%[DEMO_LOTE:operacion-hotel-v1]%';

do $cleanup$
declare
  v_ids bigint[];
  v_total integer;
  v_fk record;
begin
  select count(*), array_agg(id order by id)
  into v_total, v_ids
  from demo_reservas_a_eliminar;

  if v_total = 0 then
    raise notice 'No se encontraron reservas del lote operacion-hotel-v1.';
    return;
  end if;

  if v_total > 1000 then
    raise exception
      'Proteccion activada: el lote contiene % reservas, por encima del limite de seguridad.',
      v_total;
  end if;

  -- notificaciones_leidas depende de notificaciones y no directamente
  -- de reservas. Se limpia antes si ambas tablas/columnas existen.
  if to_regclass('public.notificaciones_leidas') is not null
    and to_regclass('public.notificaciones') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notificaciones_leidas'
        and column_name = 'id_notificacion'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notificaciones'
        and column_name = 'reserva_id'
    )
  then
    execute $sql$
      delete from public.notificaciones_leidas
      where id_notificacion in (
        select id
        from public.notificaciones
        where reserva_id = any($1)
      )
    $sql$
    using v_ids;
  end if;

  -- Descubre y elimina dependencias directas de reservas, incluyendo
  -- reserva_servicios, auditoria y notificaciones.
  for v_fk in
    select
      child_ns.nspname as schema_name,
      child.relname as table_name,
      child_col.attname as column_name
    from pg_constraint constraint_info
    join pg_class child
      on child.oid = constraint_info.conrelid
    join pg_namespace child_ns
      on child_ns.oid = child.relnamespace
    join pg_attribute child_col
      on child_col.attrelid = constraint_info.conrelid
      and child_col.attnum = constraint_info.conkey[1]
    where constraint_info.contype = 'f'
      and constraint_info.confrelid = 'public.reservas'::regclass
      and array_length(constraint_info.conkey, 1) = 1
      and constraint_info.conrelid <> 'public.reservas'::regclass
  loop
    execute format(
      'delete from %I.%I where %I = any($1)',
      v_fk.schema_name,
      v_fk.table_name,
      v_fk.column_name
    )
    using v_ids;
  end loop;

  delete from public.reservas
  where id = any(v_ids);

  raise notice 'Se eliminaron % reservas ficticias del lote operacion-hotel-v1.', v_total;
end;
$cleanup$;

select
  count(*) as reservas_eliminadas
from demo_reservas_a_eliminar;

select
  count(*) as reservas_demo_restantes
from public.reservas
where observaciones like '%[DEMO_LOTE:operacion-hotel-v1]%';

commit;
