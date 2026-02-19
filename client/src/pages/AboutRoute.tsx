import { useNavigate } from 'react-router';
import { AboutPage } from '@/components/marketing/AboutPage';

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
    <AboutPage
      onBackToHome={() => navigate('/')}
      onNavigate={handleNavigate}
    />
  );
}
