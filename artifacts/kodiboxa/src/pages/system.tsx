import { useState } from 'react';
import { Link } from 'wouter';
import { useUser } from '@clerk/react';
import { Plug, Bot, ScrollText, Activity, Info, Moon, Sun, ShieldCheck } from 'lucide-react';
import { useHealthCheck, getHealthCheckQueryKey } from '@workspace/api-client-react';
import { WS, PageHeader, Pill, Empty, Panel, SignInToAct, AdminWarning, Stat } from '@/components/bits';
import { NativeSelect } from '@/components/forms';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { access, useCommand, fmtStamp, initials } from '@/lib/workspace';
import { usePrefs } from '@/lib/prefs';
import { cn } from '@/lib/utils';

const PHASES = [
  { name: 'Video streaming', body: 'Hybrid stage video and recordings. Provider not chosen; no streams can be started from here.' },
  { name: 'Live translation', body: 'Caption and interpretation channels. Requires a translation service that is not connected.' },
  { name: 'SimpleX private messaging', body: 'Private attendee chat over SimpleX. Bridge not deployed.' },
];

export function Platform() {
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey() } });
  return (
    <WS>
      {(ws) => (
        <>
          <PageHeader kicker="Integrations" title="Platform" sub="What is actually wired up today. Nothing on this page is simulated as connected." />
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="API health" value={health.isLoading ? '...' : health.data?.status ?? 'down'} tone={health.data?.status === 'ok' ? 'ok' : 'live'} />
            <Stat label="Connected" value={ws.integrations.filter((i) => i.status === 'connected').length} tone="ok" />
            <Stat label="Demo only" value={ws.integrations.filter((i) => i.status === 'demo').length} tone="tape" />
            <Stat label="Planned" value={ws.integrations.filter((i) => i.status === 'planned' || i.status === 'unavailable').length} />
          </div>
          <Panel title="Integrations" meta={`${ws.integrations.length}`}>
            {ws.integrations.length ? (
              <ul className="divide-y divide-border">
                {ws.integrations.map((i) => (
                  <li key={i.id} className="flex items-start gap-4 px-5 py-4" data-testid={`row-integration-${i.id}`}>
                    <span className={cn('mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg', i.status === 'connected' ? 'bg-ok/12 text-ok' : 'bg-muted text-muted-foreground')}><Plug className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1"><div className="font-semibold">{i.name}</div><p className="text-sm text-muted-foreground">{i.description}</p></div>
                    <Pill status={i.status} />
                  </li>
                ))}
              </ul>
            ) : <Empty icon={<Plug className="h-6 w-6" />} title="No integrations reported" />}
          </Panel>
          <h2 className="mb-3 mt-8 text-xl font-bold">Advanced phases</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {PHASES.map((p) => (
              <div key={p.name} className="rise rounded-xl border border-dashed border-border bg-card/60 p-5" data-testid={`card-phase-${p.name}`}>
                <Pill status="planned" label="setup pending" />
                <div className="mt-3 font-semibold">{p.name}</div>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </WS>
  );
}

export function Agents() {
  const cmd = useCommand();
  return (
    <WS>
      {(ws) => {
        const a = access(ws);
        return (
          <>
            <PageHeader kicker="Isolated SRE demo" title="Agents and incidents" sub="A sandboxed workflow against a safe timer service. It never touches event data."
              actions={a.isAdmin ? <Button onClick={() => cmd.run({ action: 'trigger_incident' })} disabled={cmd.pending} data-testid="button-trigger-incident"><Activity className="mr-2 h-4 w-4" />Inject latency</Button> : !a.signedIn ? <SignInToAct /> : null} />
            <div className="mb-6 flex gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm" data-testid="banner-agent-honesty">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div><span className="font-semibold">How this works: </span>delay is measured for real on an isolated timer service. Analysis and recommendations come from deterministic rules, not from a connected language model. The four local agents are defined but not yet connected to Ollama.</div>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
              <Panel title="Incidents" meta={`${ws.incidents.length}`}>
                {ws.incidents.length ? (
                  <ul className="divide-y divide-border">
                    {ws.incidents.map((i) => (
                      <li key={i.id} className="space-y-3 px-5 py-4" data-testid={`row-incident-${i.id}`}>
                        <div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{i.title}</div><div className="font-mono text-[11px] text-muted-foreground">{fmtStamp(i.createdAt)}</div></div><Pill status={i.status} /></div>
                        <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                          <div className="rounded-lg bg-live/10 p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">measured before</div><div className="text-xl font-semibold tabular-nums text-live">{i.beforeMs} ms</div></div>
                          <div className="rounded-lg bg-ok/10 p-3"><div className="text-[10px] uppercase tracking-wider text-muted-foreground">after fix</div><div className="text-xl font-semibold tabular-nums text-ok">{i.afterMs == null ? 'pending' : `${i.afterMs} ms`}</div></div>
                        </div>
                        <div className="text-sm"><span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Evidence </span>{i.evidence}</div>
                        <div className="text-sm"><span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">Rule-based recommendation </span>{i.recommendation}</div>
                        {i.status === 'awaiting_approval' && (a.isAdmin ? <Button size="sm" className="bg-ok text-white hover:bg-ok/90" disabled={cmd.pending} onClick={() => cmd.run({ action: 'approve_remediation', id: i.id })} data-testid={`button-approve-${i.id}`}><ShieldCheck className="mr-2 h-4 w-4" />Approve remediation</Button> : <span className="text-xs text-muted-foreground">Awaiting administrator approval.</span>)}
                      </li>
                    ))}
                  </ul>
                ) : <Empty icon={<Activity className="h-6 w-6" />} title="No incidents" body="Inject latency to run the demo workflow end to end." />}
              </Panel>
              <Panel title="Local agents" meta="not connected">
                <ul className="divide-y divide-border">
                  {ws.agents.map((g) => (
                    <li key={g.id} className="flex items-start gap-3 px-5 py-3.5" data-testid={`row-agent-${g.id}`}>
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-muted"><Bot className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1"><div className="font-medium">{g.name}</div><p className="text-xs text-muted-foreground">{g.description}</p></div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{g.status}</span>
                    </li>
                  ))}
                  {!ws.agents.length && <Empty icon={<Bot className="h-6 w-6" />} title="No agents defined" />}
                </ul>
              </Panel>
            </div>
          </>
        );
      }}
    </WS>
  );
}

export function Audit() {
  const [q, setQ] = useState('');
  return (
    <WS>
      {(ws) => {
        const a = access(ws);
        if (!a.preview && !a.isAdmin) return <Empty icon={<ScrollText className="h-6 w-6" />} title="Administrator access only" />;
        const list = ws.audit.filter((x) => `${x.actor} ${x.action} ${x.detail}`.toLowerCase().includes(q.toLowerCase()));
        return (
          <>
            <PageHeader kicker="Who did what" title="Audit log" sub="Every command that changed the workspace." actions={<Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by actor or action" className="w-64" data-testid="input-filter-audit" />} />
            <Panel>
              {list.length ? (
                <ol className="divide-y divide-border">
                  {list.map((x) => (
                    <li key={x.id} className="grid gap-1 px-5 py-3 sm:grid-cols-[140px_160px_1fr]" data-testid={`row-audit-${x.id}`}>
                      <span className="font-mono text-xs text-muted-foreground">{fmtStamp(x.createdAt)}</span>
                      <span className="font-mono text-xs font-semibold text-primary">{x.action}</span>
                      <span className="text-sm"><span className="font-semibold">{x.actor}</span> <span className="text-muted-foreground">{x.detail}</span></span>
                    </li>
                  ))}
                </ol>
              ) : <Empty icon={<ScrollText className="h-6 w-6" />} title="No audit entries" />}
            </Panel>
          </>
        );
      }}
    </WS>
  );
}

export function Settings() {
  const p = usePrefs();
  const { user: clerkUser } = useUser();
  const cmd = useCommand();
  return (
    <WS>
      {(ws) => {
        const a = access(ws);
        return (
          <>
            <PageHeader kicker="Preferences" title="Settings" />
            <AdminWarning ws={ws} />
            <div className="grid gap-5 lg:grid-cols-2">
              <Panel title="Appearance and language">
                <div className="space-y-4 p-5">
                  <div className="grid grid-cols-2 gap-2">
                    {(['light', 'dark'] as const).map((th) => (
                      <button key={th} onClick={() => p.set({ theme: th })} data-testid={`button-theme-${th}`} className={cn('flex items-center gap-2 rounded-lg border p-3 text-sm font-medium capitalize', p.theme === th ? 'border-primary ring-2 ring-primary/20' : 'border-border')}>
                        {th === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{th}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm"><span>Language</span><span className="font-medium" data-testid="text-language">English</span></div>
                  <label className="flex items-center justify-between text-sm"><span>24-hour clock</span><Switch checked={p.hour24} onCheckedChange={(v) => p.set({ hour24: v })} data-testid="switch-24h" /></label>
                  <label className="flex items-center justify-between text-sm"><span>Larger text</span><Switch checked={p.largeText} onCheckedChange={(v) => p.set({ largeText: v })} data-testid="switch-large-text" /></label>
                  <p className="text-xs text-muted-foreground">Saved on this device.</p>
                </div>
              </Panel>
              <Panel title="Account">
                <div className="p-5">
                  {a.signedIn && a.user ? (
                    <div className="flex items-center gap-4">
                      <div className="grid h-14 w-14 place-items-center rounded-xl bg-primary font-display text-xl font-bold text-primary-foreground">{initials(a.user.name)}</div>
                      <div><div className="font-semibold" data-testid="text-account-name">{a.user.name}</div><div className="text-sm text-muted-foreground">{clerkUser?.primaryEmailAddress?.emailAddress ?? a.user.email}</div><Pill status="upcoming" label={a.user.role} className="mt-1" /></div>
                    </div>
                  ) : <SignInToAct label="Sign in to see your account" />}
                  {a.signedIn && <Link href="/communication-preferences" className="mt-4 inline-flex items-center gap-2 rounded-lg border border-primary/30 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5" data-testid="link-settings-communication-preferences">Manage communication preferences</Link>}
                </div>
              </Panel>
            </div>
            {a.isAdmin && (
              <Panel title="Team roles" meta={`${ws.users.length} users`} className="mt-5">
                <ul className="divide-y divide-border">
                  {ws.users.map((u) => {
                    const self = u.id === a.user?.id;
                    return (
                      <li key={u.id} className="flex items-center gap-3 px-5 py-3" data-testid={`row-user-${u.id}`}>
                        <div className="grid h-9 w-9 place-items-center rounded-md bg-muted font-mono text-xs font-bold">{initials(u.name)}</div>
                        <div className="min-w-0 flex-1"><div className="truncate font-medium">{u.name}{self && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</div><div className="truncate text-xs text-muted-foreground">{u.email}</div></div>
                        <NativeSelect value={u.role} disabled={self || cmd.pending} title={self ? 'You cannot change your own role' : undefined} onChange={(e) => cmd.run({ action: 'set_role', userId: u.id, role: e.target.value as typeof u.role })} className="w-36" data-testid={`select-role-${u.id}`}>
                          <option value="participant">participant</option><option value="presenter">presenter</option><option value="admin">admin</option>
                        </NativeSelect>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            )}
            {a.signedIn && !a.isAdmin && <p className="mt-5 text-sm text-muted-foreground">Roles are assigned by administrators. Accounts cannot change their own role.</p>}
          </>
        );
      }}
    </WS>
  );
}
