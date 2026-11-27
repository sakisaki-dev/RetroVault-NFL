import type { LiveDetail, LiveDrive, LiveGame, LivePlayRow, LiveScore } from '@/utils/liveGames';
import { absOf, sameClub } from './liveField';

/**
 * What the live panels derive from ESPN's summary: game time for every play, the win-probability series on that clock,
 * the scoring marks, momentum, the drive categories and the key plays. Everything here is read off the feed, nothing
 * is invented; each function returns an empty result when its inputs are missing.
 */
export const clockSecs = (c: string): number => {
  const m = /^(\d+):(\d+)/.exec(c.trim());
  return m ? +m[1] * 60 + +m[2] : 0;
};
/** seconds played at (period, clock): quarters are 15 minutes, overtime 10 */
export const elapsedOf = (period: number, clock: string): number => (period <= 4 ? (Math.max(1, period) - 1) * 900 + 900 - clockSecs(clock) : 3600 + (period - 5) * 600 + 600 - clockSecs(clock));
/** the game's length on the chart: four quarters, plus each overtime that has begun */
export const totalSecs = (period: number): number => (period > 4 ? 3600 + (period - 4) * 600 : 3600);

export interface WpPoint { t: number; h: number }
export interface Mark { t: number; h: number; abbr: string; kind: string; text: string; score: string }

export interface WinModel {
  pts: WpPoint[];
  marks: Mark[];
  total: number;
  /** the biggest single swing: the play and how far the home club's chance moved (+ toward home) */
  swing: { text: string; d: number; abbr: string | null } | null;
  /** the change in the home club's chance over about the last three minutes of game time (+ toward home) */
  momentum: number | null;
}

