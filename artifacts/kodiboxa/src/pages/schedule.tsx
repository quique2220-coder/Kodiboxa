import { useState } from 'react';
import { Link } from 'wouter';
import { Clock3 } from 'lucide-react';
import { WS, PageHeader, Pill, Empty, Panel } from '@/components/bits';
import { NativeSelect } from '@/components/forms';
import { fmtDay, fmtTime } from '@/lib/workspace';
import { usePrefs } from '@/lib/prefs';
import { cn } from '@/lib/utils';

export default function Schedule() {
  const [eventId, setEventId] = useState('all');
  const [status, setStatus] = useState('all');
  const { hour24 } = usePrefs();
  return (
    <WS>
      {(ws) => {
        const list = ws.sessions
          .filter((s) => (eventId === 'all' || s.eventId === eventId) && (status === 'all' || s.status === status))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        const days = new Map<string, typeof list>();
        list.forEach((s) => { const d = fmtDay(s.startsAt); days.set(d, [...(days.get(d) ?? []), s]); });
        return (
          <>
            <PageHeader kicker="All rooms" title="Schedule" sub="Every session across every event, in running order." actions={
              <div className="flex gap-2">
                <NativeSelect value={eventId} onChange={(e) => setEventId(e.target.value)} className="w-48" data-testid="select-filter-event">
                  <option value="all">All events</option>
                  {ws.events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                </NativeSelect>
                <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-36" data-testid="select-filter-status">
                  <option value="all">Any status</option><option value="scheduled">Scheduled</option><option value="live">Live</option><option value="ended">Ended</option>
                </NativeSelect>
              </div>
            } />
            {list.length ? (
              <div className="space-y-6">
                {[...days.entries()].map(([day, ss]) => (
                  <Panel key={day} title={day} meta={`${ss.length} sessions`}>
                    <ul className="divide-y divide-border">
                      {ss.map((s) => {
                        const ev = ws.events.find((e) => e.id === s.eventId);
                        const room = ws.rooms.find((r) => r.id === s.roomId);
                        return (
                          <li key={s.id} className={cn('grid grid-cols-[72px_1fr] gap-4 px-5 py-3.5 sm:grid-cols-[88px_1fr_auto]', s.status === 'live' && 'bg-live/5')} data-testid={`row-schedule-${s.id}`}>
                            <div className="font-mono text-sm tabular-nums">{fmtTime(s.startsAt, hour24)}<div className="text-[11px] text-muted-foreground">to {fmtTime(s.endsAt, hour24)}</div></div>
                            <div className="min-w-0">
                              <div className="font-semibold leading-tight">{s.title}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">{s.presenterName || 'Unassigned'} / {room?.name ?? 'Room'} / <Link href={`/events/${s.eventId}`} className="text-primary hover:underline" data-testid={`link-session-event-${s.id}`}>{ev?.title ?? 'Event'}</Link></div>
                            </div>
                            <div className="col-start-2 sm:col-start-auto"><Pill status={s.status} /></div>
                          </li>
                        );
                      })}
                    </ul>
                  </Panel>
                ))}
              </div>
            ) : <Panel><Empty icon={<Clock3 className="h-6 w-6" />} title="No sessions match" body="Try another event or status filter." /></Panel>}
          </>
        );
      }}
    </WS>
  );
}
