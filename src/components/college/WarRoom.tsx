import PixelLoader from '@/components/ui/PixelLoader';
import { useEffect } from 'react';
import type { Player } from '@/types/player';
import { ArcadeToggle } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import TeamLogo from '@/components/brand/TeamLogo';
import { openTeamPage } from '@/utils/teamSearch';
import { usePlayoffOdds, type DraftSlot, type OddsClub } from '@/utils/playoffOdds';
import { useNeeds, type NeedRow, type NeedsFile } from '@/utils/collegeData';
import { getNFLTeamByAbbr } from './teamByAbbr';
import { cardVars, Figure, nameOfKey, usePlayerMap } from './shared';

export type WarRoomView = 'needs' | 'order';

/** A club's simulated slots as 32 thin bars (pick 1 on the left), the middle 90% lit, the most likely gold */
export const SlotBars = ({ d, label }: { d: DraftSlot; label: string }) => {
  const max = Math.max(...d.dist, 0.0001);
  return (
    <span className="wr-bars" role="img" aria-label={label}>
      {d.dist.map((p, i) => (
        <i key={i} className={i + 1 === d.mode ? 'is-mode' : i + 1 >= d.lo && i + 1 <= d.hi ? 'is-in' : ''} style={{ height: `${Math.max(p > 0 ? 8 : 0, (p / max) * 100)}%` }} />
      ))}
    </span>
  );
};

const recordOf = (c: OddsClub) => `${c.w}-${c.l}${c.t ? `-${c.t}` : ''}`;
/** The gap bar's full width: a unit this many SZN points under the league's average fills it */
const GAP_FULL = 30;

/**
 * The next draft's war room: the projected first round (the season simulations, scripts/nfl/playoff_odds.py) and each
 * club's needs (its depth chart's weakest units by the starters' SZN, scripts/nfl/college.py needs.json) on one board of
 * 32 club-colour slots. Each slot: the record and playoff odds, the most likely pick with the simulation bars, the need as
 * a position chip with the unit's SZN against the league and the oldest starter's age past the threshold, a gap bar, the
 * second need, and a starter from that unit standing in the club's kit. No prospects are named: there is no prospect data.
 */
const WarRoom = ({ focus, view, onView }: { focus?: string; view: WarRoomView; onView: (v: WarRoomView) => void }) => {
  const odds = usePlayoffOdds();
  const needs = useNeeds();
  const players = usePlayerMap();
  const ready = !!odds?.draft && needs !== undefined;
  useEffect(() => {
    if (!focus || !ready) return;
    const t = window.setTimeout(() => document.getElementById(`wr-${focus}`)?.scrollIntoView({ block: 'center' }), 140);
    return () => window.clearTimeout(t);
  }, [focus, ready]);
  if (!odds || needs === undefined) return <PixelLoader what="the war room" minHeight={420} />;
  if (!odds.draft) return <p className="cl-note">The playoff model has no draft projection yet.</p>;
  const { year, order, rule } = odds.draft;
  const groups = needs ? needs.groups.map((g) => g[0]).join(', ') : '';
  const live = odds.status === 'live';

  return (
    <section aria-labelledby="wr-title" className="cl-sec wr">
      <header className="wr__h">
        <div>
          <span className="ax-kicker">
            {odds.season} {live ? `after week ${odds.week - 1}` : 'final'} · {odds.sims.toLocaleString()} simulations{needs?.at ? ` · depth charts of ${needs.at}` : ''}
          </span>
          <h2 id="wr-title" className="cl-h2">
            The {year} war room
          </h2>
        </div>
        <ArcadeToggle<WarRoomView>
          size="sm"
          label="War room view"
          value={view}
          onChange={onView}
          options={[
            { value: 'needs', label: 'Order + needs' },
            { value: 'order', label: 'Order only' },
          ]}
        />
      </header>
      <aside className="wr-memo" aria-label="Honesty note">
        <span className="ax-kicker">Honesty note</span>
        <p>
          A needs-based projection, not real prospects: there is no {year} prospect data, so no player is named as a pick.
          {needs ? (
            <>
              {' '}
              Each slot's need is its weakest unit by the starters' SZN against the league ({groups}), plus a little for each year the oldest starter is past{' '}
              {needs.ageFrom}.{needs.unrated.length ? ` ${needs.unrated.join(', ')} has no season rating, so it is left out.` : ''}
            </>
          ) : null}{' '}
          {rule}
        </p>
      </aside>
      <Reveal as="ol" className={`wr-board${view === 'order' ? ' is-order' : ''}`} aria-label={`${year} first round, projected`}>
        {order.map((abbr, i) => (
          <Slot key={abbr} abbr={abbr} i={i} c={odds.clubs[abbr]} rows={needs?.clubs[abbr] ?? []} needs={needs} players={players} live={live} focus={focus === abbr} view={view} />
        ))}
      </Reveal>
      <p className="cl-foot">
        Sprite: a starter from the unit the club needs most, in its kit. Bars: each pick's share of the {odds.sims.toLocaleString()} simulated seasons, the middle 90%
        lit, the most likely gold. The order lists clubs by their average simulated slot, so two clubs can share a most likely pick. Contracts aren't used (the
        contract file stops in 2022).
      </p>
    </section>
  );
};

