import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';

type WelcomeBannerProps = {
  nombre?: string | null;
  eyebrow?: string;
};

const getGreeting = (hour: number) => {
  // 06:00–12:59 → días · 13:00–19:59 → tardes · 20:00–05:59 → noches
  if (hour >= 6 && hour < 13) return 'Buenos días';
  if (hour >= 13 && hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
};

export function WelcomeBanner({
  nombre,
  eyebrow = 'Hotel Quinto Centenario · Back-Office',
}: WelcomeBannerProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const greeting = getGreeting(now.getHours());
  const firstName = nombre?.trim().split(/\s+/)[0] || '';
  const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(now);
  const dayMonth = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'long' }).format(now);
  const time = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  return (
    <div className="bo-welcome">
      <div className="bo-welcome-left">
        <span className="bo-welcome-eyebrow">{eyebrow}</span>
        <h2 className="bo-welcome-greeting">
          {greeting}
          {firstName ? `, ${firstName}` : ''} <span aria-hidden="true">👋</span>
        </h2>
      </div>
      <div className="bo-welcome-clock">
        <span className="bo-welcome-clock-icon">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div className="bo-welcome-date">
          <span className="bo-welcome-weekday">{weekday}</span>
          <span className="bo-welcome-day">{dayMonth}</span>
        </div>
        <span className="bo-welcome-time" aria-live="off">{time}</span>
      </div>
    </div>
  );
}
