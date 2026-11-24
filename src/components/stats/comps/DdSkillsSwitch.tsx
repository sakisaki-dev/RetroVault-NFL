import { useMemo, useState } from 'react';
import type { Player } from '@/types/player';
import { seasonLabel } from '@/config/edition';
import { playerKey, seasonPlayerOf, type SeasonOvrFile } from '@/config/ovr';
import { careerPool, careerPoolLabel, seasonPoolLabel, foldAdvanced, gradeFor, ovrFromPercentile, percentileOf, playerSkillGrades, tierFor } from '@/config/skillGrades';
import { careerRatingOf } from '@/config/ovr';
import { advancedPcts, useAdvanced } from '@/utils/nflAdvanced';
import { cn } from '@/lib/utils';
import DdSkills from './DdSkills';
import DdAdvancedFactors from './DdAdvancedFactors';
import { IS_NFL } from '@/config/edition';

interface Props {
  player: Player;
  /** CAR: his career OVR */
  car: number | undefined;
  /** League players (career) */
  players: Player[];
  seasonOvr: SeasonOvrFile | null;
  onOpenPlayer: (p: Player) => void;
}

/**
 * Skill ratings with a This season / Career switch (owner, 2026-11-23). Default: This season for an active player who
 * played it, Career for a retiree. The season grades rank his season's per-game rates against everyone at his position
 * who played that season (same traits, same curve); a stat the season line lacks shows "no data".
 */
const DdSkillsSwitch = ({ player, car, players, seasonOvr, onOpenPlayer }: Props) => {
  const key = playerKey(player);
  const line = seasonOvr?.lines?.[key];
  const hasSeason = !!line && player.status === 'Active';
  const [mode, setMode] = useState<'season' | 'career' | null>(null);
  const shown = mode ?? (hasSeason ? 'season' : 'career');

  const seasonPlayers = useMemo(() => {
    const lines = seasonOvr?.lines;
    if (!lines) return [] as Player[];
    return players.flatMap((p) => (lines[playerKey(p)] ? [seasonPlayerOf(p, lines[playerKey(p)])] : []));
  }, [players, seasonOvr]);

  const career = useMemo(() => playerSkillGrades(players, player), [players, player]);
  const seasonMe = useMemo(() => seasonPlayers.find((p) => playerKey(p) === key) ?? null, [seasonPlayers, key]);
  const season = useMemo(() => (seasonMe ? playerSkillGrades(seasonPlayers, seasonMe) : null), [seasonPlayers, seasonMe]);

  const useSeason = shown === 'season' && !!season && !!seasonMe;
  const base = useSeason ? season! : career;
  // NFL: the advanced factors of the shown scope count as much as the classic traits (skillGrades.ts foldAdvanced)
  const adv = useAdvanced(player.position);
  const scope = useSeason ? String(seasonOvr?.season) : 'c';
  // The career overall is the classic overall folded with the advanced factors, then RE-RANKED among the qualified
  // starters (the fold of two percentiles squeezes toward the middle, so S would otherwise be rare): S stays the top 10%.
  const foldedPool = useMemo(() => {
    const set = useSeason ? seasonPlayers : players;
    const pool = IS_NFL && adv ? careerPool(set, player.position) : null;
    if (!pool) return null;
    return pool
      .map((p) => foldAdvanced(playerSkillGrades(set, p).overall, advancedPcts(adv, playerKey(p), useSeason ? String(seasonOvr?.season) : 'c'))?.pct)
      .filter((x): x is number => typeof x === 'number')
      .sort((a, b) => a - b);
  }, [adv, useSeason, players, seasonPlayers, seasonOvr, player.position]);
  const grades = useMemo(() => {
    if (!(IS_NFL && adv)) return base;
    const folded = foldAdvanced(base.overall, advancedPcts(adv, key, scope));
    if (!folded || !foldedPool) return { ...base, overall: folded };
    const pct = percentileOf(foldedPool, folded.pct);
    const grade = gradeFor(pct) ?? folded.grade;
    return { ...base, overall: { ...folded, pct, rating: ovrFromPercentile(pct), grade, tier: tierFor(grade) } };
  }, [base, adv, key, scope, foldedPool]);
  const label = seasonOvr ? seasonLabel(seasonOvr.season) : 'This season';

  return (
    <div className="space-y-3">
      {hasSeason && (
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Skill ratings basis" className="inline-flex overflow-hidden rounded-lg border border-line text-xs">
            {(['season', 'career'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={shown === m}
                onClick={() => setMode(m)}
                className={cn('px-3 py-1.5 font-display font-bold uppercase tracking-wide', shown === m ? 'bg-gold/20 text-gold' : 'text-muted-foreground hover:text-foreground')}
              >
                {m === 'season' ? `This season (${label})` : 'Career'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {useSeason
              ? `Graded on ${label}${seasonOvr?.live ? ' so far' : ''} alone, against ${player.position}s with ${seasonPoolLabel(seasonPlayers, player.position) ?? 'a game'}.`
              : 'Graded on his whole career, against every ' + player.position + '.'}
          </p>
        </div>
      )}
      <DdSkills
        player={useSeason ? seasonMe! : player}
        ovr={useSeason ? seasonOvr?.ovr[key] : car}
        ovrLabel={useSeason ? 'SZN' : 'CAR'}
        traits={grades.traits}
        overall={grades.overall}
        players={useSeason ? seasonPlayers : players}
        onOpenPlayer={(p) => onOpenPlayer(players.find((x) => playerKey(x) === playerKey(p)) ?? p)}
      />
      {IS_NFL && useSeason && (grades as { smallSample?: boolean }).smallSample && seasonPoolLabel(seasonPlayers, player.position) && (
        <p className="text-[11px] text-muted-foreground">
          Below the {seasonPoolLabel(seasonPlayers, player.position)} bar: his rates are pulled toward the qualified average in proportion to the sample.
        </p>
      )}
      {IS_NFL && !useSeason && (
        <>
          {(grades as { smallSample?: boolean }).smallSample && careerPoolLabel(player.position) && (
            <p className="text-[11px] text-muted-foreground">
              Small career sample (under {careerPoolLabel(player.position)}): his rates are pulled toward the qualified average in proportion to the sample.
            </p>
          )}
          {careerRatingOf(key)?.[5] === 1 && <p className="text-[11px] text-muted-foreground">Efficiency from career totals (no weekly data for his whole career): his rates are compared with players whose careers centre within five years of his, then ranked with everyone else.</p>}
        </>
      )}
      {IS_NFL && <DdAdvancedFactors player={player} players={players} scope={useSeason ? String(seasonOvr?.season) : 'c'} onOpenPlayer={onOpenPlayer} />}
    </div>
  );
};

export default DdSkillsSwitch;
