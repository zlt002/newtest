import { useSearchParams } from 'react-router-dom';
import type { HooksOverviewPageData } from '../../components/hooks/types';
import HooksOverviewContent, { getRecentExecutionKey } from './OverviewContent';

export { getRecentExecutionKey };

type HooksPageProps = {
  initialData?: HooksOverviewPageData;
};

export default function HooksPage({ initialData }: HooksPageProps) {
  const [searchParams] = useSearchParams();
  const queryString = searchParams.toString();

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6">
      <div className="mx-auto h-[calc(100vh-3rem)] max-w-6xl">
        <HooksOverviewContent initialData={initialData} queryString={queryString} />
      </div>
    </main>
  );
}
