import { useNavigate } from 'react-router';
import { LandingPage } from '@/components/marketing/LandingPage';
import { PageMeta } from '@/components/seo/PageMeta';
import { META_CONFIG } from '@/components/seo/metaConfig';

/**
 * Route wrapper for landing page
 * Translates onNavigate callbacks to React Router navigation
 */
export default function LandingRoute() {
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
      <PageMeta meta={META_CONFIG.landing} />
      <LandingPage
        onStartGame={() => navigate('/play')}
        onNavigate={handleNavigate}
      />
    </>
  );
}
