import { cn } from './ui/utils';

const link = (active) =>
  cn('rounded-md px-3.5 py-2 text-sm font-medium transition-colors',
    active ? 'bg-sky-50 text-sky-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900');

export default function Header({ view }) {
  return (
    <header className="border-b border-slate-200 bg-white print:hidden">
      <div className="h-0.5 bg-sky-600" />
      <div className="mx-auto flex max-w-9xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
        <a href="/" className="flex min-w-0 items-center gap-3.5">
          <img src="/logo.png" alt="RMBGH logo" className="h-10 w-10 shrink-0 rounded-full bg-white object-contain ring-1 ring-slate-200" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900 sm:text-[17px]">Rosario Maclang Bautista General Hospital</h1>
            <p className="mt-0.5 text-xs text-slate-500">Attendance Kiosk · Local station</p>
          </div>
        </a>
        <nav className="flex items-center gap-1" aria-label="Main">
          <a href="/" className={link(view === 'kiosk')}>Attendance</a>
          <a href="/?view=mylogs" className={link(view === 'mylogs')}>My Logs</a>
          <a href="/?view=manage" className={link(view === 'manage' || view === 'logs' || view === 'dtr')}>Admin</a>
        </nav>
      </div>
    </header>
  );
}
