# 🏨 Hotel Back-Office - Sistema de Reservas

Sistema completo de gestión de reservas de salones de hotel con roles de usuario (ADMIN y OPERADOR), prevención de solapamientos, gestión de servicios adicionales, y dashboard con KPIs en tiempo real.

## 🚀 Inicio Rápido

> 📖 **Instrucciones completas:** Ver **[SETUP.md](./SETUP.md)**  
> 🔍 **¿Problemas?** Ver **[DIAGNOSTICO.md](./DIAGNOSTICO.md)**

### 1. Configuración de Base de Datos

1. Ve a tu proyecto Supabase → **SQL Editor**
2. Ejecuta TODO el contenido de **`database-setup.sql`**

### 2. Crear Usuario Administrador

1. **Authentication** → **Users** → **Add user**
2. Email: `admin@hotel.com` / Password: `Admin123!`
3. ✅ Marca "Auto Confirm User"
4. Copia el **User UID**
5. En **SQL Editor**:

```sql
INSERT INTO public.perfiles (user_id, nombre, rol) 
VALUES ('PASTE-USER-UUID-HERE', 'Administrador', 'ADMIN');
```

### 3. ⚠️ Fix de Políticas (IMPORTANTE)

**Si tienes errores al crear usuarios o de recursión:**

1. Ejecuta TODO el contenido de **`fix-policies.sql`** en SQL Editor
2. Recarga la app (F5)

### 4. Listo ✅

Inicia sesión con `admin@hotel.com` / `Admin123!`

---

## 📚 Documentación

- **[SETUP.md](./SETUP.md)** - Guía paso a paso para configurar el sistema
- **[DIAGNOSTICO.md](./DIAGNOSTICO.md)** - Soluciones a problemas comunes
- **[SQL-UTILES.md](./SQL-UTILES.md)** - Comandos SQL útiles y reportes
- **[fix-policies.sql](./fix-policies.sql)** - Script para corregir políticas RLS
- **[database-setup.sql](./database-setup.sql)** - Script completo de setup inicial

---

## ✨ Funcionalidades Principales

### 📊 Dashboard
- **KPIs en tiempo real:** Eventos Activos (hoy), Total Reservas (mes), Ingresos (mes)
- **Calendario visual:** Código de colores por estado de reserva
- **Eventos multi-día:** Líneas continuas en el calendario

### 📅 Reservas
- **Creación automática de clientes** al hacer reservas
- **Prevención de solapamientos** por salón
- **Estados:** Pendiente, Confirmado, Pagado, Cancelado
- **Servicios adicionales:** Selección múltiple al reservar
- **Filtros avanzados:** Por salón, estado, rango de fechas
- **Modal de detalle** con toda la información

### 🏢 Salones
- **Gestión completa:** Crear, editar, eliminar (solo ADMIN)
- **Distribuciones:** Múltiples configuraciones por salón (Teatro, U, Imperial, etc.)
- **Precios personalizados**
- **Página de edición dedicada** con capacidades diferentes por distribución

### 📦 Servicios Adicionales
- **Categorías de servicios:** Desayuno, Coffee Break, etc.
- **ABM completo:** Crear, editar, eliminar categorías y servicios
- **Asignación a reservas:** Selección múltiple con cantidad
- **Solo visible para ADMIN**

### 👥 Usuarios (Solo ADMIN)
- **Gestión de usuarios:** Crear, editar, eliminar
- **Roles:** ADMIN (acceso total) / OPERADOR (lectura + crear/editar reservas)
- **Edición de emails**

### 🔐 Autenticación
- **Login seguro** con Supabase Auth
- **Recuperación de contraseña**
- **Sesión persistente**

---

## 🗂️ Base de Datos

**8 tablas principales:** perfiles, salones, distribuciones, clientes, reservas, categorias_servicios, servicios, reserva_servicios

**Seguridad RLS:**
- ADMIN: Acceso total
- OPERADOR: Lectura + Crear/Editar reservas

## 🛠️ Stack

React + TypeScript + Tailwind v4 + Supabase + shadcn/ui

---

## 🔧 Solución Rápida de Problemas

### ❌ Error al crear usuarios / Recursión / 42P17

Ejecuta **`fix-policies.sql`** en Supabase SQL Editor → Recarga (F5)

### Más ayuda

Ver **[DIAGNOSTICO.md](./DIAGNOSTICO.md)** para soluciones detalladas

---

## 📝 Últimas Mejoras

- ✅ Servicios adicionales con categorías (ABM completo)
- ✅ Distribuciones de salones con capacidades variables
- ✅ Creación automática de clientes al reservar
- ✅ Eventos multi-día en calendario
- ✅ Políticas RLS optimizadas (sin recursión)
- ✅ Recuperación de contraseña
- ✅ KPIs en tiempo real

---

**Versión 2.0** | Octubre 2025 | Sistema de Reservas Hotel Back-Office
