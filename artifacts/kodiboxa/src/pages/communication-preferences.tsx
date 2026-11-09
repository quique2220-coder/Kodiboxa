import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCircle2, Mail, MessageSquareText, ShieldCheck } from 'lucide-react';
import { getGetCommunicationPreferencesQueryKey, useGetCommunicationPreferences, useSaveCommunicationPreferences } from '@workspace/api-client-react';
import { access, errorMessage, useWorkspace } from '@/lib/workspace';
import { ErrorState, LoadingPage, PageHeader, Panel, SignInToAct } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

export default function CommunicationPreferencesPage() {
  const wsQuery = useWorkspace();
  const ws = wsQuery.data;
  const a = access(ws);
  const ownerId = a.user?.id ?? '';
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  const prefsKey = [...getGetCommunicationPreferencesQueryKey(), ownerId];
  const prefs = useGetCommunicationPreferences({ query: { enabled: a.signedIn, queryKey: prefsKey, refetchInterval: 15000 } });
  const save = useSaveCommunicationPreferences();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [emailOptIn, setEmailOptIn] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [phone, setPhone] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    setEmailOptIn(false);
    setSmsOptIn(false);
    setPhone('');
    setDirty(false);
    setSavedMessage('');
  }, [ownerId]);

  useEffect(() => {
    if (!prefs.data || dirty) return;
    setEmailOptIn(prefs.data.emailOptIn);
    setSmsOptIn(prefs.data.smsOptIn);
    setPhone(prefs.data.phone);
  }, [prefs.data, dirty, ownerId]);

  const update = (fn: () => void) => { fn(); setDirty(true); setSavedMessage(''); };
  const submit = () => {
    if (phone.trim() && !/^\+[1-9]\d{6,14}$/.test(phone.trim())) {
      toast({ title: 'Check the phone number', description: 'Use E.164 format, such as +14155550123.', variant: 'destructive' });
      return;
    }
    if (smsOptIn && !/^\+[1-9]\d{6,14}$/.test(phone.trim())) {
      toast({ title: 'A valid phone number is required', description: 'Enter an E.164 number before opting into SMS.', variant: 'destructive' });
      return;
    }
    save.mutate({ data: { emailOptIn, smsOptIn, phone: phone.trim(), noticeVersion: prefs.data!.noticeVersion } }, {
      onSuccess: (result) => {
        qc.setQueryData(prefsKey, result);
        void qc.invalidateQueries({ queryKey: getGetCommunicationPreferencesQueryKey() });
        if (ownerRef.current !== ownerId) return;
        setEmailOptIn(result.emailOptIn);
        setSmsOptIn(result.smsOptIn);
        setPhone(result.phone);
        setDirty(false);
        setSavedMessage('Your communication choices have been saved.');
        toast({ title: 'Preferences saved' });
      },
      onError: (error) => {
        const message = errorMessage(error);
        const status = (error as { status?: number } | null)?.status;
        if (status === 409 || /\b409\b|conflict|notice version/i.test(message)) {
          setSavedMessage('The consent notice changed while you were editing. Review the updated wording before saving again.');
          void prefs.refetch();
        }
        toast({ title: 'Preferences not saved', description: message, variant: 'destructive' });
      },
    });
  };

  if (wsQuery.isLoading) return <LoadingPage />;
  if (wsQuery.isError || !ws) return <ErrorState error={wsQuery.error} retry={() => void wsQuery.refetch()} />;
  if (!a.signedIn) return <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><h1 className="mt-3 font-display text-2xl font-bold">Your choices belong to you</h1><p className="my-4 text-sm text-muted-foreground">Sign in to manage your own event communication preferences.</p><SignInToAct /></div>;
  if (prefs.isLoading) return <LoadingPage />;
  if (prefs.isError || !prefs.data) return <ErrorState error={prefs.error} retry={() => void prefs.refetch()} />;

  return <div className="mx-auto max-w-3xl space-y-6">
    <PageHeader kicker="YOUR ACCOUNT / COMMUNICATIONS" title="Choose what reaches you." sub="Opt in to future event updates on your terms. You can withdraw either choice here at any time." />
    <div className="rounded-2xl border border-primary/25 bg-primary/5 p-4 text-sm"><div className="flex items-center gap-2 font-semibold"><Bell className="h-4 w-4 text-primary" />No hidden opt-ins</div><p className="mt-1 text-muted-foreground">Each choice is separate and starts unchecked unless you previously saved it. Signing up for an event does not subscribe you to marketing.</p></div>
    <Panel title="Your contact details" meta="Only your own preferences">
      <div className="space-y-5 p-5">
        <div className="rounded-xl border border-border p-4"><div className="flex items-start gap-3"><Mail className="mt-0.5 h-5 w-5 text-primary" /><div className="min-w-0"><p className="font-semibold">Email address</p><p className="mt-1 break-all text-sm text-muted-foreground" data-testid="text-own-email">{prefs.data.email || 'No email address on your account'}</p><p className="mt-1 text-xs text-muted-foreground">Managed by your KODIBOXA sign-in account.</p></div></div></div>
        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${emailOptIn ? 'border-primary/45 bg-primary/5' : 'border-border hover:bg-muted/40'}`}><input type="checkbox" checked={emailOptIn} onChange={(e) => update(() => setEmailOptIn(e.target.checked))} className="mt-1 h-4 w-4 accent-primary" data-testid="checkbox-email-opt-in" /><span className="flex-1"><span className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4 text-primary" />Email updates and offers</span><span className="mt-1 block text-sm text-muted-foreground">{prefs.data.emailNotice}</span></span></label>
        <div className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 font-semibold"><MessageSquareText className="h-4 w-4 text-primary" />Text message updates</div>
          <label className="block space-y-1.5"><span className="text-sm font-medium">Your phone number</span><Input type="tel" inputMode="tel" maxLength={20} value={phone} onChange={(e) => update(() => setPhone(e.target.value))} placeholder="+14155550123" aria-describedby="phone-help" data-testid="input-own-phone" /><span id="phone-help" className="block text-xs text-muted-foreground">International E.164 format, for example +14155550123. {prefs.data.phoneVerified ? 'This number is verified.' : 'This number is not verified.'}</span></label>
          <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${smsOptIn ? 'border-primary/45 bg-primary/5' : 'border-border hover:bg-muted/40'}`}><input type="checkbox" checked={smsOptIn} onChange={(e) => update(() => setSmsOptIn(e.target.checked))} className="mt-1 h-4 w-4 accent-primary" data-testid="checkbox-sms-opt-in" /><span><span className="flex items-center gap-2 font-semibold"><MessageSquareText className="h-4 w-4 text-primary" />SMS updates and offers</span><span className="mt-1 block text-sm text-muted-foreground">{prefs.data.smsNotice}</span></span></label>
        </div>
        <div className="rounded-xl border border-live/30 bg-live/5 p-4"><p className="font-semibold">Messages are not available yet</p><p className="mt-1 text-sm text-muted-foreground">Email and SMS are not connected. Saving an opt-in records your choice only; no message will be sent. SMS also requires phone verification and provider setup.</p></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Withdraw consent at any time by unchecking a choice and saving.</p><Button onClick={submit} disabled={save.isPending || !dirty} data-testid="button-save-communication-preferences">{save.isPending ? 'Saving…' : 'Save my choices'}</Button></div>
        {savedMessage && <p className="flex items-center gap-2 text-sm font-medium text-ok" role="status" data-testid="text-preferences-saved"><CheckCircle2 className="h-4 w-4" />{savedMessage}</p>}
      </div>
    </Panel>
  </div>;
}
