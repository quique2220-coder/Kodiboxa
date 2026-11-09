import type { ReactNode } from 'react';
import { Link, Redirect } from 'wouter';
import { ArrowUpRight, CalendarRange, Radio, Ticket, MessageCircleQuestion, Users, ScrollText } from 'lucide-react';
import { WS, Pill, Empty, AdminWarning } from '@/components/bits';
import { AnnouncementList } from '@/components/qa';
import { access, fmtTime, fmtDay, fmtStamp } from '@/lib/workspace';
import { usePrefs } from '@/lib/prefs';
import { cn } from '@/lib/utils';
import '@/components/dashboard-experience.css';

import kodeSmall from '@/assets/kode-studio-avatar.webp';
import KodeGills from '@/components/kode-gills';

function Box({ title, meta, action, children, className }: { title: string; meta?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('kx-card overflow-hidden', className)}>
      <header className="flex items-center justify-between gap-3 border-b border-card-border px-5 py-3.5">
        <div className="flex items-baseline gap-2.5"><h2 className="text-[15px] font-semibold">{title}</h2>{meta && <span className="font-mono text-[11px] text-muted-foreground">{meta}</span>}</div>
        {action}
      </header>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { hour24 } = usePrefs();
  return (
    <WS>
      {(ws) => {
        const a = access(ws);
        if (a.signedIn && a.role === 'participant') return <Redirect to="/participant" />;
        const s = ws.summary;
        const live = ws.sessions.filter((x) => x.status === 'live');
        const next = ws.sessions.filter((x) => x.status === 'scheduled').sort((x, y) => x.startsAt.localeCompare(y.startsAt)).slice(0, 6);
        const rate = s.registrations ? ((s.checkedIn / s.registrations) * 100).toFixed(1) : '0.0';
        const room = (id: string) => ws.rooms.find((r) => r.id === id)?.name ?? 'Room';
        const hint = live.length
          ? `${live.length} ${live.length === 1 ? 'session is' : 'sessions are'} live. ${s.openQuestions} questions are waiting for answers.`
          : next[0] ? `Stages are quiet. Up next: "${next[0].title}" at ${fmtTime(next[0].startsAt, hour24)}.` : 'No sessions scheduled. Create an event to get started.';
        const stats = [
          { label: 'Events', value: s.events, tone: 'kx-cyan' },
          { label: 'Live now', value: s.liveEvents, sub: 'events on air', tone: 'text-live' },
          { label: 'Registered', value: s.registrations, tone: 'kx-violet' },
          { label: 'Checked in', value: s.checkedIn, sub: `${rate}% of passes`, tone: 'text-ok' },
          { label: 'Open questions', value: s.openQuestions, tone: 'kx-violet' },
        ];
        return (
          <div className="kx">
            <section className="kx-band mb-5 rounded-3xl">
              <div className="relative p-5 md:p-6">
                <div className="min-w-0">
                  <span className="kx-chip" data-testid="text-dashboard-mode">{a.signedIn ? `Operations · role ${a.role}` : 'Operations · sample workspace'}</span>
                  <h1 className="mt-2 text-2xl font-extrabold leading-tight md:text-3xl">Operations overview</h1>
                  <p className="mt-1 text-sm opacity-75">Doors, stages and questions across every event, refreshed every five seconds.</p>
                  <div className="mt-3 flex max-w-xl items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3" data-testid="text-kode-hint">
                    <img src={kodeSmall} alt="KODELOTH" className="h-8 w-8 shrink-0 object-contain" />
                    <p className="text-[13.5px] leading-snug"><span className="font-semibold text-[hsl(186_95%_70%)]">KODELOTH:</span> {hint}</p>
                  </div>
                </div>
                <div className="kode-swim-lane" data-testid="kodeloth-swim-lane">
                  <div className="kode-swim-traveler kx-mascot" data-testid="kodeloth-swimmer">
                    <div role="img" aria-label="KODELOTH swimming from one side of the banner to the other" className="kode-swim w-full"><KodeGills className="h-auto w-full" /></div>
                  </div>
                  <span className="kode-motion-label kode-swim-status" data-testid="kodeloth-motion-status"><span className="kode-motion-running">Swimming</span><span className="kode-motion-reduced">Reduced motion</span></span>
                </div>
              </div>
            </section>
            <AdminWarning ws={ws} />
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
              {stats.map((x) => (
                <div key={x.label} className="kx-card px-4 py-3.5">
                  <div className="kx-kicker">{x.label}</div>
                  <div className={cn('mt-1 font-display text-3xl font-bold tabular-nums', x.tone)} data-testid={`stat-${x.label.toLowerCase().replace(/\s+/g, '-')}`}>{x.value}</div>
                  {x.sub && <div className="text-xs text-muted-foreground">{x.sub}</div>}
                </div>
              ))}
            </div>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { href: '/participants', label: 'Check-in desk', icon: Users, show: a.isAdmin || a.preview },
                { href: '/presenter', label: 'Presenter desk', icon: MessageCircleQuestion, show: a.isPresenter || a.preview },
                { href: '/events', label: 'Manage events', icon: CalendarRange, show: true },
                { href: '/participant', label: 'View as attendee', icon: Ticket, show: true },
              ].filter((q) => q.show).map((q, i) => (
                <Link key={q.href} href={q.href} data-testid={`link-quick-${q.href.slice(1)}`} className="kx-card kx-link group flex items-center gap-3 p-3.5">
                  <span className={cn('kx-icon h-9 w-9', i % 2 === 0 && 'kx-icon-cyan')}><q.icon className="h-4 w-4" /></span>
                  <span className="flex-1 text-sm font-semibold">{q.label}</span>
                  <ArrowUpRight className="h-4 w-4 opacity-40 transition-opacity group-hover:opacity-90" />
                </Link>
              ))}
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <div className="space-y-5">
                <Box title="On air" meta={`${live.length} live`} className={live.length ? 'kx-live' : undefined}>
                  {live.length ? (
                    <ul className="divide-y divide-border">
                      {live.map((x) => (
                        <li key={x.id} className="flex items-center gap-4 px-5 py-3.5" data-testid={`row-live-${x.id}`}>
                          <span className="grid h-10 w-10 place-items-center rounded-xl bg-live/12 text-live"><Radio className="h-5 w-5" /></span>
                          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{x.title}</div><div className="text-xs text-muted-foreground">{x.presenterName || 'Unassigned'} / {room(x.roomId)}</div></div>
                          <Pill status="live" />
                        </li>
                      ))}
                    </ul>
                  ) : <Empty icon={<Radio className="h-6 w-6" />} title="All stages quiet" body="Sessions appear here the moment a presenter goes live." />}
                </Box>
                <Box title="Run of show" meta="next up" action={<Link href="/schedule" className="text-xs font-semibold kx-cyan" data-testid="link-schedule">Full schedule</Link>}>
                  {next.length ? (
                    <ol className="relative px-5 py-4">
                      <span className="absolute bottom-6 left-[88px] top-6 w-px bg-border" />
                      {next.map((x) => (
                        <li key={x.id} className="relative flex items-start gap-5 py-2.5">
                          <div className="w-14 shrink-0 text-right font-mono text-xs tabular-nums"><span className="kx-cyan">{fmtTime(x.startsAt, hour24)}</span><div className="text-[10px] text-muted-foreground">{fmtDay(x.startsAt).split(',')[0]}</div></div>
                          <span className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[hsl(var(--kx-violet))] bg-card" />
                          <div className="min-w-0"><div className="font-medium leading-tight">{x.title}</div><div className="text-xs text-muted-foreground">{x.presenterName || 'Unassigned'} / {room(x.roomId)}</div></div>
                        </li>
                      ))}
                    </ol>
                  ) : <Empty icon={<CalendarRange className="h-6 w-6" />} title="Nothing scheduled" />}
                </Box>
              </div>
              <div className="space-y-5">
                <Box title="Events" meta={`${ws.events.length}`} action={<Link href="/events" className="text-xs font-semibold kx-cyan" data-testid="link-events">Manage</Link>}>
                  <ul className="divide-y divide-border">
                    {ws.events.slice(0, 5).map((e) => {
                      const pct = e.registrations ? Math.round((e.checkedIn / e.registrations) * 100) : 0;
                      return (
                        <li key={e.id}>
                          <Link href={`/events/${e.id}`} className="group block px-5 py-3 hover:bg-muted/50" data-testid={`link-event-${e.id}`}>
                            <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{e.title}</span><ArrowUpRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-60" /></div>
                            <div className="mt-1.5 flex items-center gap-3"><Pill status={e.status} /><span className="font-mono text-[11px] text-muted-foreground">{e.checkedIn}/{e.registrations} in</span></div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="kx-bar h-full origin-left rounded-full transition-transform duration-700" style={{ transform: `scaleX(${pct / 100})` }} /></div>
                          </Link>
                        </li>
                      );
                    })}
                    {!ws.events.length && <Empty icon={<CalendarRange className="h-6 w-6" />} title="No events yet" />}
                  </ul>
                </Box>
                <Box title="Latest announcements"><AnnouncementList items={ws.announcements.slice(0, 4)} canDelete={false} /></Box>
                {(a.isAdmin || a.preview) && ws.audit.length > 0 && (
                  <Box title="Recent activity" action={<Link href="/audit" className="inline-flex items-center gap-1 text-xs font-semibold kx-cyan" data-testid="link-audit"><ScrollText className="h-3 w-3" />Audit log</Link>}>
                    <ul className="divide-y divide-border">
                      {ws.audit.slice(0, 5).map((x) => (
                        <li key={x.id} className="px-5 py-2.5 text-sm"><span className="font-semibold">{x.actor}</span> <span className="text-muted-foreground">{x.detail}</span><div className="font-mono text-[10.5px] text-muted-foreground">{fmtStamp(x.createdAt)}</div></li>
                      ))}
                    </ul>
                  </Box>
                )}
              </div>
            </div>
          </div>
        );
      }}
    </WS>
  );
}
