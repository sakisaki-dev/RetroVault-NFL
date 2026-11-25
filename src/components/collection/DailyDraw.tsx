import { useEffect, useState } from 'react';
import { CalendarClock, Gift } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoTip } from '@/components/ui/InfoTip';
import { DAILY_ODDS, PACKS, claimDaily, dailyReady, msUntilDaily, type CollectionState } from '@/utils/collection';

const PCT = (n: number) => (n >= 1 ? `${Math.round(n)}%` : `${n}%`);
const ODDS_LINE = (Object.entries(DAILY_ODDS) as [keyof typeof DAILY_ODDS, number][])
  .map(([t, w]) => `${PACKS[t].label.replace(/ Pack$/, '')} ${PCT(w)}`)
  .join(' · ');

const countdown = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};

/** The free daily pack (utils/collection.ts claimDaily): one roll per local day, the pack type weighted by DAILY_ODDS. */
const DailyDraw = ({ state, disabled }: { state: CollectionState; disabled?: boolean }) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const ready = dailyReady(state, now);

  return (
    <div className={cn('col-daily', ready && 'col-daily--ready')}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="col-daily__icon" aria-hidden="true">
          {ready ? <Gift className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1 font-display text-sm font-bold uppercase tracking-wide">
            Daily draw
            <InfoTip className="sm:hidden" label="Pack odds">
              Chance of each pack type: {ODDS_LINE}.
            </InfoTip>
          </p>
          <p className="text-xs text-muted-foreground">
            {ready ? 'One free pack a day. Today’s is waiting.' : `Drawn today. Next draw in ${countdown(msUntilDaily(now))}.`}
          </p>
          <p className="mt-0.5 hidden text-[11px] text-muted-foreground/80 sm:block" title="Chance of each pack type">
            {ODDS_LINE}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="col-daily__btn"
        disabled={!ready || disabled}
        onClick={() => {
          claimDaily();
          setNow(new Date());
        }}
      >
        {ready ? 'Draw today’s pack' : 'Come back tomorrow'}
      </button>
    </div>
  );
};

export default DailyDraw;
