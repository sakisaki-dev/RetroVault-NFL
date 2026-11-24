import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { SectionHeader, clubPlate } from '@/components/arcade';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GradeStep } from '@/config/skillGrades';

/** The player's banner club: section headers wear its logo, grade tiles its flat colour (null outside the Deep Dive). */
export const DdClubContext = createContext<string | null>(null);
export const useDdClub = () => useContext(DdClubContext);

/** One Deep Dive section: anchor target for the section index, broadcast-style heading, staggered reveal. */
export const DdSection = ({
  id,
  title,
  kicker,
  actions,
  index,
  children,
  className,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  kicker?: ReactNode;
  actions?: ReactNode;
  index: number;
  children: ReactNode;
  className?: string;
}) => {
  const club = useDdClub();
  return (
  <section id={id} aria-label={title} className={cn('dd-enter scroll-mt-28 space-y-3', className)} style={{ '--i': index } as CSSProperties}>
    <SectionHeader club={club} title={title} right={actions} as="h2" className="dd-sechead" />
    {kicker && <p className="-mt-1 text-xs text-muted-foreground sm:text-sm">{kicker}</p>}
    {children}
  </section>
  );
};

/** Letter-grade chip (S glows gold). */
export const GradeChip = ({ grade, size = 'md', className }: { grade: GradeStep | null; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) => {
  const dims = { sm: 'h-6 min-w-[1.75rem] px-1 text-sm', md: 'h-10 min-w-[2.75rem] px-1.5 text-2xl', lg: 'h-14 min-w-[3.75rem] px-2 text-4xl', xl: 'h-20 min-w-[5rem] px-2 text-6xl' }[size];
  if (!grade) {
    return (
      <span className={cn('dd-grade bg-panel-2 !text-muted-foreground', dims, className)} aria-label="No grade">
        —
      </span>
    );
  }
  const club = useDdClub();
  const plate = club ? clubPlate(club) : null;
  return (
    <span className={cn('dd-grade', grade.grade === 'S' && 'dd-grade--s', plate && 'dd-grade--club', dims, className)} style={plate ? { background: plate.fill, color: plate.ink, borderColor: plate.edge } : { background: grade.color }} aria-label={`Grade ${grade.grade.replace('−', ' minus').replace('+', ' plus')}`}>
      {grade.grade}
    </span>
  );
};

/** Percentile bar in the deep-dive style (fill colour optional). */
export const DdBar = ({ pct, color, label }: { pct: number | null; color?: string; label: string }) => (
  <div
    className="dd-bar"
    role="meter"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={pct == null ? undefined : Math.round(pct)}
    aria-valuetext={pct == null ? 'no data' : `${Math.round(pct)} percentile`}
  >
    <span style={{ width: `${pct == null ? 0 : Math.max(2, pct)}%`, background: color ?? '#3987e5' }} />
  </div>
);

export const SmallSampleChip = () => (
  <span className="rounded-sm border border-dashed border-gold/70 px-1.5 py-0.5 font-pixel text-[8px] uppercase text-gold" title="Fewer than 8 games: rates are noisy">
    small sample
  </span>
);
