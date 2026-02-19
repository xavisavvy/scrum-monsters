import { useNavigate } from 'react-router';
import { AboutPage } from '@/components/marketing/AboutPage';
import { PageMeta } from '@/components/seo/PageMeta';
import { META_CONFIG } from '@/components/seo/metaConfig';

/**
 * Route wrapper for about page
 * Translates onNavigate callbacks to React Router navigation
 */
export default function AboutRoute() {
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
      <PageMeta meta={META_CONFIG.about} />
      <AboutPage
        onBackToHome={() => navigate('/')}
        onNavigate={handleNavigate}
      />
    </>
  );
}
