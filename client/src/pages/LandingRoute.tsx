import { useNavigate } from 'react-router';
import { LandingPage } from '@/components/marketing/LandingPage';

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
    <LandingPage
      onStartGame={() => navigate('/play')}
      onNavigate={handleNavigate}
    />
  );
}
