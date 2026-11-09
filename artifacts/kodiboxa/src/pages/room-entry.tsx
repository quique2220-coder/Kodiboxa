import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { SignIn } from '@clerk/react';
import { ArrowLeft, ArrowRight, CalendarClock, DoorOpen, MapPin, ShieldCheck, TicketCheck } from 'lucide-react';
import { getGetRoomEntryQueryKey, useGetRoomEntry } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { access, errorMessage, fmtDate, fmtTime, useCommand, useWorkspace } from '@/lib/workspace';
import { Pill } from '@/components/bits';

export default function RoomEntry() {
  const { id = '' } = useParams<{ id: string }>();
  const workspace = useWorkspace();
  const a = access(workspace.data);
  const entry = useGetRoomEntry(id, {
    query: { enabled: a.signedIn, queryKey: getGetRoomEntryQueryKey(id), refetchInterval: 3000 },
  });
  const cmd = useCommand();
  const [busyAction, setBusyAction] = useState<'in' | 'out' | null>(null);
  const roomEntry = entry.data;
  const eventClosed = roomEntry ? ['draft', 'completed'].includes(roomEntry.event.status) : false;
  const ownRoomPresence = roomEntry?.presence;
  const alreadyHere = ownRoomPresence?.roomId === id;
  const inOtherRoom = !!ownRoomPresence && ownRoomPresence.roomId !== id;
  const canEnter = !!roomEntry?.registered && !eventClosed && !ownRoomPresence;

  const submit = (action: 'in' | 'out') => {
    setBusyAction(action);
    cmd.run({ action: action === 'in' ? 'room_check_in' : 'room_check_out', roomId: id }, () => {
      setBusyAction(null);
      void entry.refetch();
    }, () => setBusyAction(null));
  };

  if (!a.signedIn) return <main className="min-h-[100dvh] bg-background px-4 py-8 sm:px-6">
    <div className="mx-auto max-w-md">
      <BrandMark />
      <section className="mt-10 rounded-3xl border border-border bg-card p-5 shadow-md sm:p-7">
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">ROOM ENTRY</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Sign in to enter</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your QR opens the right room. Sign in to check your registration and room status; you will return here after authentication.</p>
        <div className="mt-6"><SignIn routing="hash" forceRedirectUrl={window.location.href} /></div>
        <p className="mt-5 text-center text-[11px] text-muted-foreground">KODIBOXA · A KODELOTH platform</p>
      </section>
    </div>
  </main>;

  if (workspace.isLoading || entry.isLoading) return <main className="min-h-[100dvh] bg-background px-4 py-8"><div className="mx-auto max-w-2xl space-y-4">
    <BrandMark /><div className="mt-10 h-10 w-48 animate-pulse rounded-lg bg-muted" /><div className="h-64 animate-pulse rounded-3xl bg-muted" /><div className="h-24 animate-pulse rounded-2xl bg-muted" />
  </div></main>;

  if (entry.isError || !roomEntry) {
    const message = errorMessage(entry.error);
    const isRegistrationDenied = /registration|registered|pass|forbidden|403/i.test(message);
    return <main className="min-h-[100dvh] bg-background px-4 py-8"><div className="mx-auto max-w-2xl">
      <BrandMark />
      <section className="mt-10 rounded-3xl border border-border bg-card p-6 sm:p-9">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-tape/20 text-foreground"><ShieldCheck className="h-6 w-6" /></div>
        <h1 className="mt-5 font-display text-3xl font-bold">{isRegistrationDenied ? 'Registration required' : 'Room details unavailable'}</h1>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{isRegistrationDenied
          ? 'This account does not have a confirmed registration for the event linked to this room. Use the account that holds your pass, or register with the event organizer.'
          : 'We could not confirm this room entry right now. Please try again or ask the event team for help.'}</p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void entry.refetch()} data-testid="button-retry-room-entry">Try again</Button>
          <Link href="/events" className="inline-flex h-9 items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent" data-testid="link-browse-events">Browse events</Link>
        </div>
        {!isRegistrationDenied && <p className="mt-5 text-xs text-muted-foreground" role="status">Detail: {message}</p>}
      </section>
    </div></main>;
  }

  const sessions = [...roomEntry.sessions].sort((x, y) => x.startsAt.localeCompare(y.startsAt));
  return <main className="min-h-[100dvh] bg-background px-4 pb-12 pt-5 sm:px-6">
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3"><BrandMark /><Link href={`/events/${roomEntry.event.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground" data-testid="link-room-event"><ArrowLeft className="h-3.5 w-3.5" />Event details</Link></div>
      <div className="mt-7 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="relative overflow-hidden bg-sidebar px-6 pb-8 pt-7 text-sidebar-foreground sm:px-9 sm:pb-10">
          <div className="absolute -right-14 -top-24 h-64 w-64 rounded-full border border-sidebar-primary/20" /><div className="absolute -right-2 -top-14 h-40 w-40 rounded-full border border-sidebar-primary/20" />
          <p className="relative font-mono text-[10px] uppercase tracking-[.2em] text-sidebar-primary">KODIBOXA / ROOM DOOR</p>
          <div className="relative mt-5 flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-sm text-sidebar-foreground/65">{roomEntry.event.title}</p><h1 className="mt-1 font-display text-4xl font-bold tracking-tight sm:text-5xl" data-testid="text-entry-room-name">{roomEntry.room.name}</h1></div>
            <div className="rounded-xl border border-sidebar-foreground/15 bg-sidebar-foreground/5 px-3 py-2 font-mono text-xs">ROOM CAPACITY <strong className="ml-1 text-sidebar-primary">{roomEntry.room.capacity}</strong></div>
          </div>
        </div>
        <div className="grid gap-0 md:grid-cols-[1fr_275px]">
          <div className="p-5 sm:p-8">
            <div className="flex flex-wrap gap-2">
              <Pill status={roomEntry.event.status} />
              {roomEntry.registered ? <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/20 bg-ok/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ok"><TicketCheck className="h-3.5 w-3.5" />Registration confirmed</span> : <Pill status="unavailable" label="Organizer access" />}
            </div>
            <div className="mt-5 space-y-2 text-sm text-muted-foreground">
              <p className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" />{fmtDate(roomEntry.event.startsAt)} · {fmtTime(roomEntry.event.startsAt)}–{fmtTime(roomEntry.event.endsAt)}</p>
              {roomEntry.event.location && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{roomEntry.event.location}</p>}
              {roomEntry.event.description && <p className="pt-2 leading-relaxed">{roomEntry.event.description}</p>}
            </div>
            <section className="mt-7 border-t border-border pt-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-xl font-bold">Room schedule</h2><span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{sessions.length} sessions</span></div>
              {sessions.length ? <ul className="space-y-2">{sessions.map((session) => <li key={session.id} className="flex gap-3 rounded-xl border border-border bg-background/50 p-3">
                <div className="w-[4.5rem] shrink-0 font-mono text-[11px] leading-relaxed tabular-nums text-muted-foreground">{fmtTime(session.startsAt)}<br />{fmtTime(session.endsAt)}</div>
                <div className="min-w-0"><p className="text-sm font-semibold">{session.title}</p><p className="text-xs text-muted-foreground">{session.presenterName || 'Speaker not listed'}</p></div>
              </li>)}</ul> : <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">The organizer has not posted a session schedule for this room.</p>}
            </section>
          </div>
          <aside className="border-t border-border bg-muted/25 p-5 sm:p-7 md:border-l md:border-t-0">
            <p className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">YOUR ROOM STATUS</p>
            {alreadyHere ? <div className="mt-4 rounded-2xl border border-ok/25 bg-ok/5 p-4" role="status" data-testid="status-room-inside">
              <div className="flex items-center gap-2 text-sm font-semibold text-ok"><span className="h-2 w-2 rounded-full bg-ok" />You are checked in</div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">You entered {roomEntry.room.name} at {fmtTime(ownRoomPresence!.enteredAt)}. Your status is private to your account.</p>
              <Button variant="outline" className="mt-4 w-full" onClick={() => submit('out')} disabled={cmd.pending || busyAction === 'out'} data-testid="button-room-exit"><ArrowLeft className="mr-2 h-4 w-4" />{busyAction === 'out' || cmd.pending ? 'Checking out…' : 'Check out of room'}</Button>
            </div> : inOtherRoom ? <div className="mt-4 rounded-2xl border border-tape/40 bg-tape/10 p-4" role="status" data-testid="status-other-room">
              <DoorOpen className="h-5 w-5 text-foreground" /><p className="mt-2 text-sm font-semibold">You are checked in elsewhere</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Check out of {ownRoomPresence!.roomName} before entering this room. This keeps your attendance status accurate.</p>
              <Link href={`/room-entry/${encodeURIComponent(ownRoomPresence!.roomId)}`} className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent" data-testid="link-current-room"><ArrowLeft className="h-4 w-4" />Open current room</Link>
            </div> : !roomEntry.registered ? <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4" role="status">
              <p className="text-sm font-semibold">{a.isAdmin ? 'Organizer view only' : 'A confirmed event pass is needed'}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{a.isAdmin
                ? 'You can review this room and its schedule, but self-entry is available only to an account with its own confirmed attendee pass.'
                : 'Room entry is available to registered attendees. If you already have a pass, sign in with the account used to register.'}</p>
              {!a.isAdmin && <Link href={`/events/${roomEntry.event.id}`} className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90" data-testid="link-event-registration">View registration details <ArrowRight className="h-4 w-4" /></Link>}
            </div> : eventClosed ? <div className="mt-4 rounded-2xl border border-border bg-background/60 p-4" role="status"><p className="text-sm font-semibold">{roomEntry.event.status === 'draft' ? 'Event is not open yet' : 'Event has ended'}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">New room entry is unavailable for this event. If you are already checked in, you can still check out from this page.</p></div> : <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.045] p-4">
              <p className="text-sm font-semibold">Ready when you are</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Entry is never automatic. Confirm to record your arrival at this door.</p>
              <Button className="mt-4 w-full" onClick={() => submit('in')} disabled={!canEnter || cmd.pending || busyAction === 'in'} data-testid="button-room-enter"><DoorOpen className="mr-2 h-4 w-4" />{busyAction === 'in' || cmd.pending ? 'Checking in…' : 'Check in to room'}</Button>
            </div>}
            <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">Room entry QR links identify a room only. They do not grant registration or organizer permissions.</p>
          </aside>
        </div>
      </div>
      <footer className="mt-5 text-center font-mono text-[9px] uppercase tracking-[.18em] text-muted-foreground">KODIBOXA · A KODELOTH platform</footer>
    </div>
  </main>;
}

function BrandMark() {
  return <Link href="/" className="inline-flex items-center gap-2.5" aria-label="KODIBOXA home"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sidebar font-display text-lg font-extrabold text-sidebar-primary">K</span><span><span className="block font-display text-[16px] font-extrabold tracking-tight">KODIBOXA</span><span className="block font-mono text-[8px] uppercase tracking-[.18em] text-muted-foreground">by KODELOTH</span></span></Link>;
}
