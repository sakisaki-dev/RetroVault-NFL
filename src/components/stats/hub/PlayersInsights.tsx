import type { LeagueData, Player } from '@/types/player';
import DeferredSection from '@/components/ui/DeferredSection';
import AnalyticsLab from '../analytics/AnalyticsLab';
import HiddenGems from '../HiddenGems';
import LeagueGallery from '../visual/LeagueGallery';
import LeagueShape from '../visual/LeagueShape';

interface Props {
  data: LeagueData;
  onSelect: (p: Player) => void;
}

/**
 * The heavy middle of the Players sub-tab (Analytics Lab, Landscape, Hidden Gems, League Shape), split into its own
 * chunk so the record strip, records, leaders and tables paint first on phones (see CareerTab).
 */
const PlayersInsights = ({ data, onSelect }: Props) => (
  <>
    <DeferredSection ids={['analytics']} minHeight={720}>
      <AnalyticsLab data={data} onSelect={onSelect} />
    </DeferredSection>
    <DeferredSection ids={['landscape']} minHeight={720}>
      <LeagueGallery data={data} onSelect={onSelect} />
    </DeferredSection>
    <DeferredSection ids={['hidden-gems']} minHeight={520}>
      <HiddenGems data={data} onSelect={onSelect} />
    </DeferredSection>
    <DeferredSection ids={['league-shape']} minHeight={720}>
      <LeagueShape data={data} onSelect={onSelect} />
    </DeferredSection>
  </>
);

export default PlayersInsights;
