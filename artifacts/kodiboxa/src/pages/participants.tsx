import { useState } from 'react';
import { QrCode, Users } from 'lucide-react';
import type { Registration } from '@workspace/api-client-react';
import { WS, PageHeader, Pill, Empty, Panel, CheckInDesk, PassCard, SignInToAct } from '@/components/bits';
import { NativeSelect } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { access, useCommand, fmtStamp } from '@/lib/workspace';

export default function Participants() {
  const [q, setQ] = useState('');
  const [eventId, setEventId] = useState('all');
  const [pass, setPass] = useState<Registration | null>(null);
  const cmd = useCommand();
  return (
    <WS>
      {(ws) => {
        const a = access(ws);
        if (!a.preview && !a.isAdmin) return <Empty icon={<Users className="h-6 w-6" />} title="Organizer access only" body="Registrations and passes are visible to administrators." />;
        const list = ws.registrations.filter((r) => (eventId === 'all' || r.eventId === eventId) && `${r.name} ${r.email} ${r.passCode}`.toLowerCase().includes(q.toLowerCase()));
        return (
          <>
            <PageHeader kicker="Registrations and passes" title="Participants" sub={`${ws.summary.checkedIn} of ${ws.summary.registrations} pass holders are inside.`} actions={!a.signedIn && <SignInToAct />} />
            <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
              <Panel title="Pass holders" meta={`${list.length}`} action={
                <div className="flex gap-2">
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, code" className="h-8 w-44" data-testid="input-search-participants" />
                  <NativeSelect value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-8 w-40" data-testid="select-participant-event">
                    <option value="all">All events</option>
                    {ws.events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
                  </NativeSelect>
                </div>
              }>
                {list.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border text-left font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground"><th className="px-5 py-2">Name</th><th className="px-3 py-2">Event</th><th className="px-3 py-2">Code</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
                      <tbody className="divide-y divide-border">
                        {list.map((r) => (
                          <tr key={r.id} className="hover:bg-muted/40" data-testid={`row-participant-${r.id}`}>
                            <td className="px-5 py-2.5"><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.email}</div></td>
                            <td className="px-3 py-2.5 text-xs">{ws.events.find((e) => e.id === r.eventId)?.title ?? 'Event'}<div className="font-mono text-[10.5px] text-muted-foreground">{fmtStamp(r.createdAt)}</div></td>
                            <td className="px-3 py-2.5 font-mono text-xs tracking-widest">{r.passCode}</td>
                            <td className="px-3 py-2.5"><Pill status={r.checkedIn ? 'in' : 'out'} label={r.checkedIn ? 'in' : 'out'} /></td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right">
                              <Button size="icon" variant="ghost" onClick={() => setPass(r)} aria-label="Show pass" data-testid={`button-show-pass-${r.id}`}><QrCode className="h-4 w-4" /></Button>
                              {a.isAdmin && <Button size="sm" variant="outline" disabled={cmd.pending} onClick={() => cmd.run({ action: r.checkedIn ? 'check_out' : 'check_in', id: r.id })} data-testid={`button-checkin-${r.id}`}>{r.checkedIn ? 'Out' : 'In'}</Button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <Empty icon={<Users className="h-6 w-6" />} title="No pass holders found" />}
              </Panel>
              <Panel title="Door scanner" meta="paste or scan"><CheckInDesk canAct={a.isAdmin} /></Panel>
            </div>
            <Dialog open={!!pass} onOpenChange={(o) => !o && setPass(null)}>
              <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-sm overflow-y-auto overscroll-contain border-0 bg-transparent p-0 shadow-none">
                <DialogTitle className="sr-only">Pass</DialogTitle>
                {pass && <PassCard reg={pass} event={ws.events.find((e) => e.id === pass.eventId)} roomName={ws.rooms.find((room) => room.id === pass.roomId)?.name} />}
              </DialogContent>
            </Dialog>
          </>
        );
      }}
    </WS>
  );
}
