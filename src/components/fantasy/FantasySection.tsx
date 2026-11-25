import { useMemo, type CSSProperties } from 'react';
import { InfoTip } from '@/components/ui/InfoTip';
import TeamLogo from '@/components/brand/TeamLogo';
import { Reveal, stag } from '@/components/motion/Reveal';
import { useTapPick } from '../stats/comps/graphs/graphKit';
import { cn } from '@/lib/utils';
import { boomN, f1, ord, pctOf, startN, TONE_LABEL, tierOfFinish, useFantasy, type Fantasy, type FanRec, type RankedStat } from '@/utils/fantasy';
import { clubHue, NextLogos, TrendChip, teamOf } from './parts';

const OPP_LABEL: Record<string, { k: string; info: string; unit: string }> = {
  og: { k: 'Opportunities / game', info: 'Carries plus targets a game (QB: pass attempts plus carries).', unit: '' },
  ts: { k: 'Target share', info: 'His targets over his club\'s targets in the weeks he played.', unit: '%' },
  ay: { k: 'Air yards share', info: 'His air yards over his club\'s in the weeks he played.', unit: '%' },
  cs: { k: 'Carry share', info: 'His carries over his club\'s in the weeks he played.', unit: '%' },
  sn: { k: 'Offence snaps', info: 'Average share of his club\'s offensive snaps in his games (snap counts).', unit: '%' },
  po: { k: 'PPR / opportunity', info: 'PPR points per carry, target or (QB) pass attempt: efficiency.', unit: '' },
};
const OPP_ORDER = ['og', 'ts', 'ay', 'cs', 'sn', 'po'] as const;

const Tile = ({ k, v, sub, i, tone }: { k: string; v: string; sub?: string; i: number; tone?: string }) => (
  <div className={cn('fx-tile mo-rise', tone && `fx-tile--${tone}`)} style={stag(i)}>
    <span className="fx-tile__k">{k}</span>
    <span className="fx-tile__v">{v}</span>
    <span className="fx-tile__s">{sub ?? ' '}</span>
  </div>
);

/** One season of weekly PPR: bars coloured by weekly finish, the 25th to 75th percentile band, tap a bar for the game. */
const WeekChart = ({ f }: { f: Fantasy }) => {
  const { rec, pos } = f;
  const { picked, pick, boxProps } = useTapPick<number>();
  const byWeek = useMemo(() => new Map(rec.w.map((w) => [w[0], w])), [rec]);
  const weeks = Array.from({ length: f.week }, (_, i) => i + 1);
  const max = Math.max(10, ...rec.w.map((w) => w[1]), rec.ce ?? 0);
  const top = Math.ceil(max / 10) * 10;
  const grid = [0, 0.5, 1].map((x) => Math.round(top * x));
  const sel = picked != null ? byWeek.get(picked) : null;
  const pct = (v: number) => `${(Math.max(v, 0) / top) * 100}%`;
  return (
    <div className="fx-chart-box" {...boxProps}>
      <div className="fx-chart" role="list" aria-label="PPR by week">
        <div className="fx-grid" aria-hidden="true">
          {grid.map((g) => <span key={g} style={{ bottom: pct(g) }}><i>{g}</i></span>)}
          {rec.fl != null && rec.ce != null && <b className="fx-band" style={{ bottom: pct(rec.fl), height: `${((rec.ce - rec.fl) / top) * 100}%` }} />}
          {rec.md != null && <u className="fx-med" style={{ bottom: pct(rec.md) }} />}
        </div>
        {weeks.map((w) => {
          const l = byWeek.get(w);
          return (
            <div key={w} className="fx-col" role="listitem">
              {l ? (
                <button type="button" className={cn('fx-bar', `fx-bar--${tierOfFinish(pos, l[3])}`, picked === w && 'is-sel')} style={{ height: `max(3px, ${pct(l[1])})` }}
                  aria-label={`Week ${w} against ${l[2]}: ${l[1].toFixed(1)} PPR, ${pos}${l[3]} that week`} onClick={() => pick(picked === w ? null : w)} />
              ) : (
                <span className="fx-miss" title={w === f.bye ? 'Bye' : 'Did not play'}>{w === f.bye ? 'bye' : ''}</span>
              )}
              <span className="fx-wk">{w}</span>
            </div>
          );
        })}
      </div>
      <div className="fx-pick" aria-live="polite" style={{ '--tc': clubHue(f.club) } as CSSProperties}>
        {sel ? (
          <>
            {teamOf(sel[2]) && <TeamLogo team={teamOf(sel[2])} size={26} decorative backed />}
            <b>Week {sel[0]} · {sel[2]}</b>
            <span><em>PPR</em> {sel[1].toFixed(1)}</span>
            <span><em>Finish</em> {pos}{sel[3]}</span>
          </>
        ) : (
          <span className="fx-pick__hint">Tap a bar for the game</span>
        )}
      </div>
      <ul className="fx-legend">
        <li><i className="fx-dot fx-dot--boom" />Boom (top {boomN(pos)})</li>
        <li><i className="fx-dot fx-dot--start" />Start-worthy (top {startN(pos)})</li>
        <li><i className="fx-dot fx-dot--flat" />Flat</li>
        <li><i className="fx-dot fx-dot--bust" />Bust (past {startN(pos) * 1.5})</li>
        <li><i className="fx-dot fx-dot--band" />Middle half of his weeks</li>
      </ul>
    </div>
  );
};

