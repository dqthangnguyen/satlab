import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { checkIsAdmin, signInAnonymous } from "./auth";
import { supabase } from "./supabase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  error: Error | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (
    typeof reason === "object" &&
    reason !== null &&
    "message" in reason &&
    typeof reason.message === "string"
  ) {
    return new Error(reason.message);
  }
  return new Error("Unable to load authentication state.");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const anonymousSignInAttempt = useRef<Promise<User> | null>(null);
  const verifiedUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let revision = 0;
    let authChangeTimeout: ReturnType<typeof setTimeout> | null = null;

    const applySession = (
      session: Session | null,
      sessionRevision: number,
      allowVerifiedSessionReuse = false,
    ) => {
      if (!active || sessionRevision !== revision) return;

      const currentUser = session?.user ?? null;
      setUser(currentUser);
      setError(null);

      if (!currentUser || currentUser.is_anonymous) {
        verifiedUserId.current = null;
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const sessionIsValid =
        typeof session?.expires_at === "number" && session.expires_at * 1000 > Date.now();
      if (
        allowVerifiedSessionReuse &&
        verifiedUserId.current === currentUser.id &&
        sessionIsValid
      ) {
        return;
      }

      verifiedUserId.current = null;
      setIsAdmin(false);
      setLoading(true);
      void checkIsAdmin()
        .then((adminStatus) => {
          if (active && sessionRevision === revision) {
            verifiedUserId.current = currentUser.id;
            setIsAdmin(adminStatus);
          }
        })
        .catch((reason: unknown) => {
          if (active && sessionRevision === revision) {
            verifiedUserId.current = null;
            setIsAdmin(false);
            setError(toError(reason));
          }
        })
        .finally(() => {
          if (active && sessionRevision === revision) setLoading(false);
        });
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;

      const sessionRevision = ++revision;
      if (authChangeTimeout !== null) clearTimeout(authChangeTimeout);
      if (event === "SIGNED_OUT") {
        anonymousSignInAttempt.current = null;
        verifiedUserId.current = null;
        setUser(null);
        setIsAdmin(false);
        setError(null);
        setLoading(true);
      }

      authChangeTimeout = setTimeout(() => {
        authChangeTimeout = null;
        if (event !== "SIGNED_OUT") {
          const canReuseVerification =
            event === "SIGNED_IN" ||
            event === "TOKEN_REFRESHED" ||
            event === "USER_UPDATED";
          applySession(session, sessionRevision, canReuseVerification);
          return;
        }

        anonymousSignInAttempt.current = signInAnonymous();
        void anonymousSignInAttempt.current
          .then((anonymousUser) => {
            if (active && sessionRevision === revision) {
              setUser(anonymousUser);
              verifiedUserId.current = null;
              setIsAdmin(false);
              setError(null);
              setLoading(false);
            }
          })
          .catch((reason: unknown) => {
            if (active && sessionRevision === revision) {
              setUser(null);
              verifiedUserId.current = null;
              setIsAdmin(false);
              setError(toError(reason));
              setLoading(false);
            }
          });
      }, 0);
    });

    const initialRevision = revision;
    void supabase.auth
      .getSession()
      .then(async ({ data, error: sessionError }) => {
        if (!active || initialRevision !== revision) return;
        if (sessionError) throw sessionError;

        if (data.session) {
          applySession(data.session, initialRevision);
          return;
        }

        setLoading(true);
        if (!anonymousSignInAttempt.current) {
          anonymousSignInAttempt.current = signInAnonymous();
        }
        const anonymousUser = await anonymousSignInAttempt.current;
        if (!active || initialRevision !== revision) return;
        setUser(anonymousUser);
        verifiedUserId.current = null;
        setIsAdmin(false);
        setError(null);
        setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active || initialRevision !== revision) return;
        setUser(null);
        verifiedUserId.current = null;
        setIsAdmin(false);
        setError(toError(reason));
        setLoading(false);
      });

    return () => {
      active = false;
      revision += 1;
      if (authChangeTimeout !== null) clearTimeout(authChangeTimeout);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider.");
  return context;
}
