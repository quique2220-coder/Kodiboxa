import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Route, Switch, Redirect, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { PrefsProvider } from '@/lib/prefs';
import { Shell } from '@/components/shell';
import Landing from '@/pages/landing';
import Dashboard from '@/pages/dashboard';
import Events from '@/pages/events';
import EventDetail from '@/pages/event-detail';
import Schedule from '@/pages/schedule';
import Participants from '@/pages/participants';
import Presenter from '@/pages/presenter';
import Participant from '@/pages/participant';
import RoomOperations from '@/pages/room-operations';
import RoomEntry from '@/pages/room-entry';
import CRM from '@/pages/crm';
import CRMIntegrations from '@/pages/crm-integrations';
import CommunicationPreferences from '@/pages/communication-preferences';
import { Platform, Agents, Audit, Settings } from '@/pages/system';
import { useWorkspace, access } from '@/lib/workspace';
import kodeSmall from '@/assets/kode-small.png';
import { LoginMascot } from '@/components/login-mascot';
import '@/components/auth-presentation.css';

const queryClient = new QueryClient();

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: 'hsl(190 94% 55%)',
    colorForeground: 'hsl(224 36% 95%)',
    colorMutedForeground: 'hsl(224 18% 69%)',
    colorDanger: 'hsl(0 78% 72%)',
    colorBackground: 'hsl(242 39% 15%)',
    colorInput: 'hsl(239 31% 20%)',
    colorInputForeground: 'hsl(224 36% 96%)',
    colorNeutral: 'hsl(224 36% 95%)',
    fontFamily: "'Instrument Sans', system-ui, sans-serif",
    borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'auth-clerk-card w-full max-w-[480px] overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'font-[Bricolage_Grotesque] text-3xl font-bold tracking-tight text-[hsl(224_36%_96%)]',
    headerSubtitle: 'text-[hsl(224_18%_73%)]',
    socialButtonsBlockButtonText: 'text-[hsl(224_36%_95%)] font-semibold',
    formFieldLabel: 'text-[hsl(224_23%_86%)] font-medium',
    footerActionLink: 'text-[hsl(190_94%_67%)] font-semibold',
    footerActionText: 'text-[hsl(224_18%_72%)]',
    dividerText: 'text-[hsl(224_18%_67%)]',
    identityPreviewEditButton: 'text-[hsl(190_94%_67%)]',
    formFieldSuccessText: 'text-[hsl(158_65%_70%)]',
    alertText: 'text-[hsl(224_36%_95%)]',
    logoBox: 'h-12 justify-center',
    logoImage: 'h-12 w-12',
    socialButtonsBlockButton: 'auth-clerk-social',
    formButtonPrimary: 'auth-clerk-primary font-semibold',
    formFieldInput: 'auth-clerk-input',
    formFieldInputShowPasswordButton: 'text-[hsl(190_94%_67%)]',
    formFieldHintText: 'text-[hsl(224_18%_68%)]',
    formFieldErrorText: 'text-[hsl(0_82%_76%)]',
    formResendCodeLink: 'text-[hsl(190_94%_67%)]',
    backLink: 'text-[hsl(190_94%_67%)]',
    footerAction: 'bg-transparent',
    dividerLine: 'bg-[hsl(245_24%_34%)]',
    alert: 'bg-[hsl(0_68%_48%/0.16)] border border-[hsl(0_72%_67%/0.32)]',
    otpCodeFieldInput: 'auth-clerk-input',
    formFieldRow: 'gap-3',
    main: 'gap-5',
  },
};

