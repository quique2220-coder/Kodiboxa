import { useState, type FormEvent, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine, Check, CircleAlert, Database, ExternalLink, LockKeyhole, Plug,
  RefreshCw, Send, ShieldCheck, Unplug, Webhook,
} from 'lucide-react';
import {
  getGetCrmIntegrationsQueryKey, getGetCrmQueryKey, useConnectCrmNeon,
  useConnectCrmZapier, useDisconnectCrmNeon, useDisconnectCrmZapier,
  useGetCrmIntegrations, useSyncCrmNeon, useSyncCrmZapier, useTestCrmZapier,
} from '@workspace/api-client-react';
import { access, fmtStamp, useWorkspace } from '@/lib/workspace';
import { Confirm } from '@/components/forms';
import { ErrorState, LoadingPage, PageHeader, Panel, Pill, SignInToAct } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

type Provider = 'neon' | 'zapier';
type ConfirmAction = { provider: Provider; action: 'sync' | 'disconnect' } | null;

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block space-y-1.5"><span className="text-sm font-semibold">{label}</span>{children}{hint && <span className="block text-xs leading-relaxed text-muted-foreground">{hint}</span>}</label>;
}

function dateLabel(value: string | null) {
  if (!value) return 'Never';
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? fmtStamp(value) : 'Not recorded';
}

