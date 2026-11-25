import { useMemo, useState } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import TeamLogo from '@/components/brand/TeamLogo';
import { SectionHeader } from '@/components/arcade';
import { ClubPicker } from '@/components/controls';
import FootballLoader from '@/components/motion/FootballLoader';
import { Reveal, stag } from '@/components/motion/Reveal';
import { PlayerHit, StarSprite } from '@/components/season/NflSeasonExtras';
import { useGameSprites } from '@/utils/gameSprites';
import { useCareerSeasons, type CareerSeasonsFile } from '@/utils/careerSeasons';
import { normalizeName, usePlayerExtras, type PlayerStints } from '@/utils/playerExtras';
import { findNFLTeam } from '@/utils/nflTeams';
import { getReadableTextOn } from '@/utils/teamColors';
import { displayName } from '@/utils/displayName';
import { useAllTimeRecords } from './allTime';
import type { TeamSummary } from '../teamStats';
import './franchiseLeaders.css';

interface StatDef {
  key: string;
  label: string;
  unit: string;
  /** (position group, field) pairs summed for a player at that group */
  fields: Partial<Record<string, string[]>>;
}
const STATS: StatDef[] = [
  { key: 'pass', label: 'Passing yards', unit: 'yds', fields: { QB: ['yds'] } },
  { key: 'rush', label: 'Rushing yards', unit: 'yds', fields: { RB: ['ryds'], QB: ['ryds'] } },
  { key: 'rec', label: 'Receiving yards', unit: 'yds', fields: { WR: ['yds'], TE: ['yds'], RB: ['recyds'] } },
  { key: 'sck', label: 'Sacks', unit: 'sacks', fields: { DEF: ['sck'] } },
  { key: 'int', label: 'Interceptions', unit: 'INT', fields: { DEF: ['int'] } },
];
const GROUP: Record<string, string> = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', OL: 'OL', DL: 'DEF', LB: 'DEF', DB: 'DEF' };

interface Leader {
  player: Player;
  value: number;
}
type Board = Map<string, Map<string, Leader[]>>;

/** The club a player was with in a season, from his stints; null when two clubs overlap that year (a mid-season move) or none. */
const clubIn = (st: PlayerStints | undefined, year: number): string | null => {
  if (!st) return null;
  const hit = new Set(st.stints.filter((s) => s.from <= year && year <= s.to).map((s) => findNFLTeam(s.team)?.name ?? s.team));
  return hit.size === 1 ? [...hit][0] : null;
};

/** Per club, per stat: each player's total with that club, the change in his season-end career totals over the seasons he spent there. */
const buildBoards = (data: CareerSeasonsFile, league: Player[], stints: Record<string, PlayerStints>, last: number): Board => {
  const board: Board = new Map();
  league.forEach((p) => {
    if (p.isRealLegend) return;
    const rec = data.players[`${p.position}:${displayName(p.name)}`];
    const group = GROUP[p.position];
    const st = stints[normalizeName(p.name)];
    if (!rec || !group || !st) return;
    const names = data.fields[group];
    if (!names) return;
    const totals = new Map<string, Map<string, number>>();
    rec.rows.forEach((row, i) => {
      const year = rec.from + i;
      if (!row || year > last) return;
      const prev = i === 0 ? null : rec.rows[i - 1];
      // the first recorded season's row is his career to date: only a player who began that year (17 games or fewer) counts
      if (i === 0 && year === data.seasons[0]) {
        const g = names.indexOf('g');
        if (g < 0 || ((row[5 + g] as number | null) ?? 0) > 17) return;
      }
      if (i > 0 && !prev) return;
      const club = clubIn(st, year);
      if (!club) return;
      STATS.forEach((s) =>
        s.fields[group]?.forEach((f) => {
          const at = names.indexOf(f);
          if (at < 0) return;
          const now = (row[5 + at] as number | null) ?? 0;
          const before = prev ? ((prev[5 + at] as number | null) ?? 0) : 0;
          const d = now - before;
          if (d <= 0) return;
          const m = totals.get(club) ?? new Map<string, number>();
          m.set(s.key, (m.get(s.key) ?? 0) + d);
          totals.set(club, m);
        }),
      );
    });
    totals.forEach((m, club) =>
      m.forEach((value, stat) => {
        const cm = board.get(club) ?? new Map<string, Leader[]>();
        cm.set(stat, [...(cm.get(stat) ?? []), { player: p, value }]);
        board.set(club, cm);
      }),
    );
  });
  board.forEach((cm) => cm.forEach((l, k) => cm.set(k, l.sort((a, b) => b.value - a.value).slice(0, 3))));
  return board;
};

