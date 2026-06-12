-- Agrupa las categorias de servicios en rubros generales para reportes de ingresos.

alter table public.categorias_servicios
  add column if not exists categoria_superior text;

with categorias_normalizadas as (
  select
    id,
    translate(
      lower(btrim(coalesce(nombre, ''))),
      U&'\00E1\00E9\00ED\00F3\00FA\00FC\00F1',
      'aeiouun'
    ) as nombre_normalizado
  from public.categorias_servicios
)
update public.categorias_servicios categoria
set categoria_superior = case
  when normalizada.nombre_normalizado ~
    '(alimento|bebida|desayuno|almuerzo|cena|coffee|cofee|break|breack|catering|gastronom|cocktail|coctel|merienda|refrigerio|menu|buffet)'
    then 'ALIMENTOS_BEBIDAS'
  when normalizada.nombre_normalizado ~
    '(equip|tecnic|audio|video|sonido|iluminacion|proyector|pantalla|microfono)'
    then 'EQUIPAMIENTO_TECNICO'
  when normalizada.nombre_normalizado ~
    '(decor|ambient|flor|centro de mesa|manteleria)'
    then 'DECORACION'
  else 'OTROS_SERVICIOS'
end
from categorias_normalizadas normalizada
where categoria.id = normalizada.id
  and (
    categoria.categoria_superior is null
    or categoria.categoria_superior not in (
      'ALIMENTOS_BEBIDAS',
      'EQUIPAMIENTO_TECNICO',
      'DECORACION',
      'OTROS_SERVICIOS'
    )
  );

alter table public.categorias_servicios
  alter column categoria_superior set default 'OTROS_SERVICIOS',
  alter column categoria_superior set not null;

alter table public.categorias_servicios
  drop constraint if exists categorias_servicios_categoria_superior_check;

alter table public.categorias_servicios
  add constraint categorias_servicios_categoria_superior_check
  check (
    categoria_superior in (
      'ALIMENTOS_BEBIDAS',
      'EQUIPAMIENTO_TECNICO',
      'DECORACION',
      'OTROS_SERVICIOS'
    )
  );

comment on column public.categorias_servicios.categoria_superior is
  'Rubro general utilizado para agrupar ingresos de servicios en el dashboard.';
