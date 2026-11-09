import { useMemo, useState } from 'react';
import type { Event, CommandInputCurrency } from '@workspace/api-client-react';
import { ArrowUpRight, ImagePlus, LoaderCircle, Palette, Ticket, X, DoorOpen, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { NativeSelect, Field } from '@/components/forms';
import { useCommand, toLocalInput, fromLocalInput, errorMessage } from '@/lib/workspace';
import { useRequestUploadUrl, useCompleteUpload } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { RoomPlanEditor, newRoomPlans, type PlanRoom } from '@/components/room-plan-editor';
import { useWorkspace } from '@/lib/workspace';
import { fmtDate, fmtTime } from '@/lib/workspace';

const TYPES = ['conference', 'hybrid', 'workshop', 'class', 'meeting'] as const;
const STATUSES = ['draft', 'upcoming', 'live', 'completed'] as const;
const CURRENCIES = ['usd', 'eur', 'gbp', 'cad', 'mxn'] as const;
const assetUrl = (path: string) => path ? `/api/storage${path}` : '';

export function EventDialog({ open, onOpenChange, event }: { open: boolean; onOpenChange: (o: boolean) => void; event?: Event }) {
  const cmd = useCommand();
  const { toast } = useToast();
  const requestUpload = useRequestUploadUrl();
  const completeUpload = useCompleteUpload();
  const workspace = useWorkspace();
  const now = new Date();
  const later = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const initialAmount = event?.ticketAmount == null ? '' : (event.ticketAmount / 100).toFixed(2);
  const priceKnown = event?.ticketAmount != null || !event?.stripePriceId;
  const [f, setF] = useState({
    title: event?.title ?? '',
    headline: event?.headline ?? '',
    description: event?.description ?? '',
    type: event?.type ?? 'conference',
    status: event?.status ?? 'upcoming',
    location: event?.location ?? '',
    startsAt: toLocalInput(event?.startsAt ?? now.toISOString()),
    endsAt: toLocalInput(event?.endsAt ?? later.toISOString()),
    capacity: String(event?.capacity ?? 120),
    isPrivate: event?.isPrivate ?? false,
    sponsorsVisible: event?.sponsorsVisible ?? true,
    accentColor: event?.accentColor ?? '#28B8D2',
    presenterName: event?.presenterName ?? '',
    presenterBio: event?.presenterBio ?? '',
    bannerPath: event?.bannerPath ?? '',
    presenterPhotoPath: event?.presenterPhotoPath ?? '',
    amount: initialAmount,
    currency: event?.currency ?? 'usd',
    free: event?.stripePriceId ? false : true,
    retainUnknownPrice: !priceKnown,
  });
  const [uploading, setUploading] = useState<'banner' | 'photo' | null>(null);
  const [activeSection, setActiveSection] = useState<'overview' | 'presentation' | 'access' | 'rooms'>('overview');
  const [roomPlans, setRoomPlans] = useState<PlanRoom[]>(() => newRoomPlans(1, event?.capacity ?? 120));
  const up = (p: Partial<typeof f>) => setF((o) => {
    const n = { ...o, ...p };
    if (p.type === 'meeting' && !event) n.isPrivate = true;
    if (n.isPrivate) n.sponsorsVisible = false;
    return n;
  });
  const parsedAmount = Number(f.amount);
  const cents = Math.round(parsedAmount * 100);
  const priceValid = f.retainUnknownPrice || f.free || (/^\d+(\.\d{1,2})?$/.test(f.amount) && Number.isFinite(parsedAmount) && cents >= 100);
  const eventStart = new Date(f.startsAt).getTime();
  const eventEnd = new Date(f.endsAt).getTime();
  const roomErrors = useMemo(() => {
    if (event || !f.startsAt || !f.endsAt) return [] as string[];
    const errors: string[] = [];
    const speakerSlots = new Map<string, { start: number; end: number; label: string }[]>();
    const roomNames = new Set<string>();
    roomPlans.forEach((room, ri) => {
      const label = `Room ${ri + 1}`;
      const name = room.name.trim().toLowerCase();
      if (!room.name.trim()) errors.push(`${label}: enter a room name.`);
      else if (roomNames.has(name)) errors.push(`${label}: room names must be unique.`);
      if (name) roomNames.add(name);
      const cap = Number(room.capacity);
      if (!Number.isInteger(cap) || cap < 1) errors.push(`${label}: enter a capacity of at least 1.`);
      else if (cap > Number(f.capacity)) errors.push(`${label}: capacity cannot exceed the event capacity of ${f.capacity}.`);
      if (!room.sessions.length) errors.push(`${label}: add at least one session.`);
      room.sessions.forEach((s, si) => {
        const sessionLabel = `${label}, session ${si + 1}`;
        const start = new Date(s.startsAt).getTime();
        const end = new Date(s.endsAt).getTime();
        if (!s.title.trim()) errors.push(`${sessionLabel}: enter a title.`);
        if (!s.presenterName.trim()) errors.push(`${sessionLabel}: speaker name is required.`);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) errors.push(`${sessionLabel}: enter a valid start and end time.`);
        else if (start < eventStart || end > eventEnd) errors.push(`${sessionLabel}: schedule it within the event dates.`);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          const speakerKeys = [`name:${s.presenterName.trim().toLowerCase()}`, ...(s.presenterId ? [`account:${s.presenterId}`] : [])];
          const speakerConflict = speakerKeys.some((key) => (speakerSlots.get(key) ?? []).some((slot) => start < slot.end && end > slot.start));
          if (speakerConflict) errors.push(`${sessionLabel}: ${s.presenterName.trim()} has another session at this time.`);
          speakerKeys.forEach((key) => speakerSlots.set(key, [...(speakerSlots.get(key) ?? []), { start, end, label: sessionLabel }]));
          const sameRoomSessions = room.sessions.slice(0, si).filter((other) => {
            const os = new Date(other.startsAt).getTime(), oe = new Date(other.endsAt).getTime();
            return start < oe && end > os;
          });
          if (sameRoomSessions.length) errors.push(`${sessionLabel}: sessions in the same room cannot overlap.`);
        }
      });
    });
    return errors;
  }, [event, eventStart, eventEnd, f.startsAt, f.endsAt, f.capacity, roomPlans]);
  const valid = !!f.title.trim() && !!f.startsAt && !!f.endsAt && Number.isInteger(Number(f.capacity)) && Number(f.capacity) >= 1 && Number(f.capacity) <= 100000 &&
    eventEnd > eventStart && /^#[0-9a-fA-F]{6}$/.test(f.accentColor) && priceValid && (event || roomErrors.length === 0);

  const uploadImage = async (file?: File, target?: 'banner' | 'photo') => {
    if (!file || !target) return;
    if (file.type !== 'image/png') {
      toast({ title: 'PNG files only', description: 'Choose a PNG image under 2 MB.', variant: 'destructive' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Image is too large', description: 'Choose a PNG image under 2 MB.', variant: 'destructive' });
      return;
    }
    setUploading(target);
    try {
      const signed = await requestUpload.mutateAsync({ data: { name: file.name, size: file.size, contentType: 'image/png' } });
      const response = await fetch(signed.uploadURL, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: file });
      if (!response.ok) throw new Error('The image upload did not complete.');
      const completed = await completeUpload.mutateAsync({ data: { objectPath: signed.objectPath } });
      up(target === 'banner' ? { bannerPath: completed.objectPath } : { presenterPhotoPath: completed.objectPath });
      toast({ title: target === 'banner' ? 'Banner uploaded' : 'Presenter photo uploaded' });
    } catch (error) {
      toast({ title: 'Upload failed', description: errorMessage(error), variant: 'destructive' });
    } finally {
      setUploading(null);
    }
  };

  const submit = () => {
    const amount = f.retainUnknownPrice ? undefined : f.free ? 0 : cents;
    cmd.run({
      action: event ? 'update_event' : 'create_event',
      id: event?.id,
      title: f.title.trim(),
      headline: f.headline.trim(),
      description: f.description,
      type: f.type,
      status: f.status,
      location: f.location,
      startsAt: fromLocalInput(f.startsAt),
      endsAt: fromLocalInput(f.endsAt),
      capacity: Number(f.capacity),
      isPrivate: f.isPrivate,
      sponsorsVisible: f.isPrivate ? false : f.sponsorsVisible,
      bannerPath: f.bannerPath,
      accentColor: f.accentColor,
      presenterName: f.presenterName.trim(),
      presenterBio: f.presenterBio,
      presenterPhotoPath: f.presenterPhotoPath,
      ...(amount !== undefined ? { ticketAmount: amount } : {}),
      currency: f.currency as CommandInputCurrency,
      ...(!event ? { roomPlans: roomPlans.map((r) => ({
        name: r.name.trim(),
        capacity: Number(r.capacity),
        sessions: r.sessions.map((s) => ({
          title: s.title.trim(),
          presenterName: s.presenterName.trim(),
          ...(s.presenterId ? { presenterId: s.presenterId } : {}),
          startsAt: fromLocalInput(s.startsAt),
          endsAt: fromLocalInput(s.endsAt),
        })),
      })) } : {}),
    }, () => onOpenChange(false));
  };

  const nav = [
    ['overview', 'Event basics', '01'],
    ['presentation', 'Attendee page', '02'],
    ['access', 'Tickets & visibility', '03'],
    ['rooms', 'Rooms & speakers', '04'],
  ] as const;
  const savedRooms = (workspace.data?.rooms ?? []).filter((r) => r.eventId === event?.id);
  const savedSessions = (workspace.data?.sessions ?? []).filter((s) => s.eventId === event?.id).sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto p-0">
        <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="border-b border-border bg-muted/50 p-5 md:border-b-0 md:border-r md:p-6">
            <div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">KODIBOXA / EVENT DESK</div>
            <DialogHeader className="mt-3 text-left">
              <DialogTitle className="font-display text-2xl">{event ? 'Shape your event' : 'Open a new event'}</DialogTitle>
              <DialogDescription className="text-xs leading-relaxed">One clear setup for the schedule, attendee page and entry rules.</DialogDescription>
            </DialogHeader>
            <nav className="mt-6 grid grid-cols-2 gap-2 md:grid-cols-1" aria-label="Editor sections">
              {nav.map(([id, label, number]) => (
                <button key={id} type="button" onClick={() => setActiveSection(id)} data-testid={`editor-section-${id}`}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left text-xs transition-colors ${activeSection === id ? 'border-primary/40 bg-card text-foreground shadow-sm' : 'border-transparent text-muted-foreground hover:bg-card/70'}`}>
                  <span className="font-mono text-[10px] text-primary">{number}</span><span className="font-semibold">{label}</span>
                </button>
              ))}
            </nav>
            <div className="mt-7 hidden rounded-2xl bg-sidebar p-4 text-sidebar-foreground md:block">
              <Palette className="mb-3 h-4 w-4 text-cyan-300" />
              <p className="text-xs font-semibold">Make it yours</p>
              <p className="mt-1 text-[11px] leading-relaxed opacity-70">Changes show up on the public attendee event page after saving.</p>
            </div>
          </aside>

          <div className="min-w-0 p-5 md:p-8">
            <div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-4">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[.18em] text-muted-foreground">{nav.find(([id]) => id === activeSection)?.[1]}</div>
                <p className="mt-1 text-sm text-muted-foreground">Build the details attendees will actually use.</p>
              </div>
              {event && <span className="rounded-full bg-muted px-3 py-1 font-mono text-[10px] uppercase text-muted-foreground">Editing saved event</span>}
            </div>

            {activeSection === 'overview' && <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Event name"><Input value={f.title} maxLength={180} onChange={(e) => up({ title: e.target.value })} data-testid="input-event-title" placeholder="The name people will recognize" /></Field></div>
                <Field label="Format"><NativeSelect value={f.type} onChange={(e) => up({ type: e.target.value as typeof f.type })} data-testid="select-event-type">{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</NativeSelect></Field>
                <Field label="Status"><NativeSelect value={f.status} onChange={(e) => up({ status: e.target.value as typeof f.status })} data-testid="select-event-status">{STATUSES.map((t) => <option key={t} value={t}>{t}</option>)}</NativeSelect></Field>
                <Field label="Starts"><Input type="datetime-local" value={f.startsAt} onChange={(e) => up({ startsAt: e.target.value })} data-testid="input-event-starts" /></Field>
                <Field label="Ends"><Input type="datetime-local" value={f.endsAt} onChange={(e) => up({ endsAt: e.target.value })} data-testid="input-event-ends" /></Field>
                <Field label="Location"><Input value={f.location} maxLength={250} placeholder="Venue or stream details" onChange={(e) => up({ location: e.target.value })} data-testid="input-event-location" /></Field>
                <Field label="Total capacity"><Input type="number" min={1} max={100000} value={f.capacity} onChange={(e) => up({ capacity: e.target.value })} data-testid="input-event-capacity" /></Field>
                <div className="sm:col-span-2"><Field label="Description"><Textarea rows={5} maxLength={5000} value={f.description} onChange={(e) => up({ description: e.target.value })} data-testid="input-event-description" placeholder="What will happen, who should come, and what to know before arriving." /></Field></div>
              </div>
              <Button variant="outline" onClick={() => setActiveSection('presentation')} className="gap-2">Next: attendee page <ArrowUpRight className="h-4 w-4" /></Button>
            </div>}

            {activeSection === 'presentation' && <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Field label="Attendee headline"><Input value={f.headline} maxLength={180} onChange={(e) => up({ headline: e.target.value })} data-testid="input-event-headline" placeholder="A concise line that sets the scene" /></Field></div>
                <Field label="Theme accent"><div className="flex gap-2"><Input type="color" value={f.accentColor} onChange={(e) => up({ accentColor: e.target.value })} className="h-10 w-14 p-1" aria-label="Choose attendee page accent" data-testid="input-event-accent" /><Input value={f.accentColor} maxLength={7} onChange={(e) => up({ accentColor: e.target.value })} data-testid="input-event-accent-hex" /></div></Field>
                <div className="sm:col-span-2 rounded-2xl border border-border bg-muted/40 p-4">
                  <div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-semibold">Event banner</p><p className="text-xs text-muted-foreground">PNG only · up to 2 MB</p></div>{f.bannerPath && <Button type="button" variant="ghost" size="sm" onClick={() => up({ bannerPath: '' })} data-testid="button-remove-banner"><X className="mr-1 h-3.5 w-3.5" />Remove</Button>}</div>
                  {f.bannerPath ? <img src={assetUrl(f.bannerPath)} alt="Event banner preview" className="mb-3 h-36 w-full rounded-xl object-cover" /> : <div className="mb-3 flex h-24 items-center justify-center rounded-xl border border-dashed border-border text-xs text-muted-foreground">No banner selected</div>}
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted"><ImagePlus className="h-4 w-4" />{uploading === 'banner' ? 'Uploading…' : 'Choose banner'}<input type="file" accept="image/png" className="sr-only" disabled={!!uploading} onChange={(e) => { void uploadImage(e.target.files?.[0], 'banner'); e.currentTarget.value = ''; }} data-testid="input-event-banner" /></label>
                </div>
                <div className="sm:col-span-2 grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-[120px_1fr]">
                  <div className="flex flex-col items-center gap-2">
                    {f.presenterPhotoPath ? <img src={assetUrl(f.presenterPhotoPath)} alt="Presenter portrait preview" className="h-24 w-24 rounded-full object-cover" /> : <div className="grid h-24 w-24 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">Presenter</div>}
                    <label className="cursor-pointer text-center text-[11px] font-semibold text-primary hover:underline">{uploading === 'photo' ? 'Uploading…' : 'Upload PNG'}<input type="file" accept="image/png" className="sr-only" disabled={!!uploading} onChange={(e) => { void uploadImage(e.target.files?.[0], 'photo'); e.currentTarget.value = ''; }} data-testid="input-presenter-photo" /></label>
                    {f.presenterPhotoPath && <button type="button" className="text-[11px] text-muted-foreground hover:text-destructive" onClick={() => up({ presenterPhotoPath: '' })} data-testid="button-remove-presenter-photo">Remove photo</button>}
                  </div>
                  <div className="space-y-4">
                    <Field label="Named presenter"><Input value={f.presenterName} maxLength={120} onChange={(e) => up({ presenterName: e.target.value })} data-testid="input-presenter-name" placeholder="Name to feature on the event page" /></Field>
                    <Field label="Presenter bio"><Textarea rows={3} maxLength={2000} value={f.presenterBio} onChange={(e) => up({ presenterBio: e.target.value })} data-testid="input-presenter-bio" placeholder="A few useful details about the presenter." /></Field>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Attendee page preview</div>
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="h-2" style={{ backgroundColor: f.accentColor }} />
                  {f.bannerPath && <img src={assetUrl(f.bannerPath)} alt="" className="h-28 w-full object-cover" />}
                  <div className="p-4"><p className="text-xs font-semibold" style={{ color: f.accentColor }}>{f.headline || 'Your headline will appear here'}</p><h3 className="mt-1 font-display text-xl font-bold">{f.title || 'Your event name'}</h3><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{f.description || 'Your event description will appear here.'}</p></div>
                </div>
              </div>
            </div>}

            {activeSection === 'access' && <div className="space-y-5">
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                <Ticket className="mt-0.5 h-4 w-4 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-semibold">Registration price</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Paid registrations are completed through secure checkout. Administrators use that same checkout flow.</p>
                  {f.retainUnknownPrice ? <div className="mt-3 space-y-3 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"><p>This saved event has a ticket price, but its amount is unavailable here. It will remain paid unless you enter a replacement price.</p><label className="flex items-center justify-between gap-3 text-foreground"><span><span className="font-medium">Explicitly make this event free</span><span className="block text-[11px] text-muted-foreground">This replaces the existing paid ticket setup.</span></span><Switch checked={false} onCheckedChange={(free) => up({ free, retainUnknownPrice: !free })} data-testid="switch-event-free" /></label></div> :
                    <label className="mt-3 flex items-center justify-between rounded-xl border border-border px-3 py-3 text-sm"><span><span className="font-medium">Free registration</span><span className="block text-xs text-muted-foreground">No payment is collected</span></span><Switch checked={f.free} onCheckedChange={(free) => up({ free, retainUnknownPrice: false })} data-testid="switch-event-free" /></label>}
                  {!f.free && !f.retainUnknownPrice && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Ticket amount"><Input type="number" min="1.00" step="0.01" inputMode="decimal" value={f.amount} onChange={(e) => up({ amount: e.target.value, retainUnknownPrice: false })} placeholder="25.00" data-testid="input-ticket-amount" /></Field><Field label="Currency"><NativeSelect value={f.currency} onChange={(e) => up({ currency: e.target.value })} data-testid="select-ticket-currency">{CURRENCIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</NativeSelect></Field><p className="text-[11px] text-muted-foreground sm:col-span-2">Enter dollars and cents. Paid tickets must be at least {new Intl.NumberFormat('en-US', { style: 'currency', currency: f.currency.toUpperCase() }).format(1)}.</p></div>}
                  {f.retainUnknownPrice && <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Replacement ticket amount"><Input type="number" min="1.00" step="0.01" value={f.amount} onChange={(e) => up({ amount: e.target.value, retainUnknownPrice: false })} placeholder="25.00" data-testid="input-ticket-amount" /></Field><Field label="Currency"><NativeSelect value={f.currency} onChange={(e) => up({ currency: e.target.value })} data-testid="select-ticket-currency">{CURRENCIES.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}</NativeSelect></Field></div>}
                </div>
              </div>
              <label className="flex items-center justify-between rounded-xl border border-border p-4 text-sm"><span><span className="font-semibold">Private event</span><span className="block text-xs text-muted-foreground">Invite-only, not in the public event listing</span></span><Switch checked={f.isPrivate} onCheckedChange={(v) => up({ isPrivate: v })} data-testid="switch-event-private" /></label>
              <label className={`flex items-center justify-between rounded-xl border border-border p-4 text-sm ${f.isPrivate ? 'opacity-60' : ''}`}><span><span className="font-semibold">Sponsors visible</span><span className="block text-xs text-muted-foreground">{f.isPrivate ? 'Hidden for private events' : 'Show sponsor placements'}</span></span><Switch checked={f.sponsorsVisible} disabled={f.isPrivate} onCheckedChange={(v) => up({ sponsorsVisible: v })} data-testid="switch-event-sponsors" /></label>
              <div className="rounded-xl bg-muted/60 p-4 text-xs leading-relaxed text-muted-foreground">Private meetings always keep sponsors hidden. Attendees choose a room during registration whenever rooms are available.</div>
            </div>}
            {activeSection === 'rooms' && (event ? <div className="space-y-5">
              <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/[0.045] p-4">
                <DoorOpen className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div><p className="font-semibold">Manage rooms separately</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">Editing event details never replaces saved rooms or schedule. Existing room plans are read-only here; manage doors, speakers and attendance from the event page.</p></div>
              </div>
              {savedRooms.length ? <div className="space-y-3">{savedRooms.map((room) => <div key={room.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-semibold">{room.name}</h3><span className="font-mono text-xs text-muted-foreground">Capacity {room.capacity}</span></div>
                <ul className="mt-3 space-y-2">{savedSessions.filter((s) => s.roomId === room.id).map((s) => <li key={s.id} className="border-l-2 border-primary/35 pl-3 text-sm">
                  <div className="font-medium">{s.title}</div><div className="text-xs text-muted-foreground">{fmtDate(s.startsAt)} · {fmtTime(s.startsAt)}–{fmtTime(s.endsAt)} · {s.presenterName || 'Speaker not assigned'}</div>
                </li>)}</ul>
              </div>)}</div> : <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">No rooms are saved on this event yet.</p>}
              <Link href={`/events/${event.id}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent" data-testid="link-manage-existing-rooms"><ExternalLink className="h-4 w-4" />Open event room management</Link>
            </div> : <div className="space-y-4">
              {workspace.isLoading ? <div className="h-24 animate-pulse rounded-xl bg-muted" aria-label="Loading presenter accounts" /> :
                <RoomPlanEditor rooms={roomPlans} onChange={setRoomPlans} eventStarts={fromLocalInput(f.startsAt)} eventEnds={fromLocalInput(f.endsAt)} eventCapacity={Number(f.capacity)} users={workspace.data?.users ?? []} />}
              {roomErrors.length > 0 && <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4" role="alert" data-testid="room-plan-validation">
                <p className="text-sm font-semibold">Complete the room plan before creating this event</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">{roomErrors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}</ul>
                {roomErrors.length > 8 && <p className="mt-2 text-xs text-muted-foreground">And {roomErrors.length - 8} more required details.</p>}
              </div>}
            </div>)}
            <DialogFooter className="mt-8 border-t border-border pt-4">
              {!event && roomErrors.length > 0 && <div className="mr-auto flex max-w-xs items-center gap-2 text-left text-[11px] text-muted-foreground" role="status">
                <span>Room setup has {roomErrors.length} item{roomErrors.length === 1 ? '' : 's'} to complete.</span>
                <Button type="button" variant="link" size="sm" className="h-auto shrink-0 p-0" onClick={() => setActiveSection('rooms')} data-testid="button-review-room-plan">Review rooms</Button>
              </div>}
              <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="button-cancel-event">Cancel</Button>
              <Button onClick={submit} disabled={!valid || cmd.pending || !!uploading} data-testid="button-save-event">{cmd.pending ? <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Saving…</> : event ? 'Save event' : 'Create event'}</Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