export default function CRMIntegrations() {
  const workspaceQuery = useWorkspace();
  const workspace = workspaceQuery.data;
  const permissions = access(workspace);
  const statusQuery = useGetCrmIntegrations({
    query: {
      enabled: permissions.isAdmin,
      queryKey: getGetCrmIntegrationsQueryKey(),
      refetchInterval: 15000,
    },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const connectNeon = useConnectCrmNeon();
  const syncNeon = useSyncCrmNeon();
  const disconnectNeon = useDisconnectCrmNeon();
  const connectZapier = useConnectCrmZapier();
  const testZapier = useTestCrmZapier();
  const syncZapier = useSyncCrmZapier();
  const disconnectZapier = useDisconnectCrmZapier();
  const [neonUrl, setNeonUrl] = useState('');
  const [zapierUrl, setZapierUrl] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const integrations = statusQuery.data?.integrations ?? [];
  const neon = integrations.find((integration) => integration.provider === 'neon');
  const zapier = integrations.find((integration) => integration.provider === 'zapier');
  const refreshStatus = () => queryClient.invalidateQueries({ queryKey: getGetCrmIntegrationsQueryKey() });
  const refreshCrm = () => queryClient.invalidateQueries({ queryKey: getGetCrmQueryKey() });
  const showSuccess = (title: string) => toast({ title });
  const showFailure = (title: string) => toast({
    title,
    description: 'The service could not complete this request. Check the connection details and try again.',
    variant: 'destructive',
  });

  const submitNeon = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const connectionString = neonUrl.trim();
    if (!connectionString) return;
    connectNeon.mutate({ data: { connectionString } }, {
      onSuccess: () => {
        setNeonUrl('');
        void refreshStatus();
        showSuccess('Neon connection verified');
      },
      onError: () => showFailure('Neon connection was not saved'),
    });
  };

  const submitZapier = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = zapierUrl.trim();
    if (!url) return;
    let validHttps = false;
    try {
      const parsed = new URL(url);
      validHttps = parsed.protocol === 'https:';
    } catch {
      validHttps = false;
    }
    if (!validHttps) {
      toast({ title: 'Enter a valid HTTPS Catch Hook URL', variant: 'destructive' });
      return;
    }
    connectZapier.mutate({ data: { url } }, {
      onSuccess: () => {
        setZapierUrl('');
        void refreshStatus();
        showSuccess('Zapier connection saved and test event sent');
      },
      onError: () => showFailure('Zapier connection was not saved'),
    });
  };

  const confirmSync = (provider: Provider) => setConfirmAction({ provider, action: 'sync' });
  const disconnect = (provider: Provider) => setConfirmAction({ provider, action: 'disconnect' });
  const runConfirmed = () => {
    if (!confirmAction) return;
    const current = confirmAction;
    setConfirmAction(null);
    if (current.provider === 'neon' && current.action === 'sync') {
      syncNeon.mutate(undefined, {
        onSuccess: () => {
          void refreshStatus();
          void refreshCrm();
          showSuccess('Neon CRM sync completed');
        },
        onError: () => showFailure('Neon CRM sync did not finish'),
      });
    } else if (current.provider === 'zapier' && current.action === 'sync') {
      syncZapier.mutate(undefined, {
        onSuccess: () => {
          void refreshStatus();
          void refreshCrm();
          showSuccess('Zapier CRM sync completed');
        },
        onError: () => showFailure('Zapier CRM sync did not finish'),
      });
    } else if (current.provider === 'neon') {
      disconnectNeon.mutate(undefined, {
        onSuccess: () => { void refreshStatus(); showSuccess('Neon disconnected'); },
        onError: () => showFailure('Neon was not disconnected'),
      });
    } else {
      disconnectZapier.mutate(undefined, {
        onSuccess: () => { void refreshStatus(); showSuccess('Zapier disconnected'); },
        onError: () => showFailure('Zapier was not disconnected'),
      });
    }
  };

  if (workspaceQuery.isLoading) return <LoadingPage />;
  if (workspaceQuery.isError || !workspace) return <ErrorState error={workspaceQuery.error} retry={() => void workspaceQuery.refetch()} />;
  if (!permissions.signedIn) return <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><h1 className="mt-3 font-display text-2xl font-bold">Administrator sign-in required</h1><p className="my-4 text-sm text-muted-foreground">CRM integrations are available to event administrators only.</p><SignInToAct /></div>;
  if (!permissions.isAdmin) return <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><h1 className="mt-3 font-display text-2xl font-bold">Administrator access only</h1><p className="mt-2 text-sm text-muted-foreground">Integration status and controls are restricted to event administrators.</p></div>;
  if (statusQuery.isLoading) return <LoadingPage />;
  if (statusQuery.isError || !statusQuery.data) return <ErrorState error={statusQuery.error} retry={() => void statusQuery.refetch()} />;

  const pendingDisconnect = disconnectNeon.isPending || disconnectZapier.isPending;
  const pendingSync = syncNeon.isPending || syncZapier.isPending;
  const dialogTitle = confirmAction?.action === 'sync'
    ? `Sync ${confirmAction.provider === 'neon' ? 'Neon' : 'Zapier'} now?`
    : `Disconnect ${confirmAction?.provider === 'neon' ? 'Neon' : 'Zapier'}?`;
  const dialogBody = confirmAction?.action === 'sync'
    ? confirmAction.provider === 'neon'
      ? 'This explicit sync copies contact name, email, phone, company, tags, source, channel consent, timestamps and verification flags, plus registration and attendance event history into the isolated kodiboxa_crm schema. Organizer notes, campaigns and Stripe/payment data are excluded.'
      : 'This explicit sync sends only active contacts with channel consent and verified destinations: email/phone, names, company, tags, event history and consent timestamp. Private organizer notes, unconsented contacts, unverified SMS numbers and campaign drafts are excluded. This is not an email or SMS, and no automatic sync is enabled.'
    : confirmAction?.provider === 'neon'
      ? 'KODIBOXA will stop using this connection. The existing copy of CRM data stays in Neon and is not deleted.'
      : 'No further Zapier deliveries will continue. Data already sent to Zapier is not recalled.';

  return <div className="space-y-6">
    <PageHeader kicker="KODIBOXA / RELATIONSHIPS" title="CRM integrations" sub="Connect a private CRM destination, then choose exactly when to share a copy of your records." />

    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm" data-testid="notice-integration-boundary">
      <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <p><strong className="font-semibold">Separate from the event platform.</strong> Neon is an isolated CRM copy; it never replaces KODIBOXA’s main database. Credentials are encrypted at rest. CRM campaign sending remains disabled, even when a provider is connected.</p>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title={<span className="inline-flex items-center gap-2"><Database className="h-4 w-4 text-primary" />Neon</span>} meta="Private CRM storage">
        <div className="space-y-5 p-5">
          <ProviderStatus connected={!!neon?.connected} verifiedAt={neon?.verifiedAt ?? null} lastSyncedAt={neon?.lastSyncedAt ?? null} provider="Neon" />
          {!neon?.connected ? <form onSubmit={submitNeon} className="space-y-4">
            <Field label="Neon connection string" hint="Paste the connection string for your Neon database. The value is encrypted at rest, never shown after saving, and cleared from this form when the connection succeeds.">
              <Input type="password" autoComplete="new-password" value={neonUrl} onChange={(event) => setNeonUrl(event.target.value)} placeholder="postgresql://…" aria-label="Neon connection string" data-testid="input-neon-connection-string" />
            </Field>
            <div className="rounded-lg border border-border bg-muted/35 p-3 text-xs leading-relaxed text-muted-foreground"><strong className="text-foreground">Safe verification:</strong> Connect runs <code className="rounded bg-muted px-1 py-0.5">SELECT 1</code> only. It does not write schema or data. Sync is a separate action and always requires confirmation.</div>
            <Button type="submit" disabled={!neonUrl.trim() || connectNeon.isPending} data-testid="button-connect-neon"><Plug className="mr-2 h-4 w-4" />{connectNeon.isPending ? 'Checking connection…' : 'Connect Neon'}</Button>
          </form> : <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Connection is verified. No data is copied until an administrator starts a manual sync.</p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => confirmSync('neon')} disabled={pendingSync || pendingDisconnect} data-testid="button-sync-neon"><ArrowDownToLine className="mr-2 h-4 w-4" />{syncNeon.isPending ? 'Syncing…' : 'Sync to Neon'}</Button>
              <Button variant="outline" onClick={() => disconnect('neon')} disabled={pendingDisconnect || pendingSync} data-testid="button-disconnect-neon"><Unplug className="mr-2 h-4 w-4" />Disconnect</Button>
            </div>
          </div>}
          <div className="border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Fields shared on sync</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Contact name, email, phone, company, tags and source; channel consent, timestamps and verification flags; registration and attendance event history. Organizer notes, campaigns and Stripe/payment data are excluded.</p>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">Destination schema: kodiboxa_crm</p>
          </div>
        </div>
      </Panel>

      <Panel title={<span className="inline-flex items-center gap-2"><Webhook className="h-4 w-4 text-primary" />Zapier</span>} meta="Catch Hook delivery">
        <div className="space-y-5 p-5">
          <ProviderStatus connected={!!zapier?.connected} verifiedAt={zapier?.verifiedAt ?? null} lastSyncedAt={zapier?.lastSyncedAt ?? null} provider="Zapier" />
          {!zapier?.connected ? <form onSubmit={submitZapier} className="space-y-4">
            <Field label="Zapier Catch Hook URL" hint="Create a Zapier Zap with a Catch Hook trigger, then paste its HTTPS URL here. The URL is encrypted at rest and never shown after saving.">
              <Input type="password" autoComplete="new-password" value={zapierUrl} onChange={(event) => setZapierUrl(event.target.value)} placeholder="https://hooks.zapier.com/…" aria-label="Zapier Catch Hook HTTPS URL" data-testid="input-zapier-catch-hook-url" />
            </Field>
            <div className="rounded-lg border border-border bg-muted/35 p-3 text-xs leading-relaxed text-muted-foreground">Saving sends one synthetic, data-free connection-test event to Zapier. No attendee details are included.</div>
            <Button type="submit" disabled={!zapierUrl.trim() || connectZapier.isPending} data-testid="button-connect-zapier"><Webhook className="mr-2 h-4 w-4" />{connectZapier.isPending ? 'Testing connection…' : 'Save Catch Hook'}</Button>
          </form> : <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Catch Hook is connected. Test sends a synthetic, data-free event; manual sync is a separate confirmed action.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => testZapier.mutate(undefined, { onSuccess: () => showSuccess('Data-free Zapier test event sent'), onError: () => showFailure('Zapier test event was not delivered') })} disabled={testZapier.isPending || pendingSync || pendingDisconnect} data-testid="button-test-zapier"><Send className="mr-2 h-4 w-4" />{testZapier.isPending ? 'Sending test…' : 'Send test event'}</Button>
              <Button onClick={() => confirmSync('zapier')} disabled={pendingSync || pendingDisconnect || testZapier.isPending} data-testid="button-sync-zapier"><ArrowDownToLine className="mr-2 h-4 w-4" />{syncZapier.isPending ? 'Syncing…' : 'Sync eligible contacts'}</Button>
              <Button variant="outline" onClick={() => disconnect('zapier')} disabled={pendingDisconnect || pendingSync || testZapier.isPending} data-testid="button-disconnect-zapier"><Unplug className="mr-2 h-4 w-4" />Disconnect</Button>
            </div>
          </div>}
          <div className="border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Manual sync boundaries</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Only active, channel-consented contacts with verified destinations are eligible. Shared fields: email/phone, names, company, tags, event history and consent timestamp. Private organizer notes, unconsented contacts, unverified SMS numbers and campaign drafts are excluded.</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Sync is not an email or SMS. No automatic sync is enabled. CRM campaign sending remains disabled.</p>
            <a href="https://zapier.com/apps/webhook/integrations" target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline" data-testid="link-zapier-setup"><ExternalLink className="h-3.5 w-3.5" />Zapier Catch Hook setup guide</a>
          </div>
        </div>
      </Panel>
    </div>

    <Panel title="Connection policy" meta="Administrator controlled">
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        <Policy icon={<LockKeyhole className="h-4 w-4" />} title="Secrets stay secret" body="Connection strings and webhook URLs are never rendered back to the page. Errors use safe, generic copy." />
        <Policy icon={<RefreshCw className="h-4 w-4" />} title="No background sync" body="Both providers move data only after an administrator explicitly confirms a manual sync." />
        <Policy icon={<CircleAlert className="h-4 w-4" />} title="Sending is off" body="Connecting storage or a webhook does not enable CRM campaign delivery." />
      </div>
    </Panel>

    <Confirm
      open={!!confirmAction}
      onOpenChange={(open) => { if (!open) setConfirmAction(null); }}
      title={dialogTitle}
      body={dialogBody}
      cta={confirmAction?.action === 'sync' ? 'Confirm sync' : 'Disconnect'}
      onConfirm={runConfirmed}
    />
  </div>;
}

