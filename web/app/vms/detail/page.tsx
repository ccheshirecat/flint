"use client"
import dynamic from 'next/dynamic';
import { PageLayout } from '@/components/shared/page-layout';
import { ErrorBoundary } from '@/components/error-boundary';
import { useTranslation } from '@/components/i18n-provider';

const VMDetailView = dynamic(
  () => import('@/components/vm-detail-view'),
  { ssr: false }
);

export default function VMDetailPage() {
  const { t } = useTranslation();
  
  return (
    <PageLayout
      title={t('vm.details')}
      description={t('vm.manageFleet')}
    >
      <ErrorBoundary>
        <VMDetailView />
      </ErrorBoundary>
    </PageLayout>
  );
}