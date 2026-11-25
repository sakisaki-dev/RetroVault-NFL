import PixelLoader from '@/components/ui/PixelLoader';
import { useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Player } from '@/types/player';
import { Reveal, stag } from '@/components/motion/Reveal';
import TeamLogo from '@/components/brand/TeamLogo';
import { CollegeMark } from '@/components/player/DraftTiles';
import { useFieldArtPalette } from '@/components/teamlab/fieldArt';
import { findNFLTeam } from '@/utils/nflTeams';
import { markInfo, useSchool, type CollegeIndex, type SchoolFile } from '@/utils/collegeData';
import { CardName, cardTap, cardVars, Figure, nameOfKey, Outcome, PickName, posOfKey, Scene, schoolColors, schoolPalette, surname, useBestKnownClub, usePlayerMap } from './shared';

type Row = SchoolFile['players'][number];
type Pick = SchoolFile['picks'][number];

/** The all-time XI's slots, by the site's positions */
const XI = ['QB', 'RB', 'WR', 'WR', 'TE', 'OL', 'DL', 'DL', 'LB', 'DB', 'DB'];

/** A school's page: loads its file, then the page */
const SchoolPage = ({ idx, slug, onBack, onYear }: { idx: CollegeIndex; slug: string; onBack: () => void; onYear: (y: number, round: number) => void }) => {
  const s = useSchool(slug);
  if (s === undefined) return <PixelLoader what="the school" minHeight={420} />;
  if (s === null)
    return (
      <section className="cl-sec">
        <button type="button" className="cl-back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" /> Every school
        </button>
        <p className="cl-note">No school file for “{slug}”.</p>
      </section>
    );
  return <School idx={idx} s={s} onBack={onBack} onYear={onYear} />;
};

/** "No. 3": the school's place among every school on a column of the index (ties share a place) */
const rankOn = (idx: CollegeIndex, slug: string, col: 7 | 8 | 11) => {
  const me = idx.schools.find((r) => r[0] === slug);
  if (!me) return null;
  return 1 + idx.schools.filter((r) => (r[col] as number) > (me[col] as number)).length;
};

/**
 * A school as its NFL factory: a campus stadium in the school's colours (the game's crowd, stands and turf painted to
 * them, the logo at midfield) over a school-colour band; the factory's numbers as tiles; the all-time XI standing on the
 * turf in their best-known clubs' kits; the pipeline per decade beside the clubs that draft from it; notable alumni as
 * plaques; today's players grouped by club; and a timeline of every pick since 1980.
 */
