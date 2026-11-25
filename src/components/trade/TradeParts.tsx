import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import TeamLogo from '@/components/brand/TeamLogo';
import GameSprite from '@/components/GameSprite';
import { matchPlayer } from '@/components/PlayerSearchSelect';
import { clubHue, NextLogos, teamOf } from '@/components/fantasy/parts';
import { InfoTip } from '@/components/ui/InfoTip';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import type { Player } from '@/types/player';
import { useBioInfo } from '@/utils/bioInfo';
import { useOpenCard } from '@/components/fantasy/hub/cardContext';
import { peekKeyProps } from '@/components/peek/peekProps';
import { f1, ord, toneOfRank, type FPos, type Slot } from '@/utils/fantasy';
import { useGameSprites } from '@/utils/gameSprites';
import { AVAIL_NOTE, flagsFor, SCORING_LABEL, TRADE_METHOD_NOTES, type Flag, type TradeModel, type TradePlayer } from '@/utils/tradeSim';

export const TEAM_LABELS = ['Team A', 'Team B', 'Team C', 'Team D'] as const;
/** One accent per side (gold, blue, green, rose): the side is never told apart by colour alone, its letter is always shown. */
export const TEAM_HUES = ['43 90% 62%', '199 90% 62%', '152 62% 48%', '330 80% 66%'] as const;
export const teamVars = (i: number): CSSProperties => ({ '--tm': `hsl(${TEAM_HUES[i] ?? TEAM_HUES[0]})` }) as CSSProperties;
export const pts = (n: number, d = 1) => (Math.abs(n) < 0.05 ? '0.0' : `${n > 0 ? '' : '−'}${Math.abs(n).toFixed(d)}`);
export const signed = (n: number, d = 1) => (Math.abs(n) < 0.05 ? '0.0' : `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(d)}`);

/** His game sprite in his club's kit on a floor glow; the club logo where this build has no sprites. */
export const Fig = ({ player, club, size = 's' }: { player?: Player; club: string; size?: 's' | 'm' }) => {
  const sprites = useGameSprites();
  return (
    <span className={cn('tr-fig', size === 'm' && 'tr-fig--m')} aria-hidden="true">
      {sprites && player && !player.isRealLegend ? (
        <GameSprite player={player} team={teamOf(club)?.name} kind="figure" size={size} className="tr-fig__sprite" />
      ) : (
        <TeamLogo team={teamOf(club)} size={size === 'm' ? 56 : 40} decorative backed />
      )}
    </span>
  );
};

export const FlagBadges = ({ flags }: { flags: Flag[] }) =>
  flags.length ? (
    <ul className="tr-flags" aria-label="Context flags">
      {flags.map((f) => (
        <li key={f.kind} className={cn('tr-flag', `tr-flag--${f.tone}`)}>{f.text}</li>
      ))}
    </ul>
  ) : null;

const rate = (r?: [number, number | null, number | null]) => (r ? `${r[0]}` : '—');

const toSlots = (p: TradePlayer, weeks: TradePlayer['weeks']): Slot[] =>
  weeks.map((w) => ({ week: w.week, opp: w.opp, home: w.home, allowed: w.allowed, rank: w.rank, tone: w.rank ? toneOfRank(w.rank) : null }));

