import { Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** A small (i) button that holds method notes, sources and legends so they stay off the page. */
export const InfoTip = ({ children, label = 'More info', className }: { children: ReactNode; label?: string; className?: string }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={label}
        className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-gold focus-visible:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold/60', className)}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] text-xs leading-relaxed text-muted-foreground">
      {children}
    </PopoverContent>
  </Popover>
);

/** A short chip for an honesty note; the long wording sits in a tooltip-style popover. */
export const NoteChip = ({ short, children, className }: { short: string; children?: ReactNode; className?: string }) => (
  <span className={cn('inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[11px] text-muted-foreground', className)}>
    {short}
    {children && <InfoTip>{children}</InfoTip>}
  </span>
);

const SHORT_MAX = 64;

/**
 * A section's one short line. Long wording (a method, a legend, a how-to-read) keeps only its first
 * short sentence on the page; the full text sits behind a small (i). Nodes (not plain text) go
 * entirely behind the (i).
 */
export const SectionNote = ({ children, className, id }: { children: ReactNode; className?: string; id?: string }) => {
  const text = typeof children === 'string' ? children.replace(/\s+/g, ' ').trim() : null;
  if (text != null && text.length <= SHORT_MAX) return <p id={id} className={className}>{text}</p>;
  const first = text != null ? (text.match(/^[^.:;?!]+(?=[.:;?!]\s|[.:;?!]$)/)?.[0] ?? '') : '';
  const short = first.length > 0 && first.length <= SHORT_MAX ? first : '';
  return (
    <p id={id} className={cn('flex items-center gap-1', className)}>
      {short}
      <InfoTip>{children}</InfoTip>
    </p>
  );
};
