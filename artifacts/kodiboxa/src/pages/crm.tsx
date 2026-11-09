import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  Archive, Bell, ChevronRight, CircleAlert, Mail, MessageSquareText, Plus, RefreshCw,
  Plug, Search, ShieldCheck, UserRound, Users, X,
} from 'lucide-react';
import {
  getGetCrmQueryKey, useCreateCrmCampaign, useCreateCrmContact, useDeleteCrmCampaign,
  useGetCrm, useSyncCrmContacts, useUpdateCrmCampaign, useUpdateCrmContact,
  type CrmCampaign, type CrmCampaignInput, type CrmContact,
} from '@workspace/api-client-react';
import { useWorkspace, access, errorMessage, fmtDate, fmtStamp } from '@/lib/workspace';
import { Empty, ErrorState, LoadingPage, PageHeader, Panel, Pill, SignInToAct, Stat } from '@/components/bits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

type ContactDraft = { name: string; email: string; phone: string; company: string; notes: string; tags: string };
const blankContact: ContactDraft = { name: '', email: '', phone: '', company: '', notes: '', tags: '' };
type CampaignDraft = { name: string; channel: 'email' | 'sms'; subject: string; body: string; promotedEventId: string; audienceEventId: string; tag: string };
const blankCampaign: CampaignDraft = { name: '', channel: 'email', subject: '', body: '', promotedEventId: '', audienceEventId: '', tag: '' };
const splitTags = (text: string) => [...new Set(text.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block space-y-1.5"><span className="text-sm font-medium">{label}</span>{children}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>;
}

export default function CRM() {
  const wsQuery = useWorkspace();
  const ws = wsQuery.data;
  const a = access(ws);
  const crm = useGetCrm({ query: { enabled: a.isAdmin, queryKey: getGetCrmQueryKey(), refetchInterval: 15000 } });
  const qc = useQueryClient();
  const { toast } = useToast();
  const createContact = useCreateCrmContact();
  const updateContact = useUpdateCrmContact();
  const sync = useSyncCrmContacts();
  const createCampaign = useCreateCrmCampaign();
  const updateCampaign = useUpdateCrmCampaign();
  const deleteCampaign = useDeleteCrmCampaign();
  const [view, setView] = useState<'contacts' | 'campaigns'>('contacts');
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [consentFilter, setConsentFilter] = useState('all');
  const [archiveFilter, setArchiveFilter] = useState('active');
  const [contactForm, setContactForm] = useState<ContactDraft | null>(null);
  const [editingContact, setEditingContact] = useState<CrmContact | null>(null);
  const [selectedContactSnapshot, setSelectedContact] = useState<CrmContact | null>(null);
  const [campaignForm, setCampaignForm] = useState<CampaignDraft | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<CrmCampaign | null>(null);
  const [deletingCampaign, setDeletingCampaign] = useState<CrmCampaign | null>(null);

  const contacts = crm.data?.contacts ?? [];
  const selectedContact = contacts.find(c => c.id === selectedContactSnapshot?.id) ?? null;
  const campaigns = crm.data?.campaigns ?? [];
  const events = useMemo(() => ws?.events ?? [], [ws?.events]);
  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const tags = useMemo(() => [...new Set(contacts.flatMap((contact) => contact.tags))].sort((x, y) => x.localeCompare(y)), [contacts]);
  const futureEvents = useMemo(() => events.filter((event) => event.status === 'draft' || (event.status === 'upcoming' && new Date(event.startsAt).getTime() > Date.now())).sort((x, y) => x.startsAt.localeCompare(y.startsAt)), [events]);
  const activeContacts = contacts.filter((contact) => !contact.archived);
  const optedEmail = contacts.filter((contact) => !contact.archived && contact.emailOptIn).length;
  const optedSms = contacts.filter((contact) => !contact.archived && contact.smsOptIn).length;
  const filtered = contacts.filter((contact) => {
    const haystack = `${contact.name} ${contact.email} ${contact.company} ${contact.tags.join(' ')}`.toLowerCase();
    const eventMatch = !eventFilter || contact.history.some((history) => history.eventId === eventFilter);
    const tagMatch = !tagFilter || contact.tags.includes(tagFilter);
    const consentMatch = consentFilter === 'all' || (consentFilter === 'email' ? contact.emailOptIn : consentFilter === 'sms' ? contact.smsOptIn : consentFilter === 'neither' ? !contact.emailOptIn && !contact.smsOptIn : contact.emailOptIn || contact.smsOptIn);
    return haystack.includes(search.toLowerCase()) && eventMatch && tagMatch && consentMatch && (archiveFilter === 'all' || (archiveFilter === 'archived' ? contact.archived : !contact.archived));
  });

  const refreshCrm = () => qc.invalidateQueries({ queryKey: getGetCrmQueryKey() });
  const closeContact = () => { setContactForm(null); setEditingContact(null); };
  const startContact = (contact?: CrmContact) => {
    setEditingContact(contact ?? null);
    setContactForm(contact ? { name: contact.name, email: contact.email, phone: contact.phone, company: contact.company, notes: contact.notes, tags: contact.tags.join(', ') } : blankContact);
  };
  const saveContact = () => {
    if (!contactForm) return;
    const phone = contactForm.phone.trim();
    if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) { toast({ title: 'Check the phone number', description: 'Use E.164 format, such as +14155550123.', variant: 'destructive' }); return; }
    const onSuccess = () => { refreshCrm(); closeContact(); toast({ title: editingContact ? 'Contact updated' : 'Contact added' }); };
    const onError = (error: unknown) => toast({ title: 'Contact not saved', description: errorMessage(error), variant: 'destructive' });
    if (editingContact) {
      const data = { name: contactForm.name.trim(), phone, company: contactForm.company.trim(), notes: contactForm.notes, tags: splitTags(contactForm.tags), ...(phone !== editingContact.phone ? { revokeSms: true } : {}) };
      updateContact.mutate({ id: editingContact.id, data }, { onSuccess, onError });
    } else {
      createContact.mutate({ data: { name: contactForm.name.trim(), email: contactForm.email.trim(), phone, company: contactForm.company.trim(), notes: contactForm.notes, tags: splitTags(contactForm.tags) } }, { onSuccess, onError });
    }
  };
  const changeArchive = (contact: CrmContact) => updateContact.mutate({ id: contact.id, data: { archived: !contact.archived } }, {
    onSuccess: () => { refreshCrm(); setSelectedContact(null); toast({ title: contact.archived ? 'Contact restored' : 'Contact archived' }); },
    onError: (error) => toast({ title: 'Contact not updated', description: errorMessage(error), variant: 'destructive' }),
  });
  const revoke = (contact: CrmContact, channel: 'email' | 'sms') => updateContact.mutate({
    id: contact.id, data: channel === 'email' ? { revokeEmail: true } : { revokeSms: true },
  }, {
    onSuccess: () => {
      refreshCrm();
      setSelectedContact((current) => current?.id === contact.id ? { ...current, ...(channel === 'email' ? { emailOptIn: false, emailConsentAt: null } : { smsOptIn: false, smsConsentAt: null }) } : current);
      toast({ title: `${channel === 'email' ? 'Email' : 'SMS'} consent withdrawn` });
    },
    onError: (error) => toast({ title: 'Consent not updated', description: errorMessage(error), variant: 'destructive' }),
  });
  const startCampaign = (campaign?: CrmCampaign) => {
    setEditingCampaign(campaign ?? null);
    setCampaignForm(campaign ? {
      name: campaign.name, channel: campaign.channel, subject: campaign.subject, body: campaign.body,
      promotedEventId: campaign.promotedEventId ?? '', audienceEventId: campaign.audienceEventId ?? '', tag: campaign.tag,
    } : blankCampaign);
  };
  const saveCampaign = () => {
    if (!campaignForm) return;
    const data: CrmCampaignInput = {
      name: campaignForm.name.trim(), channel: campaignForm.channel, subject: campaignForm.subject,
      body: campaignForm.body, promotedEventId: campaignForm.promotedEventId || null,
      audienceEventId: campaignForm.audienceEventId || null, tag: campaignForm.tag.trim(),
    };
    const onSuccess = () => { refreshCrm(); setCampaignForm(null); setEditingCampaign(null); toast({ title: editingCampaign ? 'Draft updated' : 'Draft saved' }); };
    const onError = (error: unknown) => toast({ title: 'Draft not saved', description: errorMessage(error), variant: 'destructive' });
    if (editingCampaign) updateCampaign.mutate({ id: editingCampaign.id, data }, { onSuccess, onError });
    else createCampaign.mutate({ data }, { onSuccess, onError });
  };

  if (wsQuery.isLoading) return <LoadingPage />;
  if (wsQuery.isError || !ws) return <ErrorState error={wsQuery.error} retry={() => void wsQuery.refetch()} />;
  if (!a.signedIn) return <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><h1 className="mt-3 font-display text-2xl font-bold">Organizer sign-in required</h1><p className="my-4 text-sm text-muted-foreground">The relationship CRM is available to event administrators.</p><SignInToAct /></div>;
  if (!a.isAdmin) return <div className="mx-auto max-w-xl rounded-2xl border border-border bg-card p-8 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-primary" /><h1 className="mt-3 font-display text-2xl font-bold">Administrator access only</h1><p className="mt-2 text-sm text-muted-foreground">Contact and campaign records are visible to event administrators only.</p></div>;
  if (crm.isLoading) return <LoadingPage />;
  if (crm.isError || !crm.data) return <ErrorState error={crm.error} retry={() => void crm.refetch()} />;

  return <div className="space-y-6">
    <PageHeader kicker="KODIBOXA / RELATIONSHIPS" title="People, not a mailing list." sub="A considered record of who came, what they opted into, and the next event worth sharing." actions={<div className="flex flex-wrap gap-2"><Link href="/crm/integrations" className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-semibold transition-colors hover:bg-muted" data-testid="link-crm-integrations"><Plug className="mr-2 h-4 w-4" />Integrations</Link><Button onClick={() => sync.mutate(undefined, { onSuccess: (result) => { refreshCrm(); toast({ title: result.message || 'Event participants synced' }); }, onError: (error) => toast({ title: 'Sync did not finish', description: errorMessage(error), variant: 'destructive' }) })} disabled={sync.isPending} variant="outline" data-testid="button-sync-event-participants"><RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />{sync.isPending ? 'Syncing participants' : 'Sync event participants'}</Button></div>} />
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Stat label="People in CRM" value={contacts.length} sub={`${activeContacts.length} active · ${contacts.length - activeContacts.length} archived`} />
      <Stat label="Email opt-ins" value={optedEmail} sub="Explicit consent only" tone="ok" />
      <Stat label="SMS opt-ins" value={optedSms} sub="Phone verification still required" tone="tape" />
      <Stat label="Campaign drafts" value={campaigns.length} sub="Nothing is sent or scheduled" />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
      <div className="flex gap-1" role="tablist" aria-label="CRM sections">
        {(['contacts', 'campaigns'] as const).map((item) => <button key={item} role="tab" aria-selected={view === item} onClick={() => setView(item)} className={`border-b-2 px-3 py-3 text-sm font-semibold capitalize ${view === item ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} data-testid={`tab-crm-${item}`}>{item}{item === 'campaigns' && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px]">{campaigns.length}</span>}</button>)}
      </div>
      {view === 'contacts' ? <Button onClick={() => startContact()} data-testid="button-add-contact"><Plus className="mr-2 h-4 w-4" />Add contact</Button> : <Button onClick={() => startCampaign()} data-testid="button-new-campaign"><Plus className="mr-2 h-4 w-4" />New draft</Button>}
    </div>
    {view === 'contacts' ? <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_310px]">
      <Panel title="Contact book" meta={`${filtered.length} shown`}>
        <div className="grid gap-2 border-b border-border p-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="relative sm:col-span-2 xl:col-span-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, company…" className="pl-9" aria-label="Search contacts" data-testid="input-search-contacts" /></div>
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} aria-label="Filter by event" className="h-10 rounded-md border border-input bg-background px-3 text-sm" data-testid="select-filter-event"><option value="">All event history</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Filter by tag" className="h-10 rounded-md border border-input bg-background px-3 text-sm" data-testid="select-filter-tag"><option value="">All tags</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select>
          <select value={consentFilter} onChange={(e) => setConsentFilter(e.target.value)} aria-label="Filter by communication consent" className="h-10 rounded-md border border-input bg-background px-3 text-sm" data-testid="select-filter-consent"><option value="all">All consent states</option><option value="email">Email opted in</option><option value="sms">SMS opted in</option><option value="either">Any opt-in</option><option value="neither">No opt-ins</option></select>
          <select value={archiveFilter} onChange={(e) => setArchiveFilter(e.target.value)} aria-label="Filter archived contacts" className="h-10 rounded-md border border-input bg-background px-3 text-sm" data-testid="select-filter-archived"><option value="active">Active contacts</option><option value="archived">Archived contacts</option><option value="all">All contacts</option></select>
          {(search || eventFilter || tagFilter || consentFilter !== 'all' || archiveFilter !== 'active') && <Button variant="ghost" className="justify-start" onClick={() => { setSearch(''); setEventFilter(''); setTagFilter(''); setConsentFilter('all'); setArchiveFilter('active'); }} data-testid="button-clear-contact-filters"><X className="mr-1.5 h-4 w-4" />Clear filters</Button>}
        </div>
        {filtered.length ? <ul className="divide-y divide-border">{filtered.map((contact) => <li key={contact.id} className="p-4" data-testid={`row-crm-contact-${contact.id}`}>
          <button onClick={() => setSelectedContact(contact)} className="flex w-full min-w-0 items-start gap-3 text-left" data-testid={`button-open-contact-${contact.id}`}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 font-semibold">{contact.name}{contact.archived && <Pill status="ended" label="Archived" />}</span><span className="block truncate text-sm text-muted-foreground">{contact.email}{contact.company ? ` · ${contact.company}` : ''}</span><span className="mt-2 flex flex-wrap gap-1.5">{contact.tags.map((tag) => <span key={tag} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{tag}</span>)}{contact.history.slice(0, 2).map((history) => <span key={history.eventId} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{history.title}</span>)}</span></span>
            <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-[52px] text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{contact.emailOptIn ? 'Email opted in' : 'No email consent'}</span><span className="inline-flex items-center gap-1"><MessageSquareText className="h-3 w-3" />{contact.smsOptIn ? 'SMS opted in' : 'No SMS consent'}</span><span>{contact.history.length} event{contact.history.length === 1 ? '' : 's'}</span></div>
        </li>)}</ul> : <Empty icon={<Users className="h-6 w-6" />} title={contacts.length ? 'No matching contacts' : 'Start with the people you know'} body={contacts.length ? 'Try broadening your filters.' : 'Sync event participants or add a contact. Registration never grants marketing consent.'} action={!contacts.length ? <Button onClick={() => startContact()}><Plus className="mr-2 h-4 w-4" />Add contact</Button> : undefined} />}
      </Panel>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-live/30 bg-live/5 p-5"><div className="flex items-center gap-2 font-semibold"><CircleAlert className="h-4 w-4 text-live" />Sending is unavailable</div><p className="mt-2 text-sm text-muted-foreground">Email and SMS are not connected. Campaigns stay as drafts; nothing can be sent, queued, or scheduled.</p><p className="mt-3 border-t border-live/15 pt-3 text-xs text-muted-foreground">{crm.data.deliveryReason}</p></div>
        <Panel title="Consent, clearly stated"><div className="space-y-3 p-4 text-sm text-muted-foreground"><p>New contacts start with no marketing opt-ins. Event registration is not consent.</p><p>Organizers can withdraw consent here, but cannot grant it on someone’s behalf.</p><p>Contacts can change their choices from their own communication preferences page.</p></div></Panel>
      </aside>
    </div> : <div className="space-y-4">
      {!campaigns.length && !campaignForm && <Panel><Empty icon={<Bell className="h-6 w-6" />} title="No campaign drafts yet" body="Write a future-event invitation and preview the consent-based audience before saving." action={<Button onClick={() => startCampaign()}><Plus className="mr-2 h-4 w-4" />Create a draft</Button>} /></Panel>}
      {campaignForm && <CampaignEditor draft={campaignForm} setDraft={setCampaignForm} editing={editingCampaign} events={futureEvents} knownEvents={eventsById} pending={createCampaign.isPending || updateCampaign.isPending} onCancel={() => { setCampaignForm(null); setEditingCampaign(null); }} onSave={saveCampaign} />}
      <div className="grid gap-4 lg:grid-cols-2">{campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} events={eventsById} onEdit={() => startCampaign(campaign)} onDelete={() => setDeletingCampaign(campaign)} />)}</div>
      {deletingCampaign && <div className="fixed inset-0 z-50 grid place-items-center bg-sidebar/55 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeletingCampaign(null); }}><section role="dialog" aria-modal="true" aria-labelledby="delete-draft-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"><h2 id="delete-draft-title" className="text-xl font-bold">Delete this draft?</h2><p className="mt-2 text-sm text-muted-foreground">“{deletingCampaign.name}” will be removed. This cannot be undone.</p><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setDeletingCampaign(null)}>Keep draft</Button><Button variant="destructive" disabled={deleteCampaign.isPending} onClick={() => deleteCampaign.mutate({ id: deletingCampaign.id }, { onSuccess: () => { refreshCrm(); setDeletingCampaign(null); toast({ title: 'Draft deleted' }); }, onError: (error) => toast({ title: 'Draft not deleted', description: errorMessage(error), variant: 'destructive' }) })} data-testid="button-confirm-delete-campaign">{deleteCampaign.isPending ? 'Deleting…' : 'Delete draft'}</Button></div></section></div>}
      <div className="rounded-xl border border-live/30 bg-live/5 p-4 text-sm"><strong>Email and SMS sending are unavailable.</strong> Drafts can be saved and reviewed, but sending, scheduling, and delivery tracking are not available.</div>
    </div>}

    {contactForm && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-sidebar/55 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) closeContact(); }}><section role="dialog" aria-modal="true" aria-labelledby="contact-form-title" className="my-6 w-full max-w-xl rounded-2xl border border-border bg-card shadow-xl">
      <header className="flex items-start justify-between border-b border-border p-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">{editingContact ? 'Update record' : 'Add to your network'}</p><h2 id="contact-form-title" className="mt-1 text-xl font-bold">{editingContact ? 'Edit contact' : 'New contact'}</h2></div><button onClick={closeContact} aria-label="Close contact form" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button></header>
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Name"><Input required maxLength={120} value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} data-testid="input-contact-name" /></Field>
        <Field label="Email" hint={editingContact ? 'Email is the consent identity and cannot be edited. Archive this record and add a new contact to correct it.' : 'Adding an address does not opt someone into email.'}><Input required type="email" maxLength={250} value={contactForm.email} disabled={!!editingContact} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} data-testid="input-contact-email" /></Field>
        <Field label="Phone (optional)" hint="E.164 format, such as +14155550123. Changing a number withdraws existing SMS consent."><Input type="tel" maxLength={20} value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="+14155550123" data-testid="input-contact-phone" /></Field>
        <Field label="Company (optional)"><Input maxLength={160} value={contactForm.company} onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })} data-testid="input-contact-company" /></Field>
        <div className="sm:col-span-2"><Field label="Tags" hint="Comma-separated, up to 12."><Input value={contactForm.tags} onChange={(e) => setContactForm({ ...contactForm, tags: e.target.value })} placeholder="speaker, returning guest" data-testid="input-contact-tags" /></Field></div>
        <div className="sm:col-span-2"><Field label="Private organizer notes"><Textarea rows={4} maxLength={5000} value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} placeholder="Context for a thoughtful follow-up." data-testid="input-contact-notes" /></Field></div>
        <p className="sm:col-span-2 rounded-lg bg-muted/70 p-3 text-xs text-muted-foreground">No opt-in will be created. The contact can choose email or SMS updates from their own preferences page.</p>
      </div>
      <footer className="flex justify-end gap-2 border-t border-border p-4"><Button variant="outline" onClick={closeContact}>Cancel</Button><Button disabled={!contactForm.name.trim() || (!editingContact && !contactForm.email.trim()) || createContact.isPending || updateContact.isPending} onClick={saveContact} data-testid="button-save-contact">{createContact.isPending || updateContact.isPending ? 'Saving…' : editingContact ? 'Save changes' : 'Add contact'}</Button></footer>
    </section></div>}

    {selectedContact && <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-sidebar/55 p-4" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedContact(null); }}><section role="dialog" aria-modal="true" aria-labelledby="contact-detail-title" className="my-6 w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5"><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Relationship record</p><h2 id="contact-detail-title" className="mt-1 text-2xl font-bold">{selectedContact.name}</h2><p className="mt-1 text-sm text-muted-foreground">{selectedContact.email}{selectedContact.company && ` · ${selectedContact.company}`}</p></div><button onClick={() => setSelectedContact(null)} aria-label="Close contact details" className="rounded-lg p-2 hover:bg-muted"><X className="h-4 w-4" /></button></header>
      <div className="grid gap-5 p-5 md:grid-cols-2">
        <div><h3 className="mb-2 font-semibold">Event history</h3>{selectedContact.history.length ? <ol className="space-y-2">{selectedContact.history.map((history) => <li key={history.eventId} className="rounded-xl border border-border p-3"><div className="font-medium">{history.title}</div><div className="mt-1 text-xs text-muted-foreground">{fmtDate(history.startsAt)} · {history.attended ? 'Attended' : 'Registered'}</div></li>)}</ol> : <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">No event participation history recorded.</p>}</div>
        <div className="space-y-4"><div><h3 className="mb-2 font-semibold">Communication consent</h3><div className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <p className="flex items-center justify-between gap-2"><span>Email · {selectedContact.emailOptIn ? 'opted in' : 'not opted in'}</span>{selectedContact.emailOptIn && <Button size="sm" variant="outline" disabled={updateContact.isPending} onClick={() => revoke(selectedContact, 'email')}>Withdraw</Button>}</p>
          <p className="flex items-center justify-between gap-2"><span>SMS · {selectedContact.smsOptIn ? 'opted in' : 'not opted in'}{selectedContact.smsOptIn && !selectedContact.phoneVerified ? ' · phone unverified' : ''}</span>{selectedContact.smsOptIn && <Button size="sm" variant="outline" disabled={updateContact.isPending} onClick={() => revoke(selectedContact, 'sms')}>Withdraw</Button>}</p>
          <p className="border-t border-border pt-2 text-xs text-muted-foreground">Consent cannot be granted by an organizer. Email verified: {selectedContact.emailVerified ? 'yes' : 'no'} · Phone verified: {selectedContact.phoneVerified ? 'yes' : 'no'}</p>
        </div></div>
          <div><h3 className="mb-2 font-semibold">Organizer notes</h3><p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{selectedContact.notes || 'No notes recorded.'}</p></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { startContact(selectedContact); setSelectedContact(null); }}>Edit details</Button><Button variant={selectedContact.archived ? 'default' : 'outline'} onClick={() => changeArchive(selectedContact)} disabled={updateContact.isPending}><Archive className="mr-2 h-4 w-4" />{selectedContact.archived ? 'Restore contact' : 'Archive contact'}</Button></div>
          <p className="text-[11px] text-muted-foreground">Source: {selectedContact.source} · Added {fmtStamp(selectedContact.createdAt)}</p>
        </div>
      </div>
    </section></div>}
  </div>;
}

function EventOptions({ events, knownEvents, value, onChange, label, includeAll }: { events: { id: string; title: string; startsAt: string }[]; knownEvents: Map<string, { title: string }>; value: string; onChange: (value: string) => void; label: string; includeAll?: boolean }) {
  const lostEvent = value && !events.some((event) => event.id === value) ? knownEvents.get(value) : undefined;
  return <Field label={label}><select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid={`select-${label.toLowerCase().replaceAll(' ', '-')}`}><option value="">{includeAll ? 'All contacts (no event filter)' : 'Choose an event'}</option>{lostEvent && <option value={value}>{lostEvent.title} · unavailable, selection retained</option>}{events.map((event) => <option key={event.id} value={event.id}>{event.title} · {fmtDate(event.startsAt)}</option>)}</select></Field>;
}

function CampaignEditor({ draft, setDraft, editing, events, knownEvents, pending, onCancel, onSave }: {
  draft: CampaignDraft; setDraft: (draft: CampaignDraft) => void; editing: CrmCampaign | null;
  events: { id: string; title: string; startsAt: string }[]; knownEvents: Map<string, { title: string }>;
  pending: boolean; onCancel: () => void; onSave: () => void;
}) {
  const audience = editing ? { matching: editing.matchingContacts, eligible: editing.eligibleContacts, excluded: editing.excludedContacts } : null;
  return <Panel title={editing ? 'Edit campaign draft' : 'New campaign draft'} meta="Draft only · sending unavailable">
      <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_.9fr]">
      <div className="space-y-4">
        <Field label="Draft name"><Input required maxLength={160} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="A note for the next gathering" data-testid="input-campaign-name" /></Field>
        <Field label="Channel"><select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value as 'email' | 'sms' })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" data-testid="select-campaign-channel"><option value="email">Email</option><option value="sms">SMS</option></select></Field>
        {draft.channel === 'email' && <Field label="Subject"><Input maxLength={200} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="A reason to meet again" data-testid="input-campaign-subject" /></Field>}
        <Field label="Message"><Textarea rows={7} maxLength={10000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Write a personal, useful invitation…" data-testid="input-campaign-body" /></Field>
        <EventOptions label="Promoted future event" value={draft.promotedEventId} onChange={(value) => setDraft({ ...draft, promotedEventId: value })} events={events} knownEvents={knownEvents} />
        <EventOptions label="Audience event filter" value={draft.audienceEventId} onChange={(value) => setDraft({ ...draft, audienceEventId: value })} events={events} knownEvents={knownEvents} includeAll />
        <Field label="Audience tag (optional)"><Input maxLength={40} value={draft.tag} onChange={(e) => setDraft({ ...draft, tag: e.target.value })} placeholder="returning guest" data-testid="input-campaign-tag" /></Field>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onCancel}>Cancel</Button><Button disabled={!draft.name.trim() || pending} onClick={onSave} data-testid="button-save-campaign">{pending ? 'Saving…' : 'Save draft'}</Button></div>
      </div>
      <aside className="space-y-4">
        <div className="rounded-xl border border-live/30 bg-live/5 p-4"><p className="font-semibold">Email and SMS are not connected</p><p className="mt-1 text-sm text-muted-foreground">This is a plain-text preview. Saving does not send, queue, or schedule anything.</p></div>
        <div className="rounded-xl border border-border bg-muted/40 p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Content preview · plain text</p>{draft.channel === 'email' && <p className="mt-3 font-semibold">{draft.subject || 'No subject yet'}</p>}<p className="mt-2 min-h-20 whitespace-pre-wrap break-words text-sm">{draft.body || 'Your message will appear here.'}</p></div>
        <div className="rounded-xl border border-border p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Audience preview</p><p className="mt-2 text-sm font-semibold">{draft.audienceEventId ? knownEvents.get(draft.audienceEventId)?.title ?? 'Previously selected event · unavailable' : 'All contacts · no event history filter'}</p><p className="mt-1 text-sm text-muted-foreground">{draft.tag.trim() ? `Tag: ${draft.tag.trim()}` : 'No tag filter'} · {draft.channel === 'email' ? 'requires explicit email opt-in' : 'requires explicit SMS opt-in and a verified phone'}</p><p className="mt-2 text-xs text-muted-foreground">{audience ? 'Saved audience counts below come from the server. Consent and verification may have changed since that snapshot.' : 'Server-calculated matching and eligibility counts appear after the first save. Registration is never treated as marketing consent.'}</p></div>
        {audience && <div className="rounded-xl border border-border p-4"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Audience snapshot from last save</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><p className="font-display text-2xl font-bold">{audience.matching}</p><p className="text-[10px] text-muted-foreground">matches</p></div><div><p className="font-display text-2xl font-bold text-ok">{audience.eligible}</p><p className="text-[10px] text-muted-foreground">eligible then</p></div><div><p className="font-display text-2xl font-bold text-live">{audience.excluded}</p><p className="text-[10px] text-muted-foreground">excluded then</p></div></div><p className="mt-3 text-xs text-muted-foreground">This snapshot is not a live delivery estimate. Consent and verification can change; SMS also requires a verified phone and provider setup.</p></div>}
      </aside>
    </div>
  </Panel>;
}

function CampaignCard({ campaign, events, onEdit, onDelete }: { campaign: CrmCampaign; events: Map<string, { title: string }>; onEdit: () => void; onDelete: () => void }) {
  const eventName = campaign.promotedEventId ? events.get(campaign.promotedEventId)?.title ?? 'Previously selected event · unavailable' : 'No promoted event';
  const audienceName = campaign.audienceEventId ? events.get(campaign.audienceEventId)?.title ?? 'Previously selected event · unavailable' : 'All contacts (no event filter)';
  return <article className="overflow-hidden rounded-2xl border border-card-border bg-card" data-testid={`card-campaign-${campaign.id}`}>
    <header className="flex items-start justify-between gap-3 border-b border-border p-4"><div><div className="flex flex-wrap items-center gap-2"><Pill status="draft" /><Pill status="unavailable" label={`${campaign.channel} not connected`} /></div><h2 className="mt-2 font-display text-xl font-bold">{campaign.name}</h2><p className="mt-1 text-xs text-muted-foreground">Updated {fmtStamp(campaign.updatedAt)}</p></div><button onClick={onDelete} aria-label={`Delete ${campaign.name}`} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" data-testid={`button-delete-campaign-${campaign.id}`}><X className="h-4 w-4" /></button></header>
    <div className="space-y-3 p-4"><p className="text-sm"><span className="font-medium">Promoting:</span> {eventName}</p><p className="text-sm"><span className="font-medium">Audience event:</span> {audienceName}{campaign.tag ? ` · tag ${campaign.tag}` : ''}</p>{campaign.channel === 'email' && <p className="truncate text-sm"><span className="font-medium">Subject:</span> {campaign.subject || 'No subject'}</p>}
      <div className="rounded-lg bg-muted/50 p-3"><p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{campaign.body || 'No message content yet.'}</p></div>
      <div className="grid grid-cols-3 gap-2 border-y border-border py-3 text-center"><div><p className="font-display text-xl font-bold">{campaign.matchingContacts}</p><p className="text-[10px] text-muted-foreground">matching</p></div><div><p className="font-display text-xl font-bold text-ok">{campaign.eligibleContacts}</p><p className="text-[10px] text-muted-foreground">eligible</p></div><div><p className="font-display text-xl font-bold text-live">{campaign.excludedContacts}</p><p className="text-[10px] text-muted-foreground">excluded</p></div></div>
      <p className="text-xs text-muted-foreground">Counts reflect saved audience eligibility, not sends. Current consent and verification may change.</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={onEdit} data-testid={`button-edit-campaign-${campaign.id}`}>Edit draft</Button><Button size="sm" disabled title="Email and SMS delivery are not connected" data-testid={`button-send-disabled-${campaign.id}`}>Send</Button><span className="self-center text-xs text-muted-foreground">Unavailable: delivery provider is not connected.</span></div>
    </div>
  </article>;
}
