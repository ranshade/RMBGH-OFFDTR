import { cn } from './ui/utils';

const link = (active) =>
  cn('rounded-md px-3 py-2 text-sm font-medium transition-colors',
    active ? 'bg-white text-primary shadow-sm' : 'text-white/90 hover:bg-white/15 hover:text-white');

export default function Header({ view }) {
  return (
    <header className="bg-gradient-to-r from-sky-600 to-sky-500 text-white shadow print:hidden">
      <div className="mx-auto flex max-w-9xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <a href="/" className="flex min-w-0 items-center gap-3">
          <img src="/logo.png" alt="RMBGH logo" className="h-11 w-11 shrink-0 rounded-full bg-white object-contain p-0.5 shadow-sm" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">Rosario Maclang Bautista General Hospital</h1>
            <p className="mt-0.5 text-xs text-white/85">Attendance Kiosk · Local station</p>
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
