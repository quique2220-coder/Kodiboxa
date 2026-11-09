import { useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import type { Event, Session, Room, User } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCommand, toLocalInput, fromLocalInput } from '@/lib/workspace';
import { cn } from '@/lib/utils';
export { EventDialog } from '@/components/event-editor';

export function NativeSelect({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...p} className={cn('h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring/40', className)}>
      {children}
    </select>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function RoomDialog({ open, onOpenChange, eventId }: { open: boolean; onOpenChange: (o: boolean) => void; eventId: string }) {
  const cmd = useCommand();
  const [name, setName] = useState('');
  const [cap, setCap] = useState('80');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display text-xl">Add room</DialogTitle><DialogDescription>Physical room or virtual stage.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <Field label="Name"><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Hall B / Main stream" data-testid="input-room-name" /></Field>
          <Field label="Capacity"><Input type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} data-testid="input-room-capacity" /></Field>
        </div>
        <DialogFooter>
          <Button
            disabled={!name.trim() || Number(cap) < 1 || cmd.pending}
            onClick={() => cmd.run({ action: 'create_room', eventId, name: name.trim(), capacity: Number(cap) }, () => { setName(''); onOpenChange(false); })}
            data-testid="button-save-room"
          >Add room</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SessionDialog({ open, onOpenChange, eventId, rooms, users, session, event }: {
  open: boolean; onOpenChange: (o: boolean) => void; eventId: string; rooms: Room[]; users: User[]; session?: Session; event?: Event;
}) {
  const cmd = useCommand();
  const base = event?.startsAt ?? new Date().toISOString();
  const [f, setF] = useState(() => ({
    title: session?.title ?? '',
    description: session?.description ?? '',
    roomId: session?.roomId ?? rooms[0]?.id ?? '',
    presenterId: session?.presenterId ?? '',
    presenterName: session?.presenterName ?? '',
    startsAt: toLocalInput(session?.startsAt ?? base),
    endsAt: toLocalInput(session?.endsAt ?? new Date(new Date(base).getTime() + 45 * 60000).toISOString()),
  }));
  const presenters = users.filter((u) => u.role === 'presenter' || u.role === 'admin');
  const linkedPresenter = presenters.find((u) => u.id === f.presenterId);
  const speakerName = f.presenterName.trim() || linkedPresenter?.name || '';
  const valid = f.title.trim() && (f.presenterName.trim() || linkedPresenter) && f.roomId && new Date(f.endsAt) > new Date(f.startsAt);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display text-2xl">{session ? 'Edit session' : 'Schedule session'}</DialogTitle><DialogDescription>Slot a talk into a room.</DialogDescription></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Title"><Input value={f.title} maxLength={180} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="input-session-title" /></Field></div>
          <Field label="Room">
            <NativeSelect value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })} data-testid="select-session-room">
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </NativeSelect>
          </Field>
          <div className="space-y-3">
            <Field label="Speaker name" hint="Required unless a presenter account is linked."><Input value={f.presenterName} maxLength={120} onChange={(e) => setF({ ...f, presenterName: e.target.value })} placeholder="Speaker’s name" data-testid="input-session-presenter-name" /></Field>
            <Field label="Presenter account (optional)">
              <NativeSelect value={f.presenterId} onChange={(e) => setF({ ...f, presenterId: e.target.value, ...(e.target.value && !f.presenterName.trim() ? { presenterName: presenters.find((u) => u.id === e.target.value)?.name ?? '' } : {}) })} data-testid="select-session-presenter">
              <option value="">No account linked</option>
              {presenters.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Starts"><Input type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} data-testid="input-session-starts" /></Field>
          <Field label="Ends"><Input type="datetime-local" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} data-testid="input-session-ends" /></Field>
          <div className="sm:col-span-2"><Field label="Description"><Textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} data-testid="input-session-description" /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!valid || cmd.pending}
            data-testid="button-save-session"
            onClick={() => cmd.run({
              action: session ? 'update_session' : 'create_session',
              id: session?.id,
              eventId,
              roomId: f.roomId,
              title: f.title.trim(),
              description: f.description,
              presenterId: f.presenterId || undefined,
              presenterName: speakerName,
              startsAt: fromLocalInput(f.startsAt),
              endsAt: fromLocalInput(f.endsAt),
            }, () => onOpenChange(false))}
          >{session ? 'Save session' : 'Add to schedule'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Confirm({ open, onOpenChange, title, body, onConfirm, cta = 'Delete' }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; body: string; onConfirm: () => void; cta?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle className="font-display">{title}</AlertDialogTitle><AlertDialogDescription>{body}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-confirm">Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm">{cta}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
