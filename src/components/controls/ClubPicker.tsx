import { NFL_TEAMS } from '@/utils/nflTeams';
import { ClubBadge } from '@/components/arcade';
import { Adaptive } from './Adaptive';
import './controls.css';

const CLUBS = [...NFL_TEAMS].sort((a, b) => a.fullName.localeCompare(b.fullName));

/**
 * ClubPicker: the site's pattern for "which club" (32 options). One button showing the current club's logo and name
 * opens a logo grid (bottom sheet on a phone, popover from 640px); picking closes it. Props: value (abbreviation or
 * null), onChange(abbr | null), allLabel? (the "no club" row, default "All clubs"; pass null to hide it), label?.
 */
export const ClubPicker = ({
  value,
  onChange,
  allLabel = 'All clubs',
  label = 'Club',
}: {
  value: string | null;
  onChange: (abbr: string | null) => void;
  allLabel?: string | null;
  label?: string;
}) => {
  const cur = CLUBS.find((c) => c.abbreviation === value);
  return (
    <Adaptive
      title={label}
      trigger={(open) => (
        <button type="button" className={`ctl-btn${cur ? ' is-on' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-label={`${label}: ${cur?.fullName ?? allLabel ?? 'none'}`}>
          {cur ? <ClubBadge club={cur.name} abbr={false} size="sm" /> : null}
          <span>{cur ? cur.name : allLabel}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="ctl-clubs" role="group" aria-label={label}>
          {allLabel !== null && (
            <button type="button" className={`ctl-club ctl-club--all${!cur ? ' is-on' : ''}`} aria-pressed={!cur} onClick={() => (onChange(null), close())}>
              {allLabel}
            </button>
          )}
          {CLUBS.map((t) => (
            <button key={t.id} type="button" className={`ctl-club${t.abbreviation === value ? ' is-on' : ''}`} aria-pressed={t.abbreviation === value} aria-label={t.fullName} title={t.fullName} onClick={() => (onChange(t.abbreviation), close())}>
              <ClubBadge club={t.name} abbr={false} size="md" />
            </button>
          ))}
        </div>
      )}
    </Adaptive>
  );
};
