import { useMemo, useState, type CSSProperties } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LedDigits } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { useFieldArt } from '@/components/teamlab/fieldArt';
import TeamLogo from '@/components/brand/TeamLogo';
import { cn } from '@/lib/utils';
import { displayName } from '@/utils/displayName';
import { bannerTeamOf } from '@/utils/playerExtras';
import { findNFLTeam } from '@/utils/nflTeams';
import { FANTASY_IDS, F_SLOTS, projectWeek, replay, type FLineup } from '@/utils/nflFantasy';
import { NameStrip, Sprite, hcVars } from './hubParts';
import { f1, nameOf, type FantasyHub } from './useFantasyHub';
import type { Sub } from './FantasyHub';

const phi = (z: number) => {
  // logistic approximation of the normal CDF
  return 1 / (1 + Math.exp(-1.702 * z));
};

/** The club a lineup leans on most (its colours): the most common club among its players. */
const dominant = (hub: FantasyHub, l: FLineup) => {
  const n = new Map<string, number>();
  Object.values(l).filter(Boolean).forEach((k) => {
    const club = k.startsWith('DST:') ? k.slice(4) : hub.lab?.p[k]?.t;
    if (club) n.set(club, (n.get(club) ?? 0) + 1);
  });
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
};

const Side = ({ hub, lineup, club, right }: { hub: FantasyHub; lineup: FLineup; club: string; right?: boolean }) => {
  const stars = FANTASY_IDS.map((id) => lineup[id]).filter((k) => k && !k.startsWith('DST:')).map((k) => ({ k, v: hub.fctx ? projectWeek(hub.fctx, k, hub.week) : 0 })).sort((a, b) => b.v - a.v).slice(0, 4);
  return (
    <div className={cn('fh-vs__side', right && 'is-right')}>
      <span className="fh-vs__logo" aria-hidden="true"><TeamLogo team={club} size={120} decorative /></span>
      <div className="fh-vs__figs">
        {stars.map(({ k }, i) => {
          const p = hub.ctx.profiles.get(k)?.player;
          return (
            <button key={k} type="button" className="fh-vs__fig mo-pop" style={stag(i, 70)} data-player-key={k} onClick={() => (window.location.hash = `#stats/deepdive?p=${encodeURIComponent(k)}`)} aria-label={`Open ${nameOf(k)}`}>
              {p && <Sprite player={p} club={findNFLTeam(bannerTeamOf(p))?.name} kind="figure" size="s" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Head-to-head: a VS split in the two lineups' colours, a jumbotron scoreboard, slot-by-slot duels and the season replay. */
const HeadToHeadPage = ({ hub, onGo }: { hub: FantasyHub; onGo: (s: Sub) => void }) => {
  const { fl, opp, opponents, oppId, setOppId, fctx, logs, oppLogs, played, scoring, week, clubName, filled, total } = hub;
  const art = useFieldArt(clubName, 'night', false);
  const [weeks, setWeeks] = useState(false);
  const mine = useMemo(() => (fctx ? replay(fctx.lab, fl, logs, scoring, played) : []), [fctx, fl, logs, scoring, played]);
  const theirs = useMemo(() => (fctx && opp ? replay(fctx.lab, opp.lineup, oppLogs, scoring, played) : []), [fctx, opp, oppLogs, scoring, played]);
  if (!filled || !fctx)
    return (
      <div className="fh-page">
        <section className="fh-empty"><b>No lineup to face yet</b><p>Build a lineup, then pick who it plays.</p><button type="button" className="fh-btn fh-btn--go" onClick={() => onGo('lineup')}>Build a lineup</button></section>
      </div>
    );
  if (!opp)
    return (
      <div className="fh-page">
        <section className="fh-empty"><b>Nobody to play</b><p>Save a lineup or finish a draft for an opponent.</p></section>
      </div>
    );
  const a = total(fl, week);
  const b = total(opp.lineup, week);
  const diffs = mine.map((r, i) => r.total - (theirs[i]?.total ?? 0));
  const mean = diffs.length ? diffs.reduce((s, x) => s + x, 0) / diffs.length : 0;
  const sd = diffs.length > 2 ? Math.sqrt(diffs.reduce((s, x) => s + (x - mean) ** 2, 0) / (diffs.length - 1)) : 12;
  const winA = Math.round(100 * phi((a - b) / Math.max(8, sd)));
  const wins = mine.filter((r, i) => r.total > (theirs[i]?.total ?? 0)).length;
  const sumA = mine.reduce((s, r) => s + r.total, 0);
  const sumB = theirs.reduce((s, r) => s + r.total, 0);
  const cA = dominant(hub, fl);
  const cB = dominant(hub, opp.lineup);
  const nA = findNFLTeam(cA)?.name ?? clubName;
  const nB = findNFLTeam(cB)?.name ?? clubName;
  const proj = (l: FLineup, w: number) => FANTASY_IDS.reduce((s, id) => s + (l[id] ? projectWeek(fctx, l[id], w) : 0), 0);
  const rowsW = [
    ...mine.map((r, i) => ({ week: r.week, a: r.total, b: theirs[i]?.total ?? 0, kind: 'played' as const })),
    ...fctx.sched.weeks.slice(0, 4).map((w) => ({ week: w, a: proj(fl, w), b: proj(opp.lineup, w), kind: 'proj' as const })),
  ];
  const maxW = Math.max(1, ...rowsW.map((r) => Math.max(r.a, r.b)));
  const vars = { ...(art.crowd ? { '--fh-crowd': `url(${art.crowd})` } : {}) } as CSSProperties;
  return (
    <div className="fh-page">
      <div className="fh-actions">
        <Select value={oppId || opp.id} onValueChange={setOppId}>
          <SelectTrigger className="fh-select" aria-label="Opponent lineup"><SelectValue placeholder="Opponent" /></SelectTrigger>
          <SelectContent className="z-[70] max-h-80">
            {opponents.map((o) => <SelectItem key={o.id} value={o.id}>{displayName(o.name)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Reveal className="fh-vs" style={{ ...vars, '--vsA': hcVars(nA)['--hc' as never], '--vsB': hcVars(nB)['--hc' as never] } as CSSProperties}>
        <Side hub={hub} lineup={fl} club={nA} />
        <div className="fh-vs__mid" aria-hidden="true"><span>VS</span></div>
        <Side hub={hub} lineup={opp.lineup} club={nB} right />
        <div className="fh-vs__board" role="group" aria-label="Scoreboard">
          <div className={cn('fh-vs__team', a >= b && 'is-lead')}><span>You</span><LedDigits value={f1(a)} dot={3} /></div>
          <div className="fh-vs__chance">
            <span>Win chance</span>
            <b>{winA}<small>%</small></b>
            <span className="fh-vs__meter" aria-hidden="true"><i style={{ width: `${winA}%` }} /></span>
          </div>
          <div className={cn('fh-vs__team', b > a && 'is-lead')}><span className="fh-vs__nm">{displayName(opp.name)}</span><LedDigits value={f1(b)} dot={3} /></div>
        </div>
      </Reveal>
      <p className="fh-vs__note">Week {week} projection<InfoTip label="About the win chance">The gap between the two projected totals against how much the two lineups' real weekly scores differed this season (at least 8 points).</InfoTip></p>

      <section className="fh-duels" aria-label="Slot by slot">
        {F_SLOTS.map((s, i) => {
          const ka = fl[s.id];
          const kb = opp.lineup[s.id];
          const pa = ka ? projectWeek(fctx, ka, week) : 0;
          const pb = kb ? projectWeek(fctx, kb, week) : 0;
          const side = (k: string | undefined, win: boolean) => {
            if (!k) return <span className="fh-duel__p is-empty">Empty</span>;
            const dst = k.startsWith('DST:');
            const club = dst ? k.slice(4) : hub.lab?.p[k]?.t ?? '';
            const t = findNFLTeam(club);
            const prof = dst ? undefined : hub.ctx.profiles.get(k);
            return (
              <span className={cn('fh-duel__p', win && 'is-win')} style={hcVars(t?.name)}>
                <span className="fh-duel__fig">{prof ? <Sprite player={prof.player} club={t?.name} /> : <TeamLogo team={club} size={30} decorative backed />}</span>
                {dst ? <b className="fh-slot__dst">{nameOf(k)}</b> : <NameStrip pkey={k} name={nameOf(k)} club={t?.name} />}
              </span>
            );
          };
          return (
            <div key={s.id} className="fh-duel ix-card mo-rise" style={stag(i, 50)}>
              {side(ka, pa > pb)}
              <span className="fh-duel__mid">
                <i>{s.label}</i>
                <span className="fh-duel__n"><b className={cn(pa > pb && 'is-win')}>{f1(pa)}</b><em>-</em><b className={cn(pb > pa && 'is-win')}>{f1(pb)}</b></span>
              </span>
              {side(kb, pb > pa)}
            </div>
          );
        })}
      </section>

      <section className="fh-panel" aria-labelledby="fh-wk-h">
        <header className="fh-panel__h">
          <h2 id="fh-wk-h">Season replay</h2>
          <span className="fh-record"><b>{wins}-{mine.length - wins}</b> {sumA.toFixed(1)} to {sumB.toFixed(1)}</span>
          <button type="button" className="fh-link" onClick={() => setWeeks((v) => !v)} aria-expanded={weeks}>{weeks ? 'Hide weeks' : 'Show weeks'}</button>
        </header>
        {weeks && (
          <ul className="fh-weeks">
            {rowsW.map((r) => (
              <li key={`${r.kind}-${r.week}`} className={cn(r.kind === 'proj' && 'is-proj')}>
                <span className="fh-weeks__w">{r.kind === 'proj' ? `Wk ${r.week} proj` : `Wk ${r.week}`}</span>
                <b className={cn(r.a > r.b && 'is-win')}>{r.a.toFixed(1)}</b>
                <span className="fh-weeks__bar" aria-hidden="true"><i className="l" style={{ width: `${(r.a / maxW) * 100}%` }} /><i className="r" style={{ width: `${(r.b / maxW) * 100}%` }} /></span>
                <b className={cn(r.b > r.a && 'is-win')}>{r.b.toFixed(1)}</b>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default HeadToHeadPage;
