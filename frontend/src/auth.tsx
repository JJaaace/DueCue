import { ClerkProvider, SignInButton, SignUpButton, UserButton, useAuth, useUser } from "@clerk/clerk-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { StartupScreen } from "./components/StartupScreen";

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
  const { user } = useUser();
  const [tokenReady, setTokenReady] = useState(false);
  useEffect(() => {
    setAccessTokenGetter(async () => getToken());
    setTokenReady(true);
    return () => { setAccessTokenGetter(async () => null); setTokenReady(false); };
  }, [getToken]);

  if (!isLoaded || !tokenReady) return <StartupScreen />;
  const displayName = user?.firstName ?? user?.fullName?.split(/\s+/)[0] ?? null;
  return <AuthContext.Provider value={{ isSignedIn: Boolean(isSignedIn), clerkConfigured: true, displayName }}>{children}</AuthContext.Provider>;
}

type AuthState = { isSignedIn: boolean; clerkConfigured: boolean; displayName: string | null };
const AuthContext = createContext<AuthState>({ isSignedIn: false, clerkConfigured: false, displayName: null });
export const useDueCueAuth = () => useContext(AuthContext);

export function AccountActions({ prominent = false }: { prominent?: boolean }) {
  const auth = useDueCueAuth();
  if (!auth.clerkConfigured) return <span className="account-unavailable">Sign-in setup pending</span>;
  if (auth.isSignedIn) return <div className="account-actions"><span>Private workspace</span><UserButton /></div>;
  return <div className={`account-actions ${prominent ? "prominent" : ""}`}><SignInButton mode="modal"><button type="button" className="account-signin">Sign in</button></SignInButton><SignUpButton mode="modal"><button type="button" className="account-signup">Create account</button></SignUpButton></div>;
}

export function DueCueAuth({ children }: { children: ReactNode }) {
  const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return <AuthContext.Provider value={{ isSignedIn: false, clerkConfigured: false, displayName: null }}>{children}</AuthContext.Provider>;
  }
  return <ClerkProvider publishableKey={publishableKey}><ClerkSessionGate>{children}</ClerkSessionGate></ClerkProvider>;
}
