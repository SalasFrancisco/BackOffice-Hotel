# 🔍 Diagnóstico de Problemas

## ❌ "No puedo crear usuarios siendo ADMIN"

### Verificar en Supabase Dashboard:

1. **SQL Editor** → Ejecuta:
```sql
SELECT user_id, nombre, rol FROM public.perfiles;
```

¿Tu usuario tiene rol `'ADMIN'` (todo mayúsculas)? Si no, corrígelo:

```sql
UPDATE public.perfiles 
SET rol = 'ADMIN' 
WHERE user_id = 'TU-USER-UUID';
```

2. **Ejecutar fix de políticas:**
   - Ve a **SQL Editor**
   - Ejecuta TODO el contenido de `fix-policies.sql`
   - Recarga la app

---

## ❌ Error: "infinite recursion" o código 42P17

**Solución:**
1. Ejecuta `fix-policies.sql` completo en SQL Editor
2. Recarga la app (F5)

---

## ❌ No aparecen salones/reservas

1. Verifica que existan datos:
```sql
SELECT COUNT(*) FROM public.salones;
SELECT COUNT(*) FROM public.reservas;
```

2. Si no hay salones, inserta datos de prueba:
```sql
INSERT INTO public.salones (nombre, capacidad, precio_base, descripcion) 
VALUES ('Salón Principal', 100, 10000.00, 'Salón de prueba');
```

3. Verifica políticas RLS:
```sql
SELECT * FROM public.perfiles WHERE user_id = auth.uid();
```

---

## ❌ Error al iniciar sesión

1. Verifica que el usuario tenga perfil:
```sql
SELECT * FROM public.perfiles WHERE user_id = 'USER-UUID-AQUI';
```

2. Si no tiene perfil, créalo:
```sql
INSERT INTO public.perfiles (user_id, nombre, rol) 
VALUES ('USER-UUID-AQUI', 'Nombre Usuario', 'ADMIN');
```

---

## ✅ Verificar que todo esté OK

Ejecuta este query de diagnóstico completo:

```sql
-- Ver usuarios y roles
SELECT 
  p.user_id,
  p.nombre,
  p.rol,
  p.creado_en
FROM public.perfiles p
ORDER BY p.creado_en DESC;

-- Ver políticas activas en perfiles
SELECT 
  schemaname,
  tablename,
  policyname
FROM pg_policies
WHERE tablename = 'perfiles';

-- Ver función helper
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name = 'get_user_role';
```

Si todo está bien, deberías ver:
- ✅ Tus usuarios con roles correctos
- ✅ 3 políticas en tabla perfiles
- ✅ La función `get_user_role`

---

## 📞 Último recurso

Si nada funciona:

1. **Borra TODAS las tablas** (⚠️ cuidado):
```sql
DROP TABLE IF EXISTS public.reserva_servicios CASCADE;
DROP TABLE IF EXISTS public.servicios CASCADE;
DROP TABLE IF EXISTS public.categorias_servicios CASCADE;
DROP TABLE IF EXISTS public.reservas CASCADE;
DROP TABLE IF EXISTS public.distribuciones CASCADE;
DROP TABLE IF EXISTS public.salones CASCADE;
DROP TABLE IF EXISTS public.clientes CASCADE;
DROP TABLE IF EXISTS public.pagos CASCADE;
DROP TABLE IF EXISTS public.perfiles CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role();
```

2. **Elimina usuarios** en Authentication → Users

3. **Ejecuta `database-setup.sql`** completo

4. **Sigue SETUP.md** paso a paso
