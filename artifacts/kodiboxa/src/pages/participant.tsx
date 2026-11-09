import { useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { Radio, CalendarDays, MessageCircleQuestion, Megaphone, Ticket, MapPin, ArrowRight, Clock3, Mail } from 'lucide-react';
import { useCancelEventCheckout, useStartEventCheckout, getGetWorkspaceQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { WS, Pill, Empty, SignInToAct, PassCard } from '@/components/bits';
import { AskBox, AnnouncementList, QuestionItem } from '@/components/qa';
import { NativeSelect } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { access, useCommand, fmtTime, fmtDay, fmtStamp, errorMessage } from '@/lib/workspace';
import { usePrefs, type DictKey } from '@/lib/prefs';
import { cn } from '@/lib/utils';
import '@/components/dashboard-experience.css';
import { useToast } from '@/hooks/use-toast';
import { LiveKitIntentJanitor, LiveKitSession } from '@/components/livekit-session';
import { participantLocation } from '@/lib/participant-navigation';

import kodeLarge from '@/assets/kode-studio.webp';
import kodeSmall from '@/assets/kode-studio-avatar.webp';

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
  const [selectedRoom, setSelectedRoom] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const setEventId = (eventId: string) => {
    setSelectedRoom('');
    setCouponCode('');
    setLocation(participantLocation(search, { event: eventId }));
  };
  const cmd = useCommand();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const checkout = useStartEventCheckout({
    mutation: {
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
        window.location.assign(result.url);
      },
      onError: (error) => toast({ title: 'Checkout could not start', description: errorMessage(error), variant: 'destructive' }),
    },
  });
  const cancelCheckout = useCancelEventCheckout({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() }),
      onError: (error) => toast({ title: 'Could not cancel checkout', description: errorMessage(error), variant: 'destructive' }),
    },
  });
  return (
    <WS>
      {(ws) => {
        const a = access(ws);
        const requestedEvent = new URLSearchParams(search).get('event');
        const ev = ws.events.find((e) => e.id === requestedEvent) ?? ws.events.find((e) => e.status === 'live') ?? ws.events[0];
        if (!ev) return <><LiveKitIntentJanitor sessions={ws.sessions} /><Empty icon={<CalendarDays className="h-6 w-6" />} title="No events available" /></>;
        const setTab = (id: string) => setLocation(participantLocation(search, { event: ev.id, tab: id }));
        const sessions = ws.sessions.filter((s) => s.eventId === ev.id).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
        const live = sessions.filter((s) => s.status === 'live');
        const upcoming = sessions.filter((s) => s.status === 'scheduled');
        const eventDisplayStatus = ev.status === 'live' && sessions.length > 0 && !live.length
          ? (upcoming.length ? 'upcoming' : 'ended')
          : ev.status;
        const eventStatusLabel = eventDisplayStatus !== ev.status
          ? (upcoming.length ? 'Between sessions' : 'Sessions ended')
          : undefined;
        const upNext = upcoming[0];
        const room = (id: string) => ws.rooms.find((r) => r.id === id)?.name ?? 'Room TBA';
        const isConfirmed = (status?: string) => !['pending', 'requires_payment', 'unpaid', 'processing', 'incomplete'].includes((status ?? '').toLowerCase());
        const myReg = a.user ? ws.registrations.find((r) => r.eventId === ev.id && r.userId === a.user!.id && isConfirmed(r.paymentStatus)) : undefined;
        const isPaid = !!ev.stripePriceId;
        const pendingOrders = (ws.orders ?? []).filter((order) => order.eventId === ev.id && order.userId === a.user?.id && order.status === 'pending' && new Date(order.expiresAt).getTime() > Date.now());
        const rooms = ws.rooms.filter((room) => room.eventId === ev.id);
        const roomNameFor = (registration?: { roomId?: string | null }) =>
          registration?.roomId ? ws.rooms.find((candidate) => candidate.id === registration.roomId)?.name : undefined;
        const sampleReg = a.preview ? ws.registrations.find((r) => r.eventId === ev.id && isConfirmed(r.paymentStatus)) : undefined;
        const myQs = ws.questions.filter((x) => x.eventId === ev.id && (a.preview || x.userId === a.user?.id));
        const updates = ws.announcements.filter((x) => x.eventId === ev.id);
        const hello = a.signedIn && a.user ? `Hi, ${a.user.name.split(' ')[0]}.` : 'Hi, I am KODELOTH.';
        const hint = live.length ? `On stage now: ${live[0].title}. You can send the presenter a question.` : upNext ? `Up next: ${upNext.title} at ${fmtTime(upNext.startsAt, hour24)}.` : 'No sessions are running right now.';
        const registerBlock = myReg ? <Pill status="in" label={t('p.registered')} /> : pendingOrders.length ? <span className="rounded-full bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200">Checkout in progress</span> : a.signedIn ? (
          isPaid ? <Button className="kx-btn h-9 rounded-xl px-4 font-semibold" disabled={checkout.isPending || (rooms.length > 0 && !selectedRoom) || ws.checkoutReady === false} onClick={() => checkout.mutate({ data: { eventId: ev.id, ...(selectedRoom ? { roomId: selectedRoom } : {}), ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}) } })} data-testid="button-register">{checkout.isPending ? 'Opening checkout…' : 'Get a ticket'}</Button> :
          <Button className="kx-btn h-9 rounded-xl px-4 font-semibold" disabled={cmd.pending || (rooms.length > 0 && !selectedRoom)} onClick={() => cmd.run({ action: 'register', eventId: ev.id, ...(selectedRoom ? { roomId: selectedRoom } : {}) }, () => setTab('pass'))} data-testid="button-register">{t('p.register')}</Button>
        ) : <SignInToAct label="Sign in to register" />;

        return (
          <div className="kx mx-auto max-w-6xl pb-28 lg:pb-8">
            <LiveKitIntentJanitor sessions={ws.sessions} />
            <section className="kx-band relative isolate mb-5 overflow-hidden rounded-3xl border-t-4" style={{ borderTopColor: ev.accentColor || undefined }}>
              {ev.bannerPath && <img src={`/api/storage${ev.bannerPath}`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />}
              {ev.bannerPath && <div className="pointer-events-none absolute inset-0 bg-sidebar/45" />}
              <div className="relative grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3 p-5 md:grid-cols-[1fr_auto] md:gap-5 md:p-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="kx-chip" data-testid="text-participant-mode">{a.preview ? 'Attendee · sample' : 'Attendee view'}</span>
                    <Pill status={eventDisplayStatus} label={eventStatusLabel} />
                    <span className="text-sm opacity-75">{hello}</span>
                  </div>
                   <h1 className="mt-2 text-2xl font-extrabold leading-tight md:text-3xl" data-testid="text-event-title">{ev.title}</h1>
                   {ev.headline && <p className="mt-1 text-sm font-semibold" style={{ color: ev.accentColor || undefined }}>{ev.headline}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] opacity-80">
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDay(ev.startsAt)}</span>
                    <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{ev.location || 'Location TBA'}</span>
                  </div>
                  {ev.description && <p className="mt-3 max-w-2xl text-sm leading-relaxed opacity-85">{ev.description}</p>}
                  {ev.presenterName && <div className="mt-3 flex items-center gap-2.5">
                    {ev.presenterPhotoPath && <img src={`/api/storage${ev.presenterPhotoPath}`} alt="" className="h-9 w-9 rounded-full object-cover" />}
                    <div><p className="text-xs font-semibold">{ev.presenterName}</p>{ev.presenterBio && <p className="mt-0.5 line-clamp-2 max-w-lg text-[11px] opacity-75">{ev.presenterBio}</p>}</div>
                  </div>}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <NativeSelect value={ev.id} onChange={(e) => setEventId(e.target.value)} aria-label="Choose event" className="h-9 w-full max-w-xs border-white/15 bg-white/10 text-[hsl(var(--kx-band-fg))]" data-testid="select-my-event">
                      {ws.events.map((e) => <option key={e.id} value={e.id} className="text-foreground">{e.title}</option>)}
                    </NativeSelect>
                    <Link href={`/events/${ev.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/20 px-3 text-xs font-semibold text-[hsl(var(--kx-band-fg))] transition-colors hover:bg-white/10" data-testid="link-event-registration-details">Event details <ArrowRight className="h-3.5 w-3.5" /></Link>
                  </div>
                  {!myReg && !pendingOrders.length && a.signedIn && (rooms.length > 0 || isPaid) && <div className="mt-3 grid max-w-xl gap-2 sm:grid-cols-[1fr_1fr]">
                    {rooms.length > 0 && <NativeSelect value={selectedRoom} onChange={(e) => setSelectedRoom(e.target.value)} aria-label="Choose a room for registration" className="border-white/15 bg-white/10 text-[hsl(var(--kx-band-fg))]" data-testid="select-dashboard-room">
                      <option value="" className="text-foreground">Choose a room</option>{rooms.map((r) => <option key={r.id} value={r.id} className="text-foreground">{r.name} · {Math.max(0, r.capacity - (r.registrations ?? 0) - (r.reserved ?? 0))} available</option>)}
                    </NativeSelect>}
                    {isPaid && <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} maxLength={40} placeholder="Coupon code (optional)" aria-label="Coupon code" className="h-9 rounded-md border border-white/15 bg-white/10 px-3 text-xs text-[hsl(var(--kx-band-fg))] placeholder:text-[hsl(var(--kx-band-fg))]/55 focus:outline-none focus:ring-2 focus:ring-white/40" data-testid="input-dashboard-coupon" />}
                  </div>}
                  <div className="mt-3">{registerBlock}</div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden grid-cols-3 gap-2 text-center xl:grid">
                    {[{ n: live.length, l: 'live' }, { n: sessions.length, l: 'sessions' }, { n: updates.length, l: 'updates' }].map((x) => (
                      <div key={x.l} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><div className="font-display text-xl font-bold tabular-nums">{x.n}</div><div className="font-mono text-[9.5px] uppercase tracking-wider opacity-70">{x.l}</div></div>
                    ))}
                  </div>
                  <img src={kodeLarge} alt="KODELOTH, the blue axolotl in a hoodie with a laptop, rendered in 3D" className="kx-mascot kode-bob h-32 w-[88px] object-contain md:h-44 md:w-44" width={640} height={640} fetchPriority="high" />
                </div>
              </div>
            </section>

            <div className="mb-5 flex items-start gap-3 kx-card kx-card-accent p-3.5 text-[13.5px] leading-snug" data-testid="text-kode-tip">
              <img src={kodeSmall} alt="" className="h-8 w-8 shrink-0 object-contain" />
              <p><span className="font-semibold kx-violet">KODELOTH says:</span> {hint}</p>
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
                        <LiveKitSession session={s} mode="participant" authorized={!!myReg && a.signedIn && !a.preview} />
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
                         <span className="block text-xs text-muted-foreground">{myReg ? 'Your personal QR pass is ready' : a.signedIn ? 'Register to get your QR pass' : 'Sign in and register for a QR pass'}</span>
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
                 <div className="mx-auto max-w-[480px]"><PassCard reg={myReg} event={ev} roomName={roomNameFor(myReg)} /><p className="mt-3 text-center text-sm text-muted-foreground">{t('p.showAtDoor')}</p><p className="mt-3 rounded-xl border border-border bg-card p-3 text-center text-xs leading-relaxed text-muted-foreground">Automated confirmation email is unavailable until an email service is connected. Your confirmed pass and event details remain in KODIBOXA.</p>{a.user?.email && <a href={`mailto:${encodeURIComponent(a.user.email)}?subject=${encodeURIComponent(`Event details: ${ev.title}`)}&body=${encodeURIComponent(`${ev.title}\n${fmtDay(ev.startsAt)}\n${ev.location || 'Location TBA'}${myReg.roomId ? `\nRoom: ${room(myReg.roomId)}` : ''}`)}`} className="mt-3 flex items-center justify-center gap-2 text-xs font-semibold text-primary hover:underline" data-testid="link-email-pass-details"><Mail className="h-3.5 w-3.5" />Open email app with event details</a>}</div>
              ) : sampleReg ? (
                 <div className="mx-auto max-w-[480px]"><PassCard reg={{ ...sampleReg, name: 'Sample participant' }} event={ev} roomName={roomNameFor(sampleReg)} /><p className="mt-3 text-center text-xs text-muted-foreground">Example pass from the sample workspace.</p></div>
              ) : pendingOrders.length ? <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-amber-500/30 bg-card p-5">
                <div className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4 text-amber-600" />Checkout in progress</div>
                <p className="text-sm text-muted-foreground">Your room seat is held until {fmtStamp(pendingOrders[0].expiresAt)}. This is not a pass. A confirmed registration will appear here after payment verification.</p>
                {pendingOrders.map((order) => <div className="flex gap-2" key={order.id}><Button className="flex-1" disabled={checkout.isPending} onClick={() => checkout.mutate({ data: { eventId: ev.id, ...(order.roomId ? { roomId: order.roomId } : {}) } })} data-testid={`button-dashboard-resume-${order.id}`}>Resume checkout</Button><Button variant="outline" disabled={cancelCheckout.isPending} onClick={() => cancelCheckout.mutate({ id: order.id })} data-testid={`button-dashboard-cancel-${order.id}`}>Cancel hold</Button></div>)}
                <p className="text-xs text-muted-foreground">Return-page flags do not confirm a payment; the verified pass will appear automatically.</p>
              </div> : <Empty icon={<Ticket className="h-6 w-6" />} title="No pass yet" body="Register for this event to receive a personal QR pass." action={a.signedIn ? registerBlock : undefined} />)}
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
