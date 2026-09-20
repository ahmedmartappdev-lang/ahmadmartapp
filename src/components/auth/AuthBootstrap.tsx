import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

/**
 * Ensures Supabase session is loaded + kept in sync for the whole app.
 * Without this, routes that only use useAuthStore (like ProtectedRoute)
 * may never resolve authLoading.
 */
export function AuthBootstrap() {
  const { setSession, setLoading } = useAuthStore();

  useEffect(() => {
    // Listener first (sync callback only)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    // Then fetch current session
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) console.error('AuthBootstrap getSession error:', error);
        setSession(session);
        setLoading(false);
      })
      .catch((err) => {
        console.error('AuthBootstrap getSession failed:', err);
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [setLoading, setSession]);

  return null;
}
