import { useDeferredValue, useMemo, useState } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { ArrowLeft, Search } from 'lucide-react';
import type { Player } from '@/types/player';
import { ArcadeToggle, SectionHeader } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import TeamLogo from '@/components/brand/TeamLogo';
import { CollegeMark } from '@/components/player/DraftTiles';
import { bannerTeamOf } from '@/utils/playerExtras';
import { findNFLTeam } from '@/utils/nflTeams';
import { ERAS, eraTotals, markInfo, schoolOfRow, useSchool, type CollegeIndex, type EraId, type SchoolFile } from '@/utils/collegeData';
import { clubColors, Figure, Outcome, PickName, schoolColors, usePlayerMap } from './shared';

type Sort = 'drafted' | 'firsts' | 'ovr';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'drafted', label: 'Drafted' },
  { value: 'firsts', label: '1st round' },
  { value: 'ovr', label: 'Total OVR' },
];

/** Search every school, and the leaderboard of schools by era */
export const CollegeIndexView = ({ idx, onSchool }: { idx: CollegeIndex; onSchool: (slug: string) => void }) => {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const [era, setEra] = useState<EraId>('all');
  const [sort, setSort] = useState<Sort>('drafted');
  const hits = useMemo(() => {
    if (!dq) return [];
    const words = dq.split(/\s+/);
    return idx.schools
      .filter((r) => words.every((w) => `${r[1]} ${r[2]}`.toLowerCase().split(/[^a-z0-9]+/).some((x) => x.startsWith(w))))
      .sort((a, b) => b[7] - a[7] || a[1].localeCompare(b[1]))
      .slice(0, 12);
  }, [dq, idx]);
  const board = useMemo(() => {
    const col = sort === 'drafted' ? 0 : sort === 'firsts' ? 1 : 2;
    return idx.schools
      .map((r) => ({ r, t: eraTotals(r, era) }))
      .filter((x) => x.t[col] > 0)
      .sort((a, b) => b.t[col] - a.t[col] || b.t[0] - a.t[0] || a.r[1].localeCompare(b.r[1]))
      .slice(0, 25);
  }, [idx, era, sort]);
  const max = board[0] ? board[0].t[sort === 'drafted' ? 0 : sort === 'firsts' ? 1 : 2] : 1;

  return (
    <section aria-labelledby="cl-schools-title" className="cl-sec">
      <SectionHeader as="h2" kicker={`${idx.schools.length} schools`} title={<span id="cl-schools-title">Colleges</span>} />
      <div className="cl-search">
        <Search className="cl-search__icon" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a school: Ohio State, Slippery Rock…" aria-label="Find a school" />
      </div>
      {dq && (
        <ul className="cl-hits" aria-label="Schools found">
          {hits.length === 0 && <li className="cl-note">No school matches “{q}”.</li>}
          {hits.map((r) => {
            const info = markInfo(schoolOfRow(r));
            return (
              <li key={r[0]}>
                <button type="button" className="cl-hit" style={schoolColors(schoolOfRow(r))} onClick={() => onSchool(r[0])}>
                  {info && <CollegeMark info={info} size={32} />}
                  <span className="cl-hit__n">{r[1]}</span>
                  <span className="cl-hit__k">{r[7]} drafted · {r[8]} in round 1 · {r[10]} on the site</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="cl-lb">
        <div className="cl-lb__controls">
          <ArcadeToggle<EraId> size="sm" label="Era (draft year)" value={era} onChange={setEra} options={ERAS.map((e) => ({ value: e.id, label: e.label }))} />
          <ArcadeToggle<Sort> size="sm" label="Rank schools by" value={sort} onChange={setSort} options={SORTS} />
        </div>
        <Reveal className="cl-table-wrap">
          <table className="cl-table">
            <caption className="sr-only">Schools ranked by {SORTS.find((s) => s.value === sort)?.label}, {ERAS.find((e) => e.id === era)?.label}</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">School</th>
                <th scope="col" className={sort === 'drafted' ? 'is-on' : ''}>Drafted</th>
                <th scope="col" className={sort === 'firsts' ? 'is-on' : ''}>1st rd</th>
                <th scope="col" className={sort === 'ovr' ? 'is-on' : 'cl-hide-sm'}>Total OVR</th>
                <th scope="col" className="cl-hide-sm">Rated</th>
              </tr>
            </thead>
            <tbody>
              {board.map(({ r, t }, i) => {
                const info = markInfo(schoolOfRow(r));
                const v = t[sort === 'drafted' ? 0 : sort === 'firsts' ? 1 : 2];
                return (
                  <tr key={r[0]} className="mo-rise" style={stag(Math.min(i, 12), 30)}>
                    <td className="cl-rank">{i + 1}</td>
                    <td>
                      <button type="button" className="cl-lbschool" style={schoolColors(schoolOfRow(r))} onClick={() => onSchool(r[0])} aria-label={`${r[1]}: open the school page`}>
                        {info && <CollegeMark info={info} size={24} />}
                        <span>{r[1]}</span>
                        <i className="cl-lbbar" style={{ width: `${Math.max(4, (v / max) * 100)}%` }} aria-hidden="true" />
                      </button>
                    </td>
                    <td className="cl-num">{t[0]}</td>
                    <td className="cl-num">{t[1]}</td>
                    <td className={sort === 'ovr' ? 'cl-num' : 'cl-num cl-hide-sm'}>{t[2].toLocaleString()}</td>
                    <td className="cl-num cl-hide-sm">{t[3]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Reveal>
        <p className="cl-foot">
          Counts since 1980
          <InfoTip>Drafted and first-rounders count every pick since 1980 by draft year; total OVR adds up the career OVR of the school's players with a card on the site (by draft year, else first season). The site's older players are fewer, so OVR totals lean recent.</InfoTip>
        </p>
      </div>
    </section>
  );
};

/** The all-time XI's slots, by the site's positions */
const XI: { pos: string; label: string }[] = [
  { pos: 'QB', label: 'QB' },
  { pos: 'RB', label: 'RB' },
  { pos: 'WR', label: 'WR' },
  { pos: 'WR', label: 'WR' },
  { pos: 'TE', label: 'TE' },
  { pos: 'OL', label: 'OL' },
  { pos: 'DL', label: 'DL' },
  { pos: 'DL', label: 'DL' },
  { pos: 'LB', label: 'LB' },
  { pos: 'DB', label: 'DB' },
  { pos: 'DB', label: 'DB' },
];

/** A school: its colours and logo, the all-time XI, its NFL players, the active ones and its draft history */
export const SchoolPage = ({ slug, onBack, onYear }: { slug: string; onBack: () => void; onYear: (y: number, round: number) => void }) => {
  const s = useSchool(slug);
  const players = usePlayerMap();
  if (s === undefined) return <p className="cl-loading" role="status">Loading the school…</p>;
  if (s === null) return (
    <section className="cl-sec">
      <button type="button" className="cl-back" onClick={onBack}><ArrowLeft aria-hidden="true" /> Every school</button>
      <p className="cl-note">No school file for “{slug}”.</p>
    </section>
  );
  return <School s={s} players={players} onBack={onBack} onYear={onYear} />;
};

const School = ({ s, players, onBack, onYear }: { s: SchoolFile; players: Map<string, Player>; onBack: () => void; onYear: (y: number, round: number) => void }) => {
  const info = markInfo(s);
  const xi = useMemo(() => {
    const used = new Set<string>();
    return XI.map((slot) => {
      const row = s.players.find((p) => p[0].startsWith(`${slot.pos}:`) && !used.has(p[0]) && p[1] != null);
      if (!row) return null;
      used.add(row[0]);
      return { slot, row, player: players.get(row[0]) ?? null };
    });
  }, [s, players]);
  const active = useMemo(() => s.players.filter((p) => p[3]).sort((a, b) => (b[2] ?? -1) - (a[2] ?? -1) || (b[1] ?? 0) - (a[1] ?? 0)), [s]);
  const maxRound = Math.max(1, ...s.rounds);
  const drafted = s.rounds.reduce((a, b) => a + b, 0);
  const hofs = s.players.filter((p) => p[5]).length;
  // the strip's club: his club now, else his banner club (where he is best known), else the club that drafted him; a free
  // agent ("FA") has no club colours, so he falls through
  const club = (p: SchoolFile['players'][number]) => {
    const pl = players.get(p[0]);
    return [p[4], pl ? bannerTeamOf(pl) : null, p[6]?.[3]].find((c) => c && findNFLTeam(c)) ?? '';
  };
  const nameOf = (k: string) => k.split(':').slice(1).join(':');
  const offense = xi.slice(0, 6);
  const defense = xi.slice(6);

  return (
    <section aria-labelledby="cl-school-title" className="cl-sec cl-schoolpage" style={schoolColors(s)}>
      <button type="button" className="cl-back" onClick={onBack}><ArrowLeft aria-hidden="true" /> Every school</button>
      <Reveal className="cl-shero">
        <span className="cl-shero__mark mo-pop">{info && <CollegeMark info={info} size={112} />}</span>
        <div className="cl-shero__text mo-rise">
          <span className="ax-kicker">College</span>
          <h2 id="cl-school-title">{s.name}</h2>
          <dl className="cl-shero__stats">
            <div><dt>Drafted</dt><dd>{drafted}</dd></div>
            <div><dt>Round 1</dt><dd>{s.rounds[0] ?? 0}</dd></div>
            <div><dt>No. 1 picks</dt><dd>{s.no1.length}</dd></div>
            <div><dt>On the site</dt><dd>{s.players.length}</dd></div>
            <div><dt>Active</dt><dd>{active.length}</dd></div>
            {hofs > 0 && <div><dt>Hall of Fame</dt><dd>{hofs}</dd></div>}
          </dl>
        </div>
      </Reveal>

      {xi.some(Boolean) && (
        <Reveal className="cl-xi" aria-labelledby="cl-xi-title">
          <header className="cl-xi__head mo-rise">
            <span className="ax-kicker">Best career OVR at each spot{xi.some((x) => !x) ? ' · open spots left out' : ''}</span>
            <h3 id="cl-xi-title">The all-time XI</h3>
          </header>
          {[offense, defense].filter((line) => line.some(Boolean)).map((line, li) => (
            <ol key={li} className="cl-xi__line" aria-label={line === defense ? 'Defense' : 'Offense'}>
              {line.map((x, i) =>
                // a school with no one rated at a spot leaves it out (no "No one" placeholders)
                x ? (
                  <li key={`${x.row[0]}`} className={`cl-xi__man ${i < line.length / 2 ? 'mo-run-l' : 'mo-run-r'}`} style={stag(i + 1 + (line === defense ? 3 : 0), 70)}>
                    <span className="cl-xi__fig" aria-hidden="true">
                      <Figure player={x.player} club={club(x.row)} kind="figure" size="s" action={x.row[1] === s.players[0][1] ? 'celebrate' : 'idle'} />
                    </span>
                    <span className="cl-xi__pos">{x.slot.label}</span>
                    <PickName name={nameOf(x.row[0])} siteKey={x.row[0]} club={club(x.row)} />
                    <span className="cl-xi__ovr">OVR {x.row[1]}</span>
                  </li>
                ) : null,
              )}
            </ol>
          ))}
        </Reveal>
      )}

      <div className="cl-cols">
        <Reveal className="cl-panel">
          <h3 className="cl-panel__t mo-rise">NFL players <small>best career OVR first</small></h3>
          {s.players.length ? (
            <ol className="cl-plist">
              {s.players.slice(0, 15).map((p, i) => (
                <li key={p[0]} className="mo-rise" style={stag(Math.min(i, 10), 30)}>
                  <span className="cl-plist__ovr">{p[1] ?? '–'}</span>
                  <span className="cl-plist__n">
                    <PickName name={nameOf(p[0])} siteKey={p[0]} club={club(p)} />
                    <span className="cl-plist__k">
                      {p[0].split(':')[0]}
                      {p[6] ? ` · ${p[6][0]} R${p[6][1]} P${p[6][2]}${p[6][3] ? ` · ${p[6][3]}` : ''}` : ' · Undrafted'}
                    </span>
                  </span>
                  {p[5] ? <span className="cl-badge cl-badge--hof">HOF</span> : p[3] ? <span className="cl-badge cl-badge--act">Active</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="cl-note">No player from {s.name} has a card on the site.</p>
          )}
          {s.players.length > 15 && <p className="cl-note">and {s.players.length - 15} more on the site.</p>}
        </Reveal>

        <Reveal className="cl-panel">
          <h3 className="cl-panel__t mo-rise">Active now <small>{active.length ? 'by this season’s SZN' : ''}</small></h3>
          {active.length ? (
            <ul className="cl-active">
              {active.slice(0, 24).map((p, i) => (
                <li key={p[0]} className="mo-pop" style={{ ...clubColors(club(p)), ...stag(Math.min(i, 12), 25) }}>
                  <PickName name={nameOf(p[0])} siteKey={p[0]} club={club(p)} />
                  <span className="cl-active__k">{p[0].split(':')[0]}{p[2] != null ? ` · SZN ${p[2]}` : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="cl-note">No active player from {s.name} is on the site.</p>
          )}
          {active.length > 24 && <p className="cl-note">and {active.length - 24} more.</p>}
        </Reveal>
      </div>

      <div className="cl-cols">
        <Reveal className="cl-panel">
          <h3 className="cl-panel__t mo-rise">Picks by round <small>since 1980</small></h3>
          {drafted ? (
            <ol className="cl-rbars" aria-label="Picks by round">
              {s.rounds.map((n, i) => (
                <li key={i} aria-label={`Round ${i + 1}: ${n}`}>
                  <span className="cl-rbars__n">{n}</span>
                  <span className="cl-rbars__bar mo-grow-y" style={{ height: `${Math.max(3, (n / maxRound) * 100)}%`, ...stag(i, 50) }} />
                  <span className="cl-rbars__r">{i + 1}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="cl-note">No pick from {s.name} since 1980.</p>
          )}
          {s.no1.length > 0 && (
            <div className="cl-no1">
              <span className="ax-kicker">No. 1 overall</span>
              <ul>
                {s.no1.map(([y, n, c, k]) => (
                  <li key={y} style={clubColors(c)}>
                    <TeamLogo team={c} size={28} decorative />
                    <span className="cl-no1__y">{y}</span>
                    <PickName name={k ? nameOf(k) : n} siteKey={k} club={c} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Reveal>

        <Reveal className="cl-panel">
          <h3 className="cl-panel__t mo-rise">First-rounders <small>{s.firsts.length}</small></h3>
          {s.firsts.length ? (
            <ol className="cl-firsts">
              {s.firsts.slice(0, 30).map(([y, pk, n, pos, c, k]) => (
                <li key={`${y}-${pk}`}>
                  <button type="button" className="cl-firsts__y" onClick={() => onYear(y, 1)} aria-label={`The ${y} draft board`}>{y}</button>
                  <span className="cl-firsts__p">#{pk}</span>
                  <TeamLogo team={c} size={20} decorative />
                  <PickName name={k ? nameOf(k) : n} siteKey={k} club={c} />
                  <span className="cl-pos">{pos}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="cl-note">No first-round pick from {s.name} since 1980.</p>
          )}
          {s.firsts.length > 30 && <p className="cl-note">and {s.firsts.length - 30} earlier.</p>}
        </Reveal>
      </div>

      {s.picks.length > 0 && (
        <Reveal className="cl-panel">
          <h3 className="cl-panel__t mo-rise">Every pick <small>{s.picks.length}, newest first</small></h3>
          <div className="cl-table-wrap">
            <table className="cl-table cl-table--picks">
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  <th scope="col">Pick</th>
                  <th scope="col">Player</th>
                  <th scope="col" className="cl-hide-sm">Club</th>
                  <th scope="col">Became</th>
                </tr>
              </thead>
              <tbody>
                {s.picks.slice(0, 120).map(([y, r, pk, c, n, pos, k, ovr, pb, ap, hof]) => (
                  <tr key={`${y}-${pk}`}>
                    <td><button type="button" className="cl-firsts__y" onClick={() => onYear(y, r)} aria-label={`The ${y} draft board, round ${r}`}>{y}</button></td>
                    <td className="cl-num">R{r} · {pk}</td>
                    <td><PickName name={k ? nameOf(k) : n} siteKey={k} club={c} /> <span className="cl-pos">{pos}</span></td>
                    <td className="cl-hide-sm"><span className="cl-clubcell"><TeamLogo team={c} size={20} decorative /> {c}</span></td>
                    <td><Outcome hof={hof} ap={ap} pb={pb} ovr={ovr} g={null} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.picks.length > 120 && <p className="cl-note">The {s.picks.length - 120} earliest picks are on each year's board.</p>}
        </Reveal>
      )}
    </section>
  );
};
