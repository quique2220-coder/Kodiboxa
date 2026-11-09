import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useClerk } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  LayoutGrid, CalendarRange, Clock3, Users, Mic2, Plug, Bot, ScrollText, Settings, LogOut, Moon, Sun, Menu, X, Eye,
  Radio, MessageCircleQuestion, Megaphone, Ticket, ArrowLeftRight, ShieldCheck, DoorOpen, ContactRound, Bell,
} from 'lucide-react';
import { useHealthCheck, getHealthCheckQueryKey } from '@workspace/api-client-react';
import { useWorkspace, access, initials } from '@/lib/workspace';
import { usePrefs, type DictKey } from '@/lib/prefs';
import { cn } from '@/lib/utils';
import { participantLocation } from '@/lib/participant-navigation';
import KodeChat from '@/components/kode-chat';
import kodeSmall from '@/assets/kode-studio-avatar.webp';
import './navigation.css';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const logo = `${basePath}/brand/kodeloth-logo.png`;

type Acc = ReturnType<typeof access>;
type Item = { href: string; label: string | DictKey; icon: typeof LayoutGrid; show: (a: Acc) => boolean; raw?: boolean };
const all = () => true;
const adminGroups: { key: DictKey; items: Item[] }[] = [
  { key: 'nav.group.run', items: [
    { href: '/dashboard', label: 'nav.dashboard', icon: LayoutGrid, show: all },
    { href: '/events', label: 'nav.events', icon: CalendarRange, show: all },
    { href: '/schedule', label: 'nav.schedule', icon: Clock3, show: all },
      { href: '/room-operations', label: 'Room operations', icon: DoorOpen, show: (a) => a.signedIn && a.isAdmin, raw: true },
  ] },
  { key: 'nav.group.people', items: [
    { href: '/participants', label: 'nav.participants', icon: Users, show: (a) => a.preview || a.isAdmin },
    { href: '/crm', label: 'Relationship CRM', icon: ContactRound, show: (a) => a.signedIn && a.isAdmin, raw: true },
    { href: '/crm/integrations', label: 'CRM integrations', icon: Plug, show: (a) => a.signedIn && a.isAdmin, raw: true },
    { href: '/presenter', label: 'nav.presenter', icon: Mic2, show: (a) => a.preview || a.isPresenter || a.isAdmin },
  ] },
  { key: 'nav.group.system', items: [
    { href: '/platform', label: 'nav.platform', icon: Plug, show: all },
    { href: '/agents', label: 'nav.agents', icon: Bot, show: all },
    { href: '/audit', label: 'nav.audit', icon: ScrollText, show: (a) => a.preview || a.isAdmin },
    { href: '/settings', label: 'nav.settings', icon: Settings, show: all },
    { href: '/communication-preferences', label: 'Communication preferences', icon: Bell, show: (a) => a.signedIn, raw: true },
  ] },
];
const partItems: Item[] = [
  { href: '/participant?tab=now', label: 'On stage now', icon: Radio, show: all, raw: true },
  { href: '/participant?tab=schedule', label: 'My schedule', icon: Clock3, show: all, raw: true },
  { href: '/participant?tab=ask', label: 'Ask a question', icon: MessageCircleQuestion, show: all, raw: true },
  { href: '/participant?tab=updates', label: 'Updates', icon: Megaphone, show: all, raw: true },
  { href: '/participant?tab=pass', label: 'My pass', icon: Ticket, show: all, raw: true },
];
const partExtra: Item[] = [
  { href: '/events', label: 'Browse events', icon: CalendarRange, show: all, raw: true },
  { href: '/presenter', label: 'nav.presenter', icon: Mic2, show: (a) => a.signedIn && a.isPresenter },
  { href: '/settings', label: 'nav.settings', icon: Settings, show: all },
  { href: '/communication-preferences', label: 'Communication preferences', icon: Bell, show: (a) => a.signedIn, raw: true },
];