/** ESPN's win probability on the game clock: each point's play gives its time; points whose play isn't known are spread between their neighbours */
export const winModel = (g: LiveGame, d: LiveDetail | undefined): WinModel | null => {
  const wp = d?.wp;
  if (!wp || wp.length < 3) return null;
  const total = totalSecs(g.period);
  const byId = new Map<string, LivePlayRow>();
  (d?.plays ?? []).forEach((p) => byId.set(p.id, p));
  const times: (number | null)[] = wp.map((x, i) => {
    const p = byId.get(x.id);
    return p ? elapsedOf(p.period, p.clock) : i === 0 ? 0 : null;
  });
  const nowT = elapsedOf(g.period, g.clock);
  if (times[times.length - 1] == null) times[times.length - 1] = nowT;
  for (let i = 1; i < times.length; i++) {
    if (times[i] != null) continue;
    let j = i;
    while (j < times.length && times[j] == null) j++;
    const a = times[i - 1] ?? 0;
    const b = times[j] ?? a;
    for (let k = i; k < j; k++) times[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  // a series that isn't in time order (a mismatched id) can't be drawn on the clock
  let pts: WpPoint[] = wp.map((x, i) => ({ t: Math.min(total, Math.max(0, times[i] ?? 0)), h: Math.min(1, Math.max(0, x.h)) }));
  for (let i = 1; i < pts.length; i++) if (pts[i].t < pts[i - 1].t) pts[i] = { ...pts[i], t: pts[i - 1].t };
  if (pts.length > 220) {
    const step = pts.length / 220;
    pts = pts.filter((_, i) => i === pts.length - 1 || Math.floor(i / step) !== Math.floor((i - 1) / step));
  }
  const at = (t: number): number => {
    let lo = pts[0];
    for (const p of pts) {
      if (p.t >= t) return p.t === lo.t ? p.h : lo.h + ((p.h - lo.h) * (t - lo.t)) / (p.t - lo.t);
      lo = p;
    }
    return lo.h;
  };
  const marks: Mark[] = (d?.scoreLog ?? []).map((s: LiveScore) => {
    const t = elapsedOf(s.period, s.clock);
    return { t, h: at(t), abbr: s.abbr, kind: s.kind || 'SC', text: s.text, score: `${s.away}–${s.home}` };
  });
  let swing: WinModel['swing'] = null;
  const all = d?.wp ?? [];
  for (let i = 1; i < all.length; i++) {
    const dl = all[i].h - all[i - 1].h;
    if (!swing || Math.abs(dl) > Math.abs(swing.d)) {
      const p = byId.get(all[i].id);
      if (p && p.text) swing = { text: p.text, d: dl, abbr: p.abbr };
    }
  }
  const lastT = pts[pts.length - 1].t;
  const momentum = lastT > 180 ? pts[pts.length - 1].h - at(lastT - 180) : null;
  return { pts, marks, total, swing: swing && Math.abs(swing.d) >= 0.06 ? swing : null, momentum };
};

export type DriveKind = 'td' | 'fg' | 'punt' | 'to' | 'miss' | 'end' | 'live' | 'other';
export const driveKind = (x: LiveDrive): DriveKind => {
  if (x.live) return 'live';
  const r = x.result.toLowerCase();
  if (/interception|fumble|downs|safety|turnover/.test(r)) return 'to';
  if (/touchdown|^td$/.test(r)) return 'td';
  if (/miss|blocked/.test(r)) return 'miss';
  if (/field goal|^fg$/.test(r)) return x.score ? 'fg' : 'miss';
  if (/punt/.test(r)) return 'punt';
  if (/end of|kneel/.test(r)) return 'end';
  return 'other';
};
export const DRIVE_TAG: Record<DriveKind, string> = { td: 'TD', fg: 'FG', punt: 'PUNT', to: 'TO', miss: 'MISS', end: 'END', live: 'LIVE', other: '–' };

export type PlayTone = 'td' | 'to' | 'big' | 'fg' | 'plain';
/** a play's weight in the feed: scores and takeaways lead, then 20+ yard gains, sacks and big losses */
export const playTone = (p: LivePlayRow): PlayTone => {
  if (p.turnover) return 'to';
  if (p.scoring && /touchdown/i.test(p.type + ' ' + p.text)) return 'td';
  if (p.scoring) return 'fg';
  if (p.yds >= 20 && !/punt|kickoff|field goal/i.test(p.type)) return 'big';
  return 'plain';
};
export const isKeyPlay = (p: LivePlayRow): boolean => playTone(p) !== 'plain' || /sack|fourth down|4th/i.test(p.type) || p.yds <= -7;

/** "7-14" -> [7, 14] */
export const pairOf = (v: string | undefined): [number, number] | null => {
  const m = /^(\d+)\s*[-/]\s*(\d+)/.exec(v ?? '');
  return m ? [+m[1], +m[2]] : null;
};

/** the current drive's plays, oldest first (the live drive's id; the plays after the last scoring one when no drive is marked live) */
export const currentDrivePlays = (g: LiveGame, d: LiveDetail | undefined): LivePlayRow[] => {
  const plays = d?.plays ?? [];
  if (!plays.length) return [];
  const liveDrive = d?.drives?.length ? d.drives[d.drives.length - 1] : null;
  // a drive marked live names the chain; one that has just begun has no plays yet
  const last = liveDrive?.live && liveDrive.id ? liveDrive.id : plays[plays.length - 1].driveId;
  return plays.filter((p) => p.driveId === last && p.from != null && p.to != null && !/timeout|penalty|end of|two-minute/i.test(p.type));
};

/** yards a play gained toward the offence's goal, from its absolute spots */
export const gainOf = (p: LivePlayRow, g: LiveGame): number => {
  if (p.from == null || p.to == null) return p.yds;
  const dir = p.abbr && sameClub(p.abbr, g.away.abbr) ? 1 : -1;
  return Math.round((p.to - p.from) * dir);
};

export const driveSpan = (x: LiveDrive, g: LiveGame): [number, number] | null => {
  const a = absOf(x.from, g.away.abbr, g.home.abbr);
  const b = absOf(x.to, g.away.abbr, g.home.abbr);
  return a == null || b == null ? null : [a, b];
};
