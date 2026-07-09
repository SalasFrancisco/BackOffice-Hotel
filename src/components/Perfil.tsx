import { KeyRound, Shield, User as UserIcon } from 'lucide-react';
import { Perfil as PerfilType } from '../utils/supabase/client';

type PerfilProps = {
  perfil: PerfilType;
  onChangePassword: () => void;
};

// Descripción de cada rol para que el usuario entienda su alcance.
const ROLE_INFO: Record<'ADMIN' | 'OPERADOR', { label: string; description: string; abilities: string[] }> = {
  ADMIN: {
    label: 'Administrador',
    description:
      'Tiene acceso completo al sistema. Además de operar las reservas, administra la configuración y a los demás usuarios.',
    abilities: [
      'Panel con las métricas del negocio (Dashboard).',
      'Alta, baja y edición de usuarios y sus contraseñas.',
      'Gestión de salones, servicios y reservas.',
    ],
  },
  OPERADOR: {
    label: 'Operador',
    description:
      'Está enfocado en la operación diaria de las reservas. No accede al panel de métricas ni a la administración de usuarios.',
    abilities: [
      'Creación y gestión de reservas.',
      'Consulta de salones y servicios adicionales.',
      'Notificaciones del sistema.',
    ],
  },
};

export function Perfil({ perfil, onChangePassword }: PerfilProps) {
  const rol: 'ADMIN' | 'OPERADOR' = perfil.rol === 'ADMIN' ? 'ADMIN' : 'OPERADOR';
  const info = ROLE_INFO[rol];
  const inicial = (perfil.nombre || '?').trim().charAt(0).toUpperCase();

  return (
    <div className="bo-page">
      <div className="bo-page-header mb-4">
        <div className="bo-module-heading">
          <h2 className="bo-module-title text-gray-900">
            <span className="bo-module-title-icon">
              <UserIcon className="h-6 w-6" />
            </span>
            Mi Perfil
          </h2>
          <p className="bo-module-subtitle">Información de su cuenta y de su acceso al sistema</p>
        </div>
      </div>

      <div className="bo-profile-card">
        <div className="bo-profile-identity">
          <span className="bo-profile-avatar" aria-hidden="true">{inicial}</span>
          <div className="bo-profile-identity-text">
            <h3 className="bo-profile-name">{perfil.nombre}</h3>
            <span className={`bo-profile-role-badge is-${rol.toLowerCase()}`}>
              <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              {info.label}
            </span>
          </div>
        </div>

        <dl className="bo-profile-fields">
          <div className="bo-profile-field">
            <dt className="bo-profile-field-label">Nombre</dt>
            <dd className="bo-profile-field-value">{perfil.nombre}</dd>
          </div>
          <div className="bo-profile-field">
            <dt className="bo-profile-field-label">Rol</dt>
            <dd className="bo-profile-field-value">{info.label}</dd>
          </div>
        </dl>

        <div className="bo-profile-role-info">
          <h4 className="bo-profile-role-info-title">
            <Shield className="h-4 w-4" aria-hidden="true" />
            Sobre su rol
          </h4>
          <p className="bo-profile-role-info-desc">{info.description}</p>
          <ul className="bo-profile-role-abilities">
            {info.abilities.map((item) => (
              <li key={item} className="bo-profile-role-ability">
                <span className="bo-profile-role-ability-dot" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="bo-profile-actions">
          <button type="button" onClick={onChangePassword} className="bo-profile-change-pw">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Cambiar contraseña
          </button>
        </div>
      </div>
    </div>
  );
}
