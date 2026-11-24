import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/timeline/TeamLogo';
import { ArcadeToggle, SectionHeader, clubVars } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { openGame, useSuperBowlIds } from '@/utils/nflGames';
import { seasonLabel } from '@/config/edition';
import type { SuperBowlEntry } from '@/utils/leagueContent';
import './superBowlList.css';

const FIRST = 9;

/**
 * Stats → Teams: the Super Bowl champions, newest first, one rounded row each (year, champion's logo, score, the runner-up);
 * a row opens that game's page. Compact: the latest nine, the rest behind a toggle.
 */
const SuperBowlList = ({ superBowls }: { superBowls: SuperBowlEntry[] }) => {
  const ids = useSuperBowlIds();
  const [all, setAll] = useState<'recent' | 'all'>('recent');
  const rows = useMemo(() => superBowls.filter((s) => s.winner).sort((a, b) => b.year - a.year), [superBowls]);
  if (!rows.length) return null;
  const shown = all === 'all' ? rows : rows.slice(0, FIRST);
  return (
    <section aria-labelledby="sbl-heading" className="sbl space-y-3">
      <SectionHeader
        kicker={`${rows.length} Super Bowls`}
        title={<span id="sbl-heading">Super Bowl champions</span>}
        right={
          rows.length > FIRST ? (
            <ArcadeToggle label="List length" size="sm" value={all} onChange={(v) => setAll(v as 'recent' | 'all')} options={[{ value: 'recent', label: `Latest ${FIRST}` }, { value: 'all', label: `All ${rows.length}` }]} />
          ) : undefined
        }
      />
      <Reveal as="ul" className="sbl__grid">
        {shown.map((sb, i) => {
          const id = ids?.[String(sb.year)];
          const inner = (
            <>
              <span className="sbl__year">{seasonLabel(sb.year)}</span>
              <TeamLogo team={sb.winner!} decorative className="sbl__logo" />
              <span className="sbl__main">
                <b>{sb.winner}</b>
                <span className="sbl__vs">
                  {sb.score ?? ''}
                  {sb.loser && (
                    <>
                      {' · over '}
                      <TeamLogo team={sb.loser} decorative className="sbl__mini" />
                      {sb.loser}
                    </>
                  )}
                </span>
              </span>
              <span className="sbl__no">{sb.roman}</span>
            </>
          );
          return (
            <li key={sb.year} className="mo-rise" style={{ ...stag(i % 9, 40), ...clubVars(sb.winner) }}>
              {id ? (
                <button type="button" className={cn('sbl__row')} onClick={() => openGame(id)} aria-label={`Super Bowl ${sb.roman}, ${seasonLabel(sb.year)}: ${sb.winner} ${sb.score ?? ''} over ${sb.loser ?? ''}. Open the game`}>
                  {inner}
                </button>
              ) : (
                <div className="sbl__row sbl__row--static">{inner}</div>
              )}
            </li>
          );
        })}
      </Reveal>
    </section>
  );
};

export default SuperBowlList;
