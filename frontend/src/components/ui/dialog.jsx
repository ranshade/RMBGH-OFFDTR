import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from './utils';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Accessible modal: Esc / overlay click closes, focus is trapped and restored, page scroll is locked.
export function Dialog({ open, onClose, title, description, children, className }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose; // keep latest handler without re-running the effect on every render

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('[data-autofocus]')?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') return closeRef.current();
      if (e.key !== 'Tab' || !ref.current) return undefined;
      const els = [...ref.current.querySelectorAll(FOCUSABLE)];
      if (!els.length) return undefined;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      return undefined;
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('relative z-10 max-h-[calc(100vh-2rem)] w-full overflow-y-auto rounded-xl border bg-card p-6 shadow-lg', /(^|\s)max-w-/.test(className || '') ? '' : 'max-w-md', className)}
      >
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <div className="mb-4 space-y-1.5 pr-6">
          <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
