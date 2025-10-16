"use client"
import dynamic from 'next/dynamic';
import { PageLayout } from '@/components/shared/page-layout';
import { getUrlParams, navigateTo, routes } from '@/lib/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/components/i18n-provider';

const VMSerialConsole = dynamic(
  () => import('@/components/vm-serial-console').then(mod => mod.VMSerialConsole),
  { ssr: false }
);

export default function ConsolePage() {
  const { t } = useTranslation();
  const searchParams = getUrlParams();
  
  const vmUuid = searchParams.get('id'); // ✅ extract vmUuid safely

  if (!vmUuid) {
    return (
      <PageLayout
        title={t('vm.serialConsole')}
        description={t('vm.vmIdRequired')}
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h2 className="text-xl font-semibold mb-2">{t('vm.noVMSelected')}</h2>
            <p className="text-muted-foreground mb-4">{t('vm.selectVMForConsole')}</p>
            <Button onClick={() => navigateTo('/vms')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('vm.backToVMs')}
            </Button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={t('vm.serialConsole')}
      description={`${t('vm.connectToSerialConsole')} ${vmUuid.slice(0, 8)}...`}
      actions={
        <Button 
          variant="outline" 
          onClick={() => navigateTo(routes.vmDetail(vmUuid))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('vm.backToVMDetails')}
        </Button>
      }
    >
      <VMSerialConsole vmUuid={vmUuid} />
    </PageLayout>
  );
}