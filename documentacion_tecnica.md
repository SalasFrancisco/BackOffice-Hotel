# Documentacion tecnica integral - BackOffice-Hotel

## Contexto general
- Aplicacion SPA construida con React 18, Vite 6 (plugin react-swc) y Tailwind CSS v4.
- Supabase provee autenticacion, Postgres, RLS y funciones edge; el cliente esta centralizado en `src/utils/supabase`.
- La logica de negocio vive en componentes de dominio dentro de `src/components`, apoyados por wrappers shadcn/ui bajo `src/components/ui`.
- Los scripts SQL en `src` definen el modelo relacional (`database-setup.sql`) y corrigen politicas (`fix-policies.sql`); la documentacion operativa acompana en archivos `.md`.
- La carpeta `supabase/functions` expone servicios tipo Hono/Deno que requieren claves `service_role` para administrar usuarios.
- Tailwind genera la hoja `index.css` y `src/styles/globals.css` aporta tokens de tema reutilizados en todo el layout.

## Estructura del repositorio

### Directorios principales
- `/`: manifiestos del build, configuracion de Vite y dependencias.
- `/src`: codigo fuente, estilos, utilidades y documentacion SQL/markdown.
- `/src/components`: pantallas y piezas de UI estructurales, con subcarpetas `figma` (helpers) y `ui` (wrappers radicados).
- `/src/utils`: cliente Supabase tipado y constantes sensibles.
- `/src/supabase`: codigo de funciones serverless y utilidades de almacenamiento KV autogeneradas.
- `/src/styles` y `/src/guidelines`: definiciones de tema y convenciones de desarrollo.
- `node_modules` y `build`: artefactos derivados de npm/vite (no se documentan por ser generados).

### Documentos en la raiz
| Archivo | Descripcion |
| --- | --- |
| `.gitignore` | Ignora `node_modules/` para evitar versionar dependencias instaladas por npm. |
| `.npmrc` | Fuerza que los paquetes bajo el scope `@jsr` se resuelvan contra `https://npm.jsr.io` para poder consumir `@jsr/supabase__supabase-js`. |
| `index.html` | Markup minimo de Vite; define `<div id="root">`, importa `/src/main.tsx` y fija el titulo "Back-office Reservation Management". |
| `package.json` | Manifiesto npm con dependencias React 18, Supabase JS 2.x, Radix UI, helpers shadcn/ui, Recharts, Embla carousel, cmdk, vaul, lucide-react, react-hook-form, sonner, etc. Scripts principales: `npm run dev` y `npm run build`. |
| `package-lock.json` | Archivo de bloqueo npm v3 que fija versiones exactas de todas las dependencias para reproducir builds. |
| `README.md` | Instruccion rapida (instalar con `npm i` y ejecutar `npm run dev`); remite a la documentacion dentro de `src/` para mayor detalle. |
| `vite.config.ts` | Configuracion de Vite: `defineConfig` con plugin react-swc, resolucion de `.js/.ts/.tsx`, alias que normalizan imports con sufijo de version (ej. `lucide-react@0.487.0`) y alias `@` -> `./src`. Ajusta build (`target esnext`, `outDir build`) y servidor de desarrollo (puerto 3000, auto apertura). |

## Carpeta `src`

### Resumen general
- Contiene el entry point (`main.tsx`), la aplicacion (`App.tsx`), estilos, componentes y documentacion operativa.
- Incluye scripts SQL y guias en markdown necesarios para provisionar y mantener la base de datos Supabase.

