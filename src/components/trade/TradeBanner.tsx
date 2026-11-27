import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LedDigits } from '@/components/arcade';
import { clubPlate } from '@/components/arcade/clubInk';
import TeamLogo from '@/components/brand/TeamLogo';
import GameSprite from '@/components/GameSprite';
import { teamOf } from '@/components/fantasy/parts';
import { useOpenCard } from '@/components/fantasy/hub/cardContext';
import { peekKeyProps } from '@/components/peek/peekProps';
import { useFieldArt } from '@/components/teamlab/fieldArt';
import { usePhone } from '@/hooks/usePhone';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { firstAndLast } from '@/utils/displayName';
import { useGameSprites } from '@/utils/gameSprites';
import { TRADE_RULES, type TradeModel, type TradeResult } from '@/utils/tradeSim';
import './tradeBanner.css';
import { reducedMotion } from '@/utils/motion';

/**
 * The Trade Desk's banner (owner picked concept 1, "the jumbotron is nice"): the game's stadium split down the middle and
 * painted to each side's lead club (the club of the side's most valuable player; the current club while a side is empty),
 * each half under that club's cropped logo. You send stands on the left turf, You get on the right, in their kits on
 * club-colour pedestals (at most four a side, then a "+N" chip); they walk in when added and walk out when removed. The
 * centre jumbotron carries the deadline countdown (weeks left before the fantasy playoffs, from the schedule the trade
 * model already holds), what each side is worth, the stamp and the gap in lit dots.
 */
const MAX = 4;
const NOW = () => (typeof document !== 'undefined' ? document.documentElement.dataset.perf === 'lite' : false);
const still = () => NOW() || (reducedMotion());

/** Counts a number up (or between values) in a few frames; instant under reduced motion and Lite mode. */
const useTween = (value: number, ms = 520) => {
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (still()) { from.current = value; setV(value); return; }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const x = a + (value - a) * (1 - (1 - k) ** 3);
      from.current = x;
      setV(x);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return v;
};

