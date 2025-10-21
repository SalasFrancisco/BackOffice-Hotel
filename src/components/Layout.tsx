import { ReactNode } from 'react';
import { LogOut, LayoutDashboard, Calendar, ListChecks, PackagePlus, Building2, UserCog } from 'lucide-react';
import { supabase, Perfil } from '../utils/supabase/client';

type LayoutProps = {
  children: ReactNode;
  currentPage: string;
  onNavigate: (page: string) => void;
  perfil: Perfil | null;
  onLogout: () => void;
};

export function Layout({ children, currentPage, onNavigate, perfil, onLogout }: LayoutProps) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'reservas', label: 'Reservas', icon: ListChecks },
    { id: 'salones', label: 'Salones', icon: Building2 },
    { id: 'servicios', label: 'Servicios Adicionales', icon: PackagePlus },
  ];

  if (perfil?.rol === 'ADMIN') {
    menuItems.push({ id: 'usuarios', label: 'Usuarios', icon: UserCog });
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200">
        <div className="p-6">
          <h1 className="text-gray-900">Hotel Back-Office</h1>
          <p className="text-gray-500 text-sm mt-1">Sistema de Reservas</p>
        </div>
        
        <nav className="px-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg mb-1 transition-colors ${
                  currentPage === item.id
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-200">
          <div className="mb-3">
            <p className="text-sm text-gray-900">{perfil?.nombre}</p>
            <p className="text-xs text-gray-500">{perfil?.rol}</p>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
