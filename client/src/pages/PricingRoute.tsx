import { useNavigate } from 'react-router';
import { PricingPage } from '@/components/marketing/PricingPage';
import { PageMeta } from '@/components/seo/PageMeta';
import { META_CONFIG } from '@/components/seo/metaConfig';

/**
 * Route wrapper for pricing page
 * Translates onNavigate callbacks to React Router navigation
 */
export default function PricingRoute() {
  const navigate = useNavigate();

  const handleNavigate = (page: string) => {
    if (page === 'landing') {
      navigate('/');
    } else {
      navigate(`/${page}`);
    }
  };

  return (
    <>
      <PageMeta meta={META_CONFIG.pricing} />
      <PricingPage
        onBackToHome={() => navigate('/')}
        onNavigate={handleNavigate}
      />
    </>
  );
}