const Tile = ({ k, v, s, tone }: { k: string; v: ReactNode; s?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) => (
  <div className={cn('tr-t', tone && `tr-t--${tone}`)}>
    <span className="tr-t__k">{k}</span>
    <span className="tr-t__v">{v}</span>
    <span className="tr-t__s">{s ?? ' '}</span>
  </div>
);

/** The expandable stat panel: scoring-aware production, usage, projection pieces, matchups, availability. */
export const StatPanel = ({ p, model, cardValue, age }: { p: TradePlayer; model: TradeModel; cardValue: number | null; age: number | null }) => {
  const { rec } = p;
  const op = rec.op ?? {};
  const next3 = toSlots(p, p.weeks.filter((w) => w.opp || true).slice(0, 3));
  const playoff = toSlots(p, p.weeks.filter((w) => w.playoff));
  const tdGap = p.tdObs - p.tdExp;
  const unit = SCORING_LABEL[model.settings.scoring];
  return (
    <div className="tr-stats mo-rise">
      <div className="tr-tiles">
        <Tile k={`${unit} / game`} v={f1(p.ppg)} s={`${p.g} games`} />
        <Tile k="Last 3" v={p.l3 != null ? f1(p.l3) : '—'} s={p.p3 != null ? `prev 3: ${f1(p.p3)}` : undefined} tone={p.l3 != null && p.p3 != null ? (p.l3 > p.p3 + 1 ? 'good' : p.l3 < p.p3 - 1 ? 'bad' : undefined) : undefined} />
        <Tile k="Floor · mid · ceiling" v={p.fl != null ? `${f1(p.fl)} · ${f1(p.md)} · ${f1(p.ce)}` : '—'} s="25th · 50th · 75th week" />
        <Tile k="Start-worthy" v={`${Math.round(100 * p.startRate)}%`} s={`${p.sw} of ${p.g} weeks`} />
        <Tile k="Boom · bust" v={`${Math.round(100 * p.boomRate)}% · ${Math.round(100 * p.bustRate)}%`} s="weekly finish" />
        {op.ts && <Tile k="Target share" v={`${rate(op.ts)}%`} s={op.ts[1] ? `${ord(op.ts[1])} of ${op.ts[2]}` : undefined} />}
        {op.ay && <Tile k="Air yards share" v={`${rate(op.ay)}%`} s={op.ay[1] ? `${ord(op.ay[1])} of ${op.ay[2]}` : undefined} />}
        {op.sn && <Tile k="Snap share" v={`${rate(op.sn)}%`} s={op.sn[1] ? `${ord(op.sn[1])} of ${op.sn[2]}` : undefined} />}
        {op.og && <Tile k="Opportunities / game" v={f1(op.og[0])} s={op.og[1] ? `${ord(op.og[1])} of ${op.og[2]}` : undefined} />}
        {p.ppo != null && <Tile k={`${unit} / opportunity`} v={p.ppo.toFixed(2)} />}
        <Tile k="TD points / game" v={f1(p.tdObs)} s={`league rate ${f1(p.tdExp)}`} tone={tdGap >= 1 ? 'warn' : undefined} />
        <Tile k="Projected / week" v={f1(p.base)} s={`${f1(p.l3 ?? undefined)} recent · ${f1(p.seasonShrunk)} season${p.usage != null ? ` · ${f1(p.usage)} usage` : ''}`} />
      </div>
      <div className="tr-sched">
        <div>
          <span className="tr-t__k">Next 3</span>
          {next3.length ? <NextLogos slots={next3} size={22} /> : <span className="tr-muted">no games left</span>}
        </div>
        <div>
          <span className="tr-t__k">Weeks 15–17</span>
          {playoff.length ? <NextLogos slots={playoff} size={22} /> : <span className="tr-muted">none</span>}
        </div>
        <div>
          <span className="tr-t__k">Availability</span>
          <span className="tr-avail">{p.status ? <b className="tr-flag tr-flag--bad">{p.status}</b> : <b className="tr-flag tr-flag--good">Healthy</b>}<i>{p.status ? AVAIL_NOTE[p.status] : p.weeks.some((w) => !w.opp) ? `bye wk ${p.weeks.find((w) => !w.opp)?.week}` : 'no bye left'}</i></span>
        </div>
        <div>
          <span className="tr-t__k">Age · card value</span>
          <span className="tr-avail"><b>{age ?? '—'}</b><i>card {cardValue != null ? Math.round(cardValue).toLocaleString() : '—'}</i></span>
        </div>
      </div>
    </div>
  );
};

/** One player in a side: flat club colour, sprite, position rank, points a game, ROS, VOR, flags; the stats open under it. */
export const TradeCard = ({
  p, model, player, cardValue, dest, onRemove, ghost,
}: {
  p: TradePlayer;
  model: TradeModel;
  player?: Player;
  cardValue: number | null;
  dest?: ReactNode;
  onRemove?: () => void;
  /** a player the side receives (read-only) */
  ghost?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const openCard = useOpenCard();
  const bio = useBioInfo(p.key);
  const flags = useMemo(() => flagsFor(p, bio?.age ?? null), [p, bio]);
  return (
    <article className={cn('tr-card ix-card', ghost && 'tr-card--ghost')} style={{ '--tc': clubHue(p.club) } as CSSProperties}>
      <div className="tr-card__main">
        <button type="button" className="tr-open" {...peekKeyProps(p.key)} onClick={() => openCard(p.key)} aria-label={`Open ${p.name}'s card`}>
          <Fig player={player} club={p.club} />
          <span className="tr-id">
            <b className="tr-name">{p.name}</b>
            <span className="tr-sub">
              <em className="tr-pos">{p.pos}{p.posRank}</em>
              <TeamLogo team={teamOf(p.club)} size={16} decorative backed />
              <span>{p.club}</span>
            </span>
          </span>
        </button>
        {onRemove && (
          <button type="button" className="tr-x" onClick={onRemove} aria-label={`Remove ${p.name}`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      <dl className="tr-nums">
        <div><dt>{SCORING_LABEL[model.settings.scoring]}/g</dt><dd>{f1(p.ppg)}</dd></div>
        <div><dt>ROS</dt><dd>{p.ros.toFixed(0)}</dd></div>
        <div><dt>VOR</dt><dd className={p.vor < 0 ? 'is-neg' : undefined}>{signed(p.vor, 0)}</dd></div>
      </dl>
      <FlagBadges flags={flags} />
      <div className="tr-card__foot">
        {dest}
        <button type="button" className="tr-more" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          Stats <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>
      {open && <StatPanel p={p} model={model} cardValue={cardValue} age={bio?.age ?? null} />}
    </article>
  );
};

/** Add a player: the site's word-prefix player match over the fantasy pool, best rest-of-season first. */
export const PlayerPicker = ({
  model, taken, onPick, label = 'Add player', pos,
}: {
  model: TradeModel;
  taken: Set<string>;
  onPick: (key: string) => void;
  label?: string;
  pos?: FPos | null;
}) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const pool = model.ranked.filter((p) => !taken.has(p.key) && (!pos || p.pos === pos));
    const qq = q.replace(/['’]/g, '').replace(/[-.]/g, ' ').trim();
    const out = qq ? pool.filter((p) => matchPlayer(`${p.name} ${p.pos} ${p.club}`, qq, [p.name]) > 0) : pool;
    return out.slice(0, 40);
  }, [model, taken, q, pos]);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(''); }}>
      <PopoverTrigger asChild>
        <button type="button" className="tr-add" aria-label={label}>
          <Plus className="h-4 w-4" aria-hidden="true" /> {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="tr-pop z-[70] w-[min(92vw,22rem)] p-0">
        <Command shouldFilter={false}>
          <div className="tr-pop__in">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <CommandInput value={q} onValueChange={setQ} placeholder="Name, position or club" className="h-10 text-[16px]" />
          </div>
          <CommandList className="max-h-72">
            <CommandEmpty>No fantasy player matches.</CommandEmpty>
            <CommandGroup>
              {list.map((p) => (
                <CommandItem
                  key={p.key}
                  value={p.key}
                  onSelect={() => { onPick(p.key); setOpen(false); setQ(''); }}
                  className="tr-pick"
                >
                  <TeamLogo team={teamOf(p.club)} size={22} decorative backed />
                  <span className="tr-pick__n">{p.name}</span>
                  <span className="tr-pick__m">{p.pos}{p.posRank} · {p.ros.toFixed(0)} ROS</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const MethodTip = ({ model }: { model: TradeModel }) => {
  const s = model.settings;
  return (
    <InfoTip label="How trade values are made" className="tr-info">
      {(['projection', 'role', 'rates', 'ros', 'vor', 'value', 'verdict'] as const).map((k, i) => (
        <p key={k} className={i ? 'mt-1.5' : undefined}>{TRADE_METHOD_NOTES[k]}</p>
      ))}
      <p className="mt-1.5">{s.teams} teams, weeks 15-17 weighted x{s.playoffWeight}. Flags and card value never change the verdict.</p>
    </InfoTip>
  );
};