### Archivos destacados
- **App.tsx:** componente raiz responsivo. Gestiona la sesion con `supabase.auth`, almacena el perfil tipado, pagina actual, id de salon en edicion y flag de error RLS. `checkSession()` obtiene la sesion persistida, trae el perfil desde la tabla `perfiles` y detecta el error de recursion (codigo 42P17) disparado por politicas mal configuradas; en ese caso limpia la sesion y activa `rlsError`. `loadPerfil()` reconsulta el perfil al cambiar el usuario. Registra listeners `onAuthStateChange` para actualizar estado en vivo. `handleLogout()` cierra sesion y resetea navegacion. `handleNavigate`/`handleEditSalon`/`handleBackFromSalonEdit` controlan el enrutamiento interno sin React Router. `renderPage()` decide que pagina renderizar (Dashboard, Reservas, Salones, Servicios Adicionales o Usuarios) y permite abrir `SalonEdit` en linea. Si `rlsError` es `true` se muestra una pantalla instructiva que inserta el contenido de `fix-policies.sql`, con tooltip para copiar y limpiar el flag tras ejecutar el script. Mientras `loading` es `true` se evita renderizar UI; sin sesion/perfil se muestra `Login`. Cuando todo esta listo renderiza `Layout` con el contenido de la pagina activa.
- **Attributions.md:** reconoce origen de componentes shadcn/ui (licencia MIT) y fotografias Unsplash utilizadas por la interfaz generada desde Figma Make.
- **database-setup.sql:** script maestro (mas de 380 lineas) que crea extensiones, tablas (`salones`, `distribuciones`, `perfiles`, `reservas`, `pagos`, `categorias_servicios`, `servicios`, `reserva_servicios`), triggers para actualizar timestamps y prevenir solapamientos (constraint `EXCLUDE` sobre rango `tstzrange`), funcion helper `get_user_role`, habilita RLS y define politicas diferenciadas para ADMIN vs OPERADOR. Inserta datos seed (salones) y documenta pasos para crear el usuario admin, ademas de instrucciones para crear usuario auth y asignar perfil administrado.
- **DIAGNOSTICO.md:** guia rapida de troubleshooting. Explica como verificar roles ADMIN, ejecutar `fix-policies.sql` para errores 42P17, validar existencia de datos, recrear salones, corroborar politicas RLS y, como ultimo recurso, limpiar tablas y reejecutar `database-setup.sql`.
- **fix-policies.sql:** script correctivo que recrea la funcion `get_user_role`, elimina todas las politicas existentes en tablas claves y crea un set nuevo sin recursion (uso directo de `auth.uid()` y `get_user_role()`). Restablece acceso total para ADMIN, lecturas y escrituras acotadas para OPERADOR y acceso de `service_role` donde aplica.
- **index.css:** salida compilada de Tailwind CSS v4 (aprox 49k lineas). Define variables CSS para paleta OKLCH, resets base, animaciones (`spin`, `pulse`) y clases utilitarias generadas por Tailwind. Complementa las reglas `@layer base/components` usadas en toda la UI.
- **main.tsx:** punto de entrada Vite. Importa `ReactDOM.createRoot`, monta `<App />` dentro de `#root` y carga `index.css`.
- **README.md (src/README.md):** documentacion funcional del sistema (version en castellano). Resume funcionalidades (KPIs, calendario, servicios adicionales, ABM de usuarios), pasos de setup, scripts a ejecutar y resalta mejoras recientes.
- **SETUP.md:** checklist paso a paso para preparar Supabase (ejecutar `database-setup.sql`, crear usuario admin, insertar perfil) y resolver problemas comunes (ejecutar `fix-policies.sql`).
- **SQL-UTILES.md:** coleccion de consultas SQL utiles (reportes, ABM rapidos, diagnostico RLS, limpiezas, backups). Cubre usuarios, salones, reservas, servicios, reportes de ingresos, top salones y mas.

### Subcarpetas clave
- `components/`, `guidelines/`, `styles/`, `supabase/`, `utils/`: concentran la logica de dominio, convenciones de diseno, estilos globales, integraciones con Supabase y utilidades compartidas.

### Carpeta `src/guidelines`
- **Guidelines.md:** establece reglas generales (codigo limpio, reutilizacion de componentes, respeto por TypeScript), criterios de diseno (Tailwind v4, consistencia con shadcn/ui, responsive por defecto) y recordatorios de RLS (ADMIN con CRUD, OPERADOR con permisos limitados, evitar recursion). Tambien fija convenciones de formato (fecha `dd/MM/yyyy HH:mm`, uso de `Dialog` para formularios, iconografia de mensajes y colores de estado).

### Carpeta `src/styles`
- **globals.css:** define variables CSS (background, foreground, tokens de card, popover, colores de borde, radios, charts y sidebar) para modo claro/oscuro usando OKLCH. Declara `@custom-variant dark`, expone tokens via `@theme inline` y aplica resets basicos via `@layer base`. Normaliza tipografia para headings, parrafos, labels, botones e inputs.

