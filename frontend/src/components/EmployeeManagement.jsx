import { useEffect, useState } from 'react';
import { jsonHeaders, adminFetch } from '../lib';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Input, Label, Select } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Alert } from './ui/alert';
import { toast } from 'sonner';
import { Dialog } from './ui/dialog';
import { IconList, IconLock, IconPencil, IconPlus, IconSearch } from './ui/icons';

const emptyForm = { employee_no: '', full_name: '', status: 'active', password: '' };
const initials = (n) => n.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export default function EmployeeManagement({ onLock, signOut }) {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null); 
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const say = (text, type = 'success') => (type === 'error' ? toast.error(text) : toast.success(text));

  async function api(path, opts) {
    const r = await adminFetch(path, opts);
    if (r.status === 401) {
      onLock('Your session expired. Please sign in again.');
      throw new Error('locked');
    }
    return r;
  }

  async function load() {
    try {
      const r = await api(`/employees?all=1&search=${encodeURIComponent(search)}`);
      if (!r.ok) throw new Error();
      setEmployees(await r.json());
    } catch (e) {
      if (e.message !== 'locked') say('Unable to load records. Check that Laravel and MySQL are running.', 'error');
    }
  }
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [search]);

  function openAdd() {
    setForm(emptyForm);
    setFormError('');
    setShowPw(false);
    setDialog({ mode: 'add' });
  }
  function openEdit(emp) {
    setForm({ employee_no: emp.employee_no, full_name: emp.full_name, status: emp.status, password: '' });
    setFormError('');
    setShowPw(false);
    setDialog({ mode: 'edit', id: emp.id });
  }
  const closeDialog = () => !saving && setDialog(null);

  async function save(e) {
    e.preventDefault();
    const editing = dialog.mode === 'edit';
    setSaving(true);
    setFormError('');
    try {
      const body = editing
        ? { employee_no: form.employee_no.trim(), full_name: form.full_name, status: form.status, password: form.password || undefined }
        : { ...form, password: form.password || undefined };
      const res = await api(editing ? `/employees/${dialog.id}` : '/employees', {
        method: editing ? 'PUT' : 'POST',
        headers: jsonHeaders,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(Object.values(data.errors || {}).flat().join(' ') || data.message || 'Could not save employee.');
      setDialog(null);
      say(editing ? 'Employee updated.' : 'Employee added.');
      load();
    } catch (err) {
      if (err.message !== 'locked') setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(emp) {
    const next = emp.status === 'active' ? 'inactive' : 'active';
    try {
      const r = await api(`/employees/${emp.id}`, { method: 'PUT', headers: jsonHeaders, body: JSON.stringify({ status: next }) });
      if (!r.ok) throw new Error();
      say(`${emp.full_name} marked ${next}.`);
      load();
    } catch (e) {
      if (e.message !== 'locked') say('Unable to update employee status.', 'error');
    }
  }

  const active = employees.filter((e) => e.status === 'active').length;
  const stats = [['Total employees', employees.length, 'All records'], ['Active', active, 'Can record attendance'], ['Inactive', employees.length - active, 'Blocked from kiosk']];

  return (
    <main className="mx-auto w-full max-w-9xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Admin</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight">Employee Management</h2>
          <p className="mt-1 text-sm text-muted-foreground">Add employees, update details, and control who can record attendance.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge>Super admin</Badge>
          <Button onClick={() => { window.location.href = '/?view=logs'; }}><IconList /> View Logs</Button>
          <Button variant="outline" onClick={signOut}><IconLock /> Lock</Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map(([k, v, d]) => (
          <Card key={k}>
            <CardHeader tight><CardDescription className="font-medium">{k}</CardDescription></CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tracking-tight">{v}</p>
              <p className="mt-1 text-xs text-muted-foreground">{d}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader row>
          <div className="space-y-1.5">
            <CardTitle className="text-lg">Employee directory</CardTitle>
            <CardDescription>{employees.length} record(s)</CardDescription>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative flex-1 sm:w-72 sm:flex-none">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ID" aria-label="Search employees" />
            </div>
            <Button onClick={openAdd}><IconPlus /> Add employee</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-t">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-6">Employee</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${emp.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{initials(emp.full_name)}</div>
                        <span className="font-medium">{emp.full_name}</span>
                        {!emp.has_password && <Badge variant="secondary" className="px-1.5 text-[10px]">No passcode</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{emp.employee_no}</TableCell>
                    <TableCell><Badge variant={emp.status === 'active' ? 'default' : 'secondary'} className="capitalize">{emp.status}</Badge></TableCell>
                    <TableCell className="pr-6">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(emp)}><IconPencil width={14} height={14} /> Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleStatus(emp)}>{emp.status === 'active' ? 'Deactivate' : 'Activate'}</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {!employees.length && <p className="py-12 text-center text-sm text-muted-foreground">No employee records found.</p>}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={!!dialog}
        onClose={closeDialog}
        title={dialog?.mode === 'edit' ? 'Edit employee' : 'Add employee'}
        description={dialog?.mode === 'edit' ? 'Update the employee details below.' : 'Enter the details of the new employee.'}
      >
        <form onSubmit={save} className="space-y-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}
          <div className="space-y-2">
            <Label htmlFor="emp-no">Employee ID / Number *</Label>
            <Input id="emp-no" data-autofocus={dialog?.mode === 'add' ? '' : undefined} required value={form.employee_no} onChange={(e) => set('employee_no', e.target.value)} placeholder="e.g. RMBGH-001" />
            {dialog?.mode === 'edit' && <p className="text-xs text-muted-foreground">Changing the ID also updates this employee's attendance history.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp-name">Full name *</Label>
            <Input id="emp-name" data-autofocus={dialog?.mode === 'edit' ? '' : undefined} required value={form.full_name} onChange={(e) => set('full_name', e.target.value)} placeholder="Employee full name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp-pw">{dialog?.mode === 'edit' ? 'New passcode' : 'Passcode'}</Label>
            <Input id="emp-pw" type={showPw ? 'text' : 'password'} inputMode="numeric" autoComplete="off" minLength={3} maxLength={3} pattern="\d{3}" title="Exactly 3 digits" value={form.password} onChange={(e) => set('password', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder={dialog?.mode === 'edit' ? 'Leave blank to keep the current passcode' : '3 digits'} />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">3-digit passcode for <b>Time In / Time Out</b>. The employee also uses it to sign in to <b>My DTR</b> (own DTR only).</p>
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show</label>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="emp-status">Status</Label>
            <Select id="emp-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : dialog?.mode === 'edit' ? 'Save changes' : 'Add employee'}</Button>
          </div>
        </form>
      </Dialog>
    </main>
  );
}
