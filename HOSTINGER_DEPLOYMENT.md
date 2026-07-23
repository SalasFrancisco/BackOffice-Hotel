# Despliegue en Hostinger

Este repositorio contiene un frontend Vite multipágina. Hostinger debe compilar
el repositorio y publicar solamente el contenido de `build/`. La base de datos,
Auth, Storage y las Edge Functions continúan alojadas en Supabase.

## 1. Configuración del proyecto en Hostinger

En hPanel, crear un sitio de tipo React/Vite y conectarlo con este repositorio
de GitHub.

Configurar:

| Campo | Valor |
| --- | --- |
| Rama de producción | `main` |
| Directorio raíz | `/` (raíz del repositorio) |
| Comando de instalación | `npm ci` |
| Comando de build | `npm run build` |
| Directorio de salida | `build` |
| Node.js | 20 o superior |

Este proyecto usa `build`, no el valor predeterminado `dist` de Vite.

## 2. Variables de entorno de Hostinger

Agregar estas variables al entorno de producción antes del primer build:

```env
VITE_SUPABASE_PROJECT_ID=gcmkqbilhtkexexwumux
VITE_SUPABASE_ANON_KEY=<COPIAR_LA_CLAVE_PUBLICA_ACTUAL>
VITE_SESSION_TIMEOUT_MINUTES=15
```

Las variables `VITE_*` se incorporan al JavaScript durante el build. Después de
cambiar una de ellas hay que ejecutar un redeploy.

No agregar a Hostinger `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_PASS`, `CRON_SECRET`
ni `RATE_LIMIT_HASH_SECRET`. Esos valores pertenecen a Supabase Edge Functions
y no deben exponerse en el frontend.

## 3. Reglas del servidor

`public/.htaccess` reemplaza en Hostinger las reglas que Vercel tomaba de
`vercel.json`. Vite lo copia automáticamente a `build/.htaccess`.

Incluye:

- `/reservas` redirige a `/reservas/`;
- `/formulario-reserva.html` sirve `salones.html`;
- encabezados contra MIME sniffing, framing no autorizado y permisos del
  navegador;
- caché prolongada para bundles versionados y revalidación para HTML y el
  service worker;
- compresión de archivos de texto.

Si el formulario se va a insertar desde un dominio distinto de
`https://www.quintocentenariohotel.com`, actualizar `frame-ancestors` en
`public/.htaccess` antes de desplegar.

## 4. Configuración de Supabase

En **Edge Functions > Secrets**, durante la transición:

```env
ALLOWED_ORIGINS=http://localhost:3000,https://quintocentenario.vercel.app,https://<DOMINIO>,https://www.<DOMINIO>
PASSWORD_RECOVERY_REDIRECT_URL=https://www.<DOMINIO>/reservas/
```

Usar orígenes exactos, sin una barra final. Cuando Hostinger esté verificado,
se puede quitar `https://quintocentenario.vercel.app`.

En **Authentication > URL Configuration**:

```text
Site URL
https://www.<DOMINIO>

Redirect URLs
https://www.<DOMINIO>/reservas/
https://<DOMINIO>/reservas/
http://localhost:3000/**
```

Elegir una sola variante canónica (`www` o sin `www`) y redirigir la otra hacia
ella.

## 5. Validación previa al corte

Probar primero con la URL temporal que entregue Hostinger. Para ello, agregar
temporalmente su origen completo a `ALLOWED_ORIGINS`.

Verificar:

1. `/` redirige a `salones.html`.
2. `/reservas` redirige a `/reservas/`.
3. `/reservas/` permite iniciar sesión y cargar información.
4. La recuperación de contraseña abre `/reservas/?recovery=1`.
5. `/formulario-reserva.html` muestra el formulario público.
6. Las altas de reservas y consultas al catálogo no producen errores CORS.
7. No hay errores 404 para archivos bajo `/assets/` ni `/reservas/`.

## 6. Corte del dominio

Después de validar la URL temporal:

1. Asociar el dominio al sitio nuevo desde hPanel.
2. Apuntar los registros web del dominio al hosting de Hostinger.
3. Mantener intactos los registros de correo MX, SPF, DKIM y DMARC.
4. Activar SSL, CDN, caché y WAF en Hostinger.
5. Actualizar Supabase con el dominio definitivo.
6. Probar nuevamente todos los puntos de la sección anterior.
7. Recién entonces quitar el dominio de Vercel o detener el proyecto.
