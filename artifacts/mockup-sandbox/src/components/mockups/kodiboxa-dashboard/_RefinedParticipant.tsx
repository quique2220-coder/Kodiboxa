import { useState } from 'react';
import { useLocation, useSearch } from './_router';
import { Radio, CalendarDays, MessageCircleQuestion, Megaphone, Ticket, MapPin, ArrowRight } from 'lucide-react';
import { WS, Pill, Empty, SignInToAct, PassCard } from './_bits';
import { AskBox, AnnouncementList, QuestionItem } from './_qa';
import { NativeSelect } from './_forms';
import { Button } from '@/components/ui/button';
import { access, useCommand, fmtTime, fmtDay, fmtStamp } from './_workspace';
import { usePrefs, type DictKey } from './_prefs';
import { cn } from '@/lib/utils';
import './_refined.css';

import kodeLarge from './assets/kode-studio.webp';
import kodeSmall from './assets/kode-studio-avatar.webp';

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
        const upcoming = sessions.filter((s) => s.status === 'scheduled');
        const upNext = upcoming[0];
        const room = (id: string) => ws.rooms.find((r) => r.id === id)?.name ?? 'Room TBA';
        const myReg = a.user ? ws.registrations.find((r) => r.eventId === ev.id && r.userId === a.user!.id) : undefined;
        const sampleReg = a.preview ? ws.registrations.find((r) => r.eventId === ev.id) : undefined;
        const myQs = ws.questions.filter((x) => x.eventId === ev.id && (a.preview || x.userId === a.user?.id));
        const updates = ws.announcements.filter((x) => x.eventId === ev.id);
        const hello = a.signedIn && a.user ? `Hi, ${a.user.name.split(' ')[0]}.` : 'Hi, I am Kode.';
        const hint = live.length ? `On stage now: ${live[0].title}. You can send the presenter a question.` : upNext ? `Up next: ${upNext.title} at ${fmtTime(upNext.startsAt, hour24)}.` : 'No sessions are running right now.';
        const registerBlock = myReg ? <Pill status="in" label={t('p.registered')} /> : a.signedIn ? (
          <Button className="kx-btn h-9 rounded-xl px-4 font-semibold" disabled={cmd.pending} onClick={() => cmd.run({ action: 'register', eventId: ev.id }, () => setTab('pass'))} data-testid="button-register">{t('p.register')}</Button>
        ) : <SignInToAct label="Sign in to register" />;

        return (
          <div className="kx mx-auto max-w-6xl pb-28 lg:pb-8">
            <section className="kx-band mb-5 rounded-3xl">
              <div className="relative grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 p-5 md:grid-cols-[1fr_auto] md:gap-5 md:p-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="kx-chip" data-testid="text-participant-mode">{a.preview ? 'Attendee · sample' : 'Attendee view'}</span>
                    <Pill status={ev.status} />
                    <span className="text-sm opacity-75">{hello}</span>
                  </div>
                  <h1 className="mt-2 text-2xl font-extrabold leading-tight md:text-3xl" data-testid="text-event-title">{ev.title}</h1>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] opacity-80">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDay(ev.startsAt)}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{ev.location || 'Location TBA'}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <NativeSelect value={ev.id} onChange={(e) => setEventId(e.target.value)} aria-label="Choose event" className="h-9 w-full max-w-xs border-white/15 bg-white/10 text-[hsl(var(--kx-band-fg))]" data-testid="select-my-event">
                      {ws.events.map((e) => <option key={e.id} value={e.id} className="text-foreground">{e.title}</option>)}
                    </NativeSelect>
                    {registerBlock}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden grid-cols-3 gap-2 text-center xl:grid">
                    {[{ n: live.length, l: 'live' }, { n: sessions.length, l: 'sessions' }, { n: updates.length, l: 'updates' }].map((x) => (
                      <div key={x.l} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="font-display text-xl font-bold tabular-nums">{x.n}</div><div className="font-mono text-[9.5px] uppercase tracking-wider opacity-70">{x.l}</div></div>
                    ))}
                  </div>
                  <img src={kodeLarge} alt="Kode, the blue axolotl in a hoodie with a laptop, rendered in 3D" className="kx-mascot kode-bob h-32 w-[88px] object-contain md:h-44 md:w-44" width={640} height={640} fetchPriority="high" />
                </div>
              </div>
            </section>

            <div className="mb-5 flex items-start gap-3 kx-card kx-card-accent p-3.5 text-[13.5px] leading-snug" data-testid="text-kode-tip">
              <img src={kodeSmall} alt="" className="h-8 w-8 shrink-0 object-contain" />
              <p><span className="font-semibold kx-violet">Kode says:</span> {hint}</p>
            </div>

            <div className="kx-tabs mb-4 hidden gap-1 lg:flex" role="tablist">
              {TABS.map((x) => (
                <button key={x.id} role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)} data-testid={`tab-desktop-${x.id}`} className={cn('flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors', tab === x.id ? 'kx-tab-on' : 'text-muted-foreground hover:bg-muted')}>
                  <x.icon className={cn('h-4 w-4', tab === x.id && 'kx-cyan')} />{t(x.key)}
                </button>
              ))}
            </div>

            <div key={tab} className="rise">
              {tab === 'now' && (
                <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                  <div className="space-y-3">
                    <div className="kx-kicker">{live.length ? 'On stage now' : 'Coming up'}</div>
                    {live.map((s) => (
                      <div key={s.id} className="kx-card kx-live p-5" data-testid={`card-now-${s.id}`}>
                        <Pill status="live" />
                        <div className="mt-2 font-display text-xl font-bold">{s.title}</div>
                        <div className="text-sm text-muted-foreground">{s.presenterName} / {room(s.roomId)}</div>
                        {s.description && <p className="mt-2 text-sm text-foreground/80">{s.description}</p>}
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => setTab('ask')} data-testid={`button-ask-now-${s.id}`}>{t('p.ask')}</Button>
                      </div>
                    ))}
                    {!live.length && (
                      <div className="kx-card" data-testid="state-nothing-live">
                        <div className="flex items-center gap-3 border-b border-card-border px-5 py-3.5">
                          <span className="kx-icon h-8 w-8"><Radio className="h-4 w-4" /></span>
                          <div className="font-semibold">{t('p.nothingLive')}</div>
                        </div>
                        {upcoming.length ? (
                          <ul className="divide-y divide-border">
                            {upcoming.slice(0, 4).map((s, i) => (
                              <li key={s.id} className="flex gap-4 px-5 py-3" data-testid={`row-upnext-${s.id}`}>
                                <div className="w-16 shrink-0 font-mono text-sm tabular-nums kx-cyan">{fmtTime(s.startsAt, hour24)}</div>
                                <div className="min-w-0 flex-1">
                                  <div className={cn('leading-tight', i === 0 ? 'font-display text-lg font-bold' : 'font-medium')}>{s.title}</div>
                                  <div className="text-xs text-muted-foreground">{s.presenterName || 'TBA'} / {room(s.roomId)}</div>
                                </div>
                                {i === 0 && <span className="self-start rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">next</span>}
                              </li>
                            ))}
                          </ul>
                        ) : <p className="px-5 py-5 text-sm text-muted-foreground">No more sessions scheduled for this event.</p>}
                        <button onClick={() => setTab('schedule')} className="flex w-full items-center justify-between border-t border-card-border px-5 py-3 text-sm font-semibold kx-cyan" data-testid="button-now-schedule">Full schedule<ArrowRight className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div className="kx-kicker">Your event</div>
                    <button onClick={() => setTab('pass')} className="kx-card kx-link flex w-full items-center gap-3 p-4 text-left" data-testid="button-now-pass">
                      <span className="kx-icon kx-icon-cyan h-10 w-10"><Ticket className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{myReg ? (myReg.checkedIn ? 'Checked in' : 'Pass ready') : sampleReg ? 'Example pass' : 'No pass yet'}</span>
                        <span className="block text-xs text-muted-foreground">{myReg ? `Code ${myReg.passCode}` : a.signedIn ? 'Register to get your QR pass' : 'Sign in and register for a QR pass'}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 opacity-50" />
                    </button>
                    <div className="kx-card">
                      <div className="flex items-center justify-between px-4 pt-3.5"><span className="font-semibold">Latest updates</span><button onClick={() => setTab('updates')} className="text-xs font-semibold kx-cyan" data-testid="button-now-updates">All</button></div>
                      {updates.length ? (
                        <ul className="divide-y divide-border">
                          {updates.slice(0, 3).map((u) => (
                            <li key={u.id} className="px-4 py-3"><div className="text-sm font-medium leading-tight">{u.title}</div><div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{u.text}</div><div className="mt-1 font-mono text-[10px] text-muted-foreground">{fmtStamp(u.createdAt)}</div></li>
                          ))}
                        </ul>
                      ) : <p className="px-4 py-4 text-sm text-muted-foreground">No announcements yet.</p>}
                    </div>
                    <button onClick={() => setTab('ask')} className="kx-card kx-link flex w-full items-center gap-3 p-4 text-left" data-testid="button-now-ask">
                      <span className="kx-icon h-10 w-10"><MessageCircleQuestion className="h-5 w-5" /></span>
                      <span className="flex-1"><span className="block font-semibold">Questions</span><span className="block text-xs text-muted-foreground">{myQs.length} {a.preview ? 'example' : 'asked by you'}</span></span>
                      <ArrowRight className="h-4 w-4 opacity-50" />
                    </button>
                  </div>
                </div>
              )}

              {tab === 'schedule' && (
                <ol className="space-y-2">
                  {sessions.map((s) => (
                    <li key={s.id} className={cn('kx-card flex gap-4 p-4', s.status === 'live' && 'kx-live', s.status === 'ended' && 'opacity-60')}>
                      <div className="w-16 shrink-0 font-mono text-sm tabular-nums"><span className="kx-cyan">{fmtTime(s.startsAt, hour24)}</span><div className="text-[10px] text-muted-foreground">{fmtTime(s.endsAt, hour24)}</div></div>
                      <div className="min-w-0 flex-1"><div className="font-semibold leading-tight">{s.title}</div><div className="text-xs text-muted-foreground">{s.presenterName || 'TBA'} / {room(s.roomId)}</div></div>
                      <Pill status={s.status} />
                    </li>
                  ))}
                  {!sessions.length && <Empty icon={<CalendarDays className="h-6 w-6" />} title="Schedule not published yet" />}
                </ol>
              )}

              {tab === 'ask' && (
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
                  <div className="kx-card kx-card-accent p-4">
                    {a.signedIn ? <AskBox sessions={live.length ? live : sessions.filter((s) => s.status !== 'ended')} /> : <SignInToAct label="Sign in to ask" />}
                  </div>
                  <div className="kx-card overflow-hidden">
                    <div className="kx-kicker px-5 pt-3">{a.preview ? 'Example questions' : 'Your questions'}</div>
                    {myQs.length ? <ul>{myQs.map((x) => <QuestionItem key={x.id} q={x} session={sessions.find((s) => s.id === x.sessionId)} canAnswer={false} />)}</ul> : <p className="px-5 py-5 text-sm text-muted-foreground">Nothing asked yet.</p>}
                  </div>
                </div>
              )}

              {tab === 'updates' && <div className="kx-card overflow-hidden"><AnnouncementList items={updates} canDelete={false} /></div>}

              {tab === 'pass' && (myReg ? (
                <div className="mx-auto max-w-sm"><PassCard reg={myReg} event={ev} /><p className="mt-3 text-center text-sm text-muted-foreground">{t('p.showAtDoor')}</p></div>
              ) : sampleReg ? (
                <div className="mx-auto max-w-sm"><PassCard reg={sampleReg} event={ev} /><p className="mt-3 text-center text-xs text-muted-foreground">Example pass from the sample workspace.</p></div>
              ) : <Empty icon={<Ticket className="h-6 w-6" />} title="No pass yet" body="Register for this event to receive a personal QR pass." action={a.signedIn ? registerBlock : undefined} />)}
            </div>

            <nav className="kx-mobile-nav fixed inset-x-0 bottom-0 z-30 border-t border-border lg:hidden">
              <div className="mx-auto grid max-w-md grid-cols-5">
                {TABS.map((x) => (
                  <button key={x.id} onClick={() => setTab(x.id)} data-testid={`tab-participant-${x.id}`} aria-current={tab === x.id ? 'page' : undefined} className={cn('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', tab === x.id ? 'kx-cyan' : 'text-muted-foreground')}>
                    {tab === x.id && <span className="kx-bar absolute top-0 h-0.5 w-8 rounded" />}
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
