import { useDeferredValue, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { InfoTip } from '@/components/ui/InfoTip';
import { ArcadeToggle } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { CollegeMark } from '@/components/player/DraftTiles';
import { ERAS, eraTotals, markInfo, schoolOfRow, type CollegeIndex, type EraId, type SchoolRow } from '@/utils/collegeData';
import { Figure, nameOfKey, posOfKey, schoolColors, surname, useBestKnownClub, usePlayerMap } from './shared';

type Sort = 'drafted' | 'firsts' | 'active' | 'ovr';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'drafted', label: 'Drafted' },
  { value: 'firsts', label: '1st round' },
  { value: 'active', label: 'Active' },
  { value: 'ovr', label: 'Total OVR' },
];
const CARDS = 12;
const PAGE = 12;

/** A school's value for a sort in an era (active counts today's players, whatever the era) */
const valueOf = (r: SchoolRow, era: EraId, sort: Sort) => {
  if (sort === 'active') return r[11];
  const t = eraTotals(r, era);
  return sort === 'drafted' ? t[0] : sort === 'firsts' ? t[1] : t[2];
};

/**
 * Every school: a search, the era and sort chips, the top 12 as school cards in school colours (logo watermark, rank,
 * drafted, round 1, active, Hall of Famers, the best alumnus standing in his best-known club's kit), then the rest of the
 * leaderboard as slim rows with a bar in school colours, 12 more at a time.
 */