const GameChips = ({ games, pos }: { games: FanRec['w']; pos: Fantasy['pos'] }) => (
  <ul className="fx-games">
    {games.map((g) => (
      <li key={g[0]} className={cn('fx-gm', `fx-gm--${tierOfFinish(pos, g[3])}`)} title={`Week ${g[0]} against ${g[2]}: ${pos}${g[3]} that week`}>
        <span className="fx-gm__w">W{g[0]}</span>
        {teamOf(g[2]) ? <TeamLogo team={teamOf(g[2])} size={20} decorative backed /> : <span>{g[2]}</span>}
        <b>{g[1].toFixed(1)}</b>
      </li>
    ))}
  </ul>
);

const avg = (g: FanRec['w']) => g.reduce((s, x) => s + x[1], 0) / (g.length || 1);

const Windows = ({ f }: { f: Fantasy }) => {
  const { rec, pos } = f;
  const last = rec.w.slice(-3);
  const prev = rec.w.slice(-6, -3);
  return (
    <div className="fx-win">
      {last.length === 3 && (
        <div className="fx-panel mo-rise" style={stag(0)}>
          <div className="fx-panel__h"><span className="fx-k">Last 3 games</span><TrendChip trend={f.trend} /></div>
          <div className="fx-panel__v"><b>{f1(avg(last))}</b><i>PPR / game</i></div>
          <GameChips games={last} pos={pos} />
          <em className="fx-panel__s">{rec.l3r ? `${ord(rec.l3r[0])} of ${rec.l3r[1]} ${pos}s on that average` : 'Out of the recent weeks'}</em>
        </div>
      )}
      {prev.length === 3 && (
        <div className="fx-panel mo-rise" style={stag(1)}>
          <div className="fx-panel__h"><span className="fx-k">The 3 before</span></div>
          <div className="fx-panel__v"><b>{f1(avg(prev))}</b><i>PPR / game</i></div>
          <GameChips games={prev} pos={pos} />
          <em className="fx-panel__s">{f.trend ? `Last 3 are ${f.trend.delta >= 0 ? '+' : ''}${f.trend.delta.toFixed(1)} on these` : ' '}</em>
        </div>
      )}
      {f.next.length > 0 && (
        <div className="fx-panel fx-panel--next mo-rise" style={stag(2)}>
          <div className="fx-panel__h"><span className="fx-k">Next 3 games</span></div>
          <ul className="fx-mu">
            {f.next.map((s) => {
              const t = s.opp ? teamOf(s.opp) : null;
              return (
                <li key={s.week} className={cn('fx-mu__r', s.tone && `fx-mu__r--${s.tone}`)}>
                  <span className="fx-mu__w">W{s.week}</span>
                  {s.opp ? (
                    <>
                      <TeamLogo team={t ?? s.opp} size={26} decorative backed />
                      <span className="fx-mu__o"><b>{s.home ? 'vs' : 'at'} {t?.name ?? s.opp}</b><em>allows {f1(s.allowed)} to {pos}s</em></span>
                      <span className="fx-mu__t"><b>{s.rank ? ord(s.rank) : '—'}</b><em>{s.tone ? TONE_LABEL[s.tone] : ''}</em></span>
                    </>
                  ) : (
                    <span className="fx-mu__o"><b>Bye week</b></span>
                  )}
                </li>
              );
            })}
          </ul>
          <em className="fx-panel__s">Rank 1 = softest of 32 defences against {pos}s</em>
        </div>
      )}
    </div>
  );
};

