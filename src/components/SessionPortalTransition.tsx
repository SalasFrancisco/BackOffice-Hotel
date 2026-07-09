import { useEffect } from 'react';

type SessionPortalTransitionProps = {
  variant: 'enter' | 'exit';
  message: string;
  onComplete: () => void;
};

const VARIANT_DURATION_MS: Record<SessionPortalTransitionProps['variant'], number> = {
  enter: 1150,
  exit: 1350,
};

export function SessionPortalTransition({ variant, message, onComplete }: SessionPortalTransitionProps) {
  useEffect(() => {
    const timer = window.setTimeout(onComplete, VARIANT_DURATION_MS[variant]);
    return () => window.clearTimeout(timer);
  }, [onComplete, variant]);

  return (
    <div
      className={`bo-login-portal${variant === 'exit' ? ' bo-login-portal--exit' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="bo-login-portal-bg" />
      <div className="bo-login-portal-content">
        <img src="/QuintoCente.png" alt="" className="bo-login-portal-logo" />
        <p className="bo-login-portal-welcome">{message}</p>
        <span className="bo-login-portal-spinner" />
      </div>
    </div>
  );
}
