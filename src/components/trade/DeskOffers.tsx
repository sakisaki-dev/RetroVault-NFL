import type { CSSProperties } from 'react';
import { Choice, FilterGroup, FilterSheet, type ActiveFilter } from '@/components/controls';
import { stag } from '@/components/motion/Reveal';
import { ClubMark, fxTone } from '@/components/fantasy/ClubMark';
import { usePhone } from '@/hooks/usePhone';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { FAIR_PCT, type Package, type TradeModel } from '@/utils/tradeSim';
import { Stand } from './DeskCard';

export type OfferPos = 'ALL' | 'QB' | 'RB' | 'WR' | 'TE';
export type OfferSize = 'any' | '1' | '2' | '3';
export type OfferSort = 'gap' | 'value';
export interface OfferFilters { pos: OfferPos; size: OfferSize; sort: OfferSort }
export const DEFAULT_FILTERS: OfferFilters = { pos: 'ALL', size: 'any', sort: 'gap' };
export const PAGE = 12;

const POS = (['ALL', 'QB', 'RB', 'WR', 'TE'] as OfferPos[]).map((v) => ({ value: v, label: v === 'ALL' ? 'All' : v }));
const SIZE: { value: OfferSize; label: string }[] = [{ value: 'any', label: 'Any' }, { value: '1', label: '1' }, { value: '2', label: '2' }, { value: '3', label: '3+' }];
const SORT: { value: OfferSort; label: string }[] = [{ value: 'gap', label: 'Fairest' }, { value: 'value', label: 'Most value' }];

const Controls = ({ f, set, wrap }: { f: OfferFilters; set: (p: Partial<OfferFilters>) => void; wrap?: boolean }) => (
  <>
    <Choice<OfferPos> label="Position" options={POS} value={f.pos} onChange={(pos) => set({ pos })} wrap={wrap} />
    <Choice<OfferSize> label="Number of players" options={SIZE} value={f.size} onChange={(size) => set({ size })} wrap={wrap} />
    <Choice<OfferSort> label="Sort" options={SORT} value={f.sort} onChange={(sort) => set({ sort })} wrap={wrap} />
  </>
);

/** One fair package as a draft-board card: lead club's colours and logo, the players on pedestals, the gap as a lit chip. */
const OfferCard = ({ o, i, model, cards, on, onPick }: { o: Package; i: number; model: TradeModel; cards: Map<string, Player>; on: boolean; onPick: () => void }) => {
  const ps = o.keys.map((k) => model.players.get(k)!).filter(Boolean);
  const lead = ps[0];
  const gap = o.gap * 100;
  const edge = o.lean === null ? 'Dead level' : o.lean === 'give' ? 'Tilts to you' : 'Tilts to them';
  return (
    <button type="button" className={cn('dk-of fx-flat mo-rise', on && 'is-on')} style={{ ...fxTone(lead?.club), ...stag(i % PAGE, 45) } as CSSProperties} aria-pressed={on} onClick={onPick}>
      <ClubMark club={lead?.club} size={130} />
      <span className="dk-of__top">
        <b className="dk-of__n">#{i + 1}</b>
        <span className="dk-of__k">{ps.length} player{ps.length > 1 ? 's' : ''}</span>
        <span className={cn('dk-of__gap', gap < FAIR_PCT ? 'is-fair' : 'is-lean')}>{gap.toFixed(1)}%</span>
      </span>
      <span className="dk-of__figs">
        {ps.map((p) => <Stand key={p.key} player={cards.get(p.key)} club={p.club} size="s" hop />)}
      </span>
      <span className="dk-of__who">
        {ps.map((p) => <span key={p.key}><b>{p.name}</b><i>{p.pos}{p.posRank} · {p.club}</i></span>)}
      </span>
      <span className="dk-of__f"><span>{edge}</span><span>ROS {ps.reduce((a, p) => a + p.ros, 0).toFixed(0)}</span></span>
    </button>
  );
};

/** Fair offers for what you send: every package inside the Fair / Leans band, fairest first, twelve at a time. */
export const DeskOffers = ({
  model, cards, offers, selected, onPick, f, setF, shown, onMore, hasSend,
}: {
  model: TradeModel; cards: Map<string, Player>; offers: Package[]; selected: string | null; onPick: (o: Package) => void;
  f: OfferFilters; setF: (p: Partial<OfferFilters>) => void; shown: number; onMore: () => void; hasSend: boolean;
}) => {
  const phone = usePhone();
  const active: ActiveFilter[] = [
    ...(f.pos !== 'ALL' ? [{ id: 'pos', label: f.pos, onClear: () => setF({ pos: 'ALL' }) }] : []),
    ...(f.size !== 'any' ? [{ id: 'size', label: f.size === '3' ? '3+ players' : `${f.size} player${f.size === '1' ? '' : 's'}`, onClear: () => setF({ size: 'any' }) }] : []),
    ...(f.sort !== 'gap' ? [{ id: 'sort', label: 'Most value', onClear: () => setF({ sort: 'gap' }) }] : []),
  ];
  return (
    <section className="dk-offers" aria-label="Fair offers">
      <header className="dk-offers__h">
        <h2>Fair offers</h2>
        {hasSend && <span className="dk-offers__c">{offers.length.toLocaleString()} found</span>}
        <div className="dk-offers__t">
          {phone ? (
            <FilterSheet title="Filters" active={active} onReset={() => setF(DEFAULT_FILTERS)}>
              <FilterGroup label="Position"><Controls f={f} set={setF} wrap /></FilterGroup>
            </FilterSheet>
          ) : <Controls f={f} set={setF} />}
        </div>
      </header>
      {!hasSend ? (
        <div className="dk-empty dk-empty--wide"><b>Send a player</b><span>Fair packages for him show here, any size.</span></div>
      ) : offers.length === 0 ? (
        <div className="dk-empty dk-empty--wide"><b>Nothing in the Fair or Leans band</b><span>Loosen the position or the number of players.</span></div>
      ) : (
        <>
          <div className="dk-offers__grid">
            {offers.slice(0, shown).map((o, i) => {
              const id = o.keys.join('+');
              return <OfferCard key={id} o={o} i={i} model={model} cards={cards} on={selected === id} onPick={() => onPick(o)} />;
            })}
          </div>
          {offers.length > shown && (
            <button type="button" className="dk-more-offers" onClick={onMore}>Show {Math.min(PAGE, offers.length - shown)} more <i>{offers.length - shown} left</i></button>
          )}
        </>
      )}
    </section>
  );
};