const School = ({ idx, s, onBack, onYear }: { idx: CollegeIndex; s: SchoolFile; onBack: () => void; onYear: (y: number, round: number) => void }) => {
  const players = usePlayerMap();
  const bestKnown = useBestKnownClub();
  const info = markInfo(s);
  const row = idx.schools.find((r) => r[0] === s.slug);
  const palette = useMemo(() => schoolPalette(s), [s]);
  const art = useFieldArtPalette(`school:${s.slug}`, palette, 'day');
  const drafted = s.rounds.reduce((a, b) => a + b, 0);
  const pickOf = useMemo(() => new Map(s.picks.filter((p) => p[6]).map((p) => [p[6]!, p])), [s]);
  const active = useMemo(() => s.players.filter((p) => p[3]), [s]);
  // a player's club for his sprite and plate: the site's best-known club rule, else the club that drafted him
  const club = (p: Row) => bestKnown(players.get(p[0]), p[6]?.[3] ?? null);
  const hofNames = useMemo(() => {
    const names = new Map<string, number>();
    s.picks.filter((p) => p[10] > 0).forEach((p) => names.set(p[6] ?? p[4], p[7] ?? 0));
    s.players.filter((p) => p[5]).forEach((p) => names.set(p[0], p[1] ?? 0));
    return [...names.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => surname(k.includes(':') ? nameOfKey(k) : k));
  }, [s]);
  const pbs = s.picks.reduce((a, p) => a + p[8], 0);
  const aps = s.picks.reduce((a, p) => a + p[9], 0);
  const rDrafted = rankOn(idx, s.slug, 7);
  const tiles: [string | number, string, string][] = [
    [drafted.toLocaleString(), 'Drafted', rDrafted ? `No. ${rDrafted} of ${idx.schools.length}` : ''],
    [s.rounds[0] ?? 0, 'First-rounders', s.rounds[0] ? `No. ${rankOn(idx, s.slug, 8)}` : ''],
    [s.no1.length, 'No. 1 picks', s.no1.map(([y, n]) => `${y} ${surname(n)}`).join(' · ')],
    [active.length, 'Active now', active.length ? `No. ${rankOn(idx, s.slug, 11)}` : ''],
    [pbs, 'Pro Bowls', 'by its draftees'],
    [aps, 'All-Pro', 'first-team picks'],
    [hofNames.length, hofNames.length === 1 ? 'Hall of Famer' : 'Hall of Famers', hofNames.slice(0, 2).join(' · ')],
    [s.players.length, 'On the site', 'with a career card'],
  ];

  return (
    <section aria-labelledby="cl-school-title" className="cl-sec sp" style={schoolColors(s)}>
      <Scene art={art} className="sp-hero">
        <span className="sp-hero__mid" aria-hidden="true">
          {info && <CollegeMark info={info} size={64} />}
        </span>
        <div className="sp-hero__band">
          <button type="button" className="sp-hero__back" onClick={onBack}>
            <ArrowLeft aria-hidden="true" /> Every school
          </button>
          <span className="sp-hero__lg mo-pop">{info && <CollegeMark info={info} size={72} />}</span>
          <div className="sp-hero__id mo-rise">
            <span className="ax-kicker">
              College{rDrafted && drafted ? ` · No. ${rDrafted} NFL factory of ${idx.schools.length}` : ''}
            </span>
            <h2 id="cl-school-title">{s.name}</h2>
            <p>
              In the NFL since {idx.years[0][0]}: {drafted.toLocaleString()} drafted, {s.rounds[0] ?? 0} in the first round
              {s.no1.length ? `, ${s.no1.length} No. 1 pick${s.no1.length === 1 ? '' : 's'}` : ''}.
            </p>
          </div>
        </div>
      </Scene>

      <Reveal className="sp-fx">
        <div className="sp-fx__h mo-rise">
          <span className="ax-kicker">NFL factory</span>
          <h3 className="cl-h3">By the numbers</h3>
        </div>
        <dl className="sp-fx__t">
          {tiles.map(([v, l, e], i) => (
            <div key={l} className="sp-tile mo-rise" style={stag(i + 1, 40)}>
              <dd>{v}</dd>
              <dt>{l}</dt>
              {e && <span className="sp-tile__e">{e}</span>}
            </div>
          ))}
        </dl>
      </Reveal>

      <AllTimeXI s={s} players={players} club={club} turf={art.turf} />

      <div className="sp-two">
        <Pipeline row={row?.[12] ?? null} s={s} />
        <DraftingClubs s={s} />
      </div>

      <Alumni s={s} players={players} club={club} pickOf={pickOf} />
      <ActiveByClub active={active} players={players} />
      <Timeline s={s} onYear={onYear} latest={idx.latest} first={idx.years[0][0]} />
      <EveryPick s={s} onYear={onYear} />
    </section>
  );
};

/* ------------------------------------------------------------------ the all-time XI on turf */

const AllTimeXI = ({ s, players, club, turf }: { s: SchoolFile; players: Map<string, Player>; club: (p: Row) => string; turf: string | null }) => {
  const xi = useMemo(() => {
    const used = new Set<string>();
    return XI.map((pos) => {
      const row = s.players.find((p) => p[0].startsWith(`${pos}:`) && !used.has(p[0]) && p[1] != null);
      if (row) used.add(row[0]);
      return row ?? null;
    });
  }, [s]);
  if (!xi.some(Boolean)) return null;
  const top = Math.max(...xi.map((r) => r?.[1] ?? 0));
  const line = (rows: (Row | null)[], side: string, off: number) => (
    <ol className="sp-xi__row" aria-label={side}>
      <span className="sp-xi__side" aria-hidden="true">
        {side}
      </span>
      {rows.map((r, i) =>
        r ? (
          <li onClick={cardTap} key={r[0]} className={`sp-xi__m ${i < rows.length / 2 ? 'mo-run-l' : 'mo-run-r'}${r[5] ? ' is-hof' : ''}`} style={stag(i + off, 60)}>
            <span className="sp-xi__pos">{posOfKey(r[0])}</span>
            <span className="sp-xi__fig" aria-hidden="true">
              <Figure player={players.get(r[0])} club={club(r)} size="m" action={r[1] === top || r[5] ? 'celebrate' : 'idle'} logo={48} />
            </span>
            <span className="sp-xi__plate" style={cardVars(club(r))}>
              <TeamLogo team={club(r)} size={18} decorative />
              <CardName name={surname(nameOfKey(r[0]))} siteKey={r[0]} />
              <em>{r[1]}</em>
            </span>
          </li>
        ) : null,
      )}
    </ol>
  );
  return (
    <Reveal className="sp-xi" style={(turf ? { '--sp-turf': `url(${turf})` } : {}) as CSSProperties} aria-labelledby="sp-xi-title">
      <header className="sp-xi__h mo-rise">
        <span className="ax-kicker">Best career OVR at each spot</span>
        <h3 id="sp-xi-title" className="cl-h3">
          The all-time XI
        </h3>
        <em>Each in the kit of his best-known club{xi.some((x) => !x) ? ' · open spots left out' : ''}</em>
      </header>
      <div className={`sp-xi__field${turf ? ' has-art' : ''}`}>
        {line(xi.slice(0, 6), 'Offense', 1)}
        {line(xi.slice(6), 'Defense', 4)}
      </div>
    </Reveal>
  );
};

