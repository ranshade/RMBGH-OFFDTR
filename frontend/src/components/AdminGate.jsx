import { useEffect, useState } from 'react';
import { API, jsonHeaders, adminFetch, getAdminToken, setAdminToken } from '../lib';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input, Label } from './ui/input';
import { Alert } from './ui/alert';
import { IconLock } from './ui/icons';

function AdminLogin({ onUnlock, notice }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState(notice || '');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch(`${API}/admin/login`, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ password }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Unable to sign in.');
      setAdminToken(d.token);
      onUnlock();
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Cannot reach the server. Check that Laravel is running.' : err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <form onSubmit={submit}>
          <CardHeader className="items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><IconLock width={22} height={22} /></div>
            <CardTitle className="pt-2 text-xl">Super admin access</CardTitle>
            <CardDescription>Employee Management is restricted. Enter the super admin password to continue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && <Alert variant="destructive">{error}</Alert>}
            <div className="space-y-2">
              <Label htmlFor="admin-pw">Password</Label>
              <div className="relative">
                <Input id="admin-pw" type={show ? 'text' : 'password'} autoFocus required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-16" placeholder="Enter password" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-3 text-xs font-medium text-primary">{show ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <Button type="submit" disabled={busy || !password} className="w-full">{busy ? 'Checking…' : 'Unlock'}</Button>
            <a href="/" className="block text-center text-sm text-muted-foreground hover:text-primary">← Back to attendance</a>
          </CardContent>
        </form>
      </Card>
    </main>
  );
}

/**
 * Password gate for everything under Admin (Employees + Logs).
 * Children receive { onLock, signOut }: onLock(msg) drops the session (e.g. expired token),
 * signOut() logs out on the server first and then drops it.
 */
export default function AdminGate({ children }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(!!getAdminToken());
  const [notice, setNotice] = useState('');

  // Re-validate an existing session token (e.g. after a page refresh).
  useEffect(() => {
    if (!getAdminToken()) return;
    adminFetch('/admin/check')
      .then((r) => setUnlocked(r.ok))
      .catch(() => setUnlocked(false))
      .finally(() => setChecking(false));
  }, []);

  function onLock(msg) {
    setAdminToken('');
    setNotice(msg || '');
    setUnlocked(false);
  }
  async function signOut() {
    try { await adminFetch('/admin/logout', { method: 'POST' }); } catch { /* ignore */ }
    onLock('');
  }

  if (checking) return <main className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Checking session…</main>;
  if (!unlocked) return <AdminLogin notice={notice} onUnlock={() => setUnlocked(true)} />;
  return children({ onLock, signOut });
}
