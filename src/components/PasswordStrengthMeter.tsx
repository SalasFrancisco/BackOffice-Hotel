import { Check, X } from 'lucide-react';
import { getPasswordRequirements, getPasswordStrength } from '../utils/passwordPolicy';

type PasswordStrengthMeterProps = {
  password: string;
};

// Medidor dinámico de fuerza de contraseña: barra + etiqueta de color
// (rojo/amarillo/verde/azul) y checklist de requisitos que se van cumpliendo.
export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (!password) return null;

  const strength = getPasswordStrength(password);
  const requirements = getPasswordRequirements(password);

  return (
    <div className="bo-pw-meter">
      <div className="bo-pw-bar">
        <span
          className={`bo-pw-bar-fill bo-pw-tone--${strength.tone}`}
          style={{ width: `${(strength.score / 4) * 100}%` }}
        />
      </div>
      <div className="bo-pw-meter-head">
        <span className="bo-pw-meter-caption">Seguridad</span>
        <span className={`bo-pw-level bo-pw-tone-text--${strength.tone}`}>{strength.label}</span>
      </div>
      <ul className="bo-pw-reqs">
        {requirements.map((requirement) => (
          <li key={requirement.key} className={requirement.ok ? 'is-ok' : ''}>
            <span className="bo-pw-req-icon" aria-hidden="true">
              {requirement.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </span>
            {requirement.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
