# BackOffice Hotel — Sistema de gestión de reservas

Sistema de gestión de reservas para el **Centro de Convenciones del Hotel Quinto Centenario**
(Córdoba, Argentina). Trabajo Final de la carrera **Analista de Sistemas** —
Colegio Universitario IES.

El proyecto resuelve el circuito comercial de los salones de eventos: consulta pública,
generación automática de presupuestos, y administración interna de reservas, salones,
servicios, usuarios y reportes.

---

## 1. Descripción general

El sistema se compone de **dos aplicaciones** que comparten una misma base de datos:

1. **Sitio público + formulario de reserva** (`salones.html`): página de marketing del Centro
   de Convenciones y formulario interactivo mediante el cual un cliente configura su evento
   (fecha, salón, distribución, cantidad de personas y servicios) y solicita un presupuesto.
   El mismo archivo se sirve como **widget embebible** (`/formulario-reserva.html`) dentro del
   sitio oficial del hotel.
2. **Back-office / panel administrativo** (`reservas/`): aplicación de escritorio web (SPA) de
   uso interno del personal del hotel para administrar el ciclo de vida de las reservas,
   salones, servicios, usuarios, notificaciones y el dashboard de indicadores.

Al enviarse el formulario público, el sistema genera automáticamente el presupuesto en PDF,
registra la reserva en estado **"Pendiente validación"**, notifica al personal (correo +
campana de notificaciones) y le entrega al cliente el presupuesto estimado en el momento.

---

## 2. Arquitectura

### 2.1 Frontend — tres puntos de entrada, un solo build

El proyecto es un frontend **Vite multipágina**. Un único `vite.config.ts` compila tres
entradas HTML independientes:

| Entrada | Qué es |
| --- | --- |
| `index.html` | Redirección al sitio público (`salones.html`). |
| `salones.html` | Sitio público + formulario de reserva (HTML/CSS/JS vanilla, no usa React). También se sirve como iframe embebible en `/formulario-reserva.html`. |
| `reservas/index.html` | Punto de entrada de la SPA de React (back-office). Se instala como PWA. |

El build se genera en la carpeta **`build/`** (no `dist/`).

### 2.2 Backend — Supabase

Toda la lógica de datos vive en **Supabase**:

- **PostgreSQL**: tablas del dominio (reservas, salones, distribuciones, servicios, categorías,
  clientes, pagos, perfiles, notificaciones, auditoría), protegidas por **Row Level Security
  (RLS)**. Las reglas de negocio críticas (transiciones de estado, anti-solapamiento de
  reservas, vigencia de presupuestos) se aplican con `CHECK`, `triggers` y procedimientos
  almacenados. Ver `supabase/migrations/`.
- **Auth**: autenticación por correo y contraseña, con roles y recuperación de contraseña.
- **Storage**: almacenamiento de los PDF de presupuesto.
- **Edge Function (`server`)**: una única función Deno/Hono (`supabase/functions/server/`) para
  las operaciones que requieren la *service-role key* o no deben ejecutarse en el cliente:
  administración de usuarios, generación/envío de presupuestos por correo, enlaces cortos,
  eliminación de reservas con limpieza de Storage, procesamiento de vencimientos y los
  **endpoints públicos** que consume el formulario (`public-catalog`, `public-reserva`), con
  *rate limiting*.

La mayor parte del CRUD lo hace el frontend directamente contra Postgres vía `supabase-js`;
solo lo sensible pasa por la Edge Function.

### 2.3 Roles

Los roles se definen en la tabla `perfiles` (`rol`: `ADMIN` u `OPERADOR`, más un flag `activo`):

- **ADMIN** (Gerente de Ventas): acceso total, incluye Dashboard y gestión de Usuarios.
- **OPERADOR** (Encargado de Ventas): gestión de reservas, salones y servicios; sin Dashboard
  ni Usuarios.

---

## 3. Stack tecnológico

| Capa | Tecnología |
| --- | --- |
| Front (back-office) | React 18 + TypeScript, Vite 6, componentes estilo shadcn/Radix UI, Recharts, Lucide, Sonner |
| Front (público) | HTML + CSS + JavaScript vanilla (`salones.html`) |
| Backend / BD | Supabase — PostgreSQL, Auth, Storage |
| Función serverless | Deno + Hono (Edge Function `server`) |
| PDF | pdfmake (cliente y servidor) |
| Correo | Nodemailer sobre SMTP (Gmail) |
| Hosting frontend | Hostinger (ver `HOSTINGER_DEPLOYMENT.md`) |
| Control de versiones | Git + GitHub |

---

## 4. Estructura del proyecto