function ProviderStatus({ connected, verifiedAt, lastSyncedAt, provider }: { connected: boolean; verifiedAt: string | null; lastSyncedAt: string | null; provider: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background/60 p-3" data-testid={`status-integration-${provider.toLowerCase()}`}>
    <div className="flex items-center gap-2"><span className={`grid h-8 w-8 place-items-center rounded-lg ${connected ? 'bg-ok/10 text-ok' : 'bg-muted text-muted-foreground'}`}>{connected ? <Check className="h-4 w-4" /> : <Plug className="h-4 w-4" />}</span><div><div className="text-sm font-semibold">{provider} connection</div><div className="text-xs text-muted-foreground">{connected ? `Verified ${dateLabel(verifiedAt)}` : 'No connection saved'}</div></div></div>
    <Pill status={connected ? 'connected' : 'unavailable'} label={connected ? 'Connected' : 'Not connected'} />
    {connected && <div className="w-full border-t border-border pt-2 text-xs text-muted-foreground">Last manual sync: <span className="font-medium text-foreground">{dateLabel(lastSyncedAt)}</span></div>}
  </div>;
}

function Policy({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return <div className="flex gap-3 rounded-lg border border-border/80 p-3"><span className="mt-0.5 text-primary">{icon}</span><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p></div></div>;
}
