import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, QRCodeSVG } from './_router';
import { AlertTriangle, Lock, RotateCw, ScanLine, ShieldAlert } from 'lucide-react';
import type { Workspace, Registration, Event } from './_types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { useWorkspace, errorMessage, useCommand } from './_workspace';
import { cn } from '@/lib/utils';

export function PageHeader({ kicker, title, sub, actions }: { kicker?: string; title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rise mb-7 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {kicker && <div className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{kicker}</div>}
        <h1 className="text-3xl font-bold leading-none md:text-[40px]" data-testid="text-page-title">{title}</h1>
        {sub && <p className="mt-2.5 max-w-2xl text-sm text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const pill: Record<string, string> = {
  live: 'bg-live/12 text-live border-live/30',
  upcoming: 'bg-primary/10 text-primary border-primary/25',
  scheduled: 'bg-primary/10 text-primary border-primary/25',
  draft: 'bg-muted text-muted-foreground border-border',
  completed: 'bg-ok/10 text-ok border-ok/25',
  ended: 'bg-muted text-muted-foreground border-border',
  open: 'bg-tape/15 text-foreground border-tape/40',
  answered: 'bg-ok/10 text-ok border-ok/25',
  dismissed: 'bg-muted text-muted-foreground border-border',
  connected: 'bg-ok/10 text-ok border-ok/25',
  demo: 'bg-tape/15 text-foreground border-tape/40',
  planned: 'bg-primary/10 text-primary border-primary/25',
  unavailable: 'bg-muted text-muted-foreground border-border',
  awaiting_approval: 'bg-live/12 text-live border-live/30',
  resolved: 'bg-ok/10 text-ok border-ok/25',
  in: 'bg-ok/10 text-ok border-ok/25',
  out: 'bg-muted text-muted-foreground border-border',
};

export function Pill({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <span
      data-testid={`status-${status}`}
      className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wider', pill[status] ?? pill.draft, className)}
    >
      {status === 'live' && <span className="onair-dot h-1.5 w-1.5 rounded-full bg-live" />}
      {label ?? status.replace(/_/g, ' ')}
    </span>
  );
}

export function Panel({ title, meta, children, className, action }: { title?: ReactNode; meta?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn('rise rounded-xl border border-card-border bg-card shadow-sm', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-card-border px-5 py-3.5">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            {meta && <span className="font-mono text-[11px] text-muted-foreground">{meta}</span>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center" data-testid="state-empty">
      <div className="dot-grid mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-dashed border-border text-muted-foreground">{icon}</div>
      <div className="font-display text-lg font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function LoadingPage() {
  return (
    <div className="space-y-6" data-testid="state-loading">
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-72" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border border-destructive/30 bg-card p-8 text-center" data-testid="state-error">
      <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
      <h2 className="text-xl font-semibold">The workspace did not load</h2>
      <p className="mt-1 text-sm text-muted-foreground">{errorMessage(error)}</p>
      <Button className="mt-5" onClick={retry} data-testid="button-retry"><RotateCw className="mr-2 h-4 w-4" />Try again</Button>
    </div>
  );
}

export function WS({ children }: { children: (ws: Workspace) => ReactNode }) {
  const q = useWorkspace();
  if (q.isLoading) return <LoadingPage />;
  if (q.isError || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return <>{children(q.data)}</>;
}

export function SignInToAct({ label = 'Sign in to make changes' }: { label?: string }) {
  return (
    <Link href="/sign-in" className="inline-flex h-9 items-center gap-2 rounded-md border border-dashed border-primary/40 px-3 text-sm font-medium text-primary hover:bg-primary/5" data-testid="link-signin-to-act">
      <Lock className="h-3.5 w-3.5" />{label}
    </Link>
  );
}

export function AdminWarning({ ws }: { ws: Workspace }) {
  if (ws.adminConfigured) return null;
  return (
    <div className="rise mb-6 flex gap-3 overflow-hidden rounded-xl border border-tape/50 bg-tape/10 p-4" data-testid="banner-admin-not-configured">
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-foreground" />
      <div className="text-sm">
        <div className="font-semibold">No administrator is configured</div>
        <p className="text-muted-foreground">
          Organizer actions stay locked until the server operator designates an administrator email. Accounts cannot promote themselves, so this has to be set on the server.
        </p>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'live' | 'ok' | 'tape' }) {
  return (
    <div className="rise relative overflow-hidden rounded-xl border border-card-border bg-card px-4 py-4">
      <span className={cn('absolute left-0 top-0 h-full w-1', tone === 'live' ? 'bg-live' : tone === 'ok' ? 'bg-ok' : tone === 'tape' ? 'bg-tape' : 'bg-primary')} />
      <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-display text-3xl font-bold tabular-nums" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function PassCard({ reg, event }: { reg: Registration; event?: Event }) {
  return (
    <div className="relative mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl border border-card-border bg-card shadow-lg" data-testid={`card-pass-${reg.id}`}>
      <div className="tape-stripe h-3" />
      <div className="mx-auto mt-3 h-2.5 w-14 rounded-full bg-background ring-1 ring-border" />
      <div className="px-6 pb-6 pt-4 text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{event?.type ?? 'event'} pass</div>
        <div className="mt-1 font-display text-lg font-bold leading-tight">{event?.title ?? 'Event'}</div>
        <div className="mx-auto my-4 w-fit rounded-xl bg-[hsl(40_40%_98%)] p-3">
          <QRCodeSVG value={reg.passCode} size={168} fgColor="#18203f" bgColor="transparent" level="M" />
        </div>
        <div className="font-display text-xl font-semibold">{reg.name}</div>
        <div className="mt-1 font-mono text-sm tracking-[0.25em] text-primary" data-testid="text-pass-code">{reg.passCode}</div>
        <div className="mt-3"><Pill status={reg.checkedIn ? 'in' : 'out'} label={reg.checkedIn ? 'checked in' : 'not checked in'} /></div>
      </div>
    </div>
  );
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

export function CheckInDesk({ canAct }: { canAct: boolean }) {
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const cmd = useCommand();
  const supported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const Ctor = (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector;
        const det = new Ctor({ formats: ['qr_code'] });
        const loop = async () => {
          if (stopped || !videoRef.current) return;
          const r = await det.detect(videoRef.current).catch(() => []);
          if (r[0]?.rawValue) {
            setCode(r[0].rawValue.trim());
            setScanNote('Code captured. Confirm check-in or check-out.');
            setScanning(false);
            return;
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        setScanNote('Camera access was blocked or is unavailable. Paste the code instead.');
        setScanning(false);
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning]);

  const act = (action: 'check_in' | 'check_out') => {
    const passCode = code.trim();
    if (!passCode) return;
    cmd.run({ action, passCode }, () => setCode(''));
  };

  return (
    <div className="space-y-3 p-5">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Paste or type pass code"
          className="font-mono tracking-widest"
          data-testid="input-pass-code"
          onKeyDown={(e) => e.key === 'Enter' && canAct && act('check_in')}
        />
        {canAct ? (
          <div className="flex gap-2">
            <Button onClick={() => act('check_in')} disabled={!code.trim() || cmd.pending} className="bg-ok text-white hover:bg-ok/90" data-testid="button-check-in">Check in</Button>
            <Button variant="outline" onClick={() => act('check_out')} disabled={!code.trim() || cmd.pending} data-testid="button-check-out">Check out</Button>
          </div>
        ) : <SignInToAct label="Admin sign-in required" />}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {supported ? (
          <Button size="sm" variant="ghost" onClick={() => setScanning((s) => !s)} disabled={!canAct} data-testid="button-scan">
            <ScanLine className="mr-1.5 h-4 w-4" />{scanning ? 'Stop camera' : 'Scan with camera'}
          </Button>
        ) : (
          <span data-testid="text-scanner-unsupported">This browser does not support QR scanning. Paste the code printed under the QR instead.</span>
        )}
        {scanNote && <span>{scanNote}</span>}
      </div>
      {scanning && (
        <div className="relative overflow-hidden rounded-xl border border-border bg-sidebar">
          <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-tape/80" />
        </div>
      )}
    </div>
  );
}
