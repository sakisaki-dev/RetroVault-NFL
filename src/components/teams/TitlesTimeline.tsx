import { formatYearRuns } from '@/utils/leagueContent';
import { liftForDarkBg } from '@/utils/teamColors';
import { clubPlate } from '../arcade';
import { IS_NFL, seasonLabel } from '@/config/edition';

interface TitlesTimelineProps {
  teamName: string;
  primary: string;
  titleYears: number[];
  lossYears: number[];
  /** Seasons the owner coached here */
  coachedYears: number[];
  years?: number;
}

/**
 * Y1–(latest season) strip for one franchise: tall gold bars are titles, short outlined bars are Super Bowl losses, and the
 * striped band underneath marks the seasons you coached here. Shapes differ, so colour is never the only cue;
 * the same facts are written out below the strip.
 */
const TitlesTimeline = ({ teamName, primary, titleYears, lossYears, coachedYears, years = 80 }: TitlesTimelineProps) => {
  // NFL edition: real years, from the first Super Bowl season on record (1999, or earlier when a title or loss is)
  // to the latest season; no coach. Retro Bowl: Y1 to the latest season.
  const from = IS_NFL ? Math.min(1999, ...titleYears, ...lossYears) : 1;
  const to = years;
  const span = Array.from({ length: Math.max(1, to - from + 1) }, (_, i) => from + i);
  const label = (y: number) => (IS_NFL ? String(y) : `Y${y}`);
  const step = IS_NFL ? 5 : 20;
  const ticks = [from, ...span.filter((y) => y !== from && y % step === 0 && to - y >= (IS_NFL ? 3 : 8)), to];
  const showCoach = !IS_NFL;
  const won = new Set(titleYears);
  const lost = new Set(lossYears);
  const coached = new Set(coachedYears);
  const band = liftForDarkBg(primary, 48);
  const plate = clubPlate(teamName);
  const cStyle = { ['--tt-fill' as string]: plate.fill, ['--tt-edge' as string]: plate.edge };

  return (
    <figure className="min-w-0">
      <div
        className="relative border-2 border-[hsl(var(--line)/0.7)] bg-card px-2 pt-3 pb-1"
        style={cStyle}
        role="img"
        aria-label={`${teamName} Super Bowl timeline, ${label(from)} to ${IS_NFL ? to : seasonLabel(years)}. ${titleYears.length} titles${lossYears.length ? `, ${lossYears.length} losses` : ''}${coachedYears.length ? `, you coached ${coachedYears.length} seasons here` : ''}. Details listed below.`}
      >
        <div className="flex h-14 items-end gap-px" aria-hidden="true">
          {span.map((y) => (
            <span key={y} className="relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${IS_NFL ? y : seasonLabel(y)}${won.has(y) ? ': won the Super Bowl' : lost.has(y) ? ': lost the Super Bowl' : ''}${coached.has(y) ? ' (you coached)' : ''}`}>
              {won.has(y) ? (
                <span className="block h-full border-t-[3px] border-gold" style={{ background: plate.fill }} />
              ) : lost.has(y) ? (
                <span className="block h-1/2 border-2 border-b-0 bg-transparent" style={{ borderColor: plate.fill === plate.edge ? plate.fill : plate.edge }} />
              ) : (
                <span className="block h-[3px] bg-border/70" />
              )}
            </span>
          ))}
        </div>
        {showCoach && <div className="mt-1 flex h-1.5 gap-px" aria-hidden="true">
          {span.map((y) => (
            <span
              key={y}
              className="min-w-0 flex-1"
              style={
                coached.has(y)
                  ? { background: `repeating-linear-gradient(135deg, ${band} 0 3px, transparent 3px 5px)` }
                  : undefined
              }
            />
          ))}
        </div>}
        <div className="mt-1 flex justify-between font-pixel text-[8px] text-muted-foreground" aria-hidden="true">
          {ticks.map((y) => (
            <span key={y}>{label(y)}</span>
          ))}
        </div>
      </div>
      <figcaption className="mt-2 space-y-1 text-xs text-muted-foreground">
        <span className="flex flex-wrap gap-x-4 gap-y-1" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-2 border-t-[3px] border-gold" style={{ background: plate.fill }} /> Title</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block h-1.5 w-2 border-2 border-b-0" style={{ borderColor: plate.edge }} /> Super Bowl loss</span>
          {showCoach && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-4" style={{ background: `repeating-linear-gradient(135deg, ${band} 0 3px, transparent 3px 5px)` }} /> You coached
            </span>
          )}
        </span>
        <span className="block">
          <b className="text-foreground">Titles:</b> {titleYears.length ? formatYearRuns(titleYears) : 'none yet'}
          {lossYears.length > 0 && (
            <>
              {' · '}
              <b className="text-foreground">Lost:</b> {formatYearRuns(lossYears)}
            </>
          )}
          {showCoach && coachedYears.length > 0 && (
            <>
              {' · '}
              <b className="text-foreground">You coached:</b> {formatYearRuns(coachedYears)}
            </>
          )}
        </span>
      </figcaption>
    </figure>
  );
};

export default TitlesTimeline;