### Carpeta `src/utils`
- **supabase/client.ts:** centraliza la inicializacion de Supabase JS usando `projectId` y `publicAnonKey` de `info.tsx`. Exporta tipos TypeScript para entidades del dominio (`Perfil`, `Salon`, `Distribucion`, `Cliente`, `CategoriaServicio`, `Servicio`, `ReservaServicio`, `Reserva`) reutilizados en toda la app.
- **supabase/info.tsx:** archivo autogenerado con constantes `projectId` (`nfivlwsteygarpfixtst`) y `publicAnonKey` JWT. Es consumido por `client.ts` y por funciones edge para construir URL y K/V; no debe editarse manualmente.

### Carpeta `src/supabase`
- **functions/server/index.tsx:** funcion edge escrita con Hono para Deno. Configura CORS, logging y crea clientes Supabase con la clave `service_role`. Incluye helper `requireAdmin()` que valida que el bearer token pertenezca a un usuario con rol ADMIN (consultando la tabla `perfiles`) antes de permitir acciones. Endpoints expuestos:
  - `GET /make-server-484a241a/health`: chequeo basico.
  - `POST /make-server-484a241a/create-user`: crea usuario `auth/admin` con metadata `nombre`, auto confirma, inserta fila en `perfiles` y retorna info basica.
  - `POST /make-server-484a241a/update-user-email`: cambia email de un usuario existente (requiere ADMIN).
  - `POST /make-server-484a241a/get-user-email`: recupera email actual de un `user_id`.
  - `POST /make-server-484a241a/delete-user`: borra perfil asociado y elimina el usuario de Auth.
  Cada endpoint valida body, maneja errores de Supabase admin y devuelve JSON estructurado.
- **functions/server/kv_store.tsx:** utilidades autogeneradas para operar contra la tabla `kv_store_484a241a` (`set`, `get`, `delete`, `mset`, `mget`, `mdel`, `getByPrefix`). Usa `supabase-js` via jsr con `service_role` para persistir configuracion de Figma Make.

