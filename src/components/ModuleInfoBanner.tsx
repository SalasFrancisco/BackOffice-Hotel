import { useState, type ReactNode } from 'react';
import { Info, ChevronDown } from 'lucide-react';

type ModuleInfoBannerProps = {
  /** Texto breve del módulo, visible al expandir. */
  children: ReactNode;
  /** Etiqueta de la barra colapsada. */
  label?: string;
};

// Bloque informativo celeste, compacto y colapsable. Colapsado por defecto
// (una sola línea) para no ocupar espacio; al hacer clic se expande y muestra
// una breve descripción de para qué sirve el módulo.
export function ModuleInfoBanner({
  children,
  label = 'Acerca de este módulo',
}: ModuleInfoBannerProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`bo-module-info${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="bo-module-info-toggle"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <span className="bo-module-info-icon" aria-hidden="true">
          <Info className="h-4 w-4" />
        </span>
        <span className="bo-module-info-label">{label}</span>
        <ChevronDown className="bo-module-info-chevron h-4 w-4" aria-hidden="true" />
      </button>
      {open && <div className="bo-module-info-body">{children}</div>}
    </div>
  );
}