/** The Deep Dive's Fantasy section (active QB, RB, WR, TE with a game this season). */
const FantasySection = ({ playerKey, active }: { playerKey: string; active: boolean }) => {
  const f = useFantasy(active ? playerKey : null);
  if (!f) return null;
  const { rec, pos } = f;
  const op = rec.op ?? {};
  const opps = OPP_ORDER.filter((k) => op[k]);
  const few = rec.g < 4;
  return (
    <Reveal className="fx" style={{ '--tc': clubHue(f.club) } as CSSProperties}>
      <div className="fx-hero">
        <Tile i={0} k="PPR total" v={f1(rec.t)} sub={`${rec.g} games · week ${f.week}`} tone="lead" />
        <Tile i={1} k="PPR / game" v={f1(rec.pg)} sub={rec.rk[4] ? `${ord(rec.rk[4])} of ${rec.rk[5]} ${pos}s` : 'Under half his club\'s games'} />
        <Tile i={2} k={`${pos} rank`} v={ord(rec.rk[0])} sub={`of ${rec.rk[1]} on total`} />
        <Tile i={3} k="Overall rank" v={ord(rec.rk[2])} sub={`of ${rec.rk[3]} skill players`} />
      </div>

      <div className="fx-block mo-rise" style={stag(4)}>
        <div className="fx-block__h">
          <span className="fx-k">Week by week · {f.season}</span>
          <InfoTip label="About the weekly chart">
            Each bar is a game in standard PPR; a bye or a missed game is a gap. Colours follow his weekly finish among every {pos} with a line that
            week: boom is the top {boomN(pos)}, start-worthy the top {startN(pos)}, bust worse than {startN(pos) * 1.5}. The shaded band is the middle half of
            his weeks (25th to 75th percentile), the line the median.
          </InfoTip>
        </div>
        <WeekChart f={f} />
      </div>

      <Windows f={f} />

      {!few && rec.sd != null && (
        <div className="fx-block mo-rise" style={stag(5)}>
          <div className="fx-block__h">
            <span className="fx-k">Consistency</span>
            <InfoTip label="About consistency">
              Floor and ceiling are the 25th and 75th percentile of his weekly PPR; the standard deviation and its ratio to his mean (CV, lower is steadier)
              come from the same weeks. Start-worthy, boom and bust are shares of his games by weekly finish at {pos}.
            </InfoTip>
          </div>
          <div className="fx-tiles">
            <Tile i={0} k="Floor" v={f1(rec.fl)} sub="25th percentile" />
            <Tile i={1} k="Median" v={f1(rec.md)} />
            <Tile i={2} k="Ceiling" v={f1(rec.ce)} sub="75th percentile" />
            <Tile i={3} k="Std dev" v={f1(rec.sd)} sub={rec.cv != null ? `CV ${rec.cv.toFixed(2)}` : undefined} />
            <Tile i={4} k="Start-worthy" v={`${pctOf(rec.sw, rec.g)}%`} sub={`${rec.sw} of ${rec.g} weeks`} tone="good" />
            <Tile i={5} k="Boom" v={`${pctOf(rec.bm, rec.g)}%`} sub={`${rec.bm} ${rec.bm === 1 ? 'week' : 'weeks'}`} />
            <Tile i={6} k="Bust" v={`${pctOf(rec.bu, rec.g)}%`} sub={`${rec.bu} ${rec.bu === 1 ? 'week' : 'weeks'}`} tone={rec.bu ? 'bad' : undefined} />
          </div>
        </div>
      )}

      {opps.length > 0 && (
        <div className="fx-block mo-rise" style={stag(6)}>
          <div className="fx-block__h">
            <span className="fx-k">Opportunity</span>
            <InfoTip label="About opportunity">
              Ranks are among {pos}s with at least half their club's games played. {OPP_ORDER.filter((k) => op[k]).map((k) => `${OPP_LABEL[k].k}: ${OPP_LABEL[k].info}`).join(' ')}
              {' '}Red-zone touches and points over expectation are not in the weekly data, so they are not shown.
            </InfoTip>
          </div>
          <div className="fx-tiles">
            {opps.map((k, i) => {
              const s = op[k] as RankedStat;
              const { unit } = OPP_LABEL[k];
              return <Tile key={k} i={i} k={OPP_LABEL[k].k} v={`${k === 'po' ? s[0].toFixed(2) : s[0].toFixed(1)}${unit}`} sub={s[1] ? `${ord(s[1])} of ${s[2]} ${pos}s` : undefined} />;
            })}
          </div>
        </div>
      )}
    </Reveal>
  );
};

export default FantasySection;
export { NextLogos };
