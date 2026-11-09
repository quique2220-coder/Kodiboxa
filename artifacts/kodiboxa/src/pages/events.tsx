import { useState } from 'react';
import { Link } from 'wouter';
import { CalendarPlus, CalendarRange, EyeOff, MapPin, Ticket, Users, ArrowUpRight } from 'lucide-react';
import { WS, PageHeader, Pill, Empty, SignInToAct, AdminWarning } from '@/components/bits';
import { EventDialog } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { access, fmtDate } from '@/lib/workspace';
import { cn } from '@/lib/utils';

const FILTERS = ['all', 'live', 'upcoming', 'draft', 'completed'] as const;

export default function Events() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [creating, setCreating] = useState(false);
  return (
    <WS>
      {(ws) => {
        const a = access(ws);
        const list = ws.events.filter((e) => filter === 'all' || e.status === filter);
        return (
          <>
            <PageHeader
              kicker="Event management"
              title="Events"
              sub="The shared event desk for organizers and participants."
              actions={a.isAdmin ? <Button onClick={() => setCreating(true)} data-testid="button-new-event"><CalendarPlus className="mr-2 h-4 w-4" />New event</Button> : !a.signedIn ? <SignInToAct /> : null}
            />
            <AdminWarning ws={ws} />
            <div className="mb-5 flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button key={f} onClick={() => setFilter(f)} data-testid={`filter-${f}`}
                  className={cn('rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors', filter === f ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:border-foreground/40')}>
                  {f} <span className="opacity-60">{f === 'all' ? ws.events.length : ws.events.filter((e) => e.status === f).length}</span>
                </button>
              ))}
            </div>
            {list.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((e, i) => {
                  const held = e.reserved ?? 0;
                  const fill = Math.min(1, (e.registrations + held) / Math.max(1, e.capacity));
                  const paid = !!e.stripePriceId;
                  return (
                    <Link key={e.id} href={`/events/${e.id}`} style={{ animationDelay: `${i * 40}ms`, borderTopColor: e.accentColor || undefined }} className="rise group relative flex flex-col overflow-hidden rounded-2xl border border-card-border border-t-4 bg-card shadow-sm transition-transform duration-300 hover:-translate-y-0.5 hover:shadow-md" data-testid={`card-event-${e.id}`}>
                      {e.bannerPath ? <img src={`/api/storage${e.bannerPath}`} alt="" className="h-36 w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]" /> : <div className={cn('h-2', e.status === 'live' ? 'bg-live' : e.isPrivate ? 'bg-sidebar' : 'tape-stripe')} />}
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">{e.type}</span>
                          <div className="flex items-center gap-1.5">{e.isPrivate && <EyeOff className="h-3.5 w-3.5 text-muted-foreground" aria-label="Private" />}<Pill status={e.status} /></div>
                        </div>
                        <h3 className="mt-2 text-xl font-bold leading-tight">{e.title}</h3>
                        {e.headline && <p className="mt-1 text-xs font-semibold" style={{ color: e.accentColor || undefined }}>{e.headline}</p>}
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{e.description || 'No description yet.'}</p>
                        <div className="mt-auto pt-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{e.location || 'Location TBA'}</div>
                          <div className="mt-1 font-mono">{fmtDate(e.startsAt)}</div>
                        </div>
                        {a.isAdmin && <div className="mt-3 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full origin-left bg-primary" style={{ transform: `scaleX(${fill})` }} /></div>
                          <span className="font-mono text-[11px] tabular-nums">{e.registrations} registered / {e.capacity}</span>
                        </div>}
                        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[11px] text-muted-foreground">
                          {a.isAdmin && <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{e.checkedIn} checked in · {held} held</span>}
                          <span className="inline-flex items-center gap-1">{paid ? <><Ticket className="h-3.5 w-3.5" />{e.ticketAmount == null ? 'Paid ticket' : new Intl.NumberFormat('en-US', { style: 'currency', currency: (e.currency || 'usd').toUpperCase() }).format(e.ticketAmount / 100)}</> : 'Free entry'}<ArrowUpRight className="ml-1 h-3 w-3" /></span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border">
                <Empty icon={<CalendarRange className="h-6 w-6" />} title={filter === 'all' ? 'No events yet' : `No ${filter} events`} body="Create the first event to open rooms, sessions and passes." action={a.isAdmin && <Button onClick={() => setCreating(true)}>New event</Button>} />
              </div>
            )}
            {creating && <EventDialog open={creating} onOpenChange={setCreating} />}
          </>
        );
      }}
    </WS>
  );
}
