import { useMemo, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { displayName } from '@/utils/displayName';
import { findNFLTeam } from '@/utils/nflTeams';
import TeamLogo from '@/components/timeline/TeamLogo';
import { ArcadeToggle, ClubStrip, PixelIcon, clubVars } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { INK_LABEL, INK_STATS, inkFor, streaksForClubSeason, useInk, useSeasonBoard, useStreaks, type AwardWin, type LeaderRow } from '@/utils/seasonBoards';
import { PlayerHit, PodiumStage, StarSprite, sitePos, splitKey } from './NflSeasonExtras';
import { SectionTitle } from './SeasonGames';
import './seasonLeaders.css';

/**
 * Season page, Leaders and awards (scripts/nfl/season_boards.py): the season's award winners standing on the stadium in
 * that season's kit, then top-5 boards for the headline stats with each leader's black ink (seasons led in a headline
 * stat, src/utils/seasonBoards.ts), and the streaks alive through the season. Real nflverse regular-season lines.
 */

const cv = (club?: string | null) => clubVars(club) as CSSProperties;
const ABBR: Record<string, string> = { LA: 'LAR', STL: 'LAR', OAK: 'LV', SD: 'LAC', WSH: 'WAS', JAC: 'JAX' };
const clubOf = (a: string) => findNFLTeam(ABBR[a] ?? a)?.name ?? a;

const AWARDS: { id: string; label: string }[] = [
  { id: 'mvp', label: 'MVP' },
  { id: 'opoy', label: 'Offensive POY' },
  { id: 'dpoy', label: 'Defensive POY' },
  { id: 'sbmvp', label: 'Super Bowl MVP' },
  { id: 'oroy', label: 'Offensive ROY' },
  { id: 'droy', label: 'Defensive ROY' },
  { id: 'cpoy', label: 'Comeback POY' },
];

const GROUPS = [
  { id: 'pass', label: 'Passing' },
  { id: 'rush', label: 'Rushing' },
  { id: 'rec', label: 'Receiving' },
  { id: 'def', label: 'Defense' },
] as const;

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const fmt = (v: number) => v.toLocaleString('en-US');

const AwardPlate = ({ kind, label, w, season, i }: { kind: string; label: string; w: AwardWin; season: number; i: number }) => (
  <li className="sl-award mo-pop" style={stag(i, 70)}>
    <PlayerHit name={w.n} pos={w.pos} playerKey={w.k} className="sl-award__hit" style={cv(w.team)}>
      <span className="sl-award__fig">
        <StarSprite name={w.n} pos={w.pos} team={w.team} size="m" season={season} celebrate={kind === 'mvp' || kind === 'sbmvp'} />
      </span>
      <span className={cn('sl-plate', kind === 'mvp' && 'sl-plate--gold')}>
        <span className="sl-plate__kick">
          <PixelIcon name={kind === 'mvp' ? 'crown' : kind === 'sbmvp' ? 'trophy' : 'star'} size={11} />
          {label}
        </span>
        <span className="sl-plate__name">{displayName(w.n)}</span>
        <span className="sl-plate__sub">
          <TeamLogo team={w.team} decorative className="h-4 w-4" />
          {w.pos} · {findNFLTeam(w.team)?.name ?? w.team}
        </span>
      </span>
    </PlayerHit>
  </li>
);

const InkPill = ({ k }: { k: string | null }) => {
  const f = useInk();
  if (!k || !f) return null;
  const by = inkFor(k);
  const n = Object.values(by).reduce((a, y) => a + y.length, 0);
  if (!n) return null;
  const detail = Object.entries(by)
    .map(([s, ys]) => `${INK_LABEL[s] ?? s} ${ys.length}`)
    .join(', ');
  return (
    <span className="sl-ink" title={`Black ink: ${n} league-leading seasons (${detail})`}>
      <i aria-hidden /> {n}
    </span>
  );
};

const Board = ({ stat, rows, season, i }: { stat: string; rows: LeaderRow[]; season: number; i: number }) => {
  const meta = INK_STATS.find((s) => s.id === stat)!;
  return (
    <section className="sl-board mo-rise" style={stag(i, 60)} aria-label={`${meta.label} leaders`}>
      <h4 className="sl-board__head" style={cv(rows[0]?.[3] ? clubOf(rows[0][3]) : null)}>
        <span>{meta.label}</span>
        <small>Top 5</small>
      </h4>
      <ol className="sl-board__rows">
        {rows.map(([k, name, pos, club, v, g], r) => (
          <li key={`${name}-${r}`} className={cn('sl-row', r === 0 && 'is-lead')}>
            <span className="sl-row__rank">{r + 1}</span>
            <PlayerHit name={name} pos={pos} playerKey={k} className="sl-row__who">
              <span className="sl-row__sprite">
                <StarSprite name={name} pos={pos} team={clubOf(club)} size="s" kind="bust" season={season} />
              </span>
              <ClubStrip club={clubOf(club)} size="sm">
                {displayName(name)}
              </ClubStrip>
            </PlayerHit>
            <InkPill k={k} />
            <span className="sl-row__val" title={`${g} games`}>
              {fmt(v)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
};

export const SeasonLeaders = ({ season, inProgress }: { season: number; inProgress: boolean }) => {
  const board = useSeasonBoard(season);
  const streakFile = useStreaks();
  const [group, setGroup] = useState<(typeof GROUPS)[number]['id']>('pass');
  const wins = useMemo(() => AWARDS.flatMap((a) => (board?.awards[a.id] ?? []).map((w) => ({ ...a, w }))), [board]);
  const through = streakFile ? Math.min(season, streakFile.last) : season;
  const streaks = useMemo(() => (streakFile ? streaksForClubSeason(null, through).slice(0, 8) : []), [streakFile, through]);
  if (!board) return null;
  const stats = INK_STATS.filter((s) => s.group === group && board.leaders[s.id]?.length);
  const lead = wins[0]?.w.team ?? board.leaders.pyds?.[0]?.[3];
  return (
    <div id="season-leaders" className="sx-block sl">
      <SectionTitle kicker={inProgress ? 'The season so far' : 'Final standings'} club={lead ? clubOf(lead) : null}>
        Leaders and awards
      </SectionTitle>
      {wins.length > 0 ? (
        <PodiumStage team={wins[0].w.team ? clubOf(wins[0].w.team) : ''}>
          <Reveal as="ul" className="sl-awards" aria-label="Award winners">
            {wins.map(({ id, label, w }, i) => (
              <AwardPlate key={`${id}-${w.n}`} kind={id} label={label} w={w} season={season} i={i} />
            ))}
          </Reveal>
        </PodiumStage>
      ) : (
        <p className="sx-note">Awards are announced after the Super Bowl.</p>
      )}
      <div className="sl-tabs">
        <ArcadeToggle label="Stat group" size="sm" value={group} onChange={(v) => setGroup(v as typeof group)} options={GROUPS.map((g) => ({ value: g.id, label: g.label }))} />
        <span className="sx-note">Regular season{inProgress ? ' so far' : ''}. The pill is a player&rsquo;s black ink: seasons he led the league in a headline stat.</span>
      </div>
      <Reveal className="sl-boards" key={group} style={{ ['--n' as string]: stats.length }}>
        {stats.map((s, i) => (
          <Board key={s.id} stat={s.id} rows={board.leaders[s.id]} season={season} i={i} />
        ))}
      </Reveal>
      {streaks.length > 0 && (
        <div className="sl-alive">
          <h4 className="sl-alive__head">
            Streaks alive<small>through {through}{inProgress || through !== season ? ' (last completed season)' : ''}</small>
          </h4>
          <ul className="sl-alive__list">
            {streaks.map((s) => {
              const [pos, name] = splitKey(s.key);
              return (
                <li key={`${s.id}-${s.key}`}>
                  <PlayerHit name={name} pos={sitePos(pos)} className="sl-alive__hit">
                    <ClubStrip club={clubOf(s.club)} size="sm">{displayName(s.name)}</ClubStrip>
                    <span className="sl-alive__txt">
                      <b>{ordinal(s.len)}</b> straight season of {s.label}
                    </span>
                  </PlayerHit>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SeasonLeaders;
