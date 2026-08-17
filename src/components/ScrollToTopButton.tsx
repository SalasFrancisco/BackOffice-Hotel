import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

// A partir de cuánto desplazamiento aparece la flecha. Poco más de media
// pantalla en mobile: lo suficiente para que no moleste en páginas cortas.
const SHOW_AFTER_PX = 320;

const getScrollTop = () =>
  window.scrollY || document.documentElement.scrollTop || 0;

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const syncVisibility = () => {
      setVisible(getScrollTop() > SHOW_AFTER_PX);
    };

    syncVisibility();
    window.addEventListener('scroll', syncVisibility, { passive: true });
    window.addEventListener('resize', syncVisibility);

    return () => {
      window.removeEventListener('scroll', syncVisibility);
      window.removeEventListener('resize', syncVisibility);
    };
  }, []);

  const scrollToTop = () => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  };

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className={`bo-scroll-top${visible ? ' is-visible' : ''}`}
      title="Volver arriba"
      aria-label="Volver al inicio de la página"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
