import { useNavigate } from 'react-router';
import { FeaturesPage } from '@/components/marketing/FeaturesPage';

/**
 * Route wrapper for features page
 * Translates onNavigate callbacks to React Router navigation
 */
export default function FeaturesRoute() {
  const navigate = useNavigate();

  const handleNavigate = (page: string) => {
    if (page === 'landing') {
      navigate('/');
    } else {
      navigate(`/${page}`);
    }
  };

  return (
    <FeaturesPage
      onBackToHome={() => navigate('/')}
      onNavigate={handleNavigate}
    />
  );
}