const Slot = ({
  abbr,
  i,
  c,
  rows,
  needs,
  players,
  live,
  focus,
  view,
}: {
  abbr: string;
  i: number;
  c: OddsClub | undefined;
  rows: NeedRow[];
  needs: NeedsFile | null;
  players: Map<string, Player>;
  live: boolean;
  focus: boolean;
  view: WarRoomView;
}) => {
  const t = getNFLTeamByAbbr(abbr);
  if (!t || !c?.draft) return null;
  const d = c.draft;
  const top = rows[0];
  const second = rows[1];
  const ageFrom = needs?.ageFrom ?? 30;
  // the unit's oldest starter when he is past the age line, else its first starter
  const starterKey = top ? (top.oldK && top.old && top.old > ageFrom ? top.oldK : top.st.find((k) => players.has(k)) ?? top.st[0]) : null;
  const starter = starterKey ? players.get(starterKey) ?? null : null;
  const gap = top ? Math.max(0, top.lg - top.szn) : 0;
  const withNeed = view === 'needs' && !!top;
  return (
    <li id={`wr-${abbr}`} className={`wr-slot mo-rise${focus ? ' is-focus' : ''}${withNeed ? '' : ' is-plain'}`} style={{ ...cardVars(t.name), ...stag(Math.min(i, 14), 28) }}>
      <span className="cl-wm wr-slot__wm" aria-hidden="true">
        <TeamLogo team={t.name} size={130} decorative />
      </span>
      <b className="wr-slot__no">{i + 1}</b>
      <span className="wr-slot__id">
        <button type="button" className="cl-cname wr-slot__club" onClick={() => openTeamPage(t.name)} aria-label={`${t.name}: open the team`}>
          {t.name}
        </button>
        <span>
          {recordOf(c)}
          {live ? ` · ${Math.round(c.playoffs * 100)}% playoffs` : ''}
        </span>
      </span>
      <span className="wr-slot__slot">
        <span>
          Most likely <b>{d.mode}</b> · range {d.lo}–{d.hi}
        </span>
        <SlotBars d={d} label={`${t.name}: most likely pick ${d.mode}, middle 90% from ${d.lo} to ${d.hi}`} />
      </span>
      {withNeed && starter && (
        <span className="wr-slot__fig" aria-hidden="true">
          <Figure player={starter} club={t.name} logo={40} />
        </span>
      )}
      {withNeed && (
        <span className="wr-slot__need">
          <b className="wr-chip" title={`Needs ${top.need}`}>
            {top.g}
          </b>
          <span className="wr-slot__why">
            unit SZN <b>{Math.round(top.szn)}</b> vs league {Math.round(top.lg)}
            {top.old && top.old > ageFrom ? ` · age ${top.old}` : ''}
          </span>
          <span className="wr-slot__gap" role="img" aria-label={`${Math.round(gap)} SZN points under the league's average`}>
            <i style={{ width: `${Math.min(100, (gap / GAP_FULL) * 100)}%` }} />
          </span>
          {second && <span className="wr-slot__also">then {second.g}</span>}
        </span>
      )}
      {withNeed && starterKey && <span className="sr-only">Starter shown: {nameOfKey(starterKey)}</span>}
    </li>
  );
};

export default WarRoom;
