import { cn } from '@/lib/utils';
import type { Clinch } from '@/utils/playoffOdds';
import './odds.css';

const TAG_TITLE: Record<Exclude<Clinch, null>, string> = {
  z: 'Clinched the top seed and the bye',
  y: 'Clinched the division',
  x: 'Clinched a playoff spot',
  e: 'Eliminated',
};
/** x clinched a spot, y the division, z the top seed and bye, e eliminated: the marks the bound check proved. */
export const ClinchTag = ({ tag }: { tag: Clinch }) =>
  tag ? (
    <span className={cn('po-tag', `po-tag--${tag}`)} title={TAG_TITLE[tag]} aria-label={TAG_TITLE[tag]}>
      {tag}
    </span>
  ) : null;