### Componentes de dominio (`src/components`)
- **ConfirmDialog.tsx:** wrapper reutilizable construido encima de `ui/alert-dialog`. Recibe flags `open`/`onOpenChange`/`onConfirm` y textos personalizables. Si `variant` es `"destructive"` muestra un icono `AlertTriangle` y colorea el boton primario en rojo. Centraliza uso de los subcomponentes `AlertDialog*` para confirmaciones.
- **Dashboard.tsx:** panel principal. Usa estados para fecha actual, reservas del mes (con joins cliente/salon), salones, filtros (salon y estado), KPI (`reservasMes`, `salonMasReservado`, `salonesActivos`, `eventosActivos`) y modal de reserva seleccionada. `loadData()` consulta Supabase para salones ordenados, reservas intersectando el mes actual con filtros, conteo exacto de reservas del mes, ranking de salones ultimo trimestre y eventos activos en el dia. Renderiza tarjetas KPI con iconos lucide, filtros select y un calendario mensual custom (day grid, legend por estado) que usa `ESTADO_COLORS` para colorear badges y abre `ReservaModal` al presionar una reserva. Maneja errores con `AlertCircle` y overlay de cargando.
- **Layout.tsx:** layout con sidebar fijo y contenido. Calcula `menuItems` base (dashboard, reservas, salones, servicios) y agrega usuarios si el perfil es ADMIN. Renderiza el menu lateral con iconos lucide, resalta la pagina activa y coloca en el pie los datos del usuario y boton de cierre de sesion.
- **Login.tsx:** pantalla de autenticacion. Maneja estados para email/password, error, loading y flujo de recuperacion. `handleLogin()` usa `supabase.auth.signInWithPassword` y luego verifica que exista fila en `perfiles` para el `user_id`. `handlePasswordRecovery()` llama `resetPasswordForEmail` y muestra feedback con `CheckCircle`/`AlertCircle`. Permite alternar entre formularios de login y recuperar, con estilos Tailwind.
- **ReservaForm.tsx:** formulario maestro para crear/editar reservas. Carga salones, distribuciones del salon seleccionado, categorias y servicios (con join de categoria) y los servicios actualmente asociados a la reserva. Mantiene `Map<number, number>` para cantidades seleccionadas. Al enviar valida campos y guarda los datos de contacto del cliente embebidos en la reserva (nombre, email, teléfono, empresa), arma payload `reservaData` con conversion de fechas a ISO y estado seleccionado, e inserta o actualiza en `reservas`. Gestiona seleccion masiva por categoria, sincronia de cantidades y desacople de servicios eliminados (borra filas de `reserva_servicios` que ya no esten y vuelve a insertar las nuevas). Muestra mensajes success/error con iconos y mantiene spinner de loading. Incluye recordatorio sobre validacion de solapamientos enforced por la constraint en la base.
- **ReservaModal.tsx:** modal de detalle (overlay centrado). Al abrir hace fetch de `reserva_servicios` con joins a servicios y categorias. Permite actualizar estado (Pendiente, Confirmado, Pagado, Cancelado) con botones coloreados, borrar reserva (tras `confirm()` nativo) y listar datos clave: cliente, salon, fechas formateadas, monto, ID, distribucion y observaciones. Calcula totales de servicios adicionales (icono `Package`). Tras acciones exitosas cierra el modal luego de un timeout.
- **Reservas.tsx:** listado administrativo. Consulta reservas con joins cliente/salon/distribucion, admite filtro por estado, busqueda por texto (cliente, salon, estado, id) y ordena por `fecha_inicio` descendente. Renderiza tabla responsive con badges de color por estado (`ESTADO_COLORS`), acciones de editar (abre `Dialog` con `ReservaForm`) y eliminar (`confirm()` + `supabase.delete`). Controla mensajes tipo toast en `message` y muestra resumen "Mostrando X de Y".
- **Salones.tsx:** ABM rapido de salones. Carga salones ordenados, permite crear/editar en un dialogo (campos `nombre`, `capacidad`, `precio_base`, `descripcion`) y enlaza boton "Editar Salon y Distribuciones" que invoca `onEditSalon` para abrir `SalonEdit`. Solo permite edicion si el perfil es ADMIN (`canEdit`). Usa `ConfirmDialog` para confirmaciones de borrado. Muestra cards con icono `Building2`, capacidad, precio, descripcion y boton de accion.
- **SalonEdit.tsx:** vista detallada para administrar un salon especifico. Carga salon y distribuciones asociadas, precarga campos en formularios separados. `handleSaveSalon()` actualiza `nombre`/`capacidad`/`precio`/`descripcion`. Permite crear nuevas distribuciones (nombre/capacidad), editarlas y eliminarlas (`ConfirmDialog`). Agrupa UI en dos bloques: edicion de datos del salon y grilla de distribuciones con acciones.
- **ServiciosAdicionales.tsx:** modulo para categorias y servicios. Carga `categorias_servicios` y `servicios` con joins. Mantiene filtros por categoria seleccionada y multiples dialogs: uno para crear/editar categoria (nombre, descripcion) y otro para servicio (categoria, nombre, descripcion, precio). Gestiona confirmaciones para eliminar categoria (tambien borra servicios asociados) y servicios individuales; restringe acciones segun rol (asume perfil ADMIN). Renderiza cards con iconos `Package`/`FolderOpen` y listas de servicios agrupados.
- **SetupScreen.tsx:** template full-screen que instruye sobre pasos de configuracion cuando falta la tabla `perfiles` (UI de soporte). Describe 5 pasos, incluye bloques con SQL e indica recursos adicionales. No se invoca desde `App` actualmente, pero sirve para escenarios de setup.
- **Usuarios.tsx:** modulo de gestion de usuarios Supabase (solo accesible a ADMIN). Carga perfiles ordenados, muestra tabla con roles, fechas y badges (`Shield`/`User`). Para crear usuarios: obtiene session, llama `fetch` al endpoint `create-user` en la funcion edge pasando bearer token para validacion; luego resetea formulario y recarga data. En edicion abre dialog, recupera email actual via endpoint `get-user-email` y permite cambiar nombre/email/rol; al guardar llama `update-user-email` y `update` en tabla `perfiles`. Tambien expone `ConfirmDialog` para eliminar (`delete-user` endpoint). Maneja mensajes en `message` y estados `creating`/`editing`.
- **Flujo de reservas:** `ReservaForm.tsx`, `ReservaModal.tsx` y `Reservas.tsx` colaboran para un flujo CRUD completo de reservas integrado con servicios y prevencion de solapes. Los datos de cliente se almacenan dentro de `reservas`.

### Subcarpeta `src/components/figma`
- **ImageWithFallback.tsx:** helper ligero para renderizar imagenes exportadas desde Figma. Mantiene estado `didError`; si falla la carga reemplaza la imagen por un SVG inline base64 que indica error, conservando `data-original-url`. En estado normal renderiza `<img>` directo con handler `onError`.

