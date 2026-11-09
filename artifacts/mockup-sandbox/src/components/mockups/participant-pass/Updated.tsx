import './_group.css';
import { PassCard } from './_PassCard';
import { demoEvent, demoReg } from './_fixtures';
export function Updated(){return <main className="min-h-screen bg-background px-4 py-6 text-foreground" style={{fontFamily:'var(--app-font-sans)'}}><p className="mb-4 text-center text-xs text-muted-foreground">Participant pass · example event</p><PassCard reg={demoReg} event={demoEvent} roomName="Main Salon" /></main>;}
