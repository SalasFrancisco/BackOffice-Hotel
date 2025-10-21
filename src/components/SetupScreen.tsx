import { Database, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react';

export function SetupScreen() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-lg shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white p-8">
          <div className="flex items-center gap-3 mb-3">
            <Database className="w-10 h-10" />
            <h1 className="text-white">Configuración de Base de Datos Requerida</h1>
          </div>
          <p className="text-blue-100">
            La base de datos de Supabase aún no ha sido configurada. Sigue estos pasos para comenzar.
          </p>
        </div>

        {/* Steps */}
        <div className="p-8">
          <div className="space-y-6">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
                1
              </div>
              <div className="flex-1">
                <h3 className="text-gray-900 mb-2">Abrir Supabase Dashboard</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Ve al Dashboard de tu proyecto de Supabase y navega a la sección <strong>SQL Editor</strong>.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>URL:</strong> https://supabase.com/dashboard/project/_/sql
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
                2
              </div>
              <div className="flex-1">
                <h3 className="text-gray-900 mb-2">Ejecutar Script SQL</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Localiza el archivo <code className="bg-gray-100 px-2 py-1 rounded">database-setup.sql</code> en el proyecto y ejecuta su contenido completo en el SQL Editor.
                </p>
                <div className="bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs">
{`-- Desde el SQL Editor de Supabase:
-- 1. Click en "New query"
-- 2. Pega todo el contenido de database-setup.sql
-- 3. Click en "Run" o presiona Cmd/Ctrl + Enter`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
                3
              </div>
              <div className="flex-1">
                <h3 className="text-gray-900 mb-2">Crear Usuario Administrador</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Ve a <strong>Authentication</strong> → <strong>Users</strong> y crea un nuevo usuario:
                </p>
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700">
                      <strong>Email:</strong> <code className="bg-white px-2 py-0.5 rounded">admin@hotel.com</code>
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700">
                      <strong>Password:</strong> <code className="bg-white px-2 py-0.5 rounded">Admin123!</code> (cámbiala después)
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700">✅ Marca <strong>"Auto Confirm User"</strong></p>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700"><strong>Importante:</strong> Copia el <strong>User UID</strong> después de crear</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
                4
              </div>
              <div className="flex-1">
                <h3 className="text-gray-900 mb-2">Asignar Perfil al Usuario</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Vuelve al SQL Editor y ejecuta (reemplaza el UUID):
                </p>
                <div className="bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto">
                  <pre className="text-xs">
{`INSERT INTO public.perfiles (user_id, nombre, rol) 
VALUES (
  'PEGA-AQUI-EL-UUID-DEL-USUARIO', 
  'Administrador Hotel', 
  'ADMIN'
);`}
                  </pre>
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-gray-900 mb-2">Recarga la Página</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Una vez completados todos los pasos, recarga esta página y podrás iniciar sesión.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Recargar Página
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Additional Resources */}
          <div className="mt-8 p-4 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg">
            <h4 className="text-sm text-gray-900 mb-3">✨ Después de Configurar</h4>
            <p className="text-sm text-gray-700 mb-2">
              Una vez que inicies sesión como administrador, podrás <strong>crear usuarios adicionales directamente desde la aplicación</strong> sin necesidad de usar el Dashboard de Supabase.
            </p>
            <p className="text-sm text-gray-600">
              Ve a <strong>Usuarios</strong> → <strong>Crear Usuario</strong> para agregar operadores o más administradores.
            </p>
          </div>

          <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h4 className="text-sm text-gray-900 mb-2">📚 Recursos Adicionales</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Ver <code className="bg-gray-200 px-1 rounded">ADMIN-SETUP.md</code> para guía completa de configuración</li>
              <li>• Ver <code className="bg-gray-200 px-1 rounded">QUICKSTART.md</code> para guía rápida de 5 minutos</li>
              <li>• Ver <code className="bg-gray-200 px-1 rounded">README.md</code> para documentación completa</li>
            </ul>
          </div>

          {/* Error Info */}
          <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-800 mb-1">
                  <strong>Error Detectado:</strong> No se encontró la tabla 'perfiles' en el esquema de la base de datos.
                </p>
                <p className="text-xs text-red-700">
                  Esto indica que el script SQL aún no ha sido ejecutado. Sin las tablas necesarias, la aplicación no puede funcionar.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
