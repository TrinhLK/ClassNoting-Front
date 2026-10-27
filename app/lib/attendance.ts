import type { MeetingParticipant } from './mockData';

/** Snapshot of accounts actually observed in Meet, epoch milliseconds. */
export interface AttendanceObservation {
  id: string;
  at: number;
  participants: MeetingParticipant[];
  complete: boolean;
}
export interface AttendanceInterval {
  start: number;
  lastSeen: number;
  detectedLeftAt?: number;
  endReason: 'left-roster' | 'not-visible' | 'gap' | 'capture-end';
}
export interface ParticipantAttendance {
  key: string;
  participant: MeetingParticipant;
  intervals: AttendanceInterval[];
  observedSeconds: number | null;
}
export const participantKey = (p: MeetingParticipant) => p.id != null ? `id:${p.id}` : `name:${(p.displayName || p.name).trim().toLocaleLowerCase()}`;

/** Never bridge an unobserved interval or infer attendance from speaking time. */
export function attendanceIntervals(people: MeetingParticipant[], observations: AttendanceObservation[]): ParticipantAttendance[] {
  const records = new Map<string, ParticipantAttendance>();
  const add = (p: MeetingParticipant) => {
    const key = participantKey(p);
    if (!records.has(key)) records.set(key, {key, participant:p, intervals:[], observedSeconds:null});
    return records.get(key)!;
  };
  people.forEach(add);
  const unique = new Map(observations.filter(o => Number.isFinite(o.at)).map(o => [o.id, o]));
  const sorted = [...unique.values()].sort((a,b) => a.at-b.at);
  const active = new Map<string, AttendanceInterval>();
  let previousAt: number | undefined;
  for (const observation of sorted) {
    const gap = previousAt !== undefined && observation.at-previousAt > 10_000;
    const present = new Map(observation.participants.map(p => [participantKey(p), p]));
    for (const [key, interval] of active) {
      if (gap || !present.has(key)) {
        interval.endReason = gap ? 'gap' : observation.complete ? 'left-roster' : 'not-visible';
        if (!gap && observation.complete && !present.has(key)) interval.detectedLeftAt=observation.at;
        active.delete(key);
      }
    }
    for (const [key,p] of present) {
      const record=add(p); record.observedSeconds ??= 0;
      let interval=active.get(key);
      if (!interval) {interval={start:observation.at,lastSeen:observation.at,endReason:'capture-end'};record.intervals.push(interval);active.set(key,interval);}
      else interval.lastSeen=observation.at;
    }
    previousAt=observation.at;
  }
  for (const record of records.values()) if (record.observedSeconds !== null)
    record.observedSeconds=record.intervals.reduce((sum,i)=>sum+Math.max(0,i.lastSeen-i.start)/1000,0);
  return [...records.values()];
}
