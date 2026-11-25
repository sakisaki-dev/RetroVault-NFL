import { memo, useMemo, useState, type CSSProperties } from 'react';
import { ChevronDown, X } from 'lucide-react';
import GameSprite from '@/components/GameSprite';
import TeamLogo from '@/components/brand/TeamLogo';
import { ViewCount } from '@/components/motion/Reveal';
import { fxTone } from '@/components/fantasy/ClubMark';
import { teamOf } from '@/components/fantasy/parts';
import { useOpenCard } from '@/components/fantasy/hub/cardContext';
import { peekKeyProps } from '@/components/peek/peekProps';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { useBioInfo } from '@/utils/bioInfo';
import { useJerseyNumbers } from '@/utils/jerseys';
import { firstAndLast } from '@/utils/displayName';
import { clubPlate } from '@/components/arcade/clubInk';
import { f1 } from '@/utils/fantasy';
import { useGameSprites } from '@/utils/gameSprites';
import { flagsFor, SCORING_LABEL, type TradeModel, type TradePlayer } from '@/utils/tradeSim';
import { StatPanel } from './TradeParts';

/** His game sprite standing on a club-colour pedestal (a glow, a ring and a floor shadow); the club logo where this build has no sprites. */
export const Stand = ({ player, club, size = 'm', hop }: { player?: Player; club: string; size?: 's' | 'm' | 'l'; hop?: boolean }) => {
  const sprites = useGameSprites();
  return (
    <span className={cn('dk-stand', size === 's' && 'dk-stand--s', size === 'l' && 'dk-stand--l', hop && 'dk-stand--hop')} style={fxTone(club)} aria-hidden="true">
      <i className="dk-stand__ped" />
      {sprites && player && !player.isRealLegend ? (
        <GameSprite player={player} team={teamOf(club)?.name} kind="figure" size={size} className="dk-stand__sprite" />
      ) : (
        <TeamLogo team={teamOf(club)} size={size === 'l' ? 96 : size === 'm' ? 60 : 40} decorative backed />
      )}
    </span>
  );
};

const FlagChips = ({ p, age }: { p: TradePlayer; age: number | null }) => {
  const flags = useMemo(() => flagsFor(p, age), [p, age]);
  return flags.length ? (
    <ul className="dk-flags" aria-label="Context flags">
      {flags.map((f) => <li key={f.kind} className={cn('dk-flag', `dk-flag--${f.tone}`)}>{f.text}</li>)}
    </ul>
  ) : null;
};

/** The weekly projection as slim bars, the playoff weeks (15-17) in gold. */
const WeekBars = ({ p }: { p: TradePlayer }) => {
  const top = Math.max(5, ...p.weeks.map((w) => w.proj));
  return (
    <div className="dk-wk" role="img" aria-label="Projected points by remaining week">
      {p.weeks.map((w) => (
        <span key={w.week} className={cn(w.playoff && 'is-po', !w.opp && 'is-bye')} title={`Wk ${w.week}${w.opp ? ` vs ${w.opp}` : ' bye'}: ${f1(w.proj)}`}>
          <i style={{ height: `${Math.max(w.opp ? 6 : 2, (w.proj / top) * 100)}%` }} />
          <em>{w.week}</em>
        </span>
      ))}
    </div>
  );
};

/** One player in a locker: club-colour name strip, logo watermark, the sprite on his pedestal, three numbers, flags; "Full stats" opens the rest. */
export const DeskCard = memo(({
  p, model, player, cardValue, side, leaving, dest, onRemove, index = 0,
}: {
  p: TradePlayer;
  model: TradeModel;
  player?: Player;
  cardValue: number | null;
  side: 'l' | 'r';
  leaving?: boolean;
  dest?: React.ReactNode;
  onRemove: () => void;
  index?: number;
}) => {
  const [open, setOpen] = useState(false);
  const openCard = useOpenCard();
  const bio = useBioInfo(p.key);
  const unit = SCORING_LABEL[model.settings.scoring];
  const { numberFor } = useJerseyNumbers();
  const num = player ? numberFor(player) : null;
  const nm = firstAndLast(p.name);
  return (
    <article className={cn('dk-pc fx-flat', side === 'l' ? 'mo-run-l' : 'mo-run-r', leaving && `dk-out dk-out--${side}`)} style={{ ...fxTone(p.club), '--i': index, '--tc2': teamOf(p.club) ? `hsl(${teamOf(p.club)!.secondaryColor})` : '#fff' } as CSSProperties}>
      <div className="dk-ban" role="button" tabIndex={0} {...peekKeyProps(p.key)} onClick={() => openCard(p.key)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(p.key); } }} aria-label={`Open ${p.name}'s card`}>
        <span className="dk-ban__bands" aria-hidden="true" />
        <span className="dk-ban__logo" aria-hidden="true"><TeamLogo team={teamOf(p.club)} size={300} decorative /></span>
        {num != null && <span className="dk-ban__num" aria-hidden="true">{num}</span>}
        <em className="dk-pos dk-ban__pos">{p.pos}{p.posRank}</em>
        <Stand player={player} club={p.club} size="l" />
        <span className="dk-ban__name" style={{ background: `color-mix(in srgb, ${clubPlate(p.club).fill} 82%, #000)` }}>
          {nm.first && <small>{nm.first}</small>}<b>{nm.last}</b>
        </span>
      </div>
      <button type="button" className="dk-x dk-x--ban" onClick={onRemove} aria-label={`Remove ${p.name}`}><X className="h-4 w-4" aria-hidden="true" /></button>
      <dl className="dk-nums">
        <div><dt>{unit}/g</dt><dd><ViewCount value={p.ppg} decimals={1} /></dd></div>
        <div><dt>ROS</dt><dd><ViewCount value={p.ros} /></dd></div>
        <div><dt>Value</dt><dd className="is-gold"><ViewCount value={p.value} /></dd></div>
      </dl>
      <div className="dk-pc__f">
        <FlagChips p={p} age={bio?.age ?? null} />
        {dest}
      </div>
      <button type="button" className="dk-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>Full stats</span><ChevronDown className={cn('h-4 w-4', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div className="dk-det">
          <WeekBars p={p} />
          <StatPanel p={p} model={model} cardValue={cardValue} age={bio?.age ?? null} />
        </div>
      )}
    </article>
  );
});
DeskCard.displayName = 'DeskCard';
