import { telemetryIntegration } from "./telemetry";

const integrations = [
  { id: "postgres", name: "PostgreSQL", status: "connected", description: "Persistent event records, registrations, attendance, and audit history." },
  { id: "clerk", name: "Clerk authentication", status: "connected", description: "Managed sign-in. Application roles enforced by the server." },
  { id: "livekit", name: "LiveKit", status: "unavailable", description: "Requires a LiveKit server, API credentials and a tested media session. Preferred adapter for fine-grained permissions." },
  { id: "jitsi", name: "Jitsi Meet", status: "planned", description: "Alternative embedded meeting provider. Not configured or tested; no media sessions available." },
  { id: "ollama", name: "Ollama local inference", status: "unavailable", description: "Requires an authenticated, securely networked external inference server. No local GPU or AI inference is connected." },
  { id: "translation", name: "Real-time translation", status: "planned", description: "Speech-to-text → translation → captions → private voice output. Requires consent and tested providers." },
  { id: "simplex", name: "SimpleX Chat", status: "planned", description: "Private administrator-to-presenter messaging adapter is not connected." },
  { id: "kubernetes", name: "Kubernetes", status: "unavailable", description: "No cluster configured. No infrastructure actions are executed." },
  { id: "radar", name: "Radar", status: "unavailable", description: "No telemetry integration connected." },
  { id: "dash0", name: "Dash0", status: "unavailable", description: "No observability integration connected." },
  { id: "elasticsearch", name: "Elasticsearch", status: "unavailable", description: "No external log search connected." },
  { id: "sre-demo", name: "Isolated latency demonstration", status: "demo", description: "Real timer measurements with rule-based analysis and administrator approval. Not LLM inference or production infrastructure." },
];
export function platformIntegrations(admin: boolean) {
  // Detailed monitoring state is operations-only, not participant/public data.
  return integrations.filter(item => item.id !== "dash0").concat(admin ? [telemetryIntegration()] : []);
}
export const agents = [
  { id: "sre", name: "AI SRE Agent", status: "Isolated demo only · inference unavailable", description: "Measure a controlled delay, inspect evidence, request approval, reset the safe demo delay and verify recovery. Rule-based demonstration, not an AI model." },
  { id: "operations", name: "Event Operations Agent", status: "Planned · Ollama not connected", description: "Activity analysis, attendance summaries and announcement drafts." },
  { id: "presenter", name: "Presenter Assistant Agent", status: "Planned · Ollama not connected", description: "Question organization, session summaries, decisions and action items." },
  { id: "translation", name: "Translation Agent", status: "Planned · providers not connected", description: "Multilingual transcription, captions, translation and voice output." },
];
// This isolated service only waits on a timer. It never issues shell commands,
// executes model output, changes external systems, or accesses event records.
export async function measureDemoService(delayMs: number) {
  const measurements: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await new Promise(resolve => setTimeout(resolve, delayMs));
    measurements.push(Math.round((performance.now() - start) * 100) / 100);
  }
  return { samples: measurements, mean: Math.round(measurements.reduce((a, b) => a + b, 0) / 3 * 100) / 100 };
}
