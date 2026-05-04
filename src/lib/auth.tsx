import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { env } from "#/env";
import { isAllowedEmail } from "#/lib/auth-gate";
import { supabase } from "#/lib/supabase";

export type AuthState = {
  session: Session | null;
  loading: boolean;
  /** True only when a session exists AND its email matches VITE_ALLOWED_EMAIL. */
  allowed: boolean;
  /** True when a session exists but its email is NOT allowed. */
  rejected: boolean;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const allowed = isAllowedEmail(session?.user?.email, env.VITE_ALLOWED_EMAIL);
  const rejected = !!session && !allowed;

  return (
    <AuthContext.Provider value={{ session, loading, allowed, rejected }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}
