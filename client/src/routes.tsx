import { createBrowserRouter, redirect } from 'react-router';
import App from './App';
import LandingRoute from './pages/LandingRoute';
import AboutRoute from './pages/AboutRoute';
import FeaturesRoute from './pages/FeaturesRoute';
import PricingRoute from './pages/PricingRoute';
import SupportRoute from './pages/SupportRoute';
import MenuPage from './pages/MenuPage';
import GamePage from './pages/GamePage';
import RoomPage from './pages/RoomPage';

/**
 * Central route definitions using React Router v7 (declarative mode)
 * Clean URLs without hash fragments, proper browser history support
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      {
        index: true,
        loader: ({ request }) => {
          // Handle legacy query params and redirect to clean URLs
          const url = new URL(request.url);
          const join = url.searchParams.get('join');
          const room = url.searchParams.get('room');
          const game = url.searchParams.get('game');
          const page = url.searchParams.get('page');

          if (join) return redirect(`/game/${join.toUpperCase()}`);
          if (room) return redirect(`/room/${room}`);
          if (game === 'menu') return redirect('/play');
          if (page === 'about') return redirect('/about');
          if (page === 'features') return redirect('/features');
          if (page === 'pricing') return redirect('/pricing');
          if (page === 'support') return redirect('/support');

          return null;
        },
        element: <LandingRoute />,
      },
      {
        path: 'about',
        element: <AboutRoute />,
      },
      {
        path: 'features',
        element: <FeaturesRoute />,
      },
      {
        path: 'pricing',
        element: <PricingRoute />,
      },
      {
        path: 'support',
        element: <SupportRoute />,
      },
      {
        path: 'play',
        element: <MenuPage />,
      },
      {
        path: 'game/:lobbyId',
        element: <GamePage />,
      },
      {
        path: 'room/:roomId',
        element: <RoomPage />,
      },
      {
        path: '*',
        loader: () => redirect('/'),
      },
    ],
  },
]);
