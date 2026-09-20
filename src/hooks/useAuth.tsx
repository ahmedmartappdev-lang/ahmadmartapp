import { useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

// Supabase's Google OAuth web client id — the audience for native ID tokens.
// Client ids are public identifiers (they appear in every OAuth URL).
const GOOGLE_WEB_CLIENT_ID = '241902797444-a09gu3513k8r0cm1rs1e2khsh4l5vk3v.apps.googleusercontent.com';

export function useAuth() {
  const { user, session, isLoading, setSession, setLoading } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [setSession, setLoading]);

  const sendOtp = useCallback(async (phone: string, role?: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { phone, role },
      });

      if (error) {
        // Parse error body from edge function non-2xx responses
        let errorMessage = 'Failed to send OTP';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body?.error) errorMessage = body.error;
          } else if (error.message) {
            errorMessage = error.message;
          }
        } catch {
          // ignore parse errors
        }
        return { success: false, error: errorMessage };
      }

      if (data?.error) {
        return { success: false, error: data.error };
      }

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message || 'Network error' };
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, otp: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { phone, otp },
      });

      if (error) {
        // Parse the actual error body from the edge function response
        let errorMessage = 'Verification failed. Please try again.';
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json();
            if (body?.error) errorMessage = body.error;
          }
        } catch {
          // ignore parse errors, use default message
        }
        return { success: false, error: errorMessage };
      }

      if (data?.error) {
        return { success: false, error: data.error };
      }

      // Set session in Supabase client
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (sessionError) {
        return { success: false, error: 'Failed to establish session' };
      }

      return { success: true, error: null };
    } catch (error: any) {
      return { success: false, error: error.message || 'Network error' };
    }
  }, []);

  const signInWithGoogle = useCallback(async (role: string) => {
    try {
      // Inside the Android/iOS app: use the OS-native Google account sheet
      // (no browser) and hand the resulting ID token straight to Supabase.
      if (Capacitor.isNativePlatform()) {
        const { SocialLogin } = await import('@capgo/capacitor-social-login');
        await SocialLogin.initialize({
          google: { webClientId: GOOGLE_WEB_CLIENT_ID },
        });
        // No explicit scopes: email/profile are included by default, and the
        // plugin requires a native MainActivity change if scopes are passed.
        const res = await SocialLogin.login({
          provider: 'google',
          options: {},
        });
        const idToken = (res.result as any)?.idToken;
        if (!idToken) {
          return { error: 'Google sign-in was cancelled or returned no token' };
        }
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });
        if (error) {
          return { error: error.message };
        }
        // The web flow lands on /auth?role=… via the OAuth redirect; mirror
        // that here so the same role-validation effect runs.
        navigate(`/auth?role=${role}`);
        return { error: null };
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth?role=${role}`,
        },
      });
      if (error) {
        return { error: error.message };
      }
      return { error: null };
    } catch (err: any) {
      return { error: err.message || 'Failed to initiate Google sign in' };
    }
  }, [navigate]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      navigate('/auth');
    }
    return { error };
  }, [navigate]);

  return {
    user,
    session,
    isLoading,
    sendOtp,
    verifyOtp,
    signInWithGoogle,
    signOut,
    isAuthenticated: !!session,
  };
}

export function useRequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [isAuthenticated, isLoading, navigate]);

  return { isLoading };
}
