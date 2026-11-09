import { CalendarDays, Check, Clock3, MapPin, Ticket } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { Event, Registration } from './_fixtures';

type PassCardProps = {
  reg: Registration;
  event?: Event;
  roomName?: string;
};

function validDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function formatDateTime(value?: string) {
  const date = validDate(value);
  if (!date) return 'Not scheduled';
  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(date);
  } catch {
    return 'Date and time unavailable';
  }
}

function localTimeZone() {
  try {
    return new Intl.DateTimeFormat('en-US').resolvedOptions().timeZone || 'local time';
  } catch {
    return 'local time';
  }
}

export function PassCard({ reg, event, roomName }: PassCardProps) {
  const title = event?.title?.trim() || 'Event details unavailable';
  const startsAt = formatDateTime(event?.startsAt);
  const endsAt = formatDateTime(event?.endsAt);
  const location = event?.location?.trim();
  const presenter = event?.presenterName?.trim();
  const headline = event?.headline?.trim();
  const description = event?.description?.trim();
  const checkedIn = Boolean(reg.checkedIn);

  return (
    <div className="w-full" data-testid={`card-pass-${reg.id}`}>
      <article
        className="event-pass rise mx-auto w-full max-w-[480px] overflow-hidden rounded-[1.35rem] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] shadow-[0_18px_45px_-24px_hsl(224_42%_18%/0.42)]"
        data-testid="card-pass"
        data-registration-id={reg.id}
        aria-label={`Entry pass for ${title}`}
      >
      <header className="relative overflow-hidden bg-[hsl(var(--sidebar))] px-5 pb-5 pt-5 text-[hsl(var(--sidebar-foreground))] sm:px-6">
        <div className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-5 -top-7 h-28 w-28 rounded-full border border-white/10" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
            <Ticket className="h-4 w-4 shrink-0 text-[hsl(var(--sidebar-primary))]" aria-hidden="true" />
            <span className="truncate">KODIBOXA · {event?.type || 'Event'} pass</span>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${
              checkedIn
                ? 'border-emerald-200/30 bg-emerald-200/10 text-emerald-100'
                : 'border-white/20 bg-white/10 text-white/85'
            }`}
            data-testid="status-pass-checkin"
          >
            {checkedIn && <Check className="h-3 w-3" aria-hidden="true" />}
            {checkedIn ? 'Checked in' : 'Ready at the door'}
          </span>
        </div>
        <h2 className="relative mt-4 break-words font-display text-[1.55rem] font-bold leading-[1.08] tracking-[-0.035em] text-white sm:text-[1.8rem]">
          {title}
        </h2>
        {headline && <p className="relative mt-2 break-words text-sm font-medium leading-snug text-[hsl(var(--sidebar-primary))]">{headline}</p>}
        {(presenter || description) && (
          <div className="relative mt-4 border-l-2 border-[hsl(var(--sidebar-primary))]/70 pl-3">
            {presenter && <p className="text-xs font-semibold text-white/90">Featuring {presenter}</p>}
            {description && <p className="mt-1 line-clamp-3 break-words text-xs leading-relaxed text-white/65">{description}</p>}
          </div>
        )}
      </header>

      <section className="px-5 py-5 sm:px-6" aria-label="Event and participant details">
        <div className="grid gap-3">
          <div className="flex min-w-0 gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--primary)/0.09)] text-primary">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Event time</p>
              <p className="mt-0.5 break-words text-[13px] font-semibold leading-snug text-foreground" data-testid="text-pass-event-dates">
                {startsAt}
                {event?.endsAt && <><span className="px-1.5 text-muted-foreground">to</span>{endsAt}</>}
              </p>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock3 className="h-3 w-3 shrink-0" aria-hidden="true" />
                Times shown in <span className="break-all font-medium">{localTimeZone()}</span>
              </p>
            </div>
          </div>

          <div className="flex min-w-0 gap-3">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--primary)/0.09)] text-primary">
              <MapPin className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Location</p>
              <p className="mt-0.5 break-words text-[13px] font-semibold leading-snug text-foreground" data-testid="text-pass-location">
                {location || 'Location details to be announced'}
              </p>
              <p className="mt-1 break-words text-xs text-muted-foreground" data-testid="text-pass-room">
                {roomName?.trim() || 'Room not assigned'}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex min-w-0 items-center justify-between gap-3 border-t border-dashed border-border pt-4">
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">This pass belongs to</p>
            <p className="mt-1 break-words font-display text-lg font-bold leading-tight text-foreground" data-testid="text-pass-name">{reg.name || 'Participant'}</p>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[hsl(var(--tape)/0.22)] text-foreground" aria-hidden="true">
            <Ticket className="h-4 w-4" />
          </span>
        </div>
      </section>

      <div className="relative border-t border-dashed border-border px-5 pb-5 pt-4 sm:px-6">
        <span className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-background" aria-hidden="true" />
        <span className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-background" aria-hidden="true" />
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-center sm:gap-5">
          <div className="shrink-0 rounded-xl border border-[#e7e6de] bg-[#fffefb] p-3 shadow-[0_3px_12px_-8px_rgba(24,32,63,0.5)]">
            <QRCodeSVG
              value={reg.passCode}
              size={156}
              level="M"
              fgColor="#18203f"
              bgColor="#fffefb"
              includeMargin
              title="Scan this QR code at the event entrance"
              className="block h-[156px] w-[156px]"
            />
          </div>
          <div className="max-w-[190px] text-center sm:text-left">
            <p className="font-display text-base font-bold leading-tight text-foreground">Your entry, all set.</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Have this QR ready for the welcome desk. No need to share a code.</p>
          </div>
        </div>
      </div>
      </article>
    </div>
  );
}
