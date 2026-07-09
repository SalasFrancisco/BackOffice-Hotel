// Minutos de inactividad antes de cerrar la sesión. Configurable por entorno
// (VITE_SESSION_TIMEOUT_MINUTES); si no se define o es inválido, se usan 15 min.
const parsedTimeoutMinutes = Number(import.meta.env?.VITE_SESSION_TIMEOUT_MINUTES);
const SESSION_INACTIVITY_TIMEOUT_MINUTES =
  Number.isFinite(parsedTimeoutMinutes) && parsedTimeoutMinutes > 0
    ? parsedTimeoutMinutes
    : 15;

export const SESSION_INACTIVITY_TIMEOUT_MS = SESSION_INACTIVITY_TIMEOUT_MINUTES * 60 * 1000;
// Cuánto antes de expirar se muestra el aviso previo de cierre por inactividad.
export const SESSION_INACTIVITY_WARNING_MS = Math.min(60 * 1000, SESSION_INACTIVITY_TIMEOUT_MS / 2);
export const SESSION_ACTIVITY_STORAGE_KEY = 'backoffice.session-activity';

const RECENT_SIGN_IN_GRACE_MS = 2 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

type SessionActivity = {
  userId: string;
  lastActivityAt: number;
};

type SessionIdentity = {
  user: {
    id: string;
    last_sign_in_at?: string | null;
  };
};

let memoryActivity: SessionActivity | null = null;

const parseStoredActivity = (value: string | null): SessionActivity | null => {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<SessionActivity>;
    if (
      typeof parsed.userId !== 'string'
      || typeof parsed.lastActivityAt !== 'number'
      || !Number.isFinite(parsed.lastActivityAt)
    ) {
      return null;
    }

    return {
      userId: parsed.userId,
      lastActivityAt: parsed.lastActivityAt,
    };
  } catch {
    return null;
  }
};

export const getSessionActivity = (userId: string) => {
  let storedActivity: SessionActivity | null = null;

  try {
    storedActivity = parseStoredActivity(window.localStorage.getItem(SESSION_ACTIVITY_STORAGE_KEY));
  } catch {
    // Fall back to the in-memory value below.
  }

  return [storedActivity, memoryActivity]
    .filter((activity): activity is SessionActivity => activity?.userId === userId)
    .sort((activityA, activityB) => activityB.lastActivityAt - activityA.lastActivityAt)[0] || null;
};

export const recordSessionActivity = (userId: string, now = Date.now()) => {
  const activity = { userId, lastActivityAt: now };
  memoryActivity = activity;

  try {
    window.localStorage.setItem(SESSION_ACTIVITY_STORAGE_KEY, JSON.stringify(activity));
  } catch {
    // The in-memory fallback still protects the current page session.
  }
};

export const clearSessionActivity = () => {
  memoryActivity = null;

  try {
    window.localStorage.removeItem(SESSION_ACTIVITY_STORAGE_KEY);
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
};

export const getSessionInactivityRemainingMs = (userId: string, now = Date.now()) => {
  const activity = getSessionActivity(userId);
  if (!activity || activity.lastActivityAt > now + CLOCK_SKEW_TOLERANCE_MS) {
    return 0;
  }

  return Math.max(0, SESSION_INACTIVITY_TIMEOUT_MS - (now - activity.lastActivityAt));
};

export const isSessionInactive = (userId: string, now = Date.now()) =>
  getSessionInactivityRemainingMs(userId, now) <= 0;

export const validateOrInitializeSessionActivity = (
  session: SessionIdentity,
  now = Date.now(),
) => {
  const lastSignInAt = Date.parse(session.user.last_sign_in_at || '');
  const isRecentSignIn = Number.isFinite(lastSignInAt)
    && lastSignInAt <= now + CLOCK_SKEW_TOLERANCE_MS
    && now - lastSignInAt <= RECENT_SIGN_IN_GRACE_MS;

  if (isRecentSignIn) {
    recordSessionActivity(session.user.id, now);
    return true;
  }

  return !isSessionInactive(session.user.id, now);
};