/* ------------------------------------------------------------------ pipeline and drafting clubs */

const Pipeline = ({ row, s }: { row: Record<string, [number, number, number, number]> | null; s: SchoolFile }) => {
  const decades = useMemo(() => {
    if (row) return Object.entries(row).sort((a, b) => Number(a[0]) - Number(b[0])).map(([d, v]) => [Number(d), v[0], v[1]] as const);
    const m = new Map<number, [number, number]>();
    s.picks.forEach((p) => {
      const d = Math.floor(p[0] / 10) * 10;
      const v = m.get(d) ?? [0, 0];
      m.set(d, [v[0] + 1, v[1] + (p[1] === 1 ? 1 : 0)]);
    });
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => [d, v[0], v[1]] as const);
  }, [row, s]);
  const shown = decades.filter(([, n]) => n > 0);
  const max = Math.max(1, ...shown.map(([, n]) => n));
  return (
    <Reveal className="sp-pane" aria-labelledby="sp-pl-title">
      <header className="sp-pane__h mo-rise">
        <span className="ax-kicker">The pipeline</span>
        <h3 id="sp-pl-title" className="cl-h3">
          Picks per decade
        </h3>
        <em>
          <i className="sp-key sp-key--r1" /> first round
        </em>
      </header>
      {shown.length ? (
        <ol className="sp-pl">
          {shown.map(([d, n, r1], i) => (
            <li key={d} className="sp-pl__c" aria-label={`${d}s: ${n} drafted, ${r1} in round 1`}>
              <span className="sp-pl__bar mo-grow-y" style={{ height: `${(n / max) * 78}%`, ...stag(i, 70) }}>
                <b>{n}</b>
                <i style={{ height: `${n ? (r1 / n) * 100 : 0}%` }} />
              </span>
              <span className="sp-pl__d">{d}s</span>
              <em>{r1} R1</em>
            </li>
          ))}
        </ol>
      ) : (
        <p className="cl-note">No pick from {s.name} since 1980.</p>
      )}
    </Reveal>
  );
};

