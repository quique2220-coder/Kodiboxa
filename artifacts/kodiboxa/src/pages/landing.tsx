import { Link } from 'wouter';
import { ArrowRight, Eye, Mic2, Ticket, LayoutGrid } from 'lucide-react';
import { useWorkspace, fmtDate, fmtTime } from '@/lib/workspace';
import { PassCard, Pill } from '@/components/bits';
import { Skeleton } from '@/components/ui/skeleton';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Landing() {
  const { data: ws, isLoading } = useWorkspace();
  const sampleReg = ws?.registrations[0];
  const sampleEvent = ws?.events.find((e) => e.id === sampleReg?.eventId);
  return (
    <div className="min-h-[100dvh]">
      <div className="flex flex-wrap items-center justify-center gap-2 bg-tape px-4 py-2 text-center text-[13px] font-medium text-accent-foreground" data-testid="banner-public-preview">
        <Eye className="h-4 w-4" />
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em]">Public preview</span>
        <span>Everything below is an example workspace. It is read-only and contains no private records.</span>
      </div>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <div className="flex items-center gap-2.5">
          <img src={`${basePath}/logo.svg`} alt="" className="h-9 w-9" />
          <div className="leading-none"><div className="font-display text-lg font-extrabold">KODIBOXA</div><div className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground">by KODELOTH</div></div>
        </div>
        <div className="flex gap-2">
          <Link href="/sign-in" className="rounded-md px-4 py-2 text-sm font-semibold hover:bg-muted" data-testid="link-header-sign-in">Sign in</Link>
          <Link href="/sign-up" className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background" data-testid="link-header-sign-up">Create account</Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-8 md:grid-cols-[1.25fr_1fr] md:pt-14">
        <div className="rise">
          <div className="mb-5 font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Hybrid event operations</div>
          <h1 className="text-5xl font-extrabold leading-[0.95] md:text-7xl">Doors, stages<br />and questions.<br /><span className="text-primary">One desk.</span></h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">Organizers schedule rooms and scan passes. Presenters go live on cue and answer the room. Attendees carry a QR pass and a pocket schedule.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/sign-in" className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-semibold text-primary-foreground shadow-md" data-testid="link-hero-sign-in">Sign in to your workspace <ArrowRight className="h-4 w-4" /></Link>
            <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-3 font-semibold hover:bg-muted" data-testid="link-browse-preview"><Eye className="h-4 w-4" />Browse the example workspace</Link>
          </div>
        </div>
        <div className="rise relative" style={{ animationDelay: '120ms' }}>
          <div className="absolute -inset-6 -z-10 rounded-[2rem] dot-grid" />
          {isLoading ? <Skeleton className="mx-auto h-[440px] w-[320px] rounded-2xl" /> : sampleReg ? (
            <div className="rotate-[-3deg] transition-transform duration-500 hover:rotate-0"><PassCard reg={sampleReg} event={sampleEvent} roomName={ws?.rooms.find((room) => room.id === sampleReg.roomId)?.name} /></div>
          ) : null}
          <p className="mt-4 text-center font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Example pass / sample data</p>
        </div>
      </section>

      <section className="bg-sidebar py-16 text-sidebar-foreground">
        <div className="mx-auto max-w-6xl px-5">
          <div className="mb-8 flex items-end justify-between gap-4">
            <h2 className="text-3xl font-bold md:text-4xl">On the example board</h2>
            <span className="font-mono text-xs uppercase tracking-wider opacity-60">refreshes every 5s</span>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar-border md:grid-cols-2">
            {(ws?.sessions ?? []).slice(0, 6).map((s) => (
              <div key={s.id} className="flex items-center gap-4 bg-sidebar p-5" data-testid={`row-preview-session-${s.id}`}>
                <div className="w-16 font-mono text-sm tabular-nums text-sidebar-primary">{fmtTime(s.startsAt)}</div>
                <div className="min-w-0 flex-1"><div className="truncate font-semibold">{s.title}</div><div className="truncate text-xs opacity-60">{s.presenterName}</div></div>
                <Pill status={s.status} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[1fr_2fr]">
        <h2 className="text-3xl font-bold leading-tight md:text-4xl">Three seats at the same table.</h2>
        <div className="divide-y divide-border border-y border-border">
          {[
            { icon: LayoutGrid, who: 'Organizers', what: 'Create events and private meetings, open rooms, slot sessions, issue passes and run the door with a paste-or-scan check-in desk. Every change lands in the audit log.' },
            { icon: Mic2, who: 'Presenters', what: 'See only your sessions. Go live, watch a countdown that turns coral when you run over, and answer audience questions as they arrive.' },
            { icon: Ticket, who: 'Attendees', what: 'A phone-first view: what is on now, the schedule, a place to ask, the latest updates, and a personal QR pass.' },
          ].map((r) => (
            <div key={r.who} className="grid grid-cols-[40px_1fr] gap-4 py-6">
              <r.icon className="h-6 w-6 text-primary" />
              <div><div className="font-display text-xl font-bold">{r.who}</div><p className="mt-1 text-muted-foreground">{r.what}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <h2 className="mb-6 text-2xl font-bold">Example events</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {(ws?.events ?? []).slice(0, 3).map((e) => (
            <Link key={e.id} href={`/events/${e.id}`} className="rounded-xl border border-card-border bg-card p-5 transition-transform hover:-translate-y-0.5" data-testid={`link-preview-event-${e.id}`}>
              <div className="flex justify-between"><span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{e.type}</span><Pill status={e.status} /></div>
              <div className="mt-2 font-display text-lg font-bold">{e.title}</div>
              <div className="mt-1 font-mono text-xs text-muted-foreground">{fmtDate(e.startsAt)}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl font-bold">Straight answers about what is connected</h2>
          <p className="mt-2 max-w-3xl text-muted-foreground">Database and sign-in are live. The SRE agent demo runs against an isolated timer service with rule-based analysis, not a language model. Video, translation and SimpleX messaging are on the roadmap and show as setup status only.</p>
          <Link href="/platform" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary" data-testid="link-platform">See integration status <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="tape-stripe h-1.5" />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-muted-foreground">
          <span>KODIBOXA by KODELOTH</span>
          <Link href="/sign-up" className="font-semibold text-foreground" data-testid="link-footer-sign-up">Create an account</Link>
        </div>
      </footer>
    </div>
  );
}
