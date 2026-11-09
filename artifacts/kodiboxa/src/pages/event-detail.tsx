import { useState } from 'react';
import { Link, useLocation, useParams } from 'wouter';
import { ArrowLeft, DoorOpen, Pencil, Plus, QrCode, Trash2, UserPlus, EyeOff, Play, Square, Clock3, Ticket, ExternalLink, Mail, Tag } from 'lucide-react';
import { useStartEventCheckout, useCancelEventCheckout, getGetWorkspaceQueryKey } from '@workspace/api-client-react';
import type { Session, Registration } from '@workspace/api-client-react';
import { WS, PageHeader, Panel, Pill, Empty, SignInToAct, CheckInDesk, PassCard, Stat } from '@/components/bits';
import { EventDialog, RoomDialog, SessionDialog, Confirm, Field } from '@/components/forms';
import { QuestionList, AnnouncementList, AnnounceForm, AskBox } from '@/components/qa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { access, useCommand, fmtDate, fmtTime, fmtStamp } from '@/lib/workspace';
import { usePrefs } from '@/lib/prefs';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { errorMessage } from '@/lib/workspace';

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const [, nav] = useLocation();
  const { hour24 } = usePrefs();
  const cmd = useCommand();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [sessionEdit, setSessionEdit] = useState<Session | 'new' | null>(null);
  const [sessionDel, setSessionDel] = useState<Session | null>(null);
  const [pass, setPass] = useState<Registration | null>(null);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [search, setSearch] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponForm, setCouponForm] = useState({ code: '', percentOff: '10', maxRedemptions: '', expiresAt: '' });

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
      onSuccess: (result) => {
        queryClient.invalidateQueries({ queryKey: getGetWorkspaceQueryKey() });
        toast({ title: result.message });
      },
      onError: (error) => toast({ title: 'Could not cancel checkout', description: errorMessage(error), variant: 'destructive' }),
    },
  });

  return (
    <WS>
      {(ws) => {
        const a = access(ws);
        const ev = ws.events.find((e) => e.id === id);
        if (!ev) return <Empty icon={<DoorOpen className="h-6 w-6" />} title="Event not found" body="It may have been deleted or is not visible to you." action={<Link href="/events" className="text-sm font-semibold text-primary">Back to events</Link>} />;
        const rooms = ws.rooms.filter((r) => r.eventId === ev.id);
        const sessions = ws.sessions.filter((s) => s.eventId === ev.id).sort((x, y) => x.startsAt.localeCompare(y.startsAt));
        const regs = ws.registrations.filter((r) => r.eventId === ev.id && !['pending', 'requires_payment', 'unpaid', 'processing', 'incomplete'].includes((r.paymentStatus ?? '').toLowerCase()));
        const qs = ws.questions.filter((q) => q.eventId === ev.id);
        const anns = ws.announcements.filter((x) => x.eventId === ev.id);
        const mine = a.user ? regs.find((r) => r.userId === a.user!.id) : undefined;
        const filteredRegs = regs.filter((r) => `${r.name} ${r.email} ${r.passCode}`.toLowerCase().includes(search.toLowerCase()));
        const canStart = (s: Session) => a.isAdmin || (a.isPresenter && s.presenterId === a.user?.id);
        const isPaid = !!ev.stripePriceId;
        const amountKnown = ev.ticketAmount != null;
        const pendingOrders = (ws.orders ?? []).filter((o) => o.eventId === ev.id && o.userId === a.user?.id && o.status === 'pending');
        const roomForPass = mine?.roomId ? rooms.find((r) => r.id === mine.roomId) : undefined;
        const ticketPrice = amountKnown ? new Intl.NumberFormat('en-US', { style: 'currency', currency: (ev.currency || 'usd').toUpperCase() }).format(ev.ticketAmount! / 100) : 'Paid ticket';
        const roomSelection = <Field label="Choose a room">
          <select aria-label="Choose a room" value={selectedRoom || (mine?.roomId ?? '')} onChange={(e) => setSelectedRoom(e.target.value)} className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40" data-testid="select-registration-room">
            <option value="">Select a room</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.name} · {Math.max(0, room.capacity - (room.registrations ?? regs.filter((r) => r.roomId === room.id).length) - (room.reserved ?? 0))} seats available</option>)}
          </select>
        </Field>;
        const registerPaid = () => {
          if (!selectedRoom && rooms.length) {
            toast({ title: 'Choose a room', description: 'Select the room for your registration first.', variant: 'destructive' });
            return;
          }
          checkout.mutate({ data: { eventId: ev.id, ...(selectedRoom ? { roomId: selectedRoom } : {}), ...(couponCode.trim() ? { couponCode: couponCode.trim() } : {}) } });
        };

        return (
          <>
            <Link href="/events" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground" data-testid="link-back-events"><ArrowLeft className="h-4 w-4" />Events</Link>
            <PageHeader
              kicker={`${ev.type} / ${fmtDate(ev.startsAt)} to ${fmtDate(ev.endsAt)}`}
              title={ev.title}
              sub={<span className="flex flex-wrap items-center gap-2"><Pill status={ev.status} />{ev.isPrivate && <span className="inline-flex items-center gap-1 text-xs"><EyeOff className="h-3 w-3" />Private, sponsors hidden</span>}{!ev.isPrivate && <span className="text-xs">Sponsors {ev.sponsorsVisible ? 'visible' : 'hidden'}</span>}<span className="text-xs">{ev.location || 'Location TBA'}</span></span>}
              actions={a.isAdmin ? (
                <>
                  <Link href={`/participant?event=${encodeURIComponent(ev.id)}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent" data-testid="link-participant-view"><ExternalLink className="h-4 w-4" />Attendee desk</Link>
                  <Link href={`/room-operations?eventId=${encodeURIComponent(ev.id)}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent" data-testid="link-room-operations"><DoorOpen className="h-4 w-4" />Room operations</Link>
                  <Button variant="outline" onClick={() => setEditing(true)} data-testid="button-edit-event"><Pencil className="mr-2 h-4 w-4" />Edit</Button>
                  <Button variant="outline" className="text-destructive" onClick={() => setDeleting(true)} data-testid="button-delete-event"><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
                </>
              ) : !a.signedIn ? <SignInToAct /> : null}
            />
            {(ev.bannerPath || ev.headline || ev.presenterName) && (
              <section className="relative mb-6 overflow-hidden rounded-2xl border border-card-border bg-card" style={{ borderTopColor: ev.accentColor || undefined }}>
                {ev.bannerPath && <img src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/storage${ev.bannerPath}`} alt="" className="h-40 w-full object-cover sm:h-56" />}
                <div className="p-5 sm:p-6">
                  {ev.headline && <p className="font-mono text-xs font-semibold uppercase tracking-[.16em]" style={{ color: ev.accentColor || 'hsl(var(--primary))' }}>{ev.headline}</p>}
                  {ev.presenterName && <div className="mt-4 flex items-center gap-3">
                    {ev.presenterPhotoPath && <img src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/api/storage${ev.presenterPhotoPath}`} alt={`${ev.presenterName} presenter photo`} className="h-12 w-12 rounded-full object-cover" />}
                    <div><p className="text-xs uppercase tracking-wider text-muted-foreground">Featured presenter</p><p className="font-semibold">{ev.presenterName}</p></div>
                  </div>}
                  {ev.presenterBio && <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{ev.presenterBio}</p>}
                </div>
              </section>
            )}
            {ev.description && <p className="-mt-3 mb-6 max-w-3xl text-[15px] text-muted-foreground">{ev.description}</p>}
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              {a.isAdmin && <>
                <Stat label="Capacity" value={ev.capacity} />
                <Stat label="Registered" value={ev.registrations} />
                <Stat label="Checked in" value={ev.checkedIn} tone="ok" />
              </>}
              <Stat label="Sessions" value={sessions.length} tone="tape" sub={a.isAdmin ? `${rooms.length} rooms · ${ev.reserved ?? 0} held` : `${rooms.length} rooms`} />
            </div>

            <Tabs defaultValue={a.isAdmin ? 'program' : 'people'}>
              <TabsList className="mb-4 flex h-auto w-full max-w-full flex-wrap justify-start gap-1 bg-transparent p-0">
                {[['program', 'Rooms and sessions'], ['people', a.isAdmin ? 'Registrations' : mine ? 'Your pass' : 'Register'], ['door', 'Check-in desk'], ['qa', `Q&A (${qs.filter((q) => q.status === 'open').length})`], ['news', 'Announcements']].filter(([v]) => a.isAdmin || v !== 'door').map(([v, l]) => (
                  <TabsTrigger key={v} value={v} className="rounded-full border border-border px-4 data-[state=active]:border-foreground data-[state=active]:bg-foreground data-[state=active]:text-background" data-testid={`tab-${v}`}>{l}</TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="program">
                <div className="mb-3 flex flex-wrap gap-2">
                  {a.isAdmin && <Button variant="outline" onClick={() => setRoomOpen(true)} data-testid="button-add-room"><Plus className="mr-2 h-4 w-4" />Room</Button>}
                  {a.isAdmin && <Button onClick={() => setSessionEdit('new')} disabled={!rooms.length} data-testid="button-add-session"><Plus className="mr-2 h-4 w-4" />Session</Button>}
                  {a.isAdmin && !rooms.length && <span className="self-center text-xs text-muted-foreground">Add a room before scheduling sessions.</span>}
                </div>
                {rooms.length ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {rooms.map((r) => {
                      const rs = sessions.filter((s) => s.roomId === r.id);
                      return (
                        <Panel key={r.id} title={r.name} meta={a.isAdmin ? `capacity ${r.capacity} · ${r.registrations ?? regs.filter((reg) => reg.roomId === r.id).length} reserved · ${r.reserved ?? 0} held` : undefined} action={a.isAdmin && (
                          <Button size="icon" variant="ghost" onClick={() => cmd.run({ action: 'delete_room', id: r.id })} disabled={cmd.pending} aria-label="Delete room" data-testid={`button-delete-room-${r.id}`}><Trash2 className="h-4 w-4" /></Button>
                        )}>
                          {rs.length ? (
                            <ul className="divide-y divide-border">
                              {rs.map((s) => (
                                <li key={s.id} className="flex items-start gap-4 px-5 py-3" data-testid={`row-session-${s.id}`}>
                                  <div className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{fmtTime(s.startsAt, hour24)}<br />{fmtTime(s.endsAt, hour24)}</div>
                                  <div className="min-w-0 flex-1">
                                    <div className="font-medium leading-tight">{s.title}</div>
                                    <div className="text-xs text-muted-foreground">{s.presenterName || 'No presenter assigned'}</div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-1"><Pill status={s.status} />
                                      {canStart(s) && s.status === 'scheduled' && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => cmd.run({ action: 'start_session', id: s.id })} data-testid={`button-start-${s.id}`}><Play className="mr-1 h-3 w-3" />Start</Button>}
                                      {canStart(s) && s.status === 'live' && <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-live" onClick={() => cmd.run({ action: 'end_session', id: s.id })} data-testid={`button-end-${s.id}`}><Square className="mr-1 h-3 w-3" />End</Button>}
                                    </div>
                                  </div>
                                  {a.isAdmin && (
                                    <div className="flex">
                                      <Button size="icon" variant="ghost" onClick={() => setSessionEdit(s)} aria-label="Edit session" data-testid={`button-edit-session-${s.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                                      <Button size="icon" variant="ghost" onClick={() => setSessionDel(s)} aria-label="Delete session" data-testid={`button-delete-session-${s.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : <p className="px-5 py-6 text-sm text-muted-foreground">No sessions in this room yet.</p>}
                        </Panel>
                      );
                    })}
                  </div>
                ) : <Panel><Empty icon={<DoorOpen className="h-6 w-6" />} title="No rooms yet" body="Rooms can be halls, breakout spaces or virtual stages." /></Panel>}
                {a.isAdmin && rooms.length > 0 && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Room reservations are not live door counts. View current occupancy and unique visitors on <Link href={`/room-operations?eventId=${encodeURIComponent(ev.id)}`} className="font-semibold text-primary underline-offset-4 hover:underline">Room operations</Link>.</p>}
              </TabsContent>

              <TabsContent value="people">
                <div className={a.isAdmin ? "grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" : "grid w-full min-w-0 max-w-xl grid-cols-1 gap-4"}>
                  {a.isAdmin && <Panel title="Registrations" meta={`${regs.length}`} action={<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-8 w-40" data-testid="input-search-registrations" />}>
                    {filteredRegs.length ? (
                      <ul className="divide-y divide-border">
                        {filteredRegs.map((r) => (
                          <li key={r.id} className="flex items-center gap-3 px-5 py-2.5" data-testid={`row-registration-${r.id}`}>
                            <div className="min-w-0 flex-1"><div className="truncate font-medium">{r.name}</div><div className="truncate text-xs text-muted-foreground">{r.email}</div></div>
                            <span className="hidden font-mono text-xs tracking-widest text-muted-foreground sm:block">{r.passCode}</span>
                            <Pill status={r.checkedIn ? 'in' : 'out'} label={r.checkedIn ? 'in' : 'out'} />
                            <Button size="icon" variant="ghost" onClick={() => setPass(r)} aria-label="Show pass" data-testid={`button-pass-${r.id}`}><QrCode className="h-4 w-4" /></Button>
                            {a.isAdmin && (
                              <Button size="sm" variant="outline" disabled={cmd.pending} onClick={() => cmd.run({ action: r.checkedIn ? 'check_out' : 'check_in', id: r.id })} data-testid={`button-toggle-checkin-${r.id}`}>{r.checkedIn ? 'Check out' : 'Check in'}</Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : <Empty icon={<UserPlus className="h-6 w-6" />} title={search ? 'No match' : 'No registrations yet'} />}
                  </Panel>}
                   <Panel title={isPaid ? 'Get a ticket' : 'Register'} meta={isPaid ? ticketPrice : 'Free'}>
                    <div className="space-y-3 p-5">
                       {mine ? (
                         <div className="space-y-3">
                            <PassCard reg={mine} event={ev} roomName={roomForPass?.name} />
                           <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">Automated confirmation email is unavailable until an email service is connected. Your confirmed pass and event details remain available here.</div>
                           {a.user?.email && <a href={`mailto:${encodeURIComponent(a.user.email)}?subject=${encodeURIComponent(`Event details: ${ev.title}`)}&body=${encodeURIComponent(`${ev.title}\n${fmtDate(ev.startsAt)}\n${ev.location || 'Location TBA'}${roomForPass ? `\nRoom: ${roomForPass.name}` : ''}`)}`} className="inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline" data-testid="link-email-event-details"><Mail className="h-3.5 w-3.5" />Open email app with event details</a>}
                           {rooms.length > 0 && <div className="space-y-2 border-t border-border pt-3">
                             <p className="text-xs font-semibold">Change your room reservation</p>{roomSelection}
                             <Button className="w-full" variant="outline" disabled={!selectedRoom || selectedRoom === mine.roomId || cmd.pending} onClick={() => cmd.run({ action: 'reserve_room', eventId: ev.id, roomId: selectedRoom }, () => setSelectedRoom(''))} data-testid="button-change-room">Update room</Button>
                           </div>}
                         </div>
                       ) : pendingOrders.length > 0 ? (
                         <div className="space-y-3">
                           <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                             <div className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4" />Checkout in progress</div>
                             <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Your room seat is held until {fmtStamp(pendingOrders[0].expiresAt)}. This is not a pass; a confirmed registration appears here after payment is verified.</p>
                           </div>
                           {pendingOrders.map((order) => <div className="flex gap-2" key={order.id}>
                             <Button className="flex-1" disabled={checkout.isPending} onClick={() => checkout.mutate({ data: { eventId: ev.id, ...(order.roomId ? { roomId: order.roomId } : {}) } })} data-testid={`button-resume-checkout-${order.id}`}>Resume checkout</Button>
                             <Button variant="outline" disabled={cancelCheckout.isPending} onClick={() => cancelCheckout.mutate({ id: order.id })} data-testid={`button-cancel-checkout-${order.id}`}>Cancel</Button>
                           </div>)}
                           <p className="text-[11px] text-muted-foreground">Success or cancel return links do not verify payment. We show your pass only after confirmation.</p>
                         </div>
                       ) : isPaid ? (
                         <>
                           {!amountKnown && <p className="text-xs text-muted-foreground">This event requires a paid ticket. Price details will be confirmed securely at checkout.</p>}
                           {!a.signedIn ? <SignInToAct label="Sign in to buy a ticket" /> : <>
                             {rooms.length > 0 && roomSelection}
                             {a.isAdmin && <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] text-muted-foreground">Admin tickets also use Stripe checkout. Free-pass issuance is unavailable for paid events.</div>}
                             <Field label="Coupon code (optional)"><Input value={couponCode} maxLength={40} onChange={(e) => setCouponCode(e.target.value)} placeholder="Enter code" data-testid="input-checkout-coupon" /></Field>
                             <Button className="w-full" disabled={checkout.isPending || (rooms.length > 0 && !selectedRoom) || ws.checkoutReady === false} onClick={registerPaid} data-testid="button-register-paid"><Ticket className="mr-2 h-4 w-4" />{checkout.isPending ? 'Opening secure checkout…' : 'Continue to checkout'}</Button>
                             {ws.checkoutReady === false && <p className="text-xs text-muted-foreground">Online checkout is not configured yet. Ask the organizer for an update.</p>}
                             <p className="text-[11px] leading-relaxed text-muted-foreground">A seat is held for about 30 minutes while checkout is open. Registration is complete only after payment confirmation.</p>
                           </>}
                         </>
                       ) : a.isAdmin ? (
                        <>
                          <Field label="Name"><Input value={regName} maxLength={120} onChange={(e) => setRegName(e.target.value)} data-testid="input-reg-name" /></Field>
                          <Field label="Email"><Input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} data-testid="input-reg-email" /></Field>
                           {rooms.length > 0 && roomSelection}
                           <Button className="w-full" disabled={!regName.trim() || !/\S+@\S+\.\S+/.test(regEmail) || (rooms.length > 0 && !selectedRoom) || cmd.pending} onClick={() => cmd.run({ action: 'register', eventId: ev.id, ...(selectedRoom ? { roomId: selectedRoom } : {}), name: regName.trim(), email: regEmail.trim() }, () => { setRegName(''); setRegEmail(''); setSelectedRoom(''); })} data-testid="button-register-attendee">Issue free pass</Button>
                        </>
                      ) : a.signedIn ? (
                         <>
                           {rooms.length > 0 && roomSelection}
                           <Button className="w-full" disabled={cmd.pending || (rooms.length > 0 && !selectedRoom)} onClick={() => cmd.run({ action: 'register', eventId: ev.id, ...(selectedRoom ? { roomId: selectedRoom } : {}) }, () => setSelectedRoom(''))} data-testid="button-register-self">Register with my account</Button>
                         </>
                      ) : <SignInToAct label="Sign in to register" />}
                    </div>
                  </Panel>
                </div>
                 {a.isAdmin && isPaid && <Panel title="Discount codes" meta="Admin only">
                   <div className="space-y-4 p-5">
                     <p className="text-xs leading-relaxed text-muted-foreground">Codes are created as real Stripe discounts restricted to this event. The attendee enters the code at checkout.</p>
                     <div className="grid gap-3 sm:grid-cols-2">
                       <Field label="Code"><Input value={couponForm.code} maxLength={40} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })} placeholder="SPRING25" data-testid="input-coupon-code" /></Field>
                       <Field label="Percent off"><Input type="number" min={1} max={100} step={1} value={couponForm.percentOff} onChange={(e) => setCouponForm({ ...couponForm, percentOff: e.target.value })} data-testid="input-coupon-percent" /></Field>
                       <Field label="Redemption limit"><Input type="number" min={1} step={1} value={couponForm.maxRedemptions} onChange={(e) => setCouponForm({ ...couponForm, maxRedemptions: e.target.value })} placeholder="No limit" data-testid="input-coupon-limit" /></Field>
                       <Field label="Expires (optional)"><Input type="datetime-local" value={couponForm.expiresAt} onChange={(e) => setCouponForm({ ...couponForm, expiresAt: e.target.value })} data-testid="input-coupon-expiry" /></Field>
                     </div>
                     <Button disabled={!couponForm.code.trim() || !/^[A-Za-z0-9_-]{3,40}$/.test(couponForm.code) || !Number.isInteger(Number(couponForm.percentOff)) || Number(couponForm.percentOff) < 1 || Number(couponForm.percentOff) > 100 || (couponForm.maxRedemptions && (!Number.isInteger(Number(couponForm.maxRedemptions)) || Number(couponForm.maxRedemptions) < 1)) || (couponForm.expiresAt && new Date(couponForm.expiresAt).getTime() <= Date.now()) || cmd.pending} onClick={() => cmd.run({ action: 'create_coupon', eventId: ev.id, code: couponForm.code.trim(), percentOff: Number(couponForm.percentOff), ...(couponForm.maxRedemptions ? { maxRedemptions: Number(couponForm.maxRedemptions) } : {}), ...(couponForm.expiresAt ? { expiresAt: new Date(couponForm.expiresAt).toISOString() } : {}) }, () => setCouponForm({ code: '', percentOff: '10', maxRedemptions: '', expiresAt: '' }))} data-testid="button-create-coupon"><Tag className="mr-2 h-4 w-4" />Create coupon</Button>
                     <div className="divide-y divide-border rounded-xl border border-border">
                       {(ws.coupons ?? []).filter((coupon) => coupon.eventId === ev.id).map((coupon) => <div key={coupon.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                         <span className="min-w-0 flex-1 font-mono font-semibold">{coupon.code}</span><span className="text-xs text-muted-foreground">{coupon.percentOff}% · {coupon.redemptions}{coupon.maxRedemptions != null ? `/${coupon.maxRedemptions}` : ''} used</span><Pill status={coupon.active ? 'active' : 'inactive'} />
                         <Button size="sm" variant="outline" disabled={cmd.pending} onClick={() => cmd.run({ action: 'toggle_coupon', id: coupon.id, active: !coupon.active })} data-testid={`button-toggle-coupon-${coupon.id}`}>{coupon.active ? 'Deactivate' : 'Activate'}</Button>
                       </div>)}
                       {!(ws.coupons ?? []).some((coupon) => coupon.eventId === ev.id) && <p className="p-3 text-xs text-muted-foreground">No coupons created for this event.</p>}
                     </div>
                   </div>
                 </Panel>}
              </TabsContent>

              {a.isAdmin && <TabsContent value="door">
                <Panel title="Check-in desk" meta={`${ev.checkedIn} of ${ev.registrations} inside`}><CheckInDesk canAct={a.isAdmin} /></Panel>
              </TabsContent>}

              <TabsContent value="qa">
                <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                  <Panel title="Questions" meta="live"><QuestionList questions={qs} sessions={sessions} canAnswer={(q) => a.isAdmin || (a.isPresenter && sessions.find((s) => s.id === q.sessionId)?.presenterId === a.user?.id)} /></Panel>
                  <Panel title="Ask"><div className="p-5">{a.signedIn ? (sessions.length ? <AskBox sessions={sessions} /> : <p className="text-sm text-muted-foreground">No sessions to ask about yet.</p>) : <SignInToAct label="Sign in to ask" />}</div></Panel>
                </div>
              </TabsContent>

              <TabsContent value="news">
                <Panel title="Announcements">{a.isAdmin && <AnnounceForm eventId={ev.id} />}<AnnouncementList items={anns} canDelete={a.isAdmin} /></Panel>
              </TabsContent>
            </Tabs>

            {editing && <EventDialog open={editing} onOpenChange={setEditing} event={ev} />}
            {roomOpen && <RoomDialog open={roomOpen} onOpenChange={setRoomOpen} eventId={ev.id} />}
            {sessionEdit && <SessionDialog open onOpenChange={(o) => !o && setSessionEdit(null)} eventId={ev.id} rooms={rooms} users={ws.users} event={ev} session={sessionEdit === 'new' ? undefined : sessionEdit} />}
            <Confirm open={deleting} onOpenChange={setDeleting} title={`Delete ${ev.title}?`} body="Rooms, sessions, passes, room attendance history, questions and announcements for this event will be permanently removed." onConfirm={() => cmd.run({ action: 'delete_event', id: ev.id }, () => nav('/events'))} />
            <Confirm open={!!sessionDel} onOpenChange={(o) => !o && setSessionDel(null)} title="Delete session?" body={sessionDel?.title ?? ''} onConfirm={() => sessionDel && cmd.run({ action: 'delete_session', id: sessionDel.id })} />
            <Dialog open={!!pass} onOpenChange={(o) => !o && setPass(null)}>
              <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm overflow-y-auto overscroll-contain border-0 bg-transparent p-0 shadow-none">
                <DialogTitle className="sr-only">Pass</DialogTitle>
                {pass && <PassCard reg={pass} event={ev} roomName={pass.roomId ? rooms.find((room) => room.id === pass.roomId)?.name : undefined} />}
                {pass && <p className="text-center font-mono text-[11px] text-background/80">issued {fmtStamp(pass.createdAt)}</p>}
              </DialogContent>
            </Dialog>
          </>
        );
      }}
    </WS>
  );
}
