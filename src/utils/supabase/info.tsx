const readRequiredPublicEnv = (value: unknown, name: string) => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  console.warn(`Missing required public environment variable: ${name}`);
  return '';
};

export const projectId = readRequiredPublicEnv(
  import.meta.env.VITE_SUPABASE_PROJECT_ID,
  'VITE_SUPABASE_PROJECT_ID',
);

export const publicAnonKey = readRequiredPublicEnv(
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  'VITE_SUPABASE_ANON_KEY',
);