```
BackOffice-Hotel/
├── index.html                  # Redirección al sitio público
├── salones.html                # Sitio público + formulario de reserva (vanilla)
├── reservas/                    # Punto de entrada de la SPA (back-office)
├── public/                     # Estáticos (incluye .htaccess de Hostinger, PWA)
├── src/                        # Código de la SPA de React
│   ├── components/             # Pantallas y UI (Reservas, Salones, Dashboard, etc.)
│   ├── utils/                  # Reglas de negocio de reservas (estados, conflictos,
│   │                           #   capacidad, vencimiento, presupuestos)
│   └── ...
├── supabase/
│   ├── functions/server/       # Edge Function (Deno/Hono)
│   ├── migrations/             # Migraciones SQL (esquema + reglas de negocio)
│   └── config.toml
├── scripts/demo-reservas/      # SQL para cargar/borrar reservas de demostración
├── vite.config.ts
├── vercel.json                 # Config de la etapa anterior (Vercel); ver nota en Despliegue
├── HOSTINGER_DEPLOYMENT.md      # Guía de despliegue en Hostinger
├── .env.example                # Plantilla de variables de entorno
└── CLAUDE.md                    # Notas de arquitectura para el asistente de código
```

---

## 5. Requisitos previos

- **Node.js 20 o superior** y npm.
- **Supabase CLI** (`supabase`) para aplicar migraciones y desplegar la Edge Function.
- Acceso a un proyecto de **Supabase** (URL, *anon key* y *service-role key*).
- Una cuenta **SMTP** (Gmail) con contraseña de aplicación, para el envío de correos.

---

## 6. Configuración local

1. Clonar el repositorio e instalar dependencias:

   ```bash
   npm install
   ```

2. Copiar `.env.example` a `.env` y completar los valores:

   ```bash
   cp .env.example .env
   ```

   **Variables del frontend** (se incrustan en el build, deben empezar con `VITE_`):

   | Variable | Descripción |
   | --- | --- |
   | `VITE_SUPABASE_PROJECT_ID` | ID del proyecto Supabase. |
   | `VITE_SUPABASE_ANON_KEY` | Clave pública (anon) del proyecto. |
   | `VITE_SESSION_TIMEOUT_MINUTES` | Minutos de inactividad antes del cierre de sesión (por defecto 15). |

   **Variables de la Edge Function / servidor** (NO se exponen en el frontend; se cargan como
   *secrets* en Supabase): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
   `ALLOWED_ORIGINS`, credenciales `SMTP_*`, límites `*_RATE_LIMIT_*` y TTL de enlaces de
   presupuesto. Ver `.env.example` para la lista completa y comentada.

   > **Importante:** el archivo `.env` real nunca se sube al repositorio (está en `.gitignore`).
   > Solo se versiona `.env.example` con los nombres de las variables.

---

## 7. Ejecución en desarrollo

```bash
npm run dev
```

Levanta el servidor de desarrollo de Vite en **http://localhost:3000** (abre el navegador
automáticamente). El back-office queda disponible en `http://localhost:3000/reservas/`.

---

## 8. Build de producción

```bash
npm run build
```

Genera los archivos estáticos en la carpeta **`build/`**, lista para publicar.

---

## 9. Despliegue

### 9.1 Frontend — Hostinger

El frontend se despliega en **Hostinger**, que compila el repositorio y publica el contenido de
`build/`. La guía completa y paso a paso está en **[`HOSTINGER_DEPLOYMENT.md`](HOSTINGER_DEPLOYMENT.md)**
(configuración del sitio, variables de entorno, reglas de `public/.htaccess`, configuración de
Supabase para el dominio, y checklist de validación).

> **Nota:** el archivo `vercel.json` corresponde a una etapa previa de despliegue en Vercel. Las
> reglas de enrutamiento y seguridad equivalentes para Hostinger están en `public/.htaccess`.

### 9.2 Backend — Supabase

- **Migraciones** (esquema y reglas de negocio):

  ```bash
  supabase db push
  ```

  (o pegar los archivos de `supabase/migrations/` en el editor SQL de Supabase, en orden).

- **Edge Function** (desplegar tras cada cambio en `supabase/functions/server/index.ts`):

  ```bash
  supabase functions deploy server
  ```

- Cargar los *secrets* de la Edge Function (SMTP, service-role, orígenes permitidos, etc.) en
  **Supabase → Edge Functions → Secrets**.

---

## 10. Base de datos y datos de demostración

- El **esquema completo y las reglas de negocio** se reconstruyen aplicando en orden las
  migraciones de `supabase/migrations/`.
- La carpeta `scripts/demo-reservas/` contiene SQL para **cargar, previsualizar y borrar**
  reservas de demostración, útil para probar el sistema con datos de ejemplo.

---

## 11. Documentación del proyecto (tesis)

La documentación académica completa (informe de tesis, diagramas UML, DER, matriz de
trazabilidad, fichas de casos de uso) se encuentra en la unidad compartida del proyecto:

- **Documentación completa (Drive):** <https://drive.google.com/drive/folders/10Jwu7Nr1x0DXEs_GVQZI6LOTe6Am4q1D?usp=sharing>

---

## 12. Autores

- **Mateo Radicci**
- **Francisco Salas**

Carrera de Analista de Sistemas — Colegio Universitario IES.
Docente: German Verblud.
