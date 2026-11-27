import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Trophy } from 'lucide-react';
import type { Player } from '@/types/player';
import { playerKey } from '@/config/ovr';
import { findNFLTeam } from '@/utils/nflTeams';
import { bannerTeamOf } from '@/utils/playerExtras';
import type { CareerSeasonsFile } from '@/utils/careerSeasons';
import { dataResponse } from '@/utils/dataStore';
import { displayName } from '@/utils/displayName';
import { bannerStats } from '@/components/hof/hofUtils';
import { groupOf } from '@/components/stats/comps/graphs/statDefs';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/brand/TeamLogo';
import { Stadium, ClubTag } from '../Screensaver';
import './newScenes.css';
import { reducedMotion } from '@/utils/motion';

/*
 * Career arc: a legend's season-by-season SZN (career_seasons.json `sovr`) as bars that rise one by one while his
 * sprite walks along the tops in each season's club kit (history/stints.json). Gold at 90+, a trophy where a ring was
 * gained that season, his plate with name, totals and career OVR.
 */
export interface ArcPoint { year: number; v: number; gain: number; club: string }
export interface CareerArcData { player: Player; points: ArcPoint[]; roll: number }

type StintFile = Record<string, { stints?: { team: string; from: number; to: number }[] }>;
let stintReq: Promise<StintFile | null> | null = null;
export const loadStints = (): Promise<StintFile | null> =>
  (stintReq ??= dataResponse('data/history/stints.json').then((r) => (r.ok ? (r.json() as Promise<StintFile>) : null)).catch(() => null));

const reduced = () => reducedMotion();

/** His seasons with a season OVR; null under 8 */
export const arcFor = (file: CareerSeasonsFile, p: Player, stints: StintFile | null, minSeasons = 8): ArcPoint[] | null => {
  const entry = file.players[playerKey(p)];
  if (!entry) return null;
  const fields = file.fields[groupOf(p.position)] ?? [];
  const ri = fields.indexOf('rings');
  const start = file.seasons.indexOf(entry.from);
  const fallback = bannerTeamOf(p);
  const list = stints?.[p.name]?.stints ?? [];
  const pts: ArcPoint[] = [];
  entry.rows.forEach((row, i) => {
    const year = file.seasons[start + i];
    if (!row || year == null) return;
    const v = row[5 + fields.length];
    if (v == null) return;
    const prev = i > 0 ? entry.rows[i - 1] : null;
    const gain = ri >= 0 && prev ? Math.max(0, Number(row[5 + ri]) - Number(prev[5 + ri])) : 0;
    const club = list.find((s) => s.from <= year && year <= s.to)?.team ?? fallback;
    pts.push({ year, v: Number(v), gain, club });
  });
  return pts.length >= minSeasons ? pts : null;
};

const heightPct = (v: number) => Math.max(8, Math.min(100, ((v - 45) / 55) * 100));

const CareerArcScene = ({ data, ovr, sprites }: { data: CareerArcData; ovr: number | null; sprites: boolean }) => {
  const { player: p, points, roll } = data;
  const N = points.length;
  const still = useMemo(reduced, []);
  const [idx, setIdx] = useState(still ? N - 1 : -1);
  const stepMs = Math.max(280, Math.min(700, 9000 / N));
  useEffect(() => {
    if (still) return;
    let i = -1;
    let t = window.setTimeout(function go() {
      i += 1;
      setIdx(i);
      if (i < N - 1) t = window.setTimeout(go, stepMs);
    }, 900);
    return () => window.clearTimeout(t);
  }, [N, stepMs, still]);

  const peak = points.reduce((a, b) => (b.v > a.v ? b : a));
  const rings = points.filter((x) => x.gain > 0).length;
  const home = findNFLTeam(bannerTeamOf(p));
  const cur = points[Math.max(0, idx)];
  const done = idx >= N - 1;
  return (
    <Stadium club={home?.name ?? 'Eagles'} roll={roll}>
      <div className="ca">
        <div className="ca__plate">
          <p className="sv-kick">Career arc · season OVR by year</p>
          <h2 className="ca__name">{displayName(p.name)}</h2>
          <p className="ca__meta">
            {p.position} · <ClubTag team={home?.name ?? p.team ?? ''} />
          </p>
          <dl className="ca__nums">
            {[
              ...(ovr != null ? [{ label: 'Career OVR', value: String(ovr) }] : []),
              ...bannerStats(p).map((s) => ({ label: s.label, value: Math.round(s.value).toLocaleString('en-US') })),
              { label: 'Peak SZN', value: `${peak.v} · ${peak.year}` },
              { label: 'Seasons', value: String(N) },
            ].map((x) => (
              <div key={x.label}>
                <dd>{x.value}</dd>
                <dt>{x.label}</dt>
              </div>
            ))}
          </dl>
        </div>
        <div className="ca__chart" style={{ '--n': N, '--step': `${stepMs}ms` } as CSSProperties}>
          <ol className="ca__bars">
            {points.map((x, i) => {
              const t = findNFLTeam(x.club);
              return (
                <li
                  key={x.year}
                  className={`ca__col ${i <= idx ? 'ca__col--up' : ''} ${x.v >= 90 ? 'ca__col--gold' : ''}`}
                  style={{ '--h': `${heightPct(x.v)}%`, '--bc': t ? `hsl(${t.primaryColor})` : '#4a5a9a', '--bc2': t ? `hsl(${t.secondaryColor})` : '#ffc63e' } as CSSProperties}
                >
                  <span className="ca__bar">
                    <b>{x.v}</b>
                    {x.gain > 0 && <Trophy className="ca__cup" size={20} strokeWidth={2.4} aria-label="Super Bowl season" />}
                  </span>
                  <span className="ca__yr">{String(x.year).slice(2)}</span>
                  <span className="ca__lg">{N <= 22 && t && <TeamLogo team={t.name} size={18} decorative />}</span>
                </li>
              );
            })}
          </ol>
          {sprites && idx >= 0 && (
            <span className="ca__walker" style={{ left: `calc(22px + (100% - 44px) * ${(idx + 0.5) / N})`, bottom: `calc(${heightPct(points[idx].v) / 100} * var(--bars-h) + var(--axis) + 12px)` }}>
              <GameSprite player={p} team={cur.club} season={cur.year} kind="figure" size="m" action={done ? 'celebrate' : 'run'} />
            </span>
          )}
          <p className="ca__key">
            <i className="ca__sw ca__sw--gold" /> 90+ season <Trophy size={14} strokeWidth={2.4} /> {rings} ring {rings === 1 ? 'season' : 'seasons'}
          </p>
        </div>
      </div>
    </Stadium>
  );
};

export default CareerArcScene;
