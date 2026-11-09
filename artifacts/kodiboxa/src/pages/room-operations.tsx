import { useMemo, useState } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { QRCodeSVG } from 'qrcode.react';
import { Activity, ArrowUpRight, DoorOpen, Download, Printer, Radio, RefreshCw, Users, CalendarClock, LockKeyhole } from 'lucide-react';
import { useGetRoomOperations, getGetRoomOperationsQueryKey } from '@workspace/api-client-react';
import type { RoomOperation } from '@workspace/api-client-react';
import { access, errorMessage, fmtDate, fmtStamp, fmtTime, useWorkspace } from '@/lib/workspace';
import { PageHeader, Panel, Empty, LoadingPage, ErrorState, Pill } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/forms';
import { CheckInDesk } from '@/components/bits';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function roomEntryUrl(id: string) {
  return `${window.location.origin}${basePath}/room-entry/${encodeURIComponent(id)}`;
}

function exportPoster(room: RoomOperation, eventTitle: string, url: string, download: boolean) {
  const svg = document.querySelector(`#room-qr-${CSS.escape(room.id)} svg`)?.outerHTML;
  if (!svg) throw new Error('The room QR is not ready. Refresh this view before exporting.');
  const safe = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
  const sessions = [...room.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const schedule = sessions.length ? `<section class="schedule"><h3>Room schedule</h3>${sessions.map((s) => `<div class="session"><time>${safe(fmtTime(s.startsAt))} – ${safe(fmtTime(s.endsAt))}</time><strong>${safe(s.title)}</strong><span>${safe(s.presenterName || 'Speaker not listed')}</span></div>`).join('')}</section>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safe(room.name)} · KODIBOXA entry</title><style>
    *{box-sizing:border-box}body{margin:0;padding:36px;background:#f3f6f3;color:#192b35;font-family:system-ui,sans-serif}
    main{max-width:680px;margin:auto;background:#fff;border:1px solid #d4dedb;border-radius:28px;padding:44px}
    .top{display:flex;justify-content:space-between;gap:14px;align-items:start}.brand{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#537078;font-weight:700}
    h1{font-size:42px;line-height:1.05;margin:18px 0 4px}h2{font-size:18px;font-weight:500;color:#537078;margin:0}
    .qrrow{display:flex;align-items:center;gap:24px;margin:26px 0;padding:20px;border-radius:20px;background:#f5f8f6}.qr{flex:none;padding:12px;background:white;border:1px solid #d4dedb;border-radius:16px}.qr svg{width:190px;height:190px}
    .qrtext{font-size:14px;line-height:1.5;color:#537078}.qrtext strong{display:block;color:#192b35;font-size:18px;margin-bottom:7px}.qrtext a{word-break:break-all;color:#176879}
    .schedule{margin-top:25px}.schedule h3{font-size:16px;margin:0 0 10px}.session{display:grid;grid-template-columns:100px 1fr;gap:4px 12px;padding:10px 0;border-top:1px solid #e1e8e4;font-size:13px}.session time{grid-row:span 2;color:#537078}.session span{color:#537078}
    .foot{margin-top:25px;padding-top:15px;border-top:1px solid #d4dedb;color:#537078;font-size:11px;display:flex;justify-content:space-between}
    @media(max-width:520px){body{padding:12px}main{padding:24px}.qrrow{align-items:flex-start;flex-direction:column}.qr svg{width:160px;height:160px}}
    @media print{body{padding:0;background:#fff}main{border:0}}
    </style></head><body><main><div class="top"><div><div class="brand">KODIBOXA · ROOM ENTRY</div><h1>${safe(room.name)}</h1><h2>${safe(eventTitle)}</h2></div><div class="brand">CAPACITY ${room.capacity}</div></div>
    <div class="qrrow"><div class="qr">${svg}</div><div class="qrtext"><strong>Scan to check in to this room</strong>Use your registered attendee account to enter.<br><br><a href="${safe(url)}">${safe(url)}</a></div></div>
    ${schedule}<div class="foot"><span>A KODELOTH platform</span><span>Room entry QR does not grant access by itself</span></div></main></body></html>`;
  if (download) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `kodiboxa-${room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-poster.html`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    return;
  }
  const printWindow = window.open('', '_blank', 'width=720,height=900');
  if (!printWindow) throw new Error('Allow pop-ups to print this poster, or choose Download poster.');
  printWindow.document.write(`${html.replace('</body>', '<script>window.onload=()=>window.print()</script></body>')}`);
  printWindow.document.close();
}

