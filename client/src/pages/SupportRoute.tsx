import { useNavigate } from 'react-router';
import { SupportPage } from '@/components/marketing/SupportPage';
import { PageMeta } from '@/components/seo/PageMeta';
import { META_CONFIG } from '@/components/seo/metaConfig';

/**
 * Route wrapper for support page
 * Translates onNavigate callbacks to React Router navigation
 */
export default function SupportRoute() {
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
      <PageMeta meta={META_CONFIG.support} />
      <SupportPage
        onBackToHome={() => navigate('/')}
        onNavigate={handleNavigate}
      />
    </>
  );
}