const DraftingClubs = ({ s }: { s: SchoolFile }) => {
  const clubs = useMemo(() => {
    const m = new Map<string, number>();
    s.picks.forEach((p) => findNFLTeam(p[3]) && m.set(p[3], (m.get(p[3]) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8);
  }, [s]);
  if (!clubs.length) return null;
  const max = clubs[0][1];
  return (
    <Reveal className="sp-pane" aria-labelledby="sp-dc-title">
      <header className="sp-pane__h mo-rise">
        <span className="ax-kicker">Who calls</span>
        <h3 id="sp-dc-title" className="cl-h3">
          Clubs that draft here
        </h3>
      </header>
      <ol className="sp-dc">
        {clubs.map(([c, n], i) => (
          <li key={c} className="sp-dc__r mo-rise" style={{ ...cardVars(c), ...stag(i, 40) }}>
            <TeamLogo team={c} size={24} decorative />
            <span className="sp-dc__n">{c}</span>
            <span className="sp-dc__bar" aria-hidden="true">
              <i className="mo-grow" style={{ width: `${(n / max) * 100}%`, ...stag(i, 50) }} />
            </span>
            <b>{n}</b>
          </li>
        ))}
      </ol>
    </Reveal>
  );
};

/* ------------------------------------------------------------------ notable alumni */

const Alumni = ({ s, players, club, pickOf }: { s: SchoolFile; players: Map<string, Player>; club: (p: Row) => string; pickOf: Map<string, Pick> }) => {
  const notable = useMemo(() => {
    const rated = s.players.filter((p) => p[1] != null);
    const hof = rated.filter((p) => p[5]);
    const rest = rated.filter((p) => !p[5]);
    return [...hof, ...rest].slice(0, 8).sort((a, b) => b[5] - a[5] || (b[1] ?? 0) - (a[1] ?? 0));
  }, [s]);
  if (!notable.length) return null;
  return (
    <Reveal className="sp-pane" aria-labelledby="sp-al-title">
      <header className="sp-pane__h mo-rise">
        <span className="ax-kicker">The wall</span>
        <h3 id="sp-al-title" className="cl-h3">
          Notable alumni
        </h3>
        <em>Hall of Famers first, then best career OVR</em>
      </header>
      <ol className="sp-al">
        {notable.map((p, i) => {
          const c = club(p);
          const pk = pickOf.get(p[0]);
          return (
            <li onClick={cardTap} key={p[0]} className="sp-pq mo-rise" style={{ ...cardVars(c), ...stag(i, 50) }}>
              <span className="cl-wm sp-pq__wm" aria-hidden="true">
                <TeamLogo team={c} size={120} decorative />
              </span>
              <span className="sp-pq__fig" aria-hidden="true">
                <Figure player={players.get(p[0])} club={c} size="m" action={p[5] ? 'celebrate' : 'idle'} logo={52} />
              </span>
              <span className="sp-pq__t">
                <b className="sp-pq__ovr">
                  {p[1]}
                  <small>OVR</small>
                </b>
                <CardName name={nameOfKey(p[0])} siteKey={p[0]} className="sp-pq__name" />
                <span className="sp-pq__sub">
                  {posOfKey(p[0])} · {p[6] ? `${p[6][0]} · Rd ${p[6][1]} · Pick ${p[6][2]}` : 'Undrafted'}
                </span>
                <span className="sp-pq__b">
                  {p[5] ? <span className="cl-bd cl-bd--hof">HOF</span> : null}
                  {pk && pk[9] > 0 ? <span className="cl-bd cl-bd--ap">{pk[9]}× AP</span> : null}
                  {pk && pk[8] > 0 ? <span className="cl-bd cl-bd--pb">{pk[8]}× PB</span> : null}
                  {p[3] ? <span className="cl-bd cl-bd--act">Active</span> : null}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </Reveal>
  );
};

/* ------------------------------------------------------------------ active by club */

const GROUPS = 12;

const ActiveByClub = ({ active, players }: { active: Row[]; players: Map<string, Player> }) => {
  const [all, setAll] = useState(false);
  const { groups, fa } = useMemo(() => {
    const m = new Map<string, Row[]>();
    let free = 0;
    active.forEach((p) => {
      if (p[4] && findNFLTeam(p[4])) m.set(p[4], [...(m.get(p[4]) ?? []), p]);
      else free += 1;
    });
    const gs = [...m.entries()]
      .map(([c, ps]) => [c, ps.sort((a, b) => (b[2] ?? -1) - (a[2] ?? -1) || (b[1] ?? 0) - (a[1] ?? 0))] as const)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    return { groups: gs, fa: free };
  }, [active]);
  if (!active.length) return null;
  const shown = all ? groups : groups.slice(0, GROUPS);
  return (
    <Reveal className="sp-pane" aria-labelledby="sp-ac-title">
      <header className="sp-pane__h mo-rise">
        <span className="ax-kicker">On Sundays now</span>
        <h3 id="sp-ac-title" className="cl-h3">
          {active.length} active, by club
        </h3>
        <em>
          best SZN first{fa ? ` · ${fa} free agent${fa === 1 ? '' : 's'}` : ''}
        </em>
      </header>
      <ol className="sp-ac">
        {shown.map(([c, ps], i) => (
          <li key={c} className="sp-ac__g mo-rise" style={{ ...cardVars(c), ...stag(Math.min(i, 10), 40) }}>
            <span className="cl-wm sp-ac__wm" aria-hidden="true">
              <TeamLogo team={c} size={96} decorative />
            </span>
            <span className="sp-ac__h">
              <b>{c}</b>
              <span>{ps.length}</span>
            </span>
            <span className="sp-ac__ps">
              {ps.slice(0, 3).map((p) => (
                <span onClick={cardTap} key={p[0]} className="sp-ac__p">
                  <span className="sp-ac__b" aria-hidden="true">
                    <Figure player={players.get(p[0])} club={c} kind="bust" logo={30} />
                  </span>
                  <CardName name={surname(nameOfKey(p[0]))} siteKey={p[0]} className="sp-ac__n" />
                  <em>
                    {posOfKey(p[0])}
                    {p[2] != null ? ` · ${p[2]}` : ''}
                  </em>
                </span>
              ))}
              {ps.length > 3 && <span className="sp-ac__more">+{ps.length - 3}</span>}
            </span>
          </li>
        ))}
      </ol>
      {groups.length > GROUPS && (
        <button type="button" className="ci-more" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? 'Fewer clubs' : `All ${groups.length} clubs`}
        </button>
      )}
    </Reveal>
  );
};

/* ------------------------------------------------------------------ the draft timeline */

const Timeline = ({ s, onYear, first, latest }: { s: SchoolFile; onYear: (y: number, round: number) => void; first: number; latest: number }) => {
  const byYear = useMemo(() => {
    const m = new Map<number, Pick[]>();
    s.picks.forEach((p) => m.set(p[0], [...(m.get(p[0]) ?? []), p]));
    m.forEach((ps) => ps.sort((a, b) => a[2] - b[2]));
    return m;
  }, [s]);
  if (!s.picks.length) return null;
  const years = Array.from({ length: latest - first + 1 }, (_, i) => first + i);
  const busiest = [...byYear.entries()].sort((a, b) => b[1].length - a[1].length || b[0] - a[0])[0];
  return (
    <Reveal className="sp-pane" aria-labelledby="sp-tl-title">
      <header className="sp-pane__h mo-rise">
        <span className="ax-kicker">
          Draft timeline · {first}–{latest}
        </span>
        <h3 id="sp-tl-title" className="cl-h3">
          Every pick
        </h3>
        <em>
          <i className="sp-key sp-key--r1" /> round 1 · <i className="sp-key sp-key--no1" /> No. 1 overall · busiest year {busiest[0]} ({busiest[1].length})
        </em>
      </header>
      <ol className="sp-tl">
        {years.map((y) => {
          const ps = byYear.get(y) ?? [];
          const n1 = ps.find((p) => p[2] === 1);
          return (
            <li key={y} className={`sp-tl__y${y % 10 === 0 ? ' is-dec' : ''}`}>
              {n1 && <span className="sp-tl__flag">#1 {surname(n1[4])}</span>}
              {ps.length > 0 ? (
                <button type="button" className="sp-tl__dots" onClick={() => onYear(y, ps[0][1])} aria-label={`${y}: ${ps.length} pick${ps.length === 1 ? '' : 's'}. Open the ${y} draft board`} title={`${y}: ${ps.length}`}>
                  {ps.map((p) => (
                    <i key={p[2]} className={p[2] === 1 ? 'is-no1' : p[1] === 1 ? 'is-r1' : ''} />
                  ))}
                </button>
              ) : (
                <span className="sp-tl__dots" aria-label={`${y}: none`} />
              )}
              <span className="sp-tl__n">{ps.length || ''}</span>
              <span className="sp-tl__yr">{y % 5 === 0 ? `’${String(y).slice(2)}` : ''}</span>
            </li>
          );
        })}
      </ol>
    </Reveal>
  );
};

/* ------------------------------------------------------------------ every pick (the plain table, folded) */

const EveryPick = ({ s, onYear }: { s: SchoolFile; onYear: (y: number, round: number) => void }) => {
  const [open, setOpen] = useState(false);
  if (!s.picks.length) return null;
  return (
    <div className="sp-pane sp-every">
      <button type="button" className="sp-every__t" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="cl-h3">The pick list</span>
        <small>
          {s.picks.length}, newest first · {open ? 'hide' : 'show the table'}
        </small>
      </button>
      {open && (
        <div className="cl-table-wrap">
          <table className="cl-table">
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Pick</th>
                <th scope="col">Player</th>
                <th scope="col" className="cl-hide-sm">
                  Club
                </th>
                <th scope="col">Became</th>
              </tr>
            </thead>
            <tbody>
              {s.picks.map(([y, r, pk, c, n, pos, k, ovr, pb, ap, hof]) => (
                <tr key={`${y}-${pk}`}>
                  <td>
                    <button type="button" className="cl-yearbtn" onClick={() => onYear(y, r)} aria-label={`The ${y} draft board, round ${r}`}>
                      {y}
                    </button>
                  </td>
                  <td className="cl-num">
                    R{r} · {pk}
                  </td>
                  <td>
                    <span className="cl-cell">
                      <PickName name={k ? nameOfKey(k) : n} siteKey={k} club={c} /> <span className="dn-pos dn-pos--dark">{pos}</span>
                    </span>
                  </td>
                  <td className="cl-hide-sm">
                    <span className="cl-cell">
                      <TeamLogo team={c} size={20} decorative /> {c}
                    </span>
                  </td>
                  <td>
                    <Outcome hof={hof} ap={ap} pb={pb} ovr={ovr} g={null} showGames={false} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SchoolPage;
