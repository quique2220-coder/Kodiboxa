import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'es';
export type Theme = 'light' | 'dark';

const en = {
  'nav.dashboard': 'Dashboard',
  'nav.events': 'Events',
  'nav.schedule': 'Schedule',
  'nav.participants': 'Participants',
  'nav.presenter': 'Presenter desk',
  'nav.participant': 'My event',
  'nav.platform': 'Platform',
  'nav.agents': 'SRE demo',
  'nav.audit': 'Audit log',
  'nav.settings': 'Settings',
  'nav.group.run': 'Run of show',
  'nav.group.people': 'People',
  'nav.group.system': 'System',
  'preview.label': 'Public preview',
  'preview.body': 'You are browsing an example workspace. Records are samples, not private data. Changes require sign-in.',
  'action.signin': 'Sign in',
  'action.signup': 'Create account',
  'action.signout': 'Sign out',
  'p.now': 'Now',
  'p.schedule': 'Schedule',
  'p.ask': 'Ask',
  'p.updates': 'Updates',
  'p.pass': 'Pass',
  'p.nothingLive': 'Nothing is on stage right now.',
  'p.askPlaceholder': 'Type a question for the presenter',
  'p.send': 'Send question',
  'p.register': 'Register',
  'p.registered': 'Registered',
  'p.yourPass': 'Your pass',
  'p.showAtDoor': 'Show this code at the check-in desk.',
} as const;

export type DictKey = keyof typeof en;

const es: Partial<Record<DictKey, string>> = {
  'nav.dashboard': 'Panel',
  'nav.events': 'Eventos',
  'nav.schedule': 'Agenda',
  'nav.participants': 'Participantes',
  'nav.presenter': 'Ponente',
  'nav.participant': 'Mi evento',
  'nav.platform': 'Plataforma',
  'nav.agents': 'Demo SRE',
  'nav.audit': 'Auditoría',
  'nav.settings': 'Ajustes',
  'nav.group.run': 'Escaleta',
  'nav.group.people': 'Personas',
  'nav.group.system': 'Sistema',
  'preview.label': 'Vista previa pública',
  'preview.body': 'Estás viendo un espacio de ejemplo. Los registros son muestras. Los cambios requieren iniciar sesión.',
  'action.signin': 'Iniciar sesión',
  'action.signup': 'Crear cuenta',
  'action.signout': 'Cerrar sesión',
  'p.now': 'Ahora',
  'p.schedule': 'Agenda',
  'p.ask': 'Preguntar',
  'p.updates': 'Avisos',
  'p.pass': 'Pase',
  'p.nothingLive': 'No hay nada en escena ahora mismo.',
  'p.askPlaceholder': 'Escribe una pregunta para el ponente',
  'p.send': 'Enviar pregunta',
  'p.register': 'Inscribirse',
  'p.registered': 'Inscrito',
  'p.yourPass': 'Tu pase',
  'p.showAtDoor': 'Muestra este código en el control de acceso.',
};

const dictionaries: Record<Lang, Partial<Record<DictKey, string>>> = { en, es };

interface Prefs {
  theme: Theme;
  lang: Lang;
  hour24: boolean;
  largeText: boolean;
}

const DEFAULTS: Prefs = { theme: 'light', lang: 'en', hour24: false, largeText: false };
const KEY = 'kodiboxa.prefs.v1';

interface Ctx extends Prefs {
  set: (p: Partial<Prefs>) => void;
  t: (k: DictKey) => string;
}

const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>), lang: 'en' } : DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    document.documentElement.classList.toggle('dark', prefs.theme === 'dark');
    document.documentElement.lang = prefs.lang;
    document.documentElement.style.fontSize = prefs.largeText ? '17.5px' : '';
  }, [prefs]);

  const value: Ctx = {
    ...prefs,
    set: (p) => setPrefs((old) => ({ ...old, ...p, lang: 'en' })),
    t: (k) => dictionaries.en[k] ?? en[k],
  };
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs() {
  const c = useContext(PrefsContext);
  if (!c) throw new Error('usePrefs outside PrefsProvider');
  return c;
}
