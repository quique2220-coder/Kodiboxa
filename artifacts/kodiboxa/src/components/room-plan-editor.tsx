import { useMemo } from 'react';
import { Plus, Trash2, DoorOpen, CalendarClock } from 'lucide-react';
import type { User } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, Field } from '@/components/forms';
import { toLocalInput } from '@/lib/workspace';

export type PlanSession = { title: string; presenterName: string; presenterId: string; startsAt: string; endsAt: string };
export type PlanRoom = { name: string; capacity: string; sessions: PlanSession[]; edited?: boolean };

const emptySession = (start: string, end: string): PlanSession => ({
  title: '', presenterName: '', presenterId: '', startsAt: toLocalInput(start), endsAt: toLocalInput(end),
});
const blankRoom = (capacity = ''): PlanRoom => ({ name: '', capacity, sessions: [emptySession('', '')] });

export function RoomPlanEditor({ rooms, onChange, eventStarts, eventEnds, eventCapacity, users }: {
  rooms: PlanRoom[]; onChange: (rooms: PlanRoom[]) => void; eventStarts: string; eventEnds: string;
  eventCapacity: number; users: User[];
}) {
  const presenters = useMemo(() => users.filter((u) => u.role === 'presenter' || u.role === 'admin'), [users]);
  const resize = (count: number) => {
    if (!Number.isInteger(count) || count < 1 || count > 50) return;
    if (count < rooms.length && rooms.slice(count).some((r) =>
      r.edited || r.name || r.sessions.some((s) => s.title || s.presenterName || s.presenterId || s.startsAt || s.endsAt)
    )) {
      if (!window.confirm(`Reduce to ${count} room${count === 1 ? '' : 's'} and discard the edited room details below?`)) return;
    }
    onChange(Array.from({ length: count }, (_, i) => rooms[i] ?? blankRoom(String(eventCapacity || ''))));
  };
  const updateRoom = (index: number, patch: Partial<PlanRoom>) => onChange(rooms.map((r, i) => i === index ? { ...r, ...patch, edited: true } : r));
  const updateSession = (ri: number, si: number, patch: Partial<PlanSession>) => onChange(rooms.map((r, i) => i !== ri ? r : {
    ...r, edited: true, sessions: r.sessions.map((s, j) => j === si ? { ...s, ...patch } : s),
  }));
  const addSession = (ri: number) => updateRoom(ri, { sessions: [...rooms[ri].sessions, emptySession(eventStarts, eventEnds)] });
  const removeSession = (ri: number, si: number) => updateRoom(ri, { sessions: rooms[ri].sessions.filter((_, i) => i !== si) });

  return <div className="space-y-5">
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-primary/20 bg-primary/[0.045] p-4 sm:flex-row sm:items-center">
      <div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><DoorOpen className="h-5 w-5" /></span>
        <div><p className="font-semibold">Plan rooms, not just reservations</p><p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">Set up each door and its schedule now. Attendee reservations are separate from live door counts.</p></div>
      </div>
      <Field label="Number of rooms">
        <Input type="number" min={1} max={50} value={rooms.length} onChange={(e) => resize(Number(e.target.value))} className="w-28" data-testid="input-room-count" />
      </Field>
    </div>
    {rooms.map((room, ri) => <section key={ri} className="overflow-hidden rounded-2xl border border-card-border bg-card" data-testid={`room-plan-${ri + 1}`}>
      <div className="flex items-center justify-between border-b border-border bg-muted/35 px-4 py-3">
        <div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">ROOM {String(ri + 1).padStart(2, '0')}</p><p className="mt-0.5 text-xs text-muted-foreground">Room name, attendee limit and program</p></div>
        <span className="font-mono text-xs text-muted-foreground">{room.sessions.length} session{room.sessions.length === 1 ? '' : 's'}</span>
      </div>
      <div className="space-y-5 p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Room name"><Input value={room.name} maxLength={120} onChange={(e) => updateRoom(ri, { name: e.target.value })} placeholder={`e.g. Studio ${ri + 1}`} data-testid={`input-plan-room-name-${ri}`} /></Field>
          <Field label="Room capacity" hint={`Must be no greater than event capacity (${eventCapacity || 'set event capacity first'}).`}>
            <Input type="number" min={1} max={eventCapacity || undefined} value={room.capacity} onChange={(e) => updateRoom(ri, { capacity: e.target.value })} placeholder="Room seat limit" data-testid={`input-plan-room-capacity-${ri}`} />
          </Field>
        </div>
        <div className="space-y-3">
          {room.sessions.map((session, si) => <div key={si} className="rounded-xl border border-border bg-background/55 p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Session {si + 1}</div>
              {room.sessions.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => removeSession(ri, si)} aria-label={`Remove session ${si + 1}`} data-testid={`button-remove-plan-session-${ri}-${si}`}><Trash2 className="h-3.5 w-3.5" /></Button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Session title"><Input value={session.title} maxLength={180} onChange={(e) => updateSession(ri, si, { title: e.target.value })} placeholder="Talk, workshop or panel title" data-testid={`input-plan-session-title-${ri}-${si}`} /></Field></div>
              <Field label="Speaker name" hint="Required. An account is optional."><Input value={session.presenterName} maxLength={120} onChange={(e) => updateSession(ri, si, { presenterName: e.target.value })} placeholder="Speaker’s full name" data-testid={`input-plan-speaker-${ri}-${si}`} /></Field>
              <Field label="Link presenter account (optional)">
                <NativeSelect value={session.presenterId} onChange={(e) => {
                  const user = presenters.find((p) => p.id === e.target.value);
                  updateSession(ri, si, { presenterId: e.target.value, ...(user && !session.presenterName.trim() ? { presenterName: user.name } : {}) });
                }} data-testid={`select-plan-presenter-${ri}-${si}`}>
                  <option value="">No account linked</option>{presenters.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Starts"><Input type="datetime-local" value={session.startsAt} onChange={(e) => updateSession(ri, si, { startsAt: e.target.value })} data-testid={`input-plan-start-${ri}-${si}`} /></Field>
              <Field label="Ends"><Input type="datetime-local" value={session.endsAt} onChange={(e) => updateSession(ri, si, { endsAt: e.target.value })} data-testid={`input-plan-end-${ri}-${si}`} /></Field>
            </div>
          </div>)}
          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => addSession(ri)} disabled={room.sessions.length >= 20} data-testid={`button-add-plan-session-${ri}`}><Plus className="h-4 w-4" />Add session</Button>
        </div>
      </div>
    </section>)}
  </div>;
}

export function newRoomPlans(count: number, capacity: number): PlanRoom[] {
  return Array.from({ length: count }, () => blankRoom(String(capacity || '')));
}
