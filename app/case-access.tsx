'use client';
import { useEffect, useState, type ReactNode, type FormEvent } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export default function CaseAccess({ onUserChange, children }: { onUserChange: (id: string | null) => void; children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isSupabaseConfigured()) { setChecking(false); return; }
    let live = true;
    const apply = (id: string | null) => { if (live) { setUserId(id); onUserChange(id); setChecking(false); } };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user.id ?? null));
    return () => { live = false; subscription.unsubscribe(); };
  }, [onUserChange]);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: String(form.get('email')), password: String(form.get('password')) });
      if (error) throw error;
    } catch { setError('Sign-in failed. Check your credentials and project availability.'); }
    finally { setBusy(false); }
  }
  if (!isSupabaseConfigured()) return <p role="alert">Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) to use case intake.</p>;
  if (checking) return <p role="status">Checking sign-in…</p>;
  if (!userId) return <section className="case-access"><h1>Case management</h1><p>Sign in with your HNR Supabase account to access your cases.</p><form onSubmit={signIn}><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label><button disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form>{error && <p role="alert">{error}</p>}</section>;
  return <><div className="case-access"><button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const { error } = await supabase.auth.signOut(); if (error) throw error; } catch { setError('Sign-out failed. Try again.'); } finally { setBusy(false); } }}>Sign out</button>{error && <p role="alert">{error}</p>}</div>{children}</>;
}
