import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '@/components/brand/TeamLogo';
import { ArcadeToggle, SectionHeader } from '@/components/arcade';
import { Reveal, stag } from '@/components/motion/Reveal';
import { getReadableTextOn } from '@/utils/teamColors';
import { POWER_WEIGHTS, type FranchiseRecord, type TeamSummary } from '../teamStats';
import './allTimePower.css';

const PARTS = [
  { key: 'titles', label: 'Titles', cls: 'atp-t' },
  { key: 'hof', label: 'Hall of Famers', cls: 'atp-h' },
  { key: 'legacy', label: 'Career Legacy', cls: 'atp-l' },
  { key: 'ovr', label: 'Best OVR', cls: 'atp-o' },
] as const;

/**
 * "Who runs the league": the all-time franchise power ladder. The score is the Retro Bowl blend, 35% Super Bowl titles,
 * 25% Hall of Famers, 25% combined Career Legacy and 15% best player OVR, each scaled to the league's best club, so every
 * bar is split into what earned it.
 */
const AllTimePower = ({ teams, records, onOpen }: { teams: TeamSummary[]; records: Map<string, FranchiseRecord>; onOpen: (key: string) => void }) => {
  const [all, setAll] = useState<'10' | 'all'>('10');
  const rows = useMemo(
    () =>
      teams
        .filter((t) => t.team && records.get(t.key))
        .map((t) => ({ t, r: records.get(t.key)! }))
        .sort((a, b) => a.r.powerRank - b.r.powerRank),
    [teams, records],
  );
  if (!rows.length) return null;
  const top = Math.max(1, ...rows.map((x) => x.r.power));
  const shown = all === 'all' ? rows : rows.slice(0, 10);
  return (
    <section aria-labelledby="atp-heading" className="atp space-y-3">
      <SectionHeader
        kicker="All-time power"
        title={<span id="atp-heading">Who runs the league</span>}
        right={<ArcadeToggle label="Ladder length" size="sm" value={all} onChange={(v) => setAll(v as '10' | 'all')} options={[{ value: '10', label: 'Top 10' }, { value: 'all', label: `All ${rows.length}` }]} />}
      />
      <ul className="atp-legend" aria-label="What the score is made of">
        {PARTS.map((p) => (
          <li key={p.key}>
            <i className={p.cls} aria-hidden />
            {p.label} {Math.round(POWER_WEIGHTS[p.key] * 100)}%
          </li>
        ))}
      </ul>
      <Reveal as="ol" className="atp-list">
        {shown.map(({ t, r }, i) => {
          const tm = t.team!;
          return (
            <li key={t.key} className="mo-rise" style={stag(i % 10, 40)}>
              <button
                type="button"
                className={cn('atp-row', r.powerRank <= 3 && 'is-top')}
                style={{ ['--p' as string]: `hsl(${tm.primaryColor})`, ['--fg' as string]: getReadableTextOn(tm.primaryColor) }}
                onClick={() => onOpen(t.key)}
                aria-label={`${r.powerRank}. ${t.label}, power ${r.power}: ${r.titles} titles, ${r.hof.length} Hall of Famers. Open club page`}
              >
                <span className="atp-n">{r.powerRank}</span>
                <TeamLogo team={tm} size={34} decorative />
                <span className="atp-main">
                  <span className="atp-name">
                    {tm.name}
                    <small>
                      {r.titles > 0 ? `${r.titles} ${r.titles === 1 ? 'title' : 'titles'}` : ''}
                      {r.titles > 0 && r.hof.length > 0 ? ' · ' : ''}
                      {r.hof.length > 0 ? `${r.hof.length} HOF` : ''}
                    </small>
                  </span>
                  <span className="atp-bar" aria-hidden style={{ width: `${Math.max(4, (r.power / top) * 100)}%` }}>
                    {PARTS.map((p) => (r.parts[p.key] > 0 ? <i key={p.key} className={p.cls} style={{ flexGrow: r.parts[p.key] }} /> : null))}
                  </span>
                </span>
                <span className="atp-score">{r.power}</span>
              </button>
            </li>
          );
        })}
      </Reveal>
    </section>
  );
};

export default AllTimePower;
