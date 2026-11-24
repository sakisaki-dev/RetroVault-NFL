import { useMemo } from 'react';
import { useHubRoute } from '@/components/stats/hub/hashRoute';
import { useBannerData } from './useBannerData';
import BannerTunnel from './BannerTunnel';
import BannerChampions from './BannerChampions';
import BannerRing from './BannerRing';
import BannerMedia from './BannerMedia';

/** Dev-only (#bannerlab, #bannerlab?p=2 for one): the four candidates for the Stats → Teams hero. */
const BannerLab = () => {
  const data = useBannerData();
  const { route } = useHubRoute();
  const only = Number(route.p) || 0;
  const items = useMemo(() => (data ? [[1, 'Tunnel of franchises', <BannerTunnel key="1" data={data} />] as const, [2, "Champions' night", <BannerChampions key="2" data={data} />] as const, [3, 'Ring of honor', <BannerRing key="3" data={data} />] as const, [4, 'Media wall', <BannerMedia key="4" data={data} />] as const] : []), [data]);
  return (
    <div className="container space-y-8 py-8">
      {!data && <p className="text-muted-foreground">Loading the league…</p>}
      {items
        .filter(([n]) => !only || only === n)
        .map(([n, name, el]) => (
          <section key={n} id={`banner-${n}`} aria-label={name} className="space-y-2">
            <h3 className="font-pixel text-[10px] uppercase text-muted-foreground">
              {n} · {name}
            </h3>
            {el}
          </section>
        ))}
    </div>
  );
};

export default BannerLab;
