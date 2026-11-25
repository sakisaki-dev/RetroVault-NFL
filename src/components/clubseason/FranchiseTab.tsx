import PixelLoader from '@/components/ui/PixelLoader';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trophy } from 'lucide-react';
import { InfoTip } from '@/components/ui/InfoTip';
import { ClubStrip, PixelChip, PixelIcon, PixelPanel, SectionHeader } from '@/components/arcade';
import TeamLogo from '@/components/brand/TeamLogo';
import GameSprite from '@/components/GameSprite';
import ProPlayerBanner from '@/components/brand/ProPlayerBanner';
import RetiredRafters from '@/components/teams/RetiredRafters';
import StadiumWeather from '@/components/teams/StadiumWeather';
import TitlesTimeline from '@/components/teams/TitlesTimeline';
import PositionRadar from '@/components/teams/PositionRadar';
import { useTeamSummaries } from '@/components/teams/useTeamSummaries';
import { franchiseLeaders, positionStrength, tenureText, type FranchiseStop } from '@/components/teams/teamStats';
import { peekProps } from '@/components/peek/peekProps';
import type { Player } from '@/types/player';
import type { RingOfHonorEntry } from '@/utils/hallOfFame';
import { cn } from '@/lib/utils';
import { seasonLabel } from '@/config/edition';
import { isHallOfFamer } from '@/config/stats';
import { displayName } from '@/utils/displayName';
import { useGameSprites } from '@/utils/gameSprites';
import { useJerseyNumbers, type RetiredNumber } from '@/utils/jerseys';
import { latestSeasonYear, matchPlayerByName, useLeagueContent } from '@/utils/leagueContent';
import { useRafters } from '@/utils/rafters';
import { scrollToTeamRafters } from '@/utils/raftersLink';
import ClubStageHero from './ClubStageHero';
import PixelCup from '@/components/frontoffice/PixelCup';
import { Reveal, stag } from '@/components/motion/Reveal';
import './franchiseTab.css';

const LEGENDS_SHOWN = 8;

const stopYears = (l: FranchiseStop, last: number) => {
  if (l.approx) return null;
  if (last && l.from > last) return `Joins for ${seasonLabel(l.from)}`;
  return l.from === l.to ? `${seasonLabel(l.from)}` : `${seasonLabel(l.from)}–${l.to}`;
};

/**
 * The club page's Franchise tab: the club's all-time history (what Stats › Teams' sidebar sheet used to show) under the
 * club season sheet's own header. Super Bowl history, the stadium's weather, franchise icons, retired numbers and the
 * Ring of Honor, all-time strength by position, every notable player and the franchise leaders. The current roster and
 * the schedule live on the This season tab, so they are not repeated here.
 */
