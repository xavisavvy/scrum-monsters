import { useNavigate } from 'react-router';
import { PricingPage } from '@/components/marketing/PricingPage';

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
    <PricingPage
      onBackToHome={() => navigate('/')}
      onNavigate={handleNavigate}
    />
  );
}