/**
 * Franchise leaders: pick a club, see who leads it in passing, rushing and receiving yards, sacks and interceptions.
 * A player's total is what he put up in the seasons he spent with that club (his stints against his season-end career
 * lines); a season split between two clubs is left out.
 */
const FranchiseLeaders = ({ teams, league }: { teams: TeamSummary[]; league: Player[] }) => {
  const data = useCareerSeasons();
  const extras = usePlayerExtras();
  const allTime = useAllTimeRecords();
  const sprites = useGameSprites();
  const clubs = useMemo(() => teams.filter((t) => t.team).sort((a, b) => a.team!.name.localeCompare(b.team!.name)), [teams]);
  const [picked, setPicked] = useState<string | null>(null);
  const board = useMemo(() => (data && allTime ? buildBoards(data, league, extras.stints, allTime.to) : null), [data, league, extras.stints, allTime]);
  const club = clubs.find((c) => c.team!.name === picked)?.team ?? clubs[0]?.team;
  if (club && !board) return <FootballLoader ready={false} minHeight={360} what="franchise leaders" label="Leaders" />;
  if (!club || !board) return null;
  const mine = board.get(club.name);
  const cards = STATS.map((s) => ({ s, rows: mine?.get(s.key) ?? [] })).filter((c) => c.rows.length > 0);
  const secondary = club.secondaryColor !== club.primaryColor ? club.secondaryColor : '226 33% 18%';
  return (
    <section aria-labelledby="fl-heading" className="fl space-y-3" style={{ ['--p' as string]: `hsl(${club.primaryColor})`, ['--s' as string]: `hsl(${secondary})` }}>
      <SectionHeader kicker={`${club.city} ${club.name}`} title={<span id="fl-heading">Franchise leaders</span>} club={club.name} />
      <ClubPicker label="Club" allLabel={null} value={club.abbreviation} onChange={(a) => { const c = clubs.find((x) => x.team!.abbreviation === a); if (c) setPicked(c.team!.name); }} />
      {cards.length === 0 ? (
        <p className="sx-note">No career totals on record for this club yet.</p>
      ) : (
        <Reveal as="ul" className="fl-grid">
          {cards.map(({ s, rows }, i) => {
            const [first, ...rest] = rows;
            return (
              <li key={s.key} className="fl-card mo-rise" style={{ ...stag(i, 50), color: getReadableTextOn(club.primaryColor), background: `linear-gradient(155deg, hsl(${club.primaryColor}) 0%, hsl(${club.primaryColor}) 55%, hsl(${secondary}) 150%)` }}>
                <span aria-hidden className="fl-bg">
                  <TeamLogo team={club} size={150} decorative />
                </span>
                <p className="fl-kick">{s.label}</p>
                <PlayerHit name={first.player.name} pos={first.player.position} className="fl-top" label={`Open ${displayName(first.player.name)}'s Deep Dive`}>
                  <span className="fl-fig" aria-hidden>
                    {sprites ? <StarSprite name={first.player.name} pos={first.player.position} team={club.name} size="s" /> : <TeamLogo team={club} size={44} decorative />}
                  </span>
                  <span className="fl-who">
                    <b>{displayName(first.player.name)}</b>
                    <span className="fl-val">
                      {first.value.toLocaleString()} <small>{s.unit}</small>
                    </span>
                  </span>
                </PlayerHit>
                {rest.length > 0 && (
                  <ol className="fl-rest">
                    {rest.map((r, k) => (
                      <li key={r.player.name + r.player.position}>
                        <span>{k + 2}</span>
                        <PlayerHit name={r.player.name} pos={r.player.position} className="fl-name">
                          {displayName(r.player.name)}
                        </PlayerHit>
                        <em>{r.value.toLocaleString()}</em>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            );
          })}
        </Reveal>
      )}
      <p className="sx-note">
        Totals with this club{allTime ? `, ${allTime.from}–${allTime.to}` : ''}
        <InfoTip>The seasons a player spent here, from his season-end career lines. A season split between two clubs is left out, and so is the first season (1999) for anyone who played before it.</InfoTip>
      </p>
    </section>
  );
};

export default FranchiseLeaders;