const FranchiseTab = ({ club, onPlayer, section }: { club: string; onPlayer: (p: Player) => void; section?: 'rafters' }) => {
  const { teams, records, coached: coachedMap, league, ovrFor } = useTeamSummaries();
  const summary = useMemo(() => teams.find((t) => t.team?.name === club || t.label === club) ?? null, [teams, club]);
  const record = summary ? records.get(summary.key) : undefined;
  const coached = summary ? coachedMap.get(summary.team?.id ?? summary.label) : undefined;
  const { content } = useLeagueContent();
  const lastSeason = latestSeasonYear(content);
  const t = summary?.team ?? null;
  const sprites = useGameSprites();
  const { numberFor, retiredFor, retiredInfo } = useJerseyNumbers();
  const { ringFor, players: leagueByKey } = useRafters();
  const [showAll, setShowAll] = useState(false);
  useEffect(() => setShowAll(false), [club]);
  useEffect(() => {
    if (section === 'rafters' && summary) scrollToTeamRafters();
  }, [section, summary]);

  const retired = summary ? retiredFor(t?.id ?? summary.label) : [];
  const legends = useMemo(() => {
    if (!summary) return [];
    const seen = new Set(summary.legends.map((l) => l.player));
    const extra = summary.players.filter((p) => !seen.has(p)).map((player) => ({ player, years: null as string | null, rings: [] as number[] }));
    return [...summary.legends.map((l) => ({ player: l.player, years: stopYears(l, lastSeason), rings: l.rings })), ...extra].sort(
      (a, b) => (b.player.careerLegacy || 0) - (a.player.careerLegacy || 0),
    );
  }, [summary, lastSeason]);
  const leaders = useMemo(() => (summary ? franchiseLeaders(summary.franchisePlayers) : []), [summary]);
  const strength = useMemo(() => (summary ? positionStrength(summary.franchisePlayers, league) : []), [summary, league]);
  const yearsFor = useCallback(
    (r: RetiredNumber) => {
      const note = content?.playerNotes && matchPlayerByName(r.name, content.playerNotes);
      return note?.era?.match(/~?Y\d+(?:\s*[–-]\s*Y?\d+)?/)?.[0];
    },
    [content],
  );
  const openRetired = (r: RetiredNumber) => {
    const p = summary?.franchisePlayers.find((x) => `${x.position}:${displayName(x.name)}` === r.playerKey) ?? (r.playerKey ? leagueByKey.get(r.playerKey) : undefined);
    if (p) onPlayer(p);
  };
  const openRing = (e: RingOfHonorEntry) => {
    const p = leagueByKey.get(`${e.pos}:${displayName(e.name)}`);
    if (p) onPlayer(p);
  };

  if (!summary) return <PixelLoader what={`the ${club} franchise`} minHeight={420} />;
  const name = t?.name ?? summary.label;
  const sbChips = record
    ? [...record.titleYears.map((y) => ({ y, won: true })), ...record.lossYears.map((y) => ({ y, won: false }))].sort((a, b) => a.y - b.y)
    : [];
  const shown = showAll ? legends : legends.slice(0, LEGENDS_SHOWN);

  return (
    <div className="ft" data-club-tab="franchise">
      {record && (
        <ClubStageHero
          club={name}
          kicker={t ? `${t.city} · ${t.conference} ${t.division}` : 'Franchise'}
          title={name}
          players={legends.slice(0, 22).map((l) => ({ player: l.player, badge: Math.round(l.player.careerLegacy || 0).toLocaleString() }))}
          champion={record.titles > 0}
          led={{ label: record.titles === 1 ? 'Super Bowl title' : 'Super Bowl titles', value: String(record.titles), sub: `${record.appearances} appearances · power #${record.powerRank}` }}
          tiles={[
            { value: record.appearances, label: 'SB apps' },
            { value: record.hof.length, label: 'Hall of Famers' },
            { value: record.powerRank, prefix: '#', label: 'All-time power' },
            ...(record.bestOvr != null ? [{ value: Math.round(Number(record.bestOvr)), label: 'Best OVR' }] : []),
          ]}
          onPlayer={onPlayer}
        >
          {sbChips.length > 0 && (
            <ul className="ft-sbs" aria-label="Super Bowl appearances">
              {sbChips.map(({ y, won }) => (
                <li key={`${y}-${won}`} className={won ? 'is-won' : ''}>
                  <PixelIcon name="trophy" size={11} color={won ? 'hsl(var(--gold))' : 'rgba(255,255,255,.7)'} />
                  {seasonLabel(y)}
                  <span className={won ? 'sr-only' : ''}>{won ? ' won' : ' L'}</span>
                </li>
              ))}
            </ul>
          )}
          {coached && (
            <p className="ft-coached">
              <b>Coached here</b>
              <span>{tenureText(coached.stints)} · {coached.w}–{coached.l}{coached.t ? `–${coached.t}` : ''} · {coached.titles} {coached.titles === 1 ? 'title' : 'titles'}</span>
            </p>
          )}
        </ClubStageHero>
      )}

      <div className="ft-body">
        {record && (
          <section aria-labelledby="titles-timeline">
            <SectionHeader as="h3" kicker="Franchise" title="Super Bowl history" club={name} className="mb-2" />
            {record.titleYears.length > 0 && (
              <Reveal as="ul" className="ft-case" aria-label="Super Bowl titles">
                {record.titleYears.map((y, i) => (
                  <li key={y} className="mo-pop" style={stag(i, 70)}>
                    <PixelCup band={t?.primaryColor ?? '43 100% 50%'} spark={i} className="ft-case__cup" />
                    <b className="num">{seasonLabel(y)}</b>
                  </li>
                ))}
              </Reveal>
            )}
            <TitlesTimeline teamName={summary.label} primary={t?.primaryColor ?? '226 33% 30%'} titleYears={record.titleYears} lossYears={record.lossYears} coachedYears={coached?.years ?? []} years={lastSeason || undefined} />
          </section>
        )}
        <StadiumWeather teamName={name} accent="hsl(var(--gold))" />
        {legends.length > 0 && (
          <section aria-labelledby="franchise-icons">
            <SectionHeader as="h3" kicker="Best of the franchise" title="Franchise icons" club={name} className="mb-2" />
            <Reveal as="ul" className="ft-icons">
              {legends.slice(0, 3).map((l, i) => (
                <li key={`${l.player.position}:${displayName(l.player.name)}`} className="mo-rise" style={stag(i, 80)}>
                  <button
                    type="button"
                    onClick={() => onPlayer(l.player)}
                    {...peekProps(l.player)}
                    className="ft-icon"
                    aria-label={`Number ${i + 1} franchise icon: ${displayName(l.player.name)}, ${l.player.position}, ${Math.round(l.player.careerLegacy || 0).toLocaleString()} Career Legacy. Open player`}
                  >
                    <span className="ft-icon__n" aria-hidden="true">{i + 1}</span>
                    <span className="ft-icon__wm" aria-hidden="true"><TeamLogo team={name} size={90} decorative /></span>
                    <span className="ft-icon__sp" aria-hidden="true">{sprites ? <GameSprite player={l.player} team={name} kind="figure" size="s" /> : <TeamLogo team={name} size={56} decorative />}</span>
                    <span className="ft-icon__t" aria-hidden="true">
                      <b>{displayName(l.player.name)}</b>
                      <small>{l.player.position}{l.years ? ` · ${l.years}` : ''}</small>
                      <em className="num">{Math.round(l.player.careerLegacy || 0).toLocaleString()}</em>
                    </span>
                  </button>
                </li>
              ))}
            </Reveal>
          </section>
        )}
        <RetiredRafters team={t} retired={retired} yearsFor={yearsFor} onSelect={openRetired} ring={ringFor(t)} onRing={openRing} />
        {summary.franchisePlayers.length > 0 && (
          <section aria-labelledby="position-strength">
            <SectionHeader as="h3" kicker="By position" title="All-time strength" club={name} className="mb-1" />
            <p className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
              Best ever at each position
              <InfoTip>As a league percentile of Career Legacy at that position.</InfoTip>
            </p>
            <PositionRadar teamName={summary.label} primary={t?.primaryColor ?? '226 33% 30%'} rows={strength} onSelect={onPlayer} />
          </section>
        )}

        {legends.length > 0 && (
          <section aria-labelledby="franchise-legends">
            <SectionHeader as="h3" kicker={`${legends.length} players`} title="Notable players" club={name} className="mb-2" />
            <ul className="grid gap-3 sm:grid-cols-2">
              {shown.map((l) => {
                const ret = retiredInfo(l.player);
                return (
                  <li key={`${l.player.position}:${displayName(l.player.name)}`} className="min-w-0">
                    <button
                      type="button"
                      {...peekProps(l.player)}
                      onClick={() => onPlayer(l.player)}
                      className="group flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card text-left hover:border-line"
                      aria-label={`${displayName(l.player.name)}, ${l.player.position}${l.years ? `, here ${l.years}` : ''}${l.rings.length ? `, ${l.rings.length} ${l.rings.length === 1 ? 'ring' : 'rings'} here` : ''}, ${Math.round(l.player.careerLegacy || 0).toLocaleString()} Career Legacy. Open player`}
                    >
                      <ProPlayerBanner
                        size="card"
                        name={displayName(l.player.name)}
                        position={l.player.position}
                        team={t ?? summary.label}
                        number={numberFor(l.player)}
                        ovr={ovrFor(l.player)}
                        hallOfFamer={isHallOfFamer(l.player)}
                        retiredBy={ret?.teamLabel ?? null}
                        interactive
                        className="rounded-b-none"
                      />
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs text-muted-foreground" aria-hidden="true">
                        {l.years && <span className="font-semibold text-foreground">{l.years}</span>}
                        {l.rings.length > 0 && <span className="inline-flex items-center gap-1 text-gold"><Trophy className="h-3 w-3" /> {l.rings.length} here</span>}
                        <span className="ml-auto font-mono tabular-nums">{Math.round(l.player.careerLegacy || 0).toLocaleString()} legacy</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {legends.length > LEGENDS_SHOWN && (
              <PixelChip className="mt-3 w-full justify-center" pressed={showAll} onClick={() => setShowAll((v) => !v)}>
                {showAll ? `Show top ${LEGENDS_SHOWN}` : `Show all ${legends.length}`}
              </PixelChip>
            )}
          </section>
        )}

        {leaders.length > 0 && (
          <section aria-labelledby="franchise-leaders">
            <SectionHeader as="h3" kicker="Career totals" title="Franchise leaders" club={name} className="mb-2" />
            <Reveal as="ul" className="ft-leaders">
              {leaders.map(({ stat, top }, si) => (
                <li key={stat.key} className="ft-ld mo-rise" style={stag(si, 40)}>
                  <span className="ft-ld__wm" aria-hidden="true"><TeamLogo team={name} size={110} decorative /></span>
                  <p className="ft-ld__k">{stat.label}</p>
                  <button type="button" className="ft-ld__top" onClick={() => onPlayer(top[0].player)} {...peekProps(top[0].player)} aria-label={`${stat.label} leader: ${displayName(top[0].player.name)}, ${top[0].value.toLocaleString()}. Open player`}>
                    {sprites && <span className="ft-ld__sp" aria-hidden="true"><GameSprite player={top[0].player} team={name} kind="bust" size="s" /></span>}
                    <span className="ft-ld__who"><b>{displayName(top[0].player.name)}</b><small>{top[0].player.position}</small></span>
                    <span className="ft-ld__v num">{top[0].value.toLocaleString()}</span>
                  </button>
                  <ol>
                    {top.slice(1).map(({ player, value }, i) => (
                      <li key={`${player.position}:${displayName(player.name)}`}>
                        <span className="num">{i + 2}</span>
                        <ClubStrip club={name} size="sm" logo={false} onClick={() => onPlayer(player)} {...peekProps(player)}>
                          {displayName(player.name)} <small>{player.position}</small>
                        </ClubStrip>
                        <b className="num">{value.toLocaleString()}</b>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </Reveal>
          </section>
        )}
      </div>
    </div>
  );
};

export default FranchiseTab;
