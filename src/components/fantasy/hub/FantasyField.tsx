import type { CSSProperties, ReactNode } from 'react';
import { Plus, Replace } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import GameSprite from '@/components/GameSprite';
import PixelLoader from '@/components/ui/PixelLoader';
import { peekProps } from '@/components/peek/peekProps';
import { FIELD_ART, type FieldArt, type Turf } from '@/components/teamlab/fieldArt';
import { PixelPlayer } from '@/components/teamlab/labArt';
import { findNFLTeam } from '@/utils/nflTeams';
import { bannerTeamOf } from '@/utils/playerExtras';
import { useJerseyNumbers } from '@/utils/jerseys';
import { surnameOf } from '@/utils/displayName';
import { getReadableTextOn } from '@/utils/teamColors';
import type { PlayerProfile } from '@/utils/teamLab';
import type { InjuryCode } from '@/utils/injuries';
import type { Slot } from '@/utils/fantasy';
import { OppChip } from './hubParts';
import { stag } from '@/components/motion/Reveal';

export interface FSpot {
  id: string;
  x: number;
  y: number;
  label: string;
  profile?: PlayerProfile;
  /** a defence stands as its logo plaque */
  dst?: string;
  /** the projection, a salary or BYE */
  badge?: ReactNode;
  injury?: InjuryCode;
  slots?: Slot[];
}
const INJ: Record<InjuryCode, string> = { IR: '#ef4444', Out: '#ef4444', Doubtful: '#f97316', Questionable: '#facc15' };

/**
 * The lineup on the painted turf: each player's own sprite in his club's kit on his spot, a flat club-colour name strip with
 * his logo, the projection, and the next opponent's logo ringed by matchup difficulty. An empty spot is a soft position plate.
 * Every spot is a button (tap: change that slot).
 */
const FantasyField = ({ spots, kitClub, turf, art, tall, size, onPick, onOpen }: { spots: FSpot[]; kitClub: string; turf: Turf; art: FieldArt; tall: boolean; size: 's' | 'm' | 'l'; onPick: (id: string) => void; onOpen: (key: string) => void }) => {
  const { numberFor } = useJerseyNumbers();
  const team = findNFLTeam(kitClub);
  const vars = {
    '--lf-c1': team ? `hsl(${team.primaryColor})` : 'hsl(var(--turf))',
    '--lf-c2': team ? `hsl(${team.secondaryColor})` : 'hsl(var(--gold))',
    ...(art.turf ? { '--lf-turf': `url("${art.turf}")` } : {}),
  } as CSSProperties;
  return (
    <div className={`lab-field nfl-field nfl-field--fantasy fh-field ${tall ? 'lab-field--tall' : 'lab-field--wide'} ${art.turf ? 'lab-field--art' : art.pending ? 'lab-field--pending' : 'lab-field--css'} lab-field--${turf}`} style={vars} role="group" aria-label="Lineup on the field">
      {art.turf && <span className="lab-field-veil" aria-hidden="true" />}
      {art.pending && <PixelLoader size="sm" label="Field" what="the field" className="lab-field-loader" />}
      {!art.turf && !art.pending && <span className="lab-field-lines" aria-hidden="true" />}
      <span className="lab-field-logo" aria-hidden="true"><TeamLogo team={kitClub} size={size === 'l' ? 190 : size === 'm' ? 150 : 96} decorative /></span>
      {spots.map((s, i) => {
        const style = { left: `${s.x}%`, top: `${s.y}%`, ...stag(i, 70) } as CSSProperties;
        if (s.dst) {
          const t = findNFLTeam(s.dst);
          const c = t ? `hsl(${t.primaryColor})` : '#333';
          return (
            <button key={s.id} type="button" className="lab-spot fh-spot mo-pop" style={style} onClick={() => onPick(s.id)} aria-label={`${t?.name ?? s.dst} defense. Change`}>
              <span className="nfl-dst-plate" style={{ '--tg-c': c } as CSSProperties}><TeamLogo team={s.dst} size={size === 's' ? 46 : 64} decorative /></span>
              <span className="fh-tag" style={{ '--hc': c, '--hink': t ? getReadableTextOn(t.primaryColor) : '#fff' } as CSSProperties}>
                <b>D/ST</b><span className="fh-tag__n">{t?.name ?? s.dst}</span>{s.badge != null && <i>{s.badge}</i>}
              </span>
            </button>
          );
        }
        const p = s.profile;
        if (!p)
          return (
            <button key={s.id} type="button" className="lab-spot fh-spot fh-spot--empty mo-pop" style={style} onClick={() => onPick(s.id)} aria-label={`Pick a player for ${s.label}`}>
              <span className="fh-plate"><b>{s.label}</b><Plus aria-hidden="true" /></span>
            </button>
          );
        const club = bannerTeamOf(p.player);
        const t = findNFLTeam(club);
        const kit = t?.name ?? kitClub;
        return (
          <div key={s.id} className="lab-spot fh-spot fh-spot--pl mo-pop" style={style}>
            <button type="button" className="fh-spot__hit" {...peekProps(p.player)} onClick={() => onOpen(p.key)} aria-label={`${s.label} ${p.name}. Open his card`}>
              <span className="lab-fig fh-fig">
                {FIELD_ART ? <GameSprite player={p.player} team={kit} kind="figure" size={size} /> : <PixelPlayer club={kit} number={numberFor(p.player)} unit={size === 'l' ? 4 : size === 'm' ? 3 : 2} />}
                {s.injury && <span className="nfl-inj" style={{ background: INJ[s.injury] }} title={s.injury}>{s.injury === 'IR' ? 'IR' : s.injury[0]}</span>}
              </span>
              <span className="fh-tag" style={{ '--hc': t ? `hsl(${t.primaryColor})` : '#333', '--hink': t ? getReadableTextOn(t.primaryColor) : '#fff' } as CSSProperties}>
                {t && <TeamLogo team={t} size={14} decorative />}
                <b>{s.label}</b><span className="fh-tag__n">{surnameOf(p.name)}</span>{s.badge != null && <i>{s.badge}</i>}
              </span>
            </button>
            {s.slots && <span className="fh-opp"><OppChip slots={s.slots} size={size === 's' ? 20 : 24} label={false} /></span>}
            <button type="button" className="fh-spot__chg" onClick={() => onPick(s.id)} aria-label={`Change ${s.label}`}><Replace aria-hidden="true" /></button>
          </div>
        );
      })}
    </div>
  );
};

export default FantasyField;
