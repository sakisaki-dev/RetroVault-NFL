import { useEffect, useState, type CSSProperties } from 'react';
import type { Player } from '@/types/player';
import { findNFLTeam } from '@/utils/nflTeams';
import { loadScheduleSeason } from '@/utils/schedule';
import { displayName, surnameOf } from '@/utils/displayName';
import TeamLogo from '@/components/brand/TeamLogo';
import { clubStyle } from '@/components/stats/visual/clubTone';
import { Figure } from '../Screensaver';
import './newScenes.css';

/*
 * Rivalry night: two clubs from one division on a split field in their colours, each side's two greatest players
 * (Career Legacy, banner club) facing off, the all-time head-to-head since 1999 summed from the weekly files on a
 * scoreboard, the biggest win each way and the latest meeting.
 */
export interface RivalryNightData { a: string; b: string; pa: Player[]; pb: Player[]; years: string[] }
interface Meeting { season: string; label: string; a: number; b: number }
export interface Series { wa: number; wb: number; ties: number; games: number; bigA: Meeting | null; bigB: Meeting | null; last: Meeting | null }

const seriesCache = new Map<string, Promise<Series>>();
export const seriesOf = (a: string, b: string, years: string[]): Promise<Series> => {
  const key = `${a}|${b}`;
  let p = seriesCache.get(key);
  if (!p) {
    const ta = findNFLTeam(a)?.abbreviation;
    const tb = findNFLTeam(b)?.abbreviation;
    p = Promise.all([...years].sort().map(loadScheduleSeason)).then((seasons) => {
      const s: Series = { wa: 0, wb: 0, ties: 0, games: 0, bigA: null, bigB: null, last: null };
      for (const ss of seasons) {
        if (!ss) continue;
        const rows: { label: string; away: string; home: string; as: number | undefined; hs: number | undefined }[] = [
          ...ss.games.map((g) => ({ label: `week ${g.week}`, away: g.away, home: g.home, as: g.awayScore, hs: g.homeScore })),
          ...(ss.playoffs ?? []).flatMap((r) => r.games.map((g) => ({ label: r.round.toLowerCase(), away: g.away, home: g.home, as: g.away_score, hs: g.home_score }))),
        ];
        for (const g of rows) {
          const aHome = g.home === ta && g.away === tb;
          if (!(aHome || (g.home === tb && g.away === ta)) || typeof g.as !== 'number' || typeof g.hs !== 'number') continue;
          const sa = aHome ? g.hs : g.as;
          const sb = aHome ? g.as : g.hs;
          const m: Meeting = { season: ss.season, label: g.label, a: sa, b: sb };
          s.games++;
          s.last = m;
          if (sa > sb) {
            s.wa++;
            if (!s.bigA || sa - sb >= s.bigA.a - s.bigA.b) s.bigA = m;
          } else if (sb > sa) {
            s.wb++;
            if (!s.bigB || sb - sa >= s.bigB.b - s.bigB.a) s.bigB = m;
          } else s.ties++;
        }
      }
      return s;
    });
    seriesCache.set(key, p);
  }
  return p;
};

const Side = ({ club, ps, right, sprites }: { club: string; ps: Player[]; right?: boolean; sprites: boolean }) => (
  <div className={right ? 'rn__side rn__side--r' : 'rn__side'}>
    <span className="rn__logo" aria-hidden="true">
      <TeamLogo team={club} size={340} decorative />
    </span>
    <div className="rn__men">
      {ps.map((p, i) => (
        <div key={p.name} className="rn__man" style={{ ...clubStyle(p), '--i': i } as CSSProperties}>
          <Figure player={p} sprites={sprites} scale={i === 0 ? 1.55 : 1.3} mirror={right} action={i === 0 ? 'stiffarm' : 'idle'} />
          <span className="sv-line__name">{surnameOf(p.name)}</span>
          <span className="sv-line__cl">{p.position} · {Math.round(p.careerLegacy).toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  </div>
);

const RivalryNightScene = ({ data, sprites }: { data: RivalryNightData; sprites: boolean }) => {
  const { a, b, pa, pb, years } = data;
  const ta = findNFLTeam(a);
  const tb = findNFLTeam(b);
  const [s, setS] = useState<Series | null>(null);
  useEffect(() => {
    let live = true;
    void seriesOf(a, b, years).then((x) => live && setS(x));
    return () => {
      live = false;
    };
  }, [a, b, years]);
  const m = (x: Meeting | null, who: 'a' | 'b') => (x ? `${who === 'a' ? x.a : x.b}–${who === 'a' ? x.b : x.a}, ${x.season} ${x.label}` : 'none');
  const lastWin = s?.last ? (s.last.a > s.last.b ? ta?.abbreviation : s.last.b > s.last.a ? tb?.abbreviation : null) : null;
  return (
    <div
      className="rn"
      style={{ '--a': `hsl(${ta?.primaryColor ?? '220 60% 30%'})`, '--b': `hsl(${tb?.primaryColor ?? '0 60% 30%'})`, '--a2': `hsl(${ta?.secondaryColor ?? '0 0% 80%'})`, '--b2': `hsl(${tb?.secondaryColor ?? '0 0% 80%'})` } as CSSProperties}
    >
      <span className="rn__turf" aria-hidden="true" />
      <Side club={ta?.name ?? a} ps={pa} sprites={sprites} />
      <div className="rn__mid">
        <p className="sv-kick">Rivalry night · {ta?.division === tb?.division && ta?.conference === tb?.conference ? `${ta?.conference} ${ta?.division}` : 'since 1999'}</p>
        <div className="rn__board">
          <div className="rn__score">
            <span>{ta?.abbreviation}</span>
            <b>{s ? s.wa : '–'}</b>
            <i>–</i>
            <b>{s ? s.wb : '–'}</b>
            <span>{tb?.abbreviation}</span>
          </div>
          <p className="rn__sub">{s ? `${s.ties ? `${s.ties} ${s.ties === 1 ? 'tie' : 'ties'} · ` : ''}${s.games} meetings since 1999` : 'Counting the meetings…'}</p>
        </div>
        <span className="rn__vs">VS</span>
        <ul className="rn__facts">
          <li>
            <small>Biggest {ta?.abbreviation} win</small>
            {s ? m(s.bigA, 'a') : '…'}
          </li>
          <li>
            <small>Biggest {tb?.abbreviation} win</small>
            {s ? m(s.bigB, 'b') : '…'}
          </li>
          <li>
            <small>Latest meeting</small>
            {s?.last ? `${s.last.season} ${s.last.label}: ${lastWin ? `${lastWin} ${Math.max(s.last.a, s.last.b)}–${Math.min(s.last.a, s.last.b)}` : `tied ${s.last.a}–${s.last.b}`}` : '…'}
          </li>
        </ul>
      </div>
      <Side club={tb?.name ?? b} ps={pb} right sprites={sprites} />
      <span className="rn__names" aria-hidden="true">
        {displayName(ta?.fullName ?? a)} · {displayName(tb?.fullName ?? b)}
      </span>
    </div>
  );
};

export default RivalryNightScene;