function Brand() {
  return (
    <Link href="/" className="nav-brand flex items-center gap-2.5" data-testid="link-home">
      <span className="nav-brand-avatar"><img src={kodeSmall} alt="KODELOTH" /></span>
      <div className="leading-none">
        <div className="font-display text-[17px] font-extrabold tracking-tight">KODIBOXA</div>
        <div className="mt-1 flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.24em] opacity-60">
          by <img src={logo} alt="" className="h-3 w-3 rounded-sm object-contain" /> KODELOTH
        </div>
      </div>
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [loc] = useLocation();
  const search = useSearch();
  const [open, setOpen] = useState(false);
  const { data: ws } = useWorkspace();
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), refetchInterval: 30000 } });
  const a = access(ws);
  const { t, theme, set } = usePrefs();
  const clerk = useClerk();
  const qc = useQueryClient();

  const participantOnly = a.signedIn && a.role === 'participant';
  const [preferredView, setPreferredView] = useState(() => {
    try { return sessionStorage.getItem('kodiboxa.view') === 'attendee' ? 'attendee' : 'operations'; }
    catch { return 'operations'; }
  });
  const sharedRoute = loc === '/events' || loc.startsWith('/events/') || loc === '/settings';
  const partView = participantOnly || loc === '/participant' || (sharedRoute && preferredView === 'attendee');
  useEffect(() => {
    const view = partView ? 'attendee' : 'operations';
    setPreferredView(view);
    try { sessionStorage.setItem('kodiboxa.view', view); } catch { /* In-memory navigation still works. */ }
  }, [partView]);
  const canSwitch = !participantOnly;
  const curTab = new URLSearchParams(search).get('tab') || 'now';

  const signOut = async () => {
    qc.clear();
    await clerk.signOut({ redirectUrl: basePath || '/' });
  };

  const label = (i: Item) => (i.raw ? i.label : t(i.label as DictKey));
  const isActive = (i: Item) => {
    if (i.href.startsWith('/participant?')) return loc === '/participant' && i.href.endsWith(`tab=${curTab}`);
    return loc === i.href || loc.startsWith(i.href + '/');
  };
  const renderItem = (i: Item) => {
    const active = isActive(i);
    const id = i.href.replace(/[/?=]/g, '-').replace(/^-/, '');
    return (
      <Link key={i.href} href={loc === '/participant' && i.href.startsWith('/participant?')
        ? participantLocation(search, { tab: new URLSearchParams(i.href.split('?')[1]).get('tab') ?? 'now' })
        : i.href} onClick={() => setOpen(false)} data-testid={`link-nav-${id}`} data-active={active} aria-current={active ? 'page' : undefined}
        className={cn('nav-item group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors duration-200',
          active ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-sm' : 'text-sidebar-foreground/70 hover:translate-x-0.5 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground')}>
        {active && <span className={cn('absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r', partView ? 'bg-gill' : 'bg-sidebar-primary')} />}
        <i.icon className={cn('h-4 w-4', active && (partView ? 'text-gill' : 'text-sidebar-primary'))} />
        {label(i)}
      </Link>
    );
  };

  const switcher = canSwitch && (
    <div className="nav-view-switch mx-3 mt-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/40 p-1" data-testid="view-switch">
      <div className="grid grid-cols-2 gap-1 text-[12px] font-semibold">
        <Link href="/dashboard" onClick={() => setOpen(false)} data-testid="button-view-admin" data-active={!partView}
          className={cn('nav-view-choice flex items-center justify-center gap-1.5 rounded-xl py-2 transition-colors', !partView ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:text-sidebar-foreground')}>
          <ShieldCheck className="h-3.5 w-3.5" />Operations
        </Link>
        <Link href={loc === '/participant' ? participantLocation(search, {}) : '/participant'} onClick={() => setOpen(false)} data-testid="button-view-participant" data-active={partView}
          className={cn('nav-view-choice flex items-center justify-center gap-1.5 rounded-xl py-2 transition-colors', partView ? 'bg-gill text-sidebar' : 'text-sidebar-foreground/65 hover:text-sidebar-foreground')}>
          <Ticket className="h-3.5 w-3.5" />Attendee
        </Link>
      </div>
      <div className="px-2 pb-1 pt-1.5 text-center font-mono text-[9.5px] uppercase tracking-[0.16em] text-sidebar-foreground/45">
        Switches view only, not your role
      </div>
    </div>
  );

  const nav = (
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label={partView ? 'Attendee navigation' : 'Operations navigation'}>
      {partView ? (
        <>
          <div>
            <div className="nav-section-label mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-gill/80">My event</div>
            {partItems.map(renderItem)}
          </div>
          <div>
            <div className="nav-section-label mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/45">More</div>
            {partExtra.filter((i) => i.show(a)).map(renderItem)}
          </div>
        </>
      ) : adminGroups.map((g) => {
        const items = g.items.filter((i) => i.show(a));
        if (!items.length) return null;
        return (
          <div key={g.key}>
            <div className="nav-section-label mb-1.5 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/45">{t(g.key)}</div>
            {items.map(renderItem)}
          </div>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t border-sidebar-border p-3">
      <div className="mb-2 flex items-center justify-between px-2 font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
        <span className="flex items-center gap-1.5" data-testid="status-api">
          <span className={cn('h-1.5 w-1.5 rounded-full', health.data?.status === 'ok' ? 'bg-ok' : health.isError ? 'bg-live' : 'bg-sidebar-foreground/40')} />
          API {health.data?.status ?? (health.isError ? 'down' : '...')}
        </span>
        <button onClick={() => set({ theme: theme === 'dark' ? 'light' : 'dark' })} className="rounded p-1 hover:bg-sidebar-accent" data-testid="button-theme-toggle" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>
      {a.signedIn && a.user ? (
        <div className="nav-account flex items-center gap-2.5 rounded-xl bg-sidebar-accent/60 p-2">
          <div className="nav-avatar grid h-8 w-8 place-items-center rounded-lg font-mono text-xs font-bold">{initials(a.user.name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold" data-testid="text-user-name">{a.user.name}</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground/60" data-testid="text-user-role">role: {a.user.role}</div>
          </div>
          <button onClick={signOut} className="rounded p-1.5 hover:bg-sidebar-accent" aria-label={t('action.signout')} data-testid="button-sign-out"><LogOut className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Link href="/sign-in" className="nav-sign-in rounded-lg bg-sidebar-primary px-3 py-2 text-center text-[13px] font-semibold text-sidebar-primary-foreground" data-testid="link-sign-in">{t('action.signin')}</Link>
          <Link href="/sign-up" className="rounded-lg border border-sidebar-border px-3 py-2 text-center text-[13px] font-medium" data-testid="link-sign-up">{t('action.signup')}</Link>
        </div>
      )}
    </div>
  );

  const sideBody = (
    <>
      {switcher}
      {!canSwitch && <div className="mx-3 mt-3 rounded-xl bg-gill/15 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-gill">Attendee view</div>}
      {nav}
      {footer}
    </>
  );

  return (
    <div className="flex min-h-[100dvh]">
      <aside className="kodiboxa-nav kodiboxa-sidebar sticky top-0 hidden h-[100dvh] w-64 shrink-0 flex-col lg:flex">
        <div className="px-5 pb-1 pt-5"><Brand /></div>
        {sideBody}
      </aside>

      <div className="kodiboxa-nav kodiboxa-mobile-bar fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between px-4 lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          {canSwitch && (
            <Link href={partView ? '/dashboard' : '/participant'} data-testid="button-view-toggle-mobile"
              className="nav-mobile-view flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold">
              <ArrowLeftRight className="h-3.5 w-3.5" /><span className="sr-only sm:not-sr-only">{partView ? 'Operations' : 'Attendee'}</span>
            </Link>
          )}
          <span className="h-10 w-10 shrink-0" aria-hidden="true" />
          <button onClick={() => setOpen(true)} className="rounded p-2" data-testid="button-open-menu" aria-label="Open menu" aria-expanded={open} aria-controls="mobile-navigation"><Menu className="h-5 w-5" /></button>
        </div>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-sidebar/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside id="mobile-navigation" className="kodiboxa-nav kodiboxa-sidebar absolute left-0 top-0 flex h-full w-72 flex-col animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between px-5 pb-1 pt-5"><Brand /><button onClick={() => setOpen(false)} aria-label="Close menu" data-testid="button-close-menu"><X className="h-5 w-5" /></button></div>
            {sideBody}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 pt-14 lg:pt-0">
        {a.preview && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-tape/40 bg-tape/15 px-5 py-2 text-[13px]" data-testid="banner-preview">
            <span className="inline-flex items-center gap-1.5 rounded bg-sidebar px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-primary"><Eye className="h-3 w-3" />{t('preview.label')}</span>
            <span className="text-foreground/80">{t('preview.body')} Public workspace · {partView ? 'attendee' : 'operations'} view.</span>
            <Link href="/sign-in" className="ml-auto font-semibold text-primary underline-offset-4 hover:underline" data-testid="link-preview-sign-in">{t('action.signin')}</Link>
          </div>
        )}
        <div key={loc} className="mx-auto max-w-[1240px] px-4 py-7 md:px-8 md:py-9">{children}</div>
      </main>
      <KodeChat />
    </div>
  );
}
