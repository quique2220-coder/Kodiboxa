import { useState } from 'react';
import { useLocation, useSearch } from './_router';
import { Radio, CalendarDays, MessageCircleQuestion, Megaphone, Ticket, MapPin } from 'lucide-react';
import { WS, Pill, Empty, SignInToAct, PassCard } from './_bits';
import { AskBox, AnnouncementList, QuestionItem } from './_qa';
import { NativeSelect } from './_forms';
import { Button } from '@/components/ui/button';
import { access, useCommand, fmtTime, fmtDay } from './_workspace';
import { usePrefs, type DictKey } from './_prefs';
import { cn } from '@/lib/utils';

import kodeLarge from './assets/kode-large.png';
const TABS: { id: string; key: DictKey; icon: typeof Radio }[] = [
  { id: 'now', key: 'p.now', icon: Radio },
  { id: 'schedule', key: 'p.schedule', icon: CalendarDays },
  { id: 'ask', key: 'p.ask', icon: MessageCircleQuestion },
  { id: 'updates', key: 'p.updates', icon: Megaphone },
  { id: 'pass', key: 'p.pass', icon: Ticket },
];

export default function Participant() {
  const { t, hour24 } = usePrefs();
  const search = useSearch();
  const [, setLocation] = useLocation();
  const q = new URLSearchParams(search).get('tab');
  const tab = TABS.some((x) => x.id === q) ? q! : 'now';
  const setTab = (id: string) => setLocation(`/participant?tab=${id}`);
  const [eventId, setEventId] = useState('');
  const cmd = useCommand();
  return (
    <WS>
      {(ws) => {
        const a = access(ws);
        const ev = ws.events.find((e) => e.id === eventId) ?? ws.events.find((e) => e.status === 'live') ?? ws.events[0];
        if (!ev) return <Empty icon={<CalendarDays className="h-6 w-6" />} title="No events available" />;
        const sessions = ws.sessions.filter((s) => s.eventId === ev.id).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
        const live = sessions.filter((s) => s.status === 'live');
        const upNext = sessions.find((s) => s.status === 'scheduled');
        const myReg = a.user ? ws.registrations.find((r) => r.eventId === ev.id && r.userId === a.user!.id) : undefined;
        const myQs = ws.questions.filter((x) => x.eventId === ev.id && (a.preview || x.userId === a.user?.id));
        const updates = ws.announcements.filter((x) => x.eventId === ev.id);
        const hello = a.signedIn && a.user ? `Hi, ${a.user.name.split(' ')[0]}.` : 'Hi, I am Kode.';
        const hint = live.length ? `On stage now: ${live[0].title}. You can send the presenter a question.` : upNext ? `Up next: ${upNext.title} at ${fmtTime(upNext.startsAt, hour24)}.` : 'No sessions are running right now.';
        return (
          <div className="mx-auto max-w-5xl pb-28 lg:pb-8">
            <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
              <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
                <section className="lagoon-panel relative overflow-hidden rounded-3xl text-sidebar-foreground">
                  <div className="bubbles absolute inset-0 opacity-70" />
                  <div className="relative p-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-gill/20 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-gill" data-testid="text-participant-mode">{a.preview ? 'Attendee · sample' : 'Attendee view'}</span>
                      <span className="shrink-0 rounded-full border border-sidebar-border px-2.5 py-1 font-mono text-[10px] uppercase">EN</span>
                    </div>
                    <div className="mt-3 flex items-end gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm opacity-75">{hello}</div>
                        <h1 className="mt-1 text-2xl font-extrabold leading-tight" data-testid="text-event-title">{ev.title}</h1>
                      </div>
                      <img src={kodeLarge} alt="Kode" className="kode-bob h-24 w-auto shrink-0 object-contain drop-shadow-lg" />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] opacity-75">
                      <span>{fmtDay(ev.startsAt)}</span>
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location || 'Location TBA'}</span>
                    </div>
                    <NativeSelect value={ev.id} onChange={(e) => setEventId(e.target.value)} className="mt-4 h-9 w-full border-sidebar-border bg-sidebar-accent text-sidebar-foreground" data-testid="select-my-event">
                      {ws.events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                    </NativeSelect>
                    <div className="mt-4">
                      {myReg ? <Pill status="in" label={t('p.registered')} /> : a.signedIn ? (
                        <Button className="w-full rounded-xl bg-gill text-sidebar hover:bg-gill/90" disabled={cmd.pending} onClick={() => cmd.run({ action: 'register', eventId: ev.id }, () => setTab('pass'))} data-testid="button-register">{t('p.register')}</Button>
                      ) : <SignInToAct label="Sign in to register" />}
                    </div>
                  </div>
                </section>
                <div className="rounded-2xl border border-card-border bg-card p-4 text-[13.5px] leading-snug" data-testid="text-kode-tip">
                  <span className="font-semibold text-primary">Kode says:</span> {hint}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[{ n: live.length, l: 'live' }, { n: sessions.length, l: 'sessions' }, { n: updates.length, l: 'updates' }].map((x) => (
                    <div key={x.l} className="rounded-2xl border border-card-border bg-card py-3"><div className="font-display text-xl font-bold tabular-nums">{x.n}</div><div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{x.l}</div></div>
                  ))}
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-4 hidden gap-1 rounded-2xl border border-card-border bg-card p-1 lg:flex">
                  {TABS.map((x) => (
                    <button key={x.id} onClick={() => setTab(x.id)} data-testid={`tab-desktop-${x.id}`} className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors', tab === x.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                      <x.icon className="h-4 w-4" />{t(x.key)}
                    </button>
                  ))}
                </div>
                <div key={tab} className="rise">
                  {tab === 'now' && (live.length ? live.map((s) => (
                    <div key={s.id} className="mb-3 rounded-2xl border border-live/40 bg-card p-5" data-testid={`card-now-${s.id}`}>
                      <Pill status="live" />
                      <div className="mt-2 font-display text-xl font-bold">{s.title}</div>
                      <div className="text-sm text-muted-foreground">{s.presenterName} / {ws.rooms.find((r) => r.id === s.roomId)?.name}</div>
                      {s.description && <p className="mt-2 text-sm text-foreground/80">{s.description}</p>}
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => setTab('ask')} data-testid={`button-ask-now-${s.id}`}>{t('p.ask')}</Button>
                    </div>
                  )) : <Empty icon={<Radio className="h-6 w-6" />} title={t('p.nothingLive')} body={upNext ? `Next: ${upNext.title}` : undefined} />)}

                  {tab === 'schedule' && (
                    <ol className="space-y-2">
                      {sessions.map((s) => (
                        <li key={s.id} className={cn('flex gap-4 rounded-2xl border bg-card p-4', s.status === 'live' ? 'border-live/40' : 'border-card-border', s.status === 'ended' && 'opacity-60')}>
                          <div className="w-16 shrink-0 font-mono text-sm tabular-nums">{fmtTime(s.startsAt, hour24)}</div>
                          <div className="min-w-0 flex-1"><div className="font-semibold leading-tight">{s.title}</div><div className="text-xs text-muted-foreground">{s.presenterName || 'TBA'}</div></div>
                          <Pill status={s.status} />
                        </li>
                      ))}
                      {!sessions.length && <Empty icon={<CalendarDays className="h-6 w-6" />} title="Schedule not published yet" />}
                    </ol>
                  )}

                  {tab === 'ask' && (
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-card-border bg-card p-4">
                        {a.signedIn ? <AskBox sessions={live.length ? live : sessions.filter((s) => s.status !== 'ended')} /> : <SignInToAct label="Sign in to ask" />}
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-card-border bg-card">
                        <div className="px-5 pt-3 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">{a.preview ? 'Example questions' : 'Your questions'}</div>
                        {myQs.length ? <ul>{myQs.map((x) => <QuestionItem key={x.id} q={x} session={sessions.find((s) => s.id === x.sessionId)} canAnswer={false} />)}</ul> : <p className="px-5 py-5 text-sm text-muted-foreground">Nothing asked yet.</p>}
                      </div>
                    </div>
                  )}

                  {tab === 'updates' && <div className="overflow-hidden rounded-2xl border border-card-border bg-card"><AnnouncementList items={updates} canDelete={false} /></div>}

                  {tab === 'pass' && (myReg ? (
                    <div className="mx-auto max-w-sm"><PassCard reg={myReg} event={ev} /><p className="mt-3 text-center text-sm text-muted-foreground">{t('p.showAtDoor')}</p></div>
                  ) : a.preview && ws.registrations.find((r) => r.eventId === ev.id) ? (
                    <div className="mx-auto max-w-sm"><PassCard reg={ws.registrations.find((r) => r.eventId === ev.id)!} event={ev} /><p className="mt-3 text-center text-xs text-muted-foreground">Example pass from the sample workspace.</p></div>
                  ) : <Empty icon={<Ticket className="h-6 w-6" />} title="No pass yet" body="Register for this event to receive a personal QR pass." />)}
                </div>
              </div>
            </div>

            <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden">
              <div className="mx-auto grid max-w-md grid-cols-5">
                {TABS.map((x) => (
                  <button key={x.id} onClick={() => setTab(x.id)} data-testid={`tab-participant-${x.id}`} className={cn('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', tab === x.id ? 'text-primary' : 'text-muted-foreground')}>
                    {tab === x.id && <span className="absolute top-0 h-0.5 w-8 rounded bg-gill" />}
                    <x.icon className="h-5 w-5" />{t(x.key)}
                  </button>
                ))}
              </div>
            </nav>
          </div>
        );
      }}
    </WS>
  );
}
