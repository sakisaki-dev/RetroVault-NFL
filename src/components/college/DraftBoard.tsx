import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Player } from '@/types/player';
import { ArcadeToggle, PixelSelect } from '@/components/arcade';
import { Reveal, stag, useReveal } from '@/components/motion/Reveal';
import TeamLogo from '@/components/brand/TeamLogo';
import { useFillCols } from '@/components/espn/FillGrid';
import { CollegeMark } from '@/components/player/DraftTiles';
import { useFieldArt } from '@/components/teamlab/fieldArt';
import { findNFLTeam } from '@/utils/nflTeams';
import { markInfo, useDraftYear, type CollegeIndex, type DraftYear, type PickRow, type SchoolInfo } from '@/utils/collegeData';
import { CardName, cardVars, Figure, Outcome, Scene, SchoolLink, surname, usePlayerMap } from './shared';

interface Props {
  idx: CollegeIndex;
  year: number;
  round: number | 'all';
  onYear: (y: number) => void;
  onRound: (r: number | 'all') => void;
  onSchool: (slug: string) => void;
}

type Players = Map<string, Player>;
type SchoolOf = (p: PickRow) => (SchoolInfo & { slug?: string }) | null;

/**
 * One draft on draft night: the No. 1 pick's home stadium (the game's crowd and turf painted to that club) with the No. 1
 * pick and the class's best career standing on the turf; the steals and busts as plaques (a draft 3+ seasons old, by the
 * site's career OVR); then each round opens with a war-room board (picks, rated, average OVR, Pro Bowlers, Hall of
 * Famers, a strip of club magnets in pick order) over a dense wall of pick cards in the drafting clubs' colours. The
 * round's spare slots in the last row hold its summary (by school, by position), so no row has gaps. All rounds at once
 * mount a round only as it nears the screen.
 */