interface Walker { key: string; out: boolean }
/** The keys on a side, plus the ones that just left for as long as their walk out takes. */
const useWalkers = (keys: string[]): Walker[] => {
  const [list, setList] = useState<Walker[]>(() => keys.map((key) => ({ key, out: false })));
  useEffect(() => {
    setList((prev) => {
      const next: Walker[] = keys.map((key) => ({ key, out: false }));
      if (still()) return next;
      prev.forEach((w, i) => { if (!keys.includes(w.key)) next.splice(Math.min(i, next.length), 0, { key: w.key, out: true }); });
      return next;
    });
    if (still()) return;
    const id = window.setTimeout(() => setList((l) => l.filter((w) => !w.out)), 300);
    return () => window.clearTimeout(id);
  }, [keys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return list;
};

const Figure = ({ k, model, player, side, phone, out, i }: { k: string; model: TradeModel; player?: Player; side: 'l' | 'r'; phone: boolean; out: boolean; i: number }) => {
  const sprites = useGameSprites();
  const openCard = useOpenCard();
  const p = model.players.get(k);
  if (!p) return null;
  const nm = firstAndLast(p.name);
  const club = teamOf(p.club);
  const size = phone ? 's' : 'm';
  return (
    <li className={cn('tb-fig', out ? `tb-out tb-out--${side}` : side === 'l' ? 'mo-run-l' : 'mo-run-r')} style={{ '--i': i, '--tc': clubPlate(p.club).fill, '--tp': clubPlate(p.club).ink } as CSSProperties}>
      <button type="button" className="tb-fig__b" {...peekKeyProps(k)} onClick={() => openCard(k)} aria-label={`Open ${p.name}'s card`} tabIndex={out ? -1 : 0}>
        <span className="tb-fig__s" aria-hidden="true">
          {sprites && player && !player.isRealLegend
            ? <GameSprite player={player} team={club?.name} kind="figure" size={size} />
            : <TeamLogo team={club} size={phone ? 44 : 72} decorative backed />}
        </span>
        <i className="tb-ped" aria-hidden="true" />
        <span className="tb-plate">
          <em>{p.pos}</em><b>{phone ? nm.last : nm.last}</b>
          {!phone && nm.first && <small>{nm.first}</small>}
        </span>
      </button>
    </li>
  );
};

const Half = ({ side, label, keys, model, cards, phone }: { side: 'l' | 'r'; label: string; keys: string[]; model: TradeModel; cards: Map<string, Player>; phone: boolean }) => {
  const walkers = useWalkers(keys);
  const live = walkers.filter((w) => !w.out);
  const max = phone ? 3 : MAX;
  const more = live.length - max;
  let seen = 0;
  const shown = walkers.filter((w) => (w.out ? true : seen++ < max));
  return (
    <div className={cn('tb-side', `tb-side--${side}`)} role="group" aria-label={`${label}: ${live.length} player${live.length === 1 ? '' : 's'}`}>
      <span className="tb-kick">{label}</span>
      {live.length === 0 && <span className="tb-empty"><i className="tb-ped tb-ped--empty" aria-hidden="true" /></span>}
      <ul className="tb-figs">
        {shown.map((w, i) => <Figure key={w.key} k={w.key} model={model} player={cards.get(w.key)} side={side} phone={phone} out={w.out} i={i} />)}
        {more > 0 && <li className="tb-more" aria-label={`${more} more`}>+{more}</li>}
      </ul>
    </div>
  );
};

/** The lead club of a side: the club of its most valuable player; null while it is empty. */
const leadClub = (keys: string[], model: TradeModel): string | null => {
  let best: { v: number; c: string } | null = null;
  keys.forEach((k) => { const p = model.players.get(k); if (p && (!best || p.value > best.v)) best = { v: p.value, c: p.club }; });
  return (best as { c: string } | null)?.c ?? null;
};

/** Weeks left before the deadline (the fantasy playoffs start), counted from the schedule the model holds, and the pips for the regular season. */
export const deadlineOf = (model: TradeModel) => {
  const dead = TRADE_RULES.playoffWeeks[0];
  const left = new Set(model.weeks.filter((w) => w < dead));
  const pips = Array.from({ length: dead - 1 }, (_, i) => ({ week: i + 1, left: left.has(i + 1) }));
  const next = pips.find((p) => p.left)?.week ?? null;
  return { dead, weeks: left.size, pips, next };
};

const STAMP: Record<string, string> = { Fair: 'Fair', Leans: 'Leans', Lopsided: 'Lopsided' };

export const TradeBanner = ({ model, result, cards, send, get, fallback, any }: {
  model: TradeModel;
  result: TradeResult;
  cards: Map<string, Player>;
  send: string[];
  get: string[];
  /** the current club: leads a side that is empty */
  fallback: string;
  any: boolean;
}) => {
  const phone = usePhone();
  const lc = leadClub(send, model);
  const rc0 = leadClub(get, model);
  const lClub = lc ?? fallback;
  // both empty would paint one club twice: the right half borrows the league's most valuable other club
  const rival = useMemo(() => model.ranked.find((p) => p.club !== lClub)?.club ?? lClub, [model, lClub]);
  const rClub = rc0 ?? (lClub === fallback && !lc ? rival : fallback);
  const artL = useFieldArt(lClub, 'night');
  const artR = useFieldArt(rClub, 'night');
  const t = result.teams[0];
  const give = t.sentValue;
  const take = t.receivedValue + t.credit;
  const empty = result.verdict === 'Empty';
  const gap = result.gap * 100;
  const gv = useTween(empty ? 0 : gap);
  const dl = useMemo(() => deadlineOf(model), [model]);
  const v = result.verdict.toLowerCase();
  const half = (art: typeof artL, club: string): CSSProperties => ({
    ...(art.crowd ? { '--tb-crowd': `url(${art.crowd})` } : {}),
    ...(art.turf ? { '--tb-turf': `url(${art.turf})` } : {}),
    ...(art.stands ? { '--tb-stands': `url(${art.stands})` } : {}),
    '--tc': clubPlate(club).fill,
  } as CSSProperties);
  const ledGap = `${gv.toFixed(1)}%`;
  return (
    <section className={cn('tb', `tb--${v}`, hasArt(artL) && 'tb--art')} aria-label="Trade banner">
      <div className="tb-bg tb-bg--l" style={half(artL, lClub)} aria-hidden="true">
        <span className="tb-bg__stands" /><span className="tb-bg__crowd" /><span className="tb-bg__turf" />
        <span className="tb-wm"><TeamLogo team={teamOf(lClub)} size={420} decorative /></span>
      </div>
      <div className="tb-bg tb-bg--r" style={half(artR, rClub)} aria-hidden="true">
        <span className="tb-bg__stands" /><span className="tb-bg__crowd" /><span className="tb-bg__turf" />
        <span className="tb-wm"><TeamLogo team={teamOf(rClub)} size={420} decorative /></span>
      </div>
      <span className="tb-lights" aria-hidden="true" />

      <div className="tb-jumbo">
        <div className="tb-screen">
          <div className="tb-top">
            <span>Trade deadline</span>
            <b>{dl.weeks > 0 ? <>{dl.weeks} week{dl.weeks === 1 ? '' : 's'}</> : 'Passed'}</b>
          </div>
          <ol className="tb-pips" aria-label={`Weeks before the deadline: ${dl.weeks} left`}>
            {dl.pips.map((p) => <li key={p.week} className={cn(p.left ? 'on' : 'past', p.week === dl.next && 'cur')} title={`Week ${p.week}`} />)}
          </ol>
          {empty || !any ? (
            <p className="tb-prompt">Add a player to each side<br /><small>or pick a quick start</small></p>
          ) : (
            <div className="tb-mid">
              <div className="tb-tot"><small>You give</small><LedDigits matrix dot={phone ? 2.4 : 3} value={Math.round(give)} color="amber" label={`You give ${Math.round(give)}`} /></div>
              <div className="tb-verdict">
                <span key={result.verdict} className={cn('tb-stamp', `tb-stamp--${v}`)}>{STAMP[result.verdict] ?? result.verdict}</span>
                <span className={cn('tb-gap', `tb-gap--${v}`)}>
                  <LedDigits matrix width={6} dot={phone ? 3 : 4} value={ledGap} color={v === 'fair' ? 'green' : v === 'leans' ? 'amber' : 'red'} label={`Gap ${gap.toFixed(1)} percent`} />
                </span>
              </div>
              <div className="tb-tot"><small>You get</small><LedDigits matrix dot={phone ? 2.4 : 3} value={Math.round(take)} color="amber" label={`You get ${Math.round(take)}`} /></div>
            </div>
          )}
        </div>
      </div>

      <Half side="l" label="You send" keys={send} model={model} cards={cards} phone={phone} />
      <Half side="r" label="You get" keys={get} model={model} cards={cards} phone={phone} />
    </section>
  );
};

const hasArt = (a: { turf: string | null }) => !!a.turf;
export default TradeBanner;