function RoomCard({ room, eventTitle }: { room: RoomOperation; eventTitle: string }) {
  const url = roomEntryUrl(room.id);
  const [copied, setCopied] = useState(false);
  const [posterMessage, setPosterMessage] = useState('');
  const poster = (download: boolean) => {
    try {
      exportPoster(room, eventTitle, url, download);
      setPosterMessage(download ? 'Poster download started. Open the HTML file to view or print it.' : 'Poster print window opened.');
    } catch (error) {
      setPosterMessage(error instanceof Error ? error.message : 'The poster could not be exported. Please retry.');
    }
  };
  const sessions = [...room.sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
    } catch {
      setCopied(false);
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return <article className="overflow-hidden rounded-2xl border border-card-border bg-card" data-testid={`card-room-operation-${room.id}`}>
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">ROOM OPERATIONS</p><h2 className="mt-1 font-display text-xl font-bold">{room.name}</h2><p className="mt-1 text-xs text-muted-foreground">Capacity {room.capacity} · {sessions.length} scheduled session{sessions.length === 1 ? '' : 's'}</p></div>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ok/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-ok"><Radio className="h-3 w-3" />Live count</span>
    </header>
    <div className="grid md:grid-cols-[minmax(0,1fr)_215px]">
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/55 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Currently inside</p><p className="mt-1 font-display text-4xl font-bold tabular-nums" data-testid={`text-room-occupancy-${room.id}`}>{room.occupancy}</p><p className="text-[11px] text-muted-foreground">of {room.capacity} room capacity</p></div>
          <div className="rounded-xl bg-muted/55 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Unique visitors</p><p className="mt-1 font-display text-4xl font-bold tabular-nums">{room.uniqueVisitors}</p><p className="text-[11px] text-muted-foreground">historical, this room</p></div>
        </div>
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Schedule and speakers</div>
          {sessions.length ? <ul className="divide-y divide-border rounded-xl border border-border">{sessions.map((s) => <li key={s.id} className="flex gap-3 p-3">
            <div className="w-20 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{fmtTime(s.startsAt)}<br />{fmtTime(s.endsAt)}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{s.title}</p><p className="text-xs text-muted-foreground">{s.presenterName || 'Speaker not assigned'}</p>{s.status === 'live' && <Link href="/presenter" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary underline-offset-2 hover:underline" data-testid={`link-room-live-cameras-${s.id}`}>View live cameras <ArrowUpRight className="h-3 w-3" /></Link>}</div><Pill status={s.status} />
          </li>)}</ul> : <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">No sessions scheduled.</p>}
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild size="sm"><Link href={`/room-entry/${encodeURIComponent(room.id)}`} data-testid={`link-room-entry-${room.id}`}><ArrowUpRight className="mr-1.5 h-4 w-4" />Open entry page</Link></Button>
          <Button variant="outline" size="sm" onClick={() => void copy()} data-testid={`button-copy-room-url-${room.id}`}>{copied ? 'Copied' : 'Copy entry link'}</Button>
        </div>
      </div>
      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <div className="border-b border-border bg-muted/35 px-4 py-3"><p className="text-xs font-semibold">Admin door station</p><p className="mt-0.5 text-[11px] text-muted-foreground">Scan or enter a participant pass for this room.</p></div>
        <CheckInDesk canAct roomId={room.id} />
      </div>
      <aside className="border-t border-border bg-muted/25 p-5 md:border-l md:border-t-0">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Entrance QR</p>
        <div id={`room-qr-${room.id}`} className="mx-auto mt-3 grid max-w-[180px] place-items-center rounded-xl border border-border bg-white p-3">
          <QRCodeSVG value={url} size={150} level="M" includeMargin aria-label={`Entry QR code for ${room.name}`} />
        </div>
        <p className="mt-2 break-all text-center font-mono text-[9px] leading-relaxed text-muted-foreground">{url}</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" className="px-2 text-[11px]" onClick={() => poster(true)} data-testid={`button-download-poster-${room.id}`}><Download className="mr-1 h-3.5 w-3.5" />Download poster</Button>
          <Button variant="outline" size="sm" className="px-2 text-[11px]" onClick={() => poster(false)} data-testid={`button-print-poster-${room.id}`}><Printer className="mr-1 h-3.5 w-3.5" />Print poster</Button>
        </div>
        {posterMessage && <p role="status" className="mt-2 text-xs leading-relaxed text-primary">{posterMessage}</p>}
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">The QR opens this room’s attendee entry page. It does not grant access by itself.</p>
      </aside>
    </div>
  </article>;
}

export default function RoomOperations() {
  const { data: ws, isLoading: workspaceLoading, isError: workspaceError, refetch: retryWorkspace } = useWorkspace();
  const a = access(ws);
  const search = useSearch();
  const [, setLocation] = useLocation();
  const events = useMemo(() => ws?.events ?? [], [ws?.events]);
  const requested = new URLSearchParams(search).get('eventId') ?? '';
  const eventId = events.some((e) => e.id === requested) ? requested : events[0]?.id ?? '';
  const event = events.find((e) => e.id === eventId);
  const query = useGetRoomOperations({ eventId }, {
    query: { enabled: a.isAdmin && !!eventId, queryKey: getGetRoomOperationsQueryKey({ eventId }), refetchInterval: 3000 },
  });
  if (workspaceLoading) return <LoadingPage />;
  if (workspaceError || !ws) return <ErrorState error={new Error('Your workspace could not be loaded.')} retry={() => void retryWorkspace()} />;
  if (!a.isAdmin) return <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center"><LockKeyhole className="mx-auto h-8 w-8 text-primary" /><h1 className="mt-3 font-display text-2xl font-bold">Organizer access required</h1><p className="mt-2 text-sm text-muted-foreground">Live room operations are visible to event administrators only.</p></div>;
  if (!event) return <><PageHeader kicker="KODIBOXA / ROOM OPERATIONS" title="Room operations" sub="Dependable door counts, room by room." /><Empty icon={<DoorOpen className="h-6 w-6" />} title="No events yet" body="Create an event to manage rooms, door stations and attendance." action={<Link href="/events" className="text-sm font-semibold text-primary">Browse events</Link>} /></>;
  if (query.isLoading) return <LoadingPage />;
  if (!query.data) return <><PageHeader kicker="KODIBOXA / ROOM OPERATIONS" title={event.title} /><ErrorState error={query.error ?? new Error('Room attendance could not be loaded.')} retry={() => void query.refetch()} /></>;
  const ops = query.data;
  const age = Date.now() - new Date(ops.updatedAt).getTime();
  const stale = age > 10000;
  return <div className="space-y-6">
    <PageHeader kicker={`${fmtDate(event.startsAt)} · ${event.location || 'Location TBA'}`} title="Room operations" sub={<span className="flex items-center gap-2">{event.title} <Pill status={event.status} /></span>}
      actions={<NativeSelect value={eventId} onChange={(e) => setLocation(`/room-operations?eventId=${encodeURIComponent(e.target.value)}`)} aria-label="Select event" className="min-w-[220px]">{events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}</NativeSelect>} />
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${query.isError || stale ? 'border-tape/40 bg-tape/10' : 'border-ok/25 bg-ok/5'}`} role="status" data-testid="room-operations-freshness">
      <div className="flex items-center gap-2 text-sm"><span className={`h-2 w-2 rounded-full ${query.isError || stale ? 'bg-tape' : 'bg-ok'}`} /><strong>{query.isError ? 'Latest refresh failed' : stale ? 'Counts may be stale' : 'Counts are updating'}</strong><span className="text-muted-foreground">· refreshed {fmtStamp(ops.updatedAt)}</span></div>
      <Button size="sm" variant="ghost" onClick={() => void query.refetch()} data-testid="button-refresh-room-operations"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
    </div>
    {query.isError && <p className="text-xs text-muted-foreground" role="alert">Showing the last successful room snapshot. {errorMessage(query.error)}</p>}
    <p className="text-xs leading-relaxed text-muted-foreground">Counts show confirmed room entries, not seat reservations. Participants should check out when leaving; exits are required to keep current occupancy accurate. Room capacity is enforced at the door.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Rooms reporting</p><p className="mt-1 font-display text-3xl font-bold">{ops.rooms.length}</p></div>
      <div className="rounded-xl border border-border bg-card p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">People inside now</p><p className="mt-1 font-display text-3xl font-bold">{ops.rooms.reduce((n, r) => n + r.occupancy, 0)}</p></div>
      <div className="rounded-xl border border-border bg-card p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Room-level unique visits</p><p className="mt-1 font-display text-3xl font-bold">{ops.rooms.reduce((n, r) => n + r.uniqueVisitors, 0)}</p><p className="text-[11px] text-muted-foreground">sum of per-room visitors</p></div>
    </div>
    {ops.rooms.length ? <div className="grid gap-5 xl:grid-cols-2">{ops.rooms.map((room) => <RoomCard key={room.id} room={room} eventTitle={event.title} />)}</div> :
      <Panel><Empty icon={<DoorOpen className="h-6 w-6" />} title="No rooms on this event" body="Add rooms from the event editor or event details before setting up a door station." action={<Link href={`/events/${event.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary">Manage event rooms <ArrowUpRight className="h-4 w-4" /></Link>} /></Panel>}
    <Panel title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" />Recent room activity</span>} meta="latest first">
      {ops.recentActivity.length ? <ul className="divide-y divide-border">{ops.recentActivity.map((item) => <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3" data-testid={`row-room-activity-${item.id}`}>
        <span className={`grid h-8 w-8 place-items-center rounded-full ${item.action === 'room_check_in' ? 'bg-ok/10 text-ok' : 'bg-muted text-muted-foreground'}`}><Users className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.participantName} <span className="font-normal text-muted-foreground">{item.action === 'room_check_in' ? 'entered' : 'left'}</span> {item.roomName}</p><p className="text-[11px] text-muted-foreground">{fmtStamp(item.createdAt)}</p></div>
        <Pill status={item.action === 'room_check_in' ? 'in' : 'out'} label={item.action === 'room_check_in' ? 'Entered' : 'Exited'} />
      </li>)}</ul> : <Empty icon={<Activity className="h-6 w-6" />} title="No room activity yet" body="Check-ins and check-outs will appear here as they happen." />}
    </Panel>
  </div>;
}
