import { useMemo, useState } from 'react';
import { InfoTip, NoteChip } from '@/components/ui/InfoTip';
import type { Player } from '@/types/player';
import { seasonLabel } from '@/config/edition';
import { playerKey, seasonPlayerOf, type SeasonOvrFile } from '@/config/ovr';
import { careerPool, careerPoolLabel, seasonPoolLabel, foldAdvanced, gradeFor, ovrFromPercentile, percentileOf, playerSkillGrades, tierFor } from '@/config/skillGrades';
import { careerRatingOf } from '@/config/ovr';
import { advancedPcts, useAdvanced } from '@/utils/nflAdvanced';
import { useSkillRatings } from '@/utils/useSkillRatings';
import { cn } from '@/lib/utils';
import DdSkills from './DdSkills';
import DdSzn, { hasSznPanel } from './DdSzn';
import DdAdvancedFactors from './DdAdvancedFactors';
import { IS_NFL } from '@/config/edition';
import { CAREER_LABEL } from '@/config/ovr';

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
  // The Season panel carries SZN, so the Skill panel opens on the career skill rating it is compared with (owner, 2026-11-25).
  const shown = mode ?? (hasSeason && !hasSznPanel(player, seasonOvr) ? 'season' : 'career');

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
  // Career scope: the one career rating the Players table, search and cards show (useSkillRatings: classic overall folded
  // with the advanced factors, ranked among players with the same data coverage), so the two never disagree.
  // This season scope: its own computation (a different number by design), folded and re-ranked in that season's pool.
  const careerRatings = useSkillRatings();
  const foldedPool = useMemo(() => {
    if (!useSeason) return null;
    const pool = IS_NFL && adv ? careerPool(seasonPlayers, player.position) : null;
    if (!pool) return null;
    return pool
      .map((p) => foldAdvanced(playerSkillGrades(seasonPlayers, p).overall, advancedPcts(adv, playerKey(p), String(seasonOvr?.season)))?.pct)
      .filter((x): x is number => typeof x === 'number')
      .sort((a, b) => a - b);
  }, [adv, useSeason, seasonPlayers, seasonOvr, player.position]);
  const grades = useMemo(() => {
    if (!useSeason) return IS_NFL ? { ...base, overall: careerRatings.get(key) ?? base.overall } : base;
    if (!(IS_NFL && adv)) return base;
    const folded = foldAdvanced(base.overall, advancedPcts(adv, key, scope));
    if (!folded || !foldedPool) return { ...base, overall: folded };
    const pct = percentileOf(foldedPool, folded.pct);
    const grade = gradeFor(pct) ?? folded.grade;
    return { ...base, overall: { ...folded, pct, rating: ovrFromPercentile(pct), grade, tier: tierFor(grade) } };
  }, [base, adv, key, scope, foldedPool, useSeason, careerRatings]);
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
              ? `${label}${seasonOvr?.live ? ' so far' : ''} · vs ${player.position}s with ${seasonPoolLabel(seasonPlayers, player.position) ?? 'a game'}`
              : 'Whole career · vs every ' + player.position}
          </p>
        </div>
      )}
      <DdSkills
        player={useSeason ? seasonMe! : player}
        ovr={useSeason ? seasonOvr?.ovr[key] : car}
        ovrLabel={useSeason ? 'SZN' : CAREER_LABEL}
        traits={grades.traits}
        overall={grades.overall}
        players={useSeason ? seasonPlayers : players}
        onOpenPlayer={(p) => onOpenPlayer(players.find((x) => playerKey(x) === playerKey(p)) ?? p)}
        below={<DdSzn player={player} players={players} seasonOvr={seasonOvr} onOpenPlayer={onOpenPlayer} />}
      />
      {IS_NFL && useSeason && (grades as { smallSample?: boolean }).smallSample && seasonPoolLabel(seasonPlayers, player.position) && (
        <p><NoteChip short="Small sample">Below the {seasonPoolLabel(seasonPlayers, player.position)} bar: his rates are pulled toward the qualified average in proportion to the sample.</NoteChip></p>
      )}
      {IS_NFL && !useSeason && (
        <>
          {(grades as { smallSample?: boolean }).smallSample && careerPoolLabel(player.position) && (
            <p><NoteChip short="Small career sample">Under {careerPoolLabel(player.position)}: his rates are pulled toward the qualified average in proportion to the sample.</NoteChip></p>
          )}
          {careerRatingOf(key)?.[5] === 1 && <p><NoteChip short="From career totals">No weekly data for his whole career: his rates are compared with players whose careers centre within five years of his, then ranked with everyone else.</NoteChip></p>}
        </>
      )}
      {IS_NFL && <DdAdvancedFactors player={player} players={players} scope={useSeason ? String(seasonOvr?.season) : 'c'} onOpenPlayer={onOpenPlayer} />}
    </div>
  );
};

export default DdSkillsSwitch;
