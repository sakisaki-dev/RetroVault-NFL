import { useEffect, useMemo } from 'react';
import PixelLoader from '@/components/ui/PixelLoader';
import { SectionHeader } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import TeamLogo from '@/components/brand/TeamLogo';
import ClubStrip from '@/components/brand/ClubStrip';
import { getNFLTeamByAbbr } from './teamByAbbr';
import { usePlayoffOdds, type DraftSlot, type OddsClub, type PlayoffOdds } from '@/utils/playoffOdds';
import { openTeamPage } from '@/utils/teamSearch';
import { useNeeds, type NeedRow, type NeedsFile } from '@/utils/collegeData';
import { clubColors, Figure, PickName, usePlayerMap } from './shared';

/** A club's simulated slots as 32 thin bars (pick 1 on the left), the range lit */
export const SlotBars = ({ d, label }: { d: DraftSlot; label: string }) => {
  const max = Math.max(...d.dist, 0.0001);
  return (
    <span className="cl-slots" role="img" aria-label={label}>
      {d.dist.map((p, i) => (
        <i key={i} className={i + 1 >= d.lo && i + 1 <= d.hi ? (i + 1 === d.mode ? 'is-mode' : 'is-in') : ''} style={{ height: `${Math.max(p > 0 ? 8 : 0, (p / max) * 100)}%` }} />
      ))}
    </span>
  );
};

const rangeText = (d: DraftSlot) => (d.lo === d.hi ? `pick ${d.mode}` : `pick ${d.mode}, range ${d.lo}–${d.hi}`);
const recordOf = (c: OddsClub) => `${c.w}-${c.l}${c.t ? `-${c.t}` : ''}`;

/** "EDGE unit SZN 61, league 86, oldest starter 33" (the reason in brackets after the need) */
const needLine = (n: NeedRow, ageFrom: number) =>
  `${n.g} unit SZN ${Math.round(n.szn)}, league ${Math.round(n.lg)}${n.old && n.old > ageFrom ? `, oldest starter ${n.old}` : ''}`;

const useFocusClub = (club: string | undefined, ready: boolean, prefix: string) =>
  useEffect(() => {
    if (!club || !ready) return;
    const t = window.setTimeout(() => document.getElementById(`${prefix}-${club}`)?.scrollIntoView({ block: 'center' }), 120);
    return () => window.clearTimeout(t);
  }, [club, ready, prefix]);

/** The next draft's projected first round from the season simulations (playoff_odds.json) */
export const ProjectedOrder = ({ focus, onMock }: { focus?: string; onMock: (club?: string) => void }) => {
  const odds = usePlayoffOdds();
  useFocusClub(focus, !!odds?.draft, 'cl-ord');
  if (!odds) return <PixelLoader label="Order" what="the projections" size="sm" minHeight={200} className="justify-start pt-8" />;
  if (!odds.draft) return <p className="cl-note">The playoff model has no draft projection yet.</p>;
  const { year, order, rule } = odds.draft;
  return (
    <section aria-labelledby="cl-order-title" className="cl-sec">
      <SectionHeader
        as="h2"
        kicker={`${odds.season} ${odds.status === 'live' ? `after week ${odds.week - 1}` : 'final'} · ${odds.sims.toLocaleString() || 'final'} simulations`}
        title={<span id="cl-order-title">{year} draft order, projected</span>}
        right={<button type="button" className="cl-linkbtn" onClick={() => onMock()}>Needs mock →</button>}
      />
      <p className="cl-callout">
        {rule}
      </p>
      <Reveal as="ol" className="cl-order">
        {order.map((abbr, i) => {
          const c = odds.clubs[abbr];
          const t = getNFLTeamByAbbr(abbr);
          if (!c?.draft || !t) return null;
          return (
            <li key={abbr} id={`cl-ord-${abbr}`} className={`cl-orow mo-rise${focus === abbr ? ' is-focus' : ''}`} style={{ ...clubColors(t.name), ...stag(Math.min(i, 14), 25) }}>
              <span className="cl-orow__no"><b>{i + 1}</b></span>
              <span className="cl-orow__club">
                <ClubStrip team={t.name} size="sm" onClick={() => openTeamPage(t.name)} ariaLabel={`${t.name}: open the team`} />
                <span className="cl-orow__rec">{recordOf(c)}{odds.status === 'live' ? ` · ${Math.round(c.playoffs * 100)}% playoffs` : ''}</span>
              </span>
              <span className="cl-orow__slot">
                <span className="cl-orow__mode">Most likely <b>{c.draft.mode}</b></span>
                <span className="cl-orow__range">range {c.draft.lo}–{c.draft.hi}</span>
              </span>
              <SlotBars d={c.draft} label={`${t.name}: most likely pick ${c.draft.mode}, middle 90% from ${c.draft.lo} to ${c.draft.hi}`} />
            </li>
          );
        })}
      </Reveal>
      <p className="cl-foot">
        The order lists clubs by their average simulated slot, so two clubs can share a most likely pick. Bars: each pick's share of the {odds.sims.toLocaleString()} simulated
        seasons, the middle 90% lit, the most likely gold.
      </p>
    </section>
  );
};

