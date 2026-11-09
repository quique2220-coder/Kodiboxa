import { QRCodeSVG } from 'qrcode.react';
import './_group.css';
import { demoEvent as event, demoReg as reg } from './_fixtures';

// Extracted from the original PassCard before the participant-focused update.
export function Current() {
  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground" style={{ fontFamily: 'var(--app-font-sans)' }}>
      <p className="mb-4 text-center text-xs text-muted-foreground">Previous pass · example event</p>
      <div className="relative mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl border border-card-border bg-card shadow-lg" data-testid={`card-pass-${reg.id}`}>
        <div className="tape-stripe h-3" />
        <div className="mx-auto mt-3 h-2.5 w-14 rounded-full bg-background ring-1 ring-border" />
        <div className="px-6 pb-6 pt-4 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{event?.type ?? 'event'} pass</div>
          <div className="mt-1 font-display text-lg font-bold leading-tight">{event?.title ?? 'Event'}</div>
          <div className="mx-auto my-4 w-fit rounded-xl bg-[hsl(40_40%_98%)] p-3">
            <QRCodeSVG value={reg.passCode} size={168} fgColor="#18203f" bgColor="transparent" level="M" />
          </div>
          <div className="font-display text-xl font-semibold">{reg.name}</div>
          <div className="mt-1 break-all font-mono text-sm tracking-[0.12em] text-primary" data-testid="text-pass-code">{reg.passCode}</div>
          <div className="mt-3"><span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{reg.checkedIn ? 'checked in' : 'not checked in'}</span></div>
        </div>
      </div>
    </main>
  );
}
