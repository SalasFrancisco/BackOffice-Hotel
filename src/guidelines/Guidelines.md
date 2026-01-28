# Hotel Back-Office - Sistema de Reservas

## Reglas Generales

- Mantener código limpio y bien estructurado
- Usar componentes reutilizables
- Seguir las convenciones de TypeScript
- No modificar archivos protegidos del sistema

## Diseño

- Usar Tailwind CSS v4 para estilos
- No sobrescribir tipografía base (definida en globals.css)
- Mantener diseño consistente con shadcn/ui
- Responsive por defecto usando flexbox y grid

## Base de Datos

- Todas las tablas tienen RLS habilitado
- ADMIN tiene acceso completo (CRUD)
- OPERADOR tiene lectura total + crear/editar reservas y clientes
- Usar políticas sin recursión para evitar errores 42P17

## Convenciones

- Formato de fecha: "dd/MM/yyyy HH:mm" (locale es-AR)
- Los formularios deben ser popups modales (Dialog)
- Mensajes de éxito/error con iconos CheckCircle/AlertCircle
- Estados de reserva con código de colores consistentes
