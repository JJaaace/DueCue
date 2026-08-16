import { ClerkProvider, SignIn, useAuth } from "@clerk/clerk-react";
import { useEffect, useState, type ReactNode } from "react";

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter = async () => null;

export function setAccessTokenGetter(getter: TokenGetter) {
  tokenGetter = getter;
}

export async function authorizationHeader() {
  const token = await tokenGetter();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function ClerkSessionGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => {
    setAccessTokenGetter(async () => getToken());
    setTokenReady(true);
    return () => { setAccessTokenGetter(async () => null); setTokenReady(false); };
  }, [getToken]);

  if (!isLoaded || !tokenReady) return <main className="auth-loading">Loading secure DueCue workspace…</main>;
  if (!isSignedIn) return <main className="auth-screen"><div><p>DueCue</p><h1>Sign in to your workspace</h1><span>Your coursework, cues, reminders, and calendar stay private to your account.</span><SignIn routing="hash" /></div></main>;
  return <>{children}</>;
}

export function DueCueAuth({ children }: { children: ReactNode }) {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    if (import.meta.env.PROD) return <main className="auth-screen"><div><p>DueCue</p><h1>Authentication is not configured</h1><span>This deployment needs a Clerk publishable key before it can load a private workspace.</span></div></main>;
    return <>{children}</>;
  }
  return <ClerkProvider publishableKey={publishableKey}><ClerkSessionGate>{children}</ClerkSessionGate></ClerkProvider>;
}