const DraftBoard = ({ idx, year, round, onYear, onRound, onSchool }: Props) => {
  const d = useDraftYear(year);
  const players = usePlayerMap();
  const meta = idx.years.find((y) => y[0] === year);
  const rounds = meta?.[2] ?? 7;
  const byPick = useMemo(() => new Map((d?.picks ?? []).map((p) => [p[1], p])), [d]);
  const school: SchoolOf = (p) => (p[5] && d?.schools[p[5]]) || null;
  const steals = (d?.steals ?? []).map((n) => byPick.get(n)).filter((p): p is PickRow => !!p);
  const busts = (d?.busts ?? []).map((n) => byPick.get(n)).filter((p): p is PickRow => !!p);
  const roundsShown = round === 'all' ? Array.from({ length: rounds }, (_, i) => i + 1) : [round];

  return (
    <section aria-labelledby="cl-board-title" className="cl-sec">
      <DraftNight idx={idx} year={year} d={d} players={players} school={school} onYear={onYear} />
      <div className="dn-rtabs">
        <ArcadeToggle<string>
          size="sm"
          label="Round"
          value={String(round)}
          onChange={(v) => onRound(v === 'all' ? 'all' : Number(v))}
          options={[...Array.from({ length: rounds }, (_, i) => ({ value: String(i + 1), label: `Rd ${i + 1}` })), { value: 'all', label: 'All' }]}
        />
        {d?.picks[0] && <span className="dn-rtabs__note">{d.picks[0][2]} on the clock: the No. 1 pick's home crowd sets the scene</span>}
      </div>

      {d === undefined && <p className="cl-loading" role="status">Loading the {year} draft…</p>}
      {d === null && <p className="cl-note">No draft file for {year}.</p>}

      {d &&
        (d.judged ? (
          <div className="dn-verdicts">
            <Verdict title="Steals" kicker={`Round 3 on · OVR ${idx.stealBar}+`} tone="steal" picks={steals} players={players} empty="No pick from round 3 on reached the steal bar." school={school} />
            <Verdict title="Busts" kicker={`Top 10 · OVR ${idx.bustBar} or lower`} tone="bust" picks={busts} players={players} empty="No top-10 pick fell to the bust bar." school={school} />
          </div>
        ) : (
          <p className="cl-callout">
            Too early to call steals and busts: a draft is judged after {idx.judgeAfter} seasons, so {year}'s waits until {year + idx.judgeAfter}.
          </p>
        ))}

      {d &&
        roundsShown.map((r) =>
          round === 'all' && r > 1 ? (
            <LazyMount key={`${year}-${r}`} minHeight={estimateHeight(d.picks.filter((p) => p[0] === r).length)}>
              <Round d={d} r={r} rounds={rounds} players={players} school={school} onSchool={onSchool} />
            </LazyMount>
          ) : (
            <Round key={`${year}-${r}`} d={d} r={r} rounds={rounds} players={players} school={school} onSchool={onSchool} />
          ),
        )}
      <p className="cl-foot">
        Picks, Pro Bowls, first-team All-Pro and games from nflverse's draft file; OVR is the site's career rating; HOF is a real inductee. Clubs carry today's names;
        the codes that changed franchises (Houston, Baltimore, St. Louis) are read by year.
      </p>
    </section>
  );
};

/** A rough height for a round not mounted yet (6 cards a row at desktop, 2 on a phone), so the page doesn't jump */
const estimateHeight = (n: number) => (typeof window !== 'undefined' && window.innerWidth < 700 ? Math.ceil(n / 2) * 150 + 280 : Math.ceil(n / 6) * 158 + 130);

/** Mounts its children once they come within a screen or so of the viewport (the all-rounds board) */
const LazyMount = ({ minHeight, children }: { minHeight: number; children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (on || !el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setOn(true), { rootMargin: '900px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return on ? <>{children}</> : <div ref={ref} style={{ minHeight }} aria-hidden="true" />;
};

/* ------------------------------------------------------------------ the draft-night header */

const YEAR_SPAN = 4;

const DraftNight = ({ idx, year, d, players, school, onYear }: { idx: CollegeIndex; year: number; d: DraftYear | null | undefined; players: Players; school: SchoolOf; onYear: (y: number) => void }) => {
  const host = d?.picks[0]?.[2] ?? 'Bears';
  const art = useFieldArt(host, 'night');
  const years = idx.years.map((y) => y[0]);
  const i = years.indexOf(year);
  const strip = years.slice(Math.max(0, i - YEAR_SPAN), i + YEAR_SPAN + 1);
  const picks = d?.picks ?? [];
  const no1 = picks[0];
  const rated = picks.filter((p) => p[7] != null).sort((a, b) => (b[7] ?? 0) - (a[7] ?? 0) || a[1] - b[1]);
  const topIsNo1 = !!rated[0] && !!no1 && rated[0][1] === no1[1];
  const best = topIsNo1 ? rated[1] : rated[0];
  const pbs = picks.filter((p) => p[8] > 0).length;
  const hofs = picks.filter((p) => p[10] > 0).length;
  const meta = idx.years[i];

  return (
    <Scene art={art} className="dn" style={cardVars(host)}>
      <div className="dn__copy mo-rise">
        <span className="ax-kicker">
          The NFL draft · {meta?.[1] ?? picks.length} picks · {meta?.[2] ?? 7} rounds
        </span>
        <h2 id="cl-board-title" className="dn__title">
          The <em>{year}</em> draft
        </h2>
        {d && (
          <div className="dn__facts">
            <span>
              <b>{d.rated}</b> on the site
            </span>
            <span>
              <b>{pbs}</b> Pro Bowler{pbs === 1 ? '' : 's'}
            </span>
            <span>
              <b>{hofs}</b> Hall of Famer{hofs === 1 ? '' : 's'}
            </span>
          </div>
        )}
        <div className="dn__years">
          <button type="button" className="dn__arrow" disabled={i <= 0} onClick={() => onYear(years[i - 1])} aria-label="The draft before">
            <ChevronLeft aria-hidden="true" />
          </button>
          {strip.map((y) => (
            <button
              key={y}
              type="button"
              className={`dn__yr${y === year ? ' is-on' : ''}${Math.abs(y - year) > 2 ? ' is-far' : ''}`}
              aria-current={y === year ? 'true' : undefined}
              onClick={() => onYear(y)}
            >
              {y}
            </button>
          ))}
          <button type="button" className="dn__arrow" disabled={i >= years.length - 1} onClick={() => onYear(years[i + 1])} aria-label="The draft after">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <PixelSelect className="dn__jump" label="Jump to a draft" prefix="Jump to" value={year} onChange={onYear} options={[...years].reverse().map((y) => ({ value: y, label: String(y) }))} />
      </div>
      <div className="dn__feat">
        {no1 && <Feature p={no1} label="No. 1 pick" players={players} school={school} i={1} />}
        {best && <Feature p={best} label={`${topIsNo1 ? 'Next best career' : 'Best career'} · pick ${best[1]}`} players={players} school={school} gold i={2} />}
      </div>
    </Scene>
  );
};

const Feature = ({ p, label, players, school, gold, i }: { p: PickRow; label: string; players: Players; school: SchoolOf; gold?: boolean; i: number }) => {
  const sc = school(p);
  const pl = p[6] ? players.get(p[6]) : null;
  return (
    <div className={`dn-ft mo-pop${gold ? ' is-gold' : ''}`} style={{ ...cardVars(p[2]), ...stag(i + 1, 120) }}>
      <span className="cl-wm dn-ft__wm" aria-hidden="true">
        <TeamLogo team={p[2]} size={190} decorative />
      </span>
      <span className="dn-ft__k">{label}</span>
      <span className="dn-ft__fig">
        <Figure player={pl} club={p[2]} size="l" action={gold ? 'celebrate' : 'idle'} logo={90} pos={p[4]} />
      </span>
      <span className="dn-ft__id">
        <CardName name={p[3]} siteKey={p[6]} />
        <span>
          {p[4]}
          {sc ? ` · ${sc.s}` : ''}
          {p[7] != null ? ` · OVR ${p[7]}` : ''}
          {p[8] > 0 ? ` · ${p[8]}× PB` : ''}
        </span>
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------ steals and busts */

const Verdict = ({ title, kicker, tone, picks, players, empty, school }: { title: string; kicker: string; tone: 'steal' | 'bust'; picks: PickRow[]; players: Players; empty: string; school: SchoolOf }) => (
  <Reveal className={`dn-vd dn-vd--${tone}`}>
    <header className="dn-vd__h mo-rise">
      <span className="ax-kicker">{kicker}</span>
      <h3>{title}</h3>
    </header>
    {picks.length ? (
      <ul className="dn-vd__row">
        {picks.map((p, i) => {
          const sc = school(p);
          return (
            <li key={p[1]} className={`dn-pq dn-pq--${tone} mo-pop`} style={{ ...cardVars(p[2]), ...stag(i + 1, 70) }}>
              <span className="cl-wm dn-pq__wm" aria-hidden="true">
                <TeamLogo team={p[2]} size={110} decorative />
              </span>
              <span className="dn-pq__k">
                {tone === 'steal' ? 'Steal' : 'Bust'} · pick {p[1]}
              </span>
              <span className="dn-pq__fig">
                <Figure player={p[6] ? players.get(p[6]) : null} club={p[2]} size="m" action={tone === 'steal' ? 'celebrate' : 'idle'} pos={p[4]} logo={56} />
              </span>
              <b className="dn-pq__ovr">{p[7]}</b>
              <CardName name={p[3]} siteKey={p[6]} className="dn-pq__name" />
              <span className="dn-pq__sub">
                Rd {p[0]} · {p[4]}
                {sc ? ` · ${sc.s}` : ''}
              </span>
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="cl-note">{empty}</p>
    )}
  </Reveal>
);

/* ------------------------------------------------------------------ a round: war-room board and pick wall */

/** The war-room board's one line, from the round's own numbers */
const roundNote = (picks: PickRow[]): string => {
  const hof = picks.filter((p) => p[10] > 0);
  if (hof.length === 1) return `${surname(hof[0][3])} at ${hof[0][1]} is the round's only Hall of Famer`;
  if (hof.length > 1)
    return `${hof.length} Hall of Famers: ${hof
      .slice(0, 3)
      .map((p) => `${surname(p[3])} (${p[1]})`)
      .join(', ')}${hof.length > 3 ? '…' : ''}`;
  const best = picks.filter((p) => p[7] != null).sort((a, b) => (b[7] ?? 0) - (a[7] ?? 0) || a[1] - b[1])[0];
  if (best) return `Best career: ${best[3]} at ${best[1]}, OVR ${best[7]}`;
  return 'No pick from this round has a card on the site yet';
};

const GAP = 8;

const Round = ({ d, r, rounds, players, school, onSchool }: { d: DraftYear; r: number; rounds: number; players: Players; school: SchoolOf; onSchool: (slug: string) => void }) => {
  const picks = useMemo(() => d.picks.filter((p) => p[0] === r), [d, r]);
  const [measure, cols] = useFillCols(160, 6, GAP);
  const reveal = useReveal<HTMLOListElement>();
  const gridRef = useCallback(
    (el: HTMLOListElement | null) => {
      measure.current = el;
      reveal(el);
    },
    [measure, reveal],
  );
  const rated = picks.filter((p) => p[7] != null);
  const avg = rated.length ? Math.round(rated.reduce((a, p) => a + (p[7] ?? 0), 0) / rated.length) : null;
  const pbs = picks.filter((p) => p[8] > 0).length;
  const hofs = picks.filter((p) => p[10] > 0).length;
  const spare = cols > 1 ? (cols - (picks.length % cols)) % cols : 0;
  const steal = new Set(d.steals);
  const bust = new Set(d.busts);

  return (
    <div className="dn-round">
      <Reveal className="dn-rb">
        <div className="dn-rb__l mo-rise">
          <span className="ax-kicker">
            War room · board {r} of {rounds}
          </span>
          <h3>Round {r}</h3>
          <p>{roundNote(picks)}</p>
        </div>
        <dl className="dn-rb__stats mo-rise" style={stag(1)}>
          <div>
            <dd>{picks.length}</dd>
            <dt>picks</dt>
          </div>
          <div>
            <dd>{rated.length}</dd>
            <dt>rated</dt>
          </div>
          <div>
            <dd>{avg ?? '–'}</dd>
            <dt>avg OVR</dt>
          </div>
          <div>
            <dd>{pbs}</dd>
            <dt>Pro Bowlers</dt>
          </div>
          <div>
            <dd>{hofs}</dd>
            <dt>HOF</dt>
          </div>
        </dl>
        <ol className="dn-rb__mags mo-rise" style={stag(2)} aria-label={`Round ${r} clubs in pick order`}>
          {picks.map((p) => (
            <li key={p[1]} className="dn-mag" style={cardVars(p[2])} title={`${p[1]}: ${p[2]}`}>
              <TeamLogo team={p[2]} size={16} decorative />
            </li>
          ))}
        </ol>
      </Reveal>
      <ol ref={gridRef} className="dn-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: GAP }} aria-label={`${d.y} draft, round ${r}`}>
        {picks.map((p, i) => (
          <PickCard key={p[1]} p={p} i={i} players={players} school={school(p)} onSchool={onSchool} tag={steal.has(p[1]) ? 'steal' : bust.has(p[1]) ? 'bust' : null} />
        ))}
        {spare > 0 && <RoundSummary picks={picks} r={r} span={spare} d={d} onSchool={onSchool} />}
      </ol>
    </div>
  );
};

const PickCard = ({ p, i, players, school, onSchool, tag }: { p: PickRow; i: number; players: Players; school: (SchoolInfo & { slug?: string }) | null; onSchool: (slug: string) => void; tag: 'steal' | 'bust' | null }) => {
  const pl = p[6] ? players.get(p[6]) : null;
  const t = findNFLTeam(p[2]);
  return (
    <li className={`dn-card mo-rise${tag ? ` is-${tag}` : ''}${p[10] > 0 ? ' is-hof' : ''}`} style={{ ...cardVars(p[2]), ...stag(Math.min(i, 12), 22) }}>
      <span className="cl-wm dn-card__wm" aria-hidden="true">
        <TeamLogo team={p[2]} size={124} decorative />
      </span>
      <span className="dn-card__top">
        <b className="dn-card__no">{p[1]}</b>
        <span className="dn-card__ab">{t?.abbreviation ?? ''}</span>
        {tag && <span className={`dn-tag dn-tag--${tag}`}>{tag}</span>}
      </span>
      <span className={`dn-card__fig${pl ? '' : ' is-ghost'}`} aria-hidden="true">
        <Figure player={pl} club={p[2]} size="m" action={p[10] > 0 || p[8] >= 5 ? 'celebrate' : 'idle'} pos={p[4]} logo={56} />
      </span>
      <span className="dn-card__body">
        <CardName name={p[3]} siteKey={p[6]} className="dn-card__name" />
        <span className="dn-card__meta">
          <span className="dn-pos">{p[4]}</span>
          {school && <SchoolLink school={school} onOpen={onSchool} size={15} className="cl-chip" />}
        </span>
        <Outcome hof={p[10]} ap={p[9]} pb={p[8]} ovr={p[7]} g={p[11]} max={3} />
      </span>
    </li>
  );
};

/** The round's spare slots: its schools (two picks or more) and positions */
const RoundSummary = ({ picks, r, span, d, onSchool }: { picks: PickRow[]; r: number; span: number; d: DraftYear; onSchool: (slug: string) => void }) => {
  const bySchool = useMemo(() => {
    const m = new Map<string, number>();
    picks.forEach((p) => p[5] && m.set(p[5], (m.get(p[5]) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || (d.schools[a[0]]?.s ?? '').localeCompare(d.schools[b[0]]?.s ?? ''));
  }, [picks, d]);
  const byPos = useMemo(() => {
    const m = new Map<string, number>();
    picks.forEach((p) => m.set(p[4], (m.get(p[4]) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [picks]);
  const multi = bySchool.filter(([, n]) => n > 1);
  const both = span >= 3;
  const schools = (multi.length ? multi : bySchool).slice(0, both ? 8 : 3);
  return (
    <li className={`dn-sum mo-rise${both ? '' : ' is-narrow'}`} style={{ gridColumn: `span ${span}` }}>
      <div className="dn-sum__part">
        <span className="ax-kicker">Round {r} by school</span>
        <span className="dn-sum__row">
          {schools.map(([sid, n]) => {
            const s = d.schools[sid] as (SchoolInfo & { slug?: string }) | undefined;
            const info = markInfo(s);
            return (
              <button key={sid} type="button" className="dn-sum__s" onClick={() => s?.slug && onSchool(s.slug)} aria-label={`${s?.name ?? sid}: ${n} pick${n === 1 ? '' : 's'}, open the school page`}>
                {info && <CollegeMark info={info} size={20} />}
                <b>{s?.s ?? sid}</b>
                <em>{n}</em>
              </button>
            );
          })}
        </span>
      </div>
      {both && (
        <div className="dn-sum__part">
          <span className="ax-kicker">By position</span>
          <span className="dn-sum__row">
            {byPos.slice(0, 6).map(([pos, n]) => (
              <span key={pos} className="dn-sum__p">
                <b>{n}</b>
                {pos}
              </span>
            ))}
          </span>
        </div>
      )}
    </li>
  );
};

export default DraftBoard;
