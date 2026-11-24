import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import TeamLogo from '../brand/TeamLogo';
import { clubVars } from './clubInk';
import './arcade.css';

/**
 * PixelPanel: the site's data surface. Default is clean and professional: a flat fill, a 2px hard border, square edges,
 * readable text, no glow. Opt-ins: club? + tone 'stripe' (a hard club-colour accent bar down the left) or 'fill' (the
 * club's flat primary as the fill); watermark? (the club's logo, faint, bottom right); chunky? (stepped corners and a
 * chunky offset shadow; leave 6px of room right and bottom); scan? (scanline overlay); screen? (dark CRT, for LED boards).
 * Props: as?, club?, tone?, watermark?, chunky?, scan?, screen?, pad? 'none' | 'sm' | 'md', className?, style?, children.
 */
export interface PixelPanelProps {
  as?: ElementType;
  club?: string | null;
  tone?: 'plain' | 'fill' | 'stripe';
  watermark?: boolean;
  chunky?: boolean;
  scan?: boolean;
  screen?: boolean;
  pad?: 'none' | 'sm' | 'md';
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  [k: string]: unknown;
}
export const PixelPanel = ({ as: Tag = 'div', club, tone = 'plain', watermark, chunky, scan, screen, pad = 'md', className, style, children, ...rest }: PixelPanelProps) => (
  <Tag
    {...rest}
    className={cn('ax-panel', `ax-panel--pad-${pad}`, club && tone !== 'plain' && `ax-panel--${tone}`, chunky && 'ax-panel--chunky', scan && 'ax-scan', screen && 'ax-panel--screen ax-scan', className)}
    style={{ ...(club ? clubVars(club) : null), ...style } as CSSProperties}
  >
    {watermark && club && (
      <span className="ax-panel__mark" aria-hidden="true">
        <TeamLogo team={club} size={96} decorative />
      </span>
    )}
    {children}
  </Tag>
);
export default PixelPanel;
