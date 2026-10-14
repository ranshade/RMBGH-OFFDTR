import { useCallback, useEffect, useRef, useState } from 'react';
import { API, STATION } from '../lib';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Input, Label } from './ui/input';
import { toast } from 'sonner';

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="text-right">
      <p className="text-xl font-bold tabular-nums tracking-tight">{now.toLocaleTimeString()}</p>
      <p className="text-xs text-muted-foreground">
        {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      </p>
    </div>
  );
}

const eventVariant = (ev) => (ev === 'TIME IN' ? 'default' : 'warning');

export default function AttendanceKiosk() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const idRef = useRef(null);
  const photoUrlRef = useRef('');
  const lookupSeq = useRef(0);

  const [cameraState, setCameraState] = useState('starting'); // starting | ready | error
  const [employeeNo, setEmployeeNo] = useState('');
  const [employee, setEmployee] = useState(null);
  const [lookup, setLookup] = useState('idle'); // idle | checking | notfound | error
  const [nextEvent, setNextEvent] = useState('TIME IN');
  const [busy, setBusy] = useState(false);
  const [latest, setLatest] = useState(null);
  const [apiStatus, setApiStatus] = useState('Checking…');

  // Camera is always on.
  const startCamera = useCallback(async () => {
    setCameraState('starting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      stream.getVideoTracks()[0].onended = () => setCameraState('error');
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setCameraState('ready');
    } catch {
      setCameraState('error');
    }
  }, []);

  useEffect(() => {
    startCamera();
    fetch(`${API}/health`)
      .then((r) => r.json())
      .then((d) => setApiStatus(d.ok ? 'Connected' : 'Unavailable'))
      .catch(() => setApiStatus('API unavailable'));
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, [startCamera]);

  // Identify the employee automatically while typing (and instantly on Enter).
  async function identify(raw) {
    const no = raw.trim();
    const seq = ++lookupSeq.current;
    if (!no) {
      setEmployee(null);
      setLookup('idle');
      return;
    }
    setLookup('checking');
    try {
      const r = await fetch(`${API}/employees?search=${encodeURIComponent(no)}`);
      if (!r.ok) throw new Error();
      const list = await r.json();
      const found = list.find((x) => x.employee_no.toLowerCase() === no.toLowerCase());
      if (seq !== lookupSeq.current) return;
      if (!found) {
        setEmployee(null);
        setLookup('notfound');
        return;
      }
      const n = await fetch(`${API}/attendance/next?employee_no=${encodeURIComponent(found.employee_no)}`);
      const nd = await n.json();
      if (seq !== lookupSeq.current) return;
      setEmployee(found);
      setNextEvent(nd.next_event || 'TIME IN');
      setLookup('idle');
    } catch {
      if (seq !== lookupSeq.current) return;
      setEmployee(null);
      setLookup('error');
    }
  }

  useEffect(() => {
    const t = setTimeout(() => identify(employeeNo), 400);
    return () => clearTimeout(t);
  }, [employeeNo]);

  function captureFrame() {
    return new Promise((resolve, reject) => {
      const v = videoRef.current;
      if (!v?.videoWidth) return reject(new Error('Camera is not ready yet. Please wait for the preview.'));
      const c = document.createElement('canvas');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not capture photo.'))), 'image/jpeg', 0.88);
    });
  }

  async function confirmAndSave() {
    if (!employee || busy) return;
    setBusy(true);
    try {
      const blob = await captureFrame();
      const f = new FormData();
      f.append('employee_no', employee.employee_no);
      f.append('device_time', new Date().toISOString());
      f.append('station_code', STATION);
      f.append('photo', blob, `${employee.employee_no}-${Date.now()}.jpg`);

      const r = await fetch(`${API}/attendance`, { method: 'POST', body: f, headers: { Accept: 'application/json' } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || 'Attendance was not saved.');

      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
      photoUrlRef.current = URL.createObjectURL(blob);
      setLatest({ employee: d.employee || employee, record: d.record, photo: photoUrlRef.current });
      toast.success('Attendance saved successfully.');
      lookupSeq.current++;
      setEmployeeNo('');
      setEmployee(null);
      setLookup('idle');
      idRef.current?.focus();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const canSave = !!employee && cameraState === 'ready' && !busy;
  const lookupText = { checking: 'Checking…', notfound: 'Employee not found or inactive. Contact the authorized administrator.', error: 'Cannot reach employee records. Check that Laravel and MySQL are running.' }[lookup];

  return (
    <main className="attendance-main flex w-full flex-1 flex-col px-4 py-5 sm:px-6">
      <Card className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Attendance</h2>
            <p className="text-sm text-muted-foreground">Enter your ID, face the camera, then confirm to save.</p>
          </div>
          <Clock />
        </div>

        <div className="grid flex-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
          {/* LEFT: ID + camera + confirm */}
          <div className="flex flex-col gap-4 p-5 sm:p-6">
            <div className="space-y-2">
              <Label htmlFor="employee-id">Employee ID Number</Label>
              <form onSubmit={(e) => { e.preventDefault(); identify(employeeNo); }}>
                <Input
                  id="employee-id"
                  ref={idRef}
                  autoFocus
                  autoComplete="off"
                  value={employeeNo}
                  onChange={(e) => setEmployeeNo(e.target.value)}
                  placeholder="Enter your employee ID number"
                  className="h-12 text-base"
                />
              </form>
              <p className={`h-4 text-xs ${lookup === 'notfound' || lookup === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{lookupText}</p>
            </div>

            {/* Always-on camera: fills the remaining height */}
            <div className="relative min-h-[340px] flex-1 overflow-hidden rounded-xl border bg-slate-900 lg:min-h-[460px]">
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
              {cameraState !== 'ready' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/90 p-6 text-center text-sm text-slate-200">
                  {cameraState === 'starting' ? (
                    <p>Starting camera…</p>
                  ) : (
                    <>
                      <p className="max-w-xs">Camera unavailable. Allow camera access in your browser, then try again.</p>
                      <Button variant="outline" onClick={startCamera}>Retry camera</Button>
                    </>
                  )}
                </div>
              )}
              {cameraState === 'ready' && (
                <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white">
                  <span className="h-2 w-2 rounded-full bg-sky-400" /> Live
                </span>
              )}
            </div>

            <div>
              <Button size="lg" disabled={!canSave} onClick={confirmAndSave} className="h-14 w-full text-base">
                {busy ? 'Saving attendance…' : 'Confirm and Save Attendance'}
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">A photo is taken automatically when you confirm. Follow hospital photo and privacy policies.</p>
            </div>
          </div>

          {/* RIGHT: attendance result */}
          <div className="flex flex-col border-t bg-muted/40 p-5 sm:p-6 lg:border-l lg:border-t-0">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">{employee ? 'Employee identified' : 'Latest punch'}</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight">Attendance Result</h3>

            <div className="mt-4 flex flex-1 flex-col">
              {employee ? (
                <Card className="flex flex-1 flex-col items-center justify-center border-primary/30 px-6 py-10 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                    {employee.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                  </div>
                  <h4 className="mt-4 text-xl font-bold tracking-tight">{employee.full_name}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{employee.employee_no}</p>
                  <p className="mt-6 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Next attendance event</p>
                  <Badge variant={eventVariant(nextEvent)} className="mt-1.5 px-5 py-1.5 text-lg">{nextEvent}</Badge>
                  <p className="mt-6 max-w-xs text-sm text-muted-foreground">Look at the camera, then press <b className="text-foreground">Confirm and Save Attendance</b>.</p>
                </Card>
              ) : latest ? (
                <Card className="flex flex-1 flex-col overflow-hidden">
                  {/* Photo fills whatever height is left, but is absolutely positioned so it never stretches the container */}
                  <div className="relative min-h-[180px] flex-1 bg-slate-900">
                    <img src={latest.photo} alt="Saved attendance" className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="truncate text-lg font-bold tracking-tight">{latest.employee.full_name}</h4>
                        <p className="text-sm text-muted-foreground">{latest.employee.employee_no}</p>
                      </div>
                      <Badge variant={eventVariant(latest.record.event_type)} className="shrink-0">{latest.record.event_type}</Badge>
                    </div>
                    <dl className="mt-4 divide-y overflow-hidden rounded-lg border text-sm">
                      {[
                        ['Date', new Date(latest.record.recorded_at).toLocaleDateString()],
                        ['Time', new Date(latest.record.recorded_at).toLocaleTimeString()],
                        ['Station', latest.record.station_code || STATION],
                      ].map(([k, v]) => (
                        // The time is what staff look for after punching, so it stands out in sky blue.
                        <div key={k} className={k === 'Time' ? 'flex items-center justify-between bg-sky-100 px-4 py-3.5' : 'flex justify-between px-4 py-2.5'}>
                          <dt className={k === 'Time' ? 'font-semibold text-sky-800' : 'text-muted-foreground'}>{k}</dt>
                          <dd className={k === 'Time' ? 'text-lg font-bold tabular-nums text-sky-900' : 'font-medium'}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </Card>
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed bg-card px-6 py-10 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-xl text-primary">✓</div>
                  <h4 className="mt-3 font-semibold">No punch recorded yet</h4>
                  <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Enter your employee ID and your name will appear here. After you confirm, the photo, punch type, date, and time are shown.</p>
                </div>
              )}
            </div>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Station <b className="text-foreground">{STATION}</b> · Database <b className="text-foreground">{apiStatus}</b>
            </p>
          </div>
        </div>
      </Card>
    </main>
  );
}
