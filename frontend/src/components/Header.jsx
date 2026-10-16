import { cn } from './ui/utils';

const navClass = (active) => cn(
  'modern-nav-link',
  active && 'is-active'
);

export default function Header({ view }) {
  const section = view === 'kiosk' ? 'Attendance station' : view === 'mylogs' ? 'Employee self-service' : view === 'manage' ? 'Administration' : view === 'logs' ? 'Attendance records' : view === 'kpi' ? 'Attendance KPIs' : view === 'syslogs' ? 'System logs' : 'DTR workspace';
  return (
    <header className="modern-header print:hidden">
      <div className="modern-header-inner">
        <a href="/" className="modern-brand" aria-label="RMBGH Attendance home">
          <span className="modern-logo"><img src="/logo.png" alt="RMBGH logo" /></span>
          <span className="modern-brand-copy">
            <span className="modern-brand-title">RMBGH <span>Attendance</span></span>
            <span className="modern-brand-subtitle">Rosario Maclang Bautista General Hospital</span>
          </span>
        </a>
        <div className="modern-header-actions">
          <span className="modern-section-label">{section}</span>
          <nav className="modern-nav" aria-label="Main navigation">
            <a href="/" className={navClass(view === 'kiosk')}>Attendance</a>
            <a href="/?view=mylogs" className={navClass(view === 'mylogs')}>My DTR</a>
            <a href="/?view=manage" className={navClass(['manage','logs','dtr','kpi','syslogs'].includes(view))}>Admin</a>
          </nav>
        </div>
      </div>
    </header>
  );
}