export const CollegeIndexView = ({ idx, onSchool }: { idx: CollegeIndex; onSchool: (slug: string) => void }) => {
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q.trim().toLowerCase());
  const [era, setEra] = useState<EraId>('all');
  const [sort, setSort] = useState<Sort>('drafted');
  const [shown, setShown] = useState(PAGE);
  const players = usePlayerMap();
  const clubOf = useBestKnownClub();
  const hits = useMemo(() => {
    if (!dq) return [];
    const words = dq.split(/\s+/);
    return idx.schools
      .filter((r) => words.every((w) => `${r[1]} ${r[2]}`.toLowerCase().split(/[^a-z0-9]+/).some((x) => x.startsWith(w))))
      .sort((a, b) => b[7] - a[7] || a[1].localeCompare(b[1]))
      .slice(0, 12);
  }, [dq, idx]);
  const board = useMemo(
    () =>
      idx.schools
        .map((r) => ({ r, v: valueOf(r, era, sort), t: eraTotals(r, era) }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.v - a.v || b.t[0] - a.t[0] || a.r[1].localeCompare(b.r[1])),
    [idx, era, sort],
  );
  const max = board[0]?.v || 1;
  const cards = board.slice(0, CARDS);
  const rows = board.slice(CARDS, CARDS + shown);
  const sortLabel = SORTS.find((s) => s.value === sort)?.label ?? '';

  return (
    <section aria-labelledby="cl-schools-title" className="cl-sec ci">
      <header className="ci__h">
        <div>
          <span className="ax-kicker">
            {idx.schools.length} schools · drafts {idx.years[0][0]}–{idx.latest}
          </span>
          <h2 id="cl-schools-title" className="cl-h2">
            The colleges
          </h2>
        </div>
        <label className="ci__search rv-search">
          <Search aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a school: Ohio State, Slippery Rock…" aria-label="Find a school" />
        </label>
      </header>
      {dq && (
        <ul className="ci-hits" aria-label="Schools found">
          {hits.length === 0 && <li className="cl-note">No school matches “{q}”.</li>}
          {hits.map((r) => {
            const info = markInfo(schoolOfRow(r));
            return (
              <li key={r[0]}>
                <button type="button" className="ci-hit" style={schoolColors(schoolOfRow(r))} onClick={() => onSchool(r[0])}>
                  {info && <CollegeMark info={info} size={30} />}
                  <span className="ci-hit__n">{r[1]}</span>
                  <span className="ci-hit__k">
                    {r[7]} drafted · {r[8]} in round 1 · {r[10]} on the site
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="ci__chips">
        <ArcadeToggle<EraId> size="sm" label="Era (draft year)" value={era} onChange={(e) => { setEra(e); setShown(PAGE); }} options={ERAS.map((e) => ({ value: e.id, label: e.label }))} />
        <ArcadeToggle<Sort> size="sm" label="Rank schools by" value={sort} onChange={(s) => { setSort(s); setShown(PAGE); }} options={SORTS} />
      </div>

      <Reveal as="ol" className="ci-cards" aria-label={`Top ${cards.length} schools by ${sortLabel}`}>
        {cards.map(({ r, t }, i) => {
          const s = schoolOfRow(r);
          const info = markInfo(s);
          const best = r[14] ?? null;
          const pl = best ? players.get(best[0]) : null;
          const club = clubOf(pl);
          return (
            <li key={r[0]} className="ci-card mo-rise" style={{ ...schoolColors(s), ...stag(Math.min(i, 10), 45) }}>
              <button type="button" className="ci-card__btn" onClick={() => onSchool(r[0])} aria-label={`${r[1]}: open the school page`}>
                <span className="cl-wm ci-card__wm" aria-hidden="true">
                  {info && <CollegeMark info={info} size={180} />}
                </span>
                <span className="ci-card__top">
                  <b className="ci-card__rk">{i + 1}</b>
                  <span className="ci-card__lg">{info && <CollegeMark info={info} size={28} />}</span>
                  <b className="ci-card__n">{r[1]}</b>
                </span>
                <span className="ci-card__st">
                  <span>
                    <b>{t[0]}</b>drafted
                  </span>
                  <span>
                    <b>{t[1]}</b>Rd 1
                  </span>
                  <span>
                    <b>{r[11]}</b>active
                  </span>
                  <span>
                    <b>{r[13] ?? 0}</b>HOF
                  </span>
                </span>
                {best && (
                  <>
                    <span className="ci-card__best">
                      <span className="ax-kicker">Best alumnus</span>
                      <b>{surname(nameOfKey(best[0]))}</b>
                      <em>
                        {posOfKey(best[0])} · OVR {best[1]}
                      </em>
                    </span>
                    <span className="ci-card__fig" aria-hidden="true">
                      <Figure player={pl} club={club} size="m" action="idle" logo={64} />
                    </span>
                  </>
                )}
              </button>
            </li>
          );
        })}
      </Reveal>

      {rows.length > 0 && (
        <div className="ci-lb">
          <div className="ci-row ci-row--h" aria-hidden="true">
            <span>#</span>
            <span>School</span>
            <span className="ci-hide-sm" />
            <span className={sort === 'drafted' ? 'is-on' : ''}>Drafted</span>
            <span className={sort === 'firsts' ? 'is-on' : ''}>Rd 1</span>
            <span className={sort === 'active' ? 'is-on' : ''}>Active</span>
            <span className={`ci-hide-sm${sort === 'ovr' ? ' is-on' : ''}`}>Total OVR</span>
          </div>
          <ol start={CARDS + 1} aria-label={`Schools ${CARDS + 1} to ${CARDS + rows.length} by ${sortLabel}`}>
            {rows.map(({ r, t, v }, i) => {
              const s = schoolOfRow(r);
              const info = markInfo(s);
              return (
                <li key={r[0]}>
                  <button
                    type="button"
                    className="ci-row"
                    style={schoolColors(s)}
                    onClick={() => onSchool(r[0])}
                    aria-label={`${CARDS + i + 1}. ${r[1]}: ${t[0]} drafted, ${t[1]} in round 1, ${r[11]} active. Open the school page`}
                  >
                    <span className="ci-row__rk">{CARDS + i + 1}</span>
                    <span className="ci-row__n">
                      {info && <CollegeMark info={info} size={24} />}
                      <b>{r[1]}</b>
                    </span>
                    <span className="ci-row__bar ci-hide-sm" aria-hidden="true">
                      <i style={{ width: `${Math.max(3, (v / max) * 100)}%` }} />
                    </span>
                    <b className={`ci-row__v${sort === 'drafted' ? ' is-on' : ''}`}>{t[0]}</b>
                    <span className={`ci-row__v${sort === 'firsts' ? ' is-on' : ''}`}>{t[1]}</span>
                    <span className={`ci-row__v${sort === 'active' ? ' is-on' : ''}`}>{r[11]}</span>
                    <span className={`ci-row__v ci-hide-sm${sort === 'ovr' ? ' is-on' : ''}`}>{t[2].toLocaleString()}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {board.length > CARDS + shown && (
        <button type="button" className="ci-more" onClick={() => setShown((n) => n + PAGE * 2)}>
          {CARDS + 1}–{CARDS + rows.length} of {board.length} · Show more
        </button>
      )}
      <p className="cl-foot flex items-center gap-1">
        Every pick since 1980, counted by draft year.
        <InfoTip>
          Drafted and first-rounders count every pick since 1980 by draft year; active counts today's players on the site whatever the era; total OVR adds up the
          career OVR of the school's players with a card on the site (by draft year, else first season), so it leans recent. Hall of Famers: real inductees from the
          draft file and the site. The best alumnus stands in the kit of the club he is best known for.
        </InfoTip>
      </p>
    </section>
  );
};
