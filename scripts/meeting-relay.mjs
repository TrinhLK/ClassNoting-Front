/** Replay NDJSON from an authenticated RTMS client or Teams bot into one session.
 * Usage: MEETING_RELAY_TOKEN=... node scripts/meeting-relay.mjs <appOrigin> <sessionId> < events.ndjson
 * sessionId is created once via /api/integrations/session and reused after reconnect.
 */
import { createInterface } from 'node:readline';
const [origin, sessionId] = process.argv.slice(2);
if (!origin || !sessionId || !process.env.MEETING_RELAY_TOKEN) throw new Error('Origin, session ID and MEETING_RELAY_TOKEN are required');
const url = new URL(origin);
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('HTTPS required');
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const event = JSON.parse(line);
  let sent = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(new URL('/api/integrations/events', url), { method: 'POST',
        headers: { Authorization: `Bearer ${process.env.MEETING_RELAY_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, events: [event] }), signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Relay HTTP ${res.status}`);
      sent = true; break;
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  if (!sent) throw new Error('Event not acknowledged');
}