function AuthFrame({ children, mode }: { children: ReactNode; mode: 'sign-in' | 'sign-up' }) {
  const isSignIn = mode === 'sign-in';
  return (
    <main className="auth-page min-h-[100dvh]">
      <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
      <div className="auth-orbit auth-orbit-two" aria-hidden="true" />
      <div className="auth-shell">
        <header className="auth-header">
          <a href={basePath || '/'} className="auth-brand" aria-label="KODIBOXA home">
            <span className="auth-brand-mark" aria-hidden="true">K</span>
            <span className="auth-brand-name">KODIBOXA</span>
          </a>
          <span className="auth-platform-label">EVENTS, IN SYNC</span>
        </header>
        <section className="auth-content" aria-label={isSignIn ? 'Sign in to KODIBOXA' : 'Create a KODIBOXA account'}>
          <LoginMascot>
            <div className="auth-form-heading">
              <span className="auth-eyebrow">{isSignIn ? 'WELCOME BACK' : 'YOUR NEXT EVENT STARTS HERE'}</span>
              <h1>{isSignIn ? 'Back to the desk.' : 'Make room for more.'}</h1>
              <p>{isSignIn ? 'Sign in to pick up where your event left off.' : 'One account for the people and moments that bring events together.'}</p>
            </div>
            {children}
          </LoginMascot>
        </section>
        <footer className="auth-footer">
          <span>Made for the moments that matter.</span>
          <span className="auth-byline">A KODELOTH platform</span>
        </footer>
      </div>
    </main>
  );
}

function SignInPage() {
  return (
    <AuthFrame mode="sign-in">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </AuthFrame>
  );
}

function SignUpPage() {
  return (
    <AuthFrame mode="sign-up">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </AuthFrame>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <RoleLanding />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function RoleLanding() {
  const { data: ws, isLoading, isError, refetch } = useWorkspace();
  if (isLoading && !ws) return <div className="grid min-h-[100dvh] place-items-center bg-background"><img src={kodeSmall} alt="KODELOTH" className="kode-bob h-16 w-16" /></div>;
  if (isError || !ws || ws.preview || !ws.user) return (
    <div className="grid min-h-[100dvh] place-items-center bg-background p-6">
      <div className="max-w-sm text-center">
        <p className="font-semibold">We couldn't load your workspace yet.</p>
        <p className="mt-2 text-sm text-muted-foreground">Retry to load the correct view for your account.</p>
        <button onClick={() => refetch()} className="mt-4 rounded-xl bg-primary px-5 py-2 text-primary-foreground">Retry</button>
      </div>
    </div>
  );
  const a = access(ws);
  return <Redirect to={a.signedIn && a.role === 'participant' ? '/participant' : '/dashboard'} />;
}

function inShell(C: ComponentType) {
  return function Wrapped() {
    return (
      <Shell>
        <RoutedErrorBoundary><C /></RoutedErrorBoundary>
      </Shell>
    );
  };
}

const DashboardPage = inShell(Dashboard);
const EventsPage = inShell(Events);
const EventDetailPage = inShell(EventDetail);
const SchedulePage = inShell(Schedule);
const ParticipantsPage = inShell(Participants);
const PresenterPage = inShell(Presenter);
const ParticipantPage = inShell(Participant);
const PlatformPage = inShell(Platform);
const AgentsPage = inShell(Agents);
const AuditPage = inShell(Audit);
const SettingsPage = inShell(Settings);
const RoomOperationsPage = inShell(RoomOperations);
const CRMPage = inShell(CRM);
const CRMIntegrationsPage = inShell(CRMIntegrations);
const CommunicationPreferencesPage = inShell(CommunicationPreferences);

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/events" component={EventsPage} />
      <Route path="/events/:id" component={EventDetailPage} />
      <Route path="/schedule" component={SchedulePage} />
      <Route path="/participants" component={ParticipantsPage} />
      <Route path="/presenter" component={PresenterPage} />
      <Route path="/participant" component={ParticipantPage} />
      <Route path="/room-operations" component={RoomOperationsPage} />
      <Route path="/crm" component={CRMPage} />
      <Route path="/crm/integrations" component={CRMIntegrationsPage} />
      <Route path="/communication-preferences" component={CommunicationPreferencesPage} />
      <Route path="/room-entry/:id" component={RoomEntry} />
      <Route path="/platform" component={PlatformPage} />
      <Route path="/agents" component={AgentsPage} />
      <Route path="/audit" component={AuditPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Welcome back', subtitle: 'Sign in to your KODIBOXA account' } },
        signUp: { start: { title: 'Join KODIBOXA', subtitle: 'Create your account to get started' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <PrefsProvider>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </PrefsProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
