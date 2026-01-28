# 📝 SQL Útiles - Comandos Frecuentes

## 👤 Gestión de Usuarios

### Ver todos los usuarios y roles
```sql
SELECT 
  user_id,
  nombre,
  rol,
  creado_en
FROM public.perfiles
ORDER BY creado_en DESC;
```

### Cambiar rol de un usuario
```sql
UPDATE public.perfiles 
SET rol = 'ADMIN' 
WHERE user_id = 'uuid-del-usuario';
```

### Verificar mi propio perfil
```sql
SELECT * FROM public.perfiles 
WHERE user_id = auth.uid();
```

---

## 🏢 Salones

### Ver todos los salones
```sql
SELECT * FROM public.salones 
ORDER BY nombre;
```

### Insertar salón de ejemplo
```sql
INSERT INTO public.salones (nombre, capacidad, precio_base, descripcion) 
VALUES ('Salón VIP', 150, 25000.00, 'Salón premium con equipamiento de lujo');
```

### Ver distribuciones por salón
```sql
SELECT 
  s.nombre AS salon,
  d.nombre AS distribucion,
  d.capacidad
FROM public.distribuciones d
JOIN public.salones s ON s.id = d.id_salon
ORDER BY s.nombre, d.nombre;
```

---

## 📅 Reservas

### Ver reservas activas (hoy)
```sql
SELECT 
  r.id,
  c.nombre AS cliente,
  s.nombre AS salon,
  r.fecha_inicio,
  r.fecha_fin,
  r.estado,
  r.monto
FROM public.reservas r
JOIN public.clientes c ON c.id = r.id_cliente
JOIN public.salones s ON s.id = r.id_salon
WHERE DATE(r.fecha_inicio) = CURRENT_DATE
  AND r.estado != 'Cancelado'
ORDER BY r.fecha_inicio;
```

### Ver todas las reservas del mes actual
```sql
SELECT 
  r.id,
  c.nombre AS cliente,
  s.nombre AS salon,
  r.fecha_inicio::date AS fecha,
  r.estado,
  r.monto
FROM public.reservas r
JOIN public.clientes c ON c.id = r.id_cliente
JOIN public.salones s ON s.id = r.id_salon
WHERE DATE_TRUNC('month', r.fecha_inicio) = DATE_TRUNC('month', CURRENT_DATE)
ORDER BY r.fecha_inicio DESC;
```

### Total ingresos del mes
```sql
SELECT 
  TO_CHAR(SUM(monto), 'FM$999,999,990.00') AS total_mes
FROM public.reservas
WHERE DATE_TRUNC('month', fecha_inicio) = DATE_TRUNC('month', CURRENT_DATE)
  AND estado IN ('Confirmado', 'Pagado');
```

---

## 📦 Servicios Adicionales

### Ver todas las categorías y servicios
```sql
SELECT 
  c.nombre AS categoria,
  s.nombre AS servicio,
  s.precio,
  s.descripcion
FROM public.servicios s
JOIN public.categorias_servicios c ON c.id = s.id_categoria
ORDER BY c.nombre, s.nombre;
```

### Insertar categoría de ejemplo
```sql
INSERT INTO public.categorias_servicios (nombre, descripcion) 
VALUES ('Bebidas', 'Servicios de bebidas y bar');
```

### Insertar servicio de ejemplo
```sql
INSERT INTO public.servicios (id_categoria, nombre, descripcion, precio) 
VALUES (1, 'Barra Libre', 'Barra libre de bebidas alcohólicas y sin alcohol', 5000.00);
```

### Ver servicios por reserva
```sql
SELECT 
  r.id AS reserva_id,
  c.nombre AS cliente,
  s.nombre AS servicio,
  rs.cantidad,
  s.precio,
  (rs.cantidad * s.precio) AS subtotal
FROM public.reserva_servicios rs
JOIN public.reservas r ON r.id = rs.id_reserva
JOIN public.clientes c ON c.id = r.id_cliente
JOIN public.servicios s ON s.id = rs.id_servicio
WHERE r.id = 1; -- Cambiar por ID de reserva
```

---

## 🔒 Políticas RLS

### Ver todas las políticas activas
```sql
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### Verificar función get_user_role
```sql
SELECT public.get_user_role();
```

### Habilitar/Deshabilitar RLS en una tabla
```sql
-- Habilitar
ALTER TABLE public.salones ENABLE ROW LEVEL SECURITY;

-- Deshabilitar (NO RECOMENDADO en producción)
ALTER TABLE public.salones DISABLE ROW LEVEL SECURITY;
```

---

## 🗑️ Limpieza de Datos

### Eliminar reservas canceladas antiguas (más de 6 meses)
```sql
DELETE FROM public.reservas 
WHERE estado = 'Cancelado' 
  AND fecha_inicio < CURRENT_DATE - INTERVAL '6 months';
```

### Eliminar clientes sin reservas
```sql
DELETE FROM public.clientes 
WHERE id NOT IN (SELECT DISTINCT id_cliente FROM public.reservas);
```

---

## 📊 Reportes

### Top 5 salones más reservados
```sql
SELECT 
  s.nombre,
  COUNT(r.id) AS total_reservas,
  SUM(r.monto) AS ingresos_totales
FROM public.salones s
LEFT JOIN public.reservas r ON r.id_salon = s.id
WHERE r.estado IN ('Confirmado', 'Pagado')
GROUP BY s.id, s.nombre
ORDER BY total_reservas DESC
LIMIT 5;
```

### Reservas por estado (mes actual)
```sql
SELECT 
  estado,
  COUNT(*) AS cantidad,
  TO_CHAR(SUM(monto), 'FM$999,999,990.00') AS total
FROM public.reservas
WHERE DATE_TRUNC('month', fecha_inicio) = DATE_TRUNC('month', CURRENT_DATE)
GROUP BY estado
ORDER BY cantidad DESC;
```

### Clientes más frecuentes
```sql
SELECT 
  c.nombre,
  c.empresa,
  COUNT(r.id) AS total_reservas,
  TO_CHAR(SUM(r.monto), 'FM$999,999,990.00') AS total_gastado
FROM public.clientes c
JOIN public.reservas r ON r.id_cliente = c.id
WHERE r.estado IN ('Confirmado', 'Pagado')
GROUP BY c.id, c.nombre, c.empresa
ORDER BY total_reservas DESC
LIMIT 10;
```

---

## 🔄 Backup y Restauración

### Exportar datos de salones
```sql
COPY (SELECT * FROM public.salones) TO '/tmp/salones_backup.csv' CSV HEADER;
```

### Ver tamaño de las tablas
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```
