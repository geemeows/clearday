import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { isAllowedEmail } from "#/lib/auth-gate";
import { supabase } from "#/lib/supabase";

export type AuthState = {
  session: Session | null;
  /** True until both the session and the allowed-email RPC have resolved. */
  loading: boolean;
  /** True only when a session exists AND its email matches the deployment's allowed_email. */
  allowed: boolean;
  /** True when a session exists but its email is NOT allowed. */
  rejected: boolean;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [allowedEmail, setAllowedEmail] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [allowedLoading, setAllowedLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    // Single source of truth: read the allowed email from Postgres via the
    // public allowed_email() RPC (granted to anon in 0002 migration).
    supabase.rpc("allowed_email").then(({ data }) => {
      setAllowedEmail(typeof data === "string" ? data : null);
      setAllowedLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const loading = sessionLoading || allowedLoading;
  const allowed = isAllowedEmail(session?.user?.email, allowedEmail);
  const rejected = !!session && !allowedLoading && !allowed;

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