const NeedPick = ({ abbr, i, odds, needs, players, focus }: { abbr: string; i: number; odds: PlayoffOdds; needs: NeedsFile; players: ReturnType<typeof usePlayerMap>; focus?: string }) => {
  const t = getNFLTeamByAbbr(abbr);
  const c = odds.clubs[abbr];
  const rows = needs.clubs[abbr] ?? [];
  if (!t || !c?.draft) return null;
  const top = rows[0];
  const old = top?.oldK ? players.get(top.oldK) : null;
  const starter = top ? players.get(top.st.find((k) => k === top.oldK) ?? top.st[0]) : null;
  return (
    <li id={`cl-mock-${abbr}`} className={`cl-mock mo-rise${focus === abbr ? ' is-focus' : ''}`} style={{ ...clubColors(t.name), ...stag(Math.min(i, 12), 30) }}>
      <span className="cl-mock__band">
        <span className="cl-mock__no">{i + 1}</span>
        <TeamLogo team={t.name} size={40} decorative />
        <span className="cl-mock__club">
          <b>{t.name}</b>
          <small>{rangeText(c.draft)}</small>
        </span>
      </span>
      {top ? (
        <span className="cl-mock__pick">
          <span className="cl-mock__fig" aria-hidden="true">
            <Figure player={starter ?? old} club={t.name} kind="bust" size="m" logo={36} />
          </span>
          <span className="cl-mock__need">
            <span className="ax-kicker">The need</span>
            <b className="cl-mock__pos">{top.g}</b>
            <span className="cl-mock__say">
              {t.name} at {i + 1}: needs {top.need} ({needLine(top, needs.ageFrom)})
            </span>
            {top.oldK && top.old && top.old > needs.ageFrom && (
              <span className="cl-mock__old">
                Oldest starter: <PickName name={top.oldK.split(':').slice(1).join(':')} siteKey={top.oldK} club={t.name} /> ({top.old})
              </span>
            )}
          </span>
        </span>
      ) : (
        <span className="cl-note">No rated starters on file.</span>
      )}
      {rows.length > 1 && (
        <span className="cl-mock__also">
          Also: {rows.slice(1, 3).map((r) => `${r.g} (SZN ${Math.round(r.szn)})`).join(' · ')}
        </span>
      )}
    </li>
  );
};

/** The needs-based mock: the projected order with each club's biggest positional need as its "pick" (no prospects) */
export const NeedsMock = ({ focus, onOrder }: { focus?: string; onOrder: () => void }) => {
  const odds = usePlayoffOdds();
  const needs = useNeeds();
  const players = usePlayerMap();
  useFocusClub(focus, !!odds?.draft && !!needs, 'cl-mock');
  const groups = useMemo(() => (needs ? needs.groups.map((g) => g[0]).join(', ') : ''), [needs]);
  if (!odds || needs === undefined) return <PixelLoader label="Needs" what="team needs" size="sm" minHeight={200} className="justify-start pt-8" />;
  if (!odds.draft || !needs) return <p className="cl-note">No needs file yet.</p>;
  return (
    <section aria-labelledby="cl-mock-title" className="cl-sec">
      <SectionHeader
        as="h2"
        kicker={`Depth charts of ${needs.at ?? needs.season}`}
        title={<span id="cl-mock-title">{odds.draft.year} mock draft-ish: the needs</span>}
        right={<button type="button" className="cl-linkbtn" onClick={onOrder}>Projected order →</button>}
      />
      <p className="cl-callout cl-callout--warn">
        A needs-based projection, not real prospects: there is no {odds.draft.year} prospect data, so no player is named as a pick. Each club's "pick" is its biggest
        positional need from its current depth chart: the starters' average SZN at each spot ({groups}) against the league's, in standard deviations, plus a
        little for each year the oldest starter is past {needs.ageFrom}. {needs.unrated.length ? `${needs.unrated.join(', ')} has no season rating in the data, so it is left out. ` : ''}
        Contracts aren't used (the contract file stops in 2022).
      </p>
      <Reveal as="ol" className="cl-mocks">
        {odds.draft.order.map((abbr, i) => (
          <NeedPick key={abbr} abbr={abbr} i={i} odds={odds} needs={needs} players={players} focus={focus} />
        ))}
      </Reveal>
    </section>
  );
};
