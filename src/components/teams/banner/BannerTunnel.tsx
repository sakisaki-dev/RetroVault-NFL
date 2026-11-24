import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import TeamLogo from '@/components/brand/TeamLogo';
import { drawTunnel, rgbOf, type TunnelGeo } from '@/components/collection/tunnel/drawTunnel';
import { homeUniform } from '@/components/collection/art/sprite/uniforms';
import { displayName } from '@/utils/displayName';
import type { BannerClub, BannerData } from './useBannerData';
import { Counts, Figure, Flashes, plateOf, stars, useStadiumVars } from './parts';

/**
 * Banner 1, "Tunnel of franchises": the players' tunnel of the pack opening (drawTunnel.ts, drawn once to a canvas),
 * looking out at a lit stadium. The 32 club banners hang on its two walls in real CSS perspective (the same vanishing
 * point and depth law as the canvas, so they sit on the concrete), the all-time No. 1 first and nearest, alternating
 * left and right. TEAMS and the counts are the jumbotron in the mouth; the No. 1's greatest player runs out under it.
 */
const PERSPECTIVE = 700;
const PER_WALL = 16;

const geoFor = (cw: number, ch: number): TunnelGeo & { cw: number; ch: number } => {
  const P = cw < 640 ? 3 : 4;
  const W = Math.max(40, Math.ceil(cw / P));
  const H = Math.max(60, Math.ceil(ch / P));
  const mw = Math.min(Math.round(W * (cw < 640 ? 0.36 : 0.27)), 64);
  const mh = Math.round(H * 0.8);
  const mx = Math.round((W - mw) / 2);
  const my = Math.round(H * 0.06);
  return { P, W, H, mx, my, mw, mh, r: Math.round(mw * 0.22), vx: mx + mw / 2, vy: my + mh * 0.6, cw, ch };
};

const WallBanner = ({ club, side, z, len, tall, top }: { club: BannerClub; side: 'l' | 'r'; z: number; len: number; tall: number; top: number }) => {
  const p = plateOf(club);
  const s = PERSPECTIVE / (PERSPECTIVE - z);
  return (
    <span
      className={`bn1-flag bn1-flag--${side}`}
      style={
        {
          width: len,
          height: tall,
          top,
          transform: `translateZ(${side === 'l' ? z : z - len}px) rotateY(${side === 'l' ? 90 : -90}deg)`,
          filter: `brightness(${(0.55 + 0.5 / s).toFixed(2)})`,
          ['--c1' as string]: p.fill,
          ['--c2' as string]: p.edge,
          ['--ink' as string]: p.ink,
        } as CSSProperties
      }
    >
      <TeamLogo team={club.team} size={Math.round(len * 0.8)} decorative />
      <span className="bn1-flag__st">{stars(club.titles) || '·'}</span>
      <span className="bn1-flag__rank">{club.rank}</span>
    </span>
  );
};

const BannerTunnel = ({ data }: { data: BannerData }) => {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [geo, setGeo] = useState<(TunnelGeo & { cw: number; ch: number }) | null>(null);
  const lead = data.clubs[0];
  const kit = homeUniform(lead.team.name);
  const vars = useStadiumVars(lead.team.name, 'night');

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (cw && ch) setGeo((g) => (g && g.cw === cw && g.ch === ch ? g : geoFor(cw, ch)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !geo) return;
    c.width = geo.W;
    c.height = geo.H;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const jersey = rgbOf(kit.jersey);
    drawTunnel(ctx, geo, { type: 'elite', stripe: jersey, runner: jersey.map((v) => v * 0.78) as [number, number, number], runnerEdge: rgbOf(kit.trim) });
  }, [geo, kit.jersey, kit.trim]);

  const walls = useMemo(() => {
    const left: BannerClub[] = [];
    const right: BannerClub[] = [];
    data.clubs.forEach((c, i) => (i % 2 === 0 ? left : right).push(c));
    return { left: left.slice(0, PER_WALL), right: right.slice(0, PER_WALL) };
  }, [data.clubs]);

  const style: CSSProperties = { ...vars };
  let flags: JSX.Element[] = [];
  if (geo) {
    const P = geo.P;
    const mhC = geo.mh * P;
    const wallTop = geo.vy * P - mhC * 0.22;
    const tall = mhC * 0.26;
    const len = PERSPECTIVE * 0.04;
    // z of the first (nearest) banner and the step; rank 1 near the camera
    const zNear = PERSPECTIVE * (1 - 1 / 3.7);
    const step = PERSPECTIVE * 0.0415;
    const make = (list: BannerClub[], side: 'l' | 'r') =>
      list.map((c, k) => <WallBanner key={c.s.key} club={c} side={side} z={zNear - k * step} len={len} tall={tall} top={wallTop} />);
    flags = [...make(walls.left, 'l'), ...make(walls.right, 'r')];
    Object.assign(style, {
      ['--tn-mx' as string]: `${geo.mx * P}px`,
      ['--tn-my' as string]: `${geo.my * P}px`,
      ['--tn-mw' as string]: `${geo.mw * P}px`,
      ['--tn-mh' as string]: `${geo.mh * P}px`,
      ['--tn-vx' as string]: `${geo.vx * P}px`,
      ['--tn-vy' as string]: `${geo.vy * P}px`,
      ['--tn-d' as string]: `${PERSPECTIVE}px`,
      ['--tn-r' as string]: `${geo.r * P}px`,
      ['--tn-c1' as string]: kit.jersey,
      ['--tn-c2' as string]: kit.trim,
    });
  }

  return (
    <div ref={root} className="bn bn1" style={style} role="img" aria-label={`Teams: ${data.totals.franchises} franchises, ${data.totals.superBowls} Super Bowls, ${data.totals.champions} champions`}>
      {geo && (
        <>
          <div className="bn1-mouth">
            <span className="bn1-sky" />
            <span className="bn1-towers" />
            <span className="bn1-stands" />
            <span className="bn1-crowd" />
            <span className="bn1-turf" />
            <Flashes n={9} className="bn1-flash" />
            <div className="bn1-board">
              <span className="bn-kicker">All time since {data.totals.since}</span>
              <b>Teams</b>
              <Counts data={data} />
            </div>
          </div>
          <canvas ref={canvas} className="bn1-walls" style={{ width: geo.W * geo.P, height: geo.H * geo.P }} />
          <div className="bn1-world">{flags}</div>
          <span className="bn1-spill" />
          <span className="bn1-vig" />
          <div className="bn1-runner">
            <Figure club={lead} action="run" size="m" />
            <span className="bn1-runner__plate">
              <TeamLogo team={lead.team} size={16} decorative />
              <span>
                <small>All-time No. 1 · {lead.team.name}</small>
                <b>{lead.star ? displayName(lead.star.name) : ''}</b>
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default BannerTunnel;