### Subcarpeta `src/components/ui`
- Nota general: todos los archivos exportan componentes funcionales en modo cliente, estilizados con Tailwind y helper `cn()`. Se apoyan en Radix UI, lucide-react, class-variance-authority y otras librerias para aportar consistencia visual.
- **accordion.tsx:** compone `Accordion`, `AccordionItem`, `AccordionTrigger` y `AccordionContent` basados en `@radix-ui/react-accordion` con animaciones y icono `ChevronDown` que rota al expandir.
- **alert-dialog.tsx:** reexpone `AlertDialog` y subcomponentes (`Portal`, `Overlay`, `Content`, `Header`, `Footer`, `Title`, `Description`, `Action`, `Cancel`) con estilos predeterminados; `Action`/`Cancel` reutilizan `buttonVariants`.
- **alert.tsx:** define `Alert`, `AlertTitle` y `AlertDescription` con variantes `base`/`destructive`, layout con icon placeholder y colores de fondo.
- **aspect-ratio.tsx:** wrapper sobre `@radix-ui/react-aspect-ratio` para mantener relaciones de aspecto.
- **avatar.tsx:** `Avatar`, `AvatarImage` y `AvatarFallback` usando `@radix-ui/react-avatar` con clases para tamanos y fallback.
- **badge.tsx:** `Badge` estilizado con variantes `default`, `secondary`, `destructive` y `outline`.
- **breadcrumb.tsx:** componentes para breadcrumbs (`Breadcrumb`, `List`, `Item`, `Link`, `Page`, `Separator`, `Ellipsis`) con semantica accesible.
- **button.tsx:** define `Button` y `buttonVariants` con `class-variance-authority`. Soporta variantes `default`, `destructive`, `outline`, `secondary`, `ghost`, `link` y tamanos (`default`, `sm`, `lg`, `icon`). Permite `asChild` para `Slot`.
- **calendar.tsx:** integra `react-day-picker` con estilos y componentes de navegacion usando `ChevronLeft`/`ChevronRight`, adaptado a modos `range` y `single`.
- **card.tsx:** `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent` y `CardFooter` con clases de caja.
- **carousel.tsx:** implementa `Carousel`, `CarouselContent`, `CarouselItem`, `CarouselPrevious`, `CarouselNext` apoyado en `embla-carousel-react` para sliders.
- **chart.tsx:** capa sobre Recharts. Define `ChartContainer` con context que acepta config por dataset (color/theme), genera estilos dinamicos, provee `ChartTooltipContent` con opciones `indicator`/`formatter` y `ChartLegendContent`. Facilita compartir definiciones de color entre componentes Recharts.
- **checkbox.tsx:** wrapper Radix `Checkbox` con soporte de icono `Check` y estados `disabled`.
- **collapsible.tsx:** reexporta `Root`, `Trigger` y `Content` de `@radix-ui/react-collapsible` con clases.
- **command.tsx:** integra `cmdk` generando `Command`, `CommandList`, `CommandInput`, `CommandEmpty`, `CommandGroup`, `CommandItem`, `CommandSeparator`, `CommandShortcut` para paletas de comandos.
- **context-menu.tsx:** wrappers de menu contextual (`ContextMenu`, `Trigger`, `Content`, `Item`, `CheckboxItem`, `RadioItem`, etc.) con estilos de fondo, atajos y submenus.
- **dialog.tsx:** `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription` y `DialogFooter` con transiciones; `Content` usa overlay y centrado.
- **drawer.tsx:** implementa `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle`, `DrawerDescription` y `DrawerFooter` utilizando `vaul` y `Sheet` para overlays deslizables laterales.
- **dropdown-menu.tsx:** wrappers de `@radix-ui/react-dropdown-menu` incluyendo triggers, content, label, item, checkbox item, radio group, separator y shortcuts.
- **form.tsx:** integracion con `react-hook-form`. Expone `Form` (`FormProvider`), `FormField` (`Controller`), hooks `useFormField` y componentes `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage` para errores/descripciones accesibles.
- **hover-card.tsx:** hover card Radix estilizado para tooltips ricos.
- **input-otp.tsx:** crea `InputOTP` con elementos, grupos y slots para ingresar codigos numericos; usa `input-otp`.
- **input.tsx:** `Input` base con `focus` states y soporte `disabled`, `invalid`, sizing.
- **label.tsx:** `Label` basado en `@radix-ui/react-label` que se integra con `form.tsx`.
- **menubar.tsx:** wrappers para menus horizontales con items, triggers, submenus y shortcuts.
- **navigation-menu.tsx:** construye menus de navegacion horizontales con indicadores animados y vistas de contenido.
- **pagination.tsx:** helpers para paginacion (`Pagination`, lista, item, previous/next, `Ellipsis`) con semantica aria y estilos.
- **popover.tsx:** wrappers `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverClose` de Radix con sombras y controles de focus.
- **progress.tsx:** `Progress` e `indicator` con animaciones y tokens de color.
- **radio-group.tsx:** `RadioGroup` y `RadioGroupItem` con circulos y estados.
- **resizable.tsx:** wrappers para `react-resizable-panels` (`PanelGroup`, `Panel`, `PanelResizeHandle`) con clases preconfiguradas.
- **scroll-area.tsx:** `ScrollArea` y `ScrollBar` con track personalizado y orientacion configurable.
- **select.tsx:** wrappers del componente `Select` de Radix (`Trigger`, `Value`, `Content`, `ScrollUpButton`, `ScrollDownButton`, `Group`, `Label`, `Item`, `ItemText`, `ItemIndicator`, `Separator`) con iconos y clases.
- **separator.tsx:** componente visual `Separator` con variantes horizontal/vertical.
- **sheet.tsx:** wrappers de Radix Sheet (`Root`, `Trigger`, `Content`, `Header`, `Title`, `Description`, `Footer`, `Close`) con animaciones `slide-in`.
- **sidebar.tsx:** implementacion completa de sidebar responsive. Usa contexto propio (`SidebarProvider`), cookies para recordar estado, shortcuts (`Ctrl/Cmd+B`), integracion con `Sheet` en mobile, componentes secundarios (`Content`, `Header`, `Footer`, `Group`, `Menu`, `MenuItem`, `MenuButton`, `MenuAction`, `MenuBadge`, `MenuSkeleton`, `MenuSub`, `MenuSubButton`, `Inset`, `Separator`, `Trigger`, `Rail`) y utilidades para icon-only mode. Emplea `useIsMobile()` para detectar breakpoint y `Button`/`Input`/`Tooltip` para interacciones avanzadas.
- **skeleton.tsx:** componente `Skeleton` para placeholders con animacion de brillo.
- **slider.tsx:** slider Radix con track y rangos custom, permitiendo distintos tamanos.
- **sonner.tsx:** wrappers sobre la libreria sonner para toasts (`Toaster`, `toast`) con posiciones y offsets predefinidos.
- **switch.tsx:** switch Radix estilizado (pistas/bola) con soporte `disabled` y `focus` ring.
- **table.tsx:** componentes `Table`, `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption` actualizados a Tailwind v4, con `data-slot`.
- **tabs.tsx:** `Tabs` con lista, triggers y contenido, transiciones y `focus` ring.
- **textarea.tsx:** `Textarea` estilizada con soporte `invalid`/`disabled`.
- **toggle-group.tsx:** `ToggleGroup` y `ToggleGroupItem` de Radix con variantes de orientacion horizontal/vertical.
- **toggle.tsx:** `Toggle` individual con estados `pressed` y `focus` ring.
- **tooltip.tsx:** `TooltipProvider`/`Tooltip`/`TooltipTrigger`/`TooltipContent` con delay y clases.
- **use-mobile.ts:** hook que escucha la media query `(max-width: 767px)` para determinar si la vista es mobile; usado en `sidebar`.
- **utils.ts:** helper `cn()` que combina `clsx` y `tailwind-merge` para fusionar clases sin duplicados.

## Notas adicionales
- `node_modules/`: directorio generado por npm; contiene dependencias versionadas en `package-lock.json`.
- `build/`: se genera al correr `npm run build` y contiene assets compilados por Vite (no presente en el repo por defecto).
- Los scripts SQL y funciones edge requieren ejecutar sucesivamente `database-setup.sql` y `fix-policies.sql` para garantizar que `App.tsx` no active el flujo de error RLS.
- Las llamadas `fetch` en `Usuarios.tsx` dependen de que las funciones edge esten desplegadas en Supabase bajo el mismo slug `make-server-484a241a`.
