import { useNavigate } from 'react-router';
import { SupportPage } from '@/components/marketing/SupportPage';

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
    <SupportPage
      onBackToHome={() => navigate('/')}
      onNavigate={handleNavigate}
    />
  );
}
