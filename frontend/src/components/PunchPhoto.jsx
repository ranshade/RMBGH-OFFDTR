import { useEffect, useRef, useState } from 'react';
import { adminFetch } from '../lib';

// Photos are private, so they are fetched with the admin token and shown from a blob URL.
// Cached per record so filtering/paging doesn't re-download them.
const cache = new Map();

async function loadPhoto(uuid) {
  if (cache.has(uuid)) return cache.get(uuid);
  const r = await adminFetch(`/attendance/${uuid}/photo`);
  if (!r.ok) throw new Error('photo');
  const url = URL.createObjectURL(await r.blob());
  cache.set(uuid, url);
  return url;
}

function usePhoto(uuid, enabled) {
  const [state, setState] = useState(() => ({ src: cache.get(uuid) || '', error: false }));
  useEffect(() => {
    if (!enabled || state.src) return undefined;
    let alive = true;
    loadPhoto(uuid)
      .then((src) => alive && setState({ src, error: false }))
      .catch(() => alive && setState({ src: '', error: true }));
    return () => { alive = false; };
  }, [uuid, enabled]);
  return state;
}

// Small clickable thumbnail; only downloads once it scrolls into view.
export function PunchPhoto({ uuid, label, onOpen }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(cache.has(uuid));
  const { src, error } = usePhoto(uuid, visible);

  useEffect(() => {
    if (visible || !ref.current) return undefined;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => src && onOpen()}
      disabled={!src}
      aria-label={`View photo: ${label}`}
      className="h-9 w-9 shrink-0 overflow-hidden rounded-md border bg-muted transition hover:ring-2 hover:ring-ring disabled:cursor-default disabled:hover:ring-0"
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">{error ? 'N/A' : ''}</span>
      )}
    </button>
  );
}

// Large view of one photo (used inside a Dialog).
export function PhotoViewer({ uuid }) {
  const { src, error } = usePhoto(uuid, true);
  if (error) return <p className="py-10 text-center text-sm text-muted-foreground">Photo not available.</p>;
  if (!src) return <p className="py-10 text-center text-sm text-muted-foreground">Loading photo…</p>;
  return <img src={src} alt="Attendance photo" className="max-h-[70vh] w-full rounded-lg bg-slate-900 object-contain" />;
}
