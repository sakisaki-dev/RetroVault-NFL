import { cn } from '@/lib/utils';
import './arcade.css';

/**
 * PixelIcon: small pixel icons as inline SVG on a 12 x 12 grid (crisp edges). Props: name ('trophy' | 'star' | 'coin' |
 * 'flag' | 'ball' | 'helmet' | 'whistle' | 'fire' | 'crown' | 'clock' | 'moon' | 'arrow'), size? (px, default 16),
 * color? (main colour, default currentColor, so it follows the text), className?. '#' is the main colour, 'h' a
 * highlight, 'k' the dark ink. Decorative unless label is given.
 */
const ICONS = {
  trophy: ['............', '.##########.', '####hh######', '#.#hh#####.#', '#.########.#', '##.######.##', '...######...', '....####....', '.....##.....', '.....##.....', '...######...', '..########..'],
  star: ['.....##.....', '.....##.....', '....####....', '############', '.###h######.', '..########..', '...######...', '..########..', '..###..###..', '.###....###.', '.##......##.', '............'],
  coin: ['....####....', '..########..', '.##hh######.', '.#h##kk###k.', '##h###kk###k', '##h##k#####k', '##h###kk###k', '##h#####k#kk', '.#h###kk##k.', '.##k#####kk.', '..########..', '....####....'],
  flag: ['.kkkkkkkk...', '.k#######k..', '.k########k.', '.k###hh####k', '.k########k.', '.k#######k..', '.k#####kk...', '.k..........', '.k..........', '.k..........', '.k..........', 'kkkk........'],
  ball: ['............', '.....kkkk...', '...kk####k..', '..k####hh#k.', '.k####hh###k', '.k##k#kk###k', '.k#kkkkk#k#k', '.k##kk#k###k', '..k####h##k.', '...kk####k..', '.....kkkk...', '............'],
  helmet: ['...######...', '..########..', '.####hh####.', '.###hh#####.', '.##########.', '####kkkk###.', '###k####k##.', '###kkkkkk##.', '###.#####...', '.##.###.....', '..#.........', '............'],
  whistle: ['............', '............', '..######....', '.#hh####....', '.#######.###', '.#######.#..', '.#######.###', '.#######....', '..######....', '............', '............', '............'],
  fire: ['.....#......', '.....##..#..', '....###.##..', '...#####.##.', '..#######.#.', '.####hh#####', '.###hhh#####', '.###hhhh####', '.####hhh###.', '..#######k..', '...#####k...', '............'],
  crown: ['............', '#...#..#...#', '##..##.##..#', '###.###.##.#', '############', '#hh#######.#', '############', '############', 'kkkkkkkkkkkk', '............', '............', '............'],
  clock: ['...######...', '..########..', '.##hh#####k.', '.##########.', '##...#.....#', '##...#.....#', '##...###...#', '##.........#', '.##########.', '.#########k.', '..########..', '...######...'],
  moon: ['....#####...', '..####hh....', '.####h......', '.####.......', '####........', '####........', '####........', '.####.....#.', '.#####...##.', '..#########.', '...#######..', '.....###....'],
  arrow: ['............', '.....##.....', '.....###....', '.....####...', '############', '#####hhhhh##', '############', '.....####...', '.....###....', '.....##.....', '............', '............'],
} as const;
export type PixelIconName = keyof typeof ICONS;
export const PIXEL_ICON_NAMES = Object.keys(ICONS) as PixelIconName[];

export const PixelIcon = ({ name, size = 16, color, label, className }: { name: PixelIconName; size?: number; color?: string; label?: string; className?: string }) => (
  <svg
    viewBox="0 0 12 12"
    width={size}
    height={size}
    shapeRendering="crispEdges"
    className={cn('ax-icon', className)}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
    style={{ color }}
  >
    {ICONS[name].flatMap((row, y) =>
      [...row].map((ch, x) =>
        ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={ch === 'h' ? '#fff6cf' : ch === 'k' ? '#0b1022' : 'currentColor'} />,
      ),
    )}
  </svg>
);
export default PixelIcon;
