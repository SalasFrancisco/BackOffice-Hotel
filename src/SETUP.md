# 🚀 Setup Rápido - Hotel Back-Office

## Paso 1: Crear Base de Datos

1. Abre tu proyecto en **Supabase Dashboard**
2. Ve a **SQL Editor** (icono de base de datos en la barra lateral)
3. Copia COMPLETO el archivo **`database-setup.sql`**
4. Pégalo en el editor
5. Clic en **RUN** ▶️
6. Espera el mensaje de éxito ✅

## Paso 2: Crear Usuario Administrador

### 2.1 Crear usuario en Auth

1. Ve a **Authentication** → **Users** (icono de persona)
2. Clic en **Add user** → **Create new user**
3. Completa:
   - **Email:** `admin@hotel.com`
   - **Password:** `Admin123!` (cámbiala después)
   - ✅ **Marca:** "Auto Confirm User"
4. Clic en **Create user**
5. **IMPORTANTE:** Copia el **User UID** (aparece en la lista de usuarios)

### 2.2 Crear perfil del admin

1. Vuelve a **SQL Editor**
2. Ejecuta (reemplaza UUID):

```sql
INSERT INTO public.perfiles (user_id, nombre, rol) 
VALUES ('PASTE-USER-UUID-HERE', 'Administrador', 'ADMIN');
```

**Ejemplo:**
```sql
INSERT INTO public.perfiles (user_id, nombre, rol) 
VALUES ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'Administrador', 'ADMIN');
```

## Paso 3: Iniciar Sesión

1. Abre la aplicación
2. Inicia sesión con:
   - **Email:** `admin@hotel.com`
   - **Password:** `Admin123!`

## ⚠️ ¿Problemas?

Si no puedes crear usuarios o hay errores:

1. Ve a **SQL Editor**
2. Ejecuta el archivo **`fix-policies.sql`** completo
3. Recarga la app (F5)

---

✅ **¡Listo!** Ya puedes gestionar reservas, salones y usuarios.
