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
 * Friendly fallback shown when React Router catches an error from a route
 * loader/element. Most commonly fires after a deploy when a stale tab
 * tries to lazy-load a chunk hash that no longer exists; main.tsx has a
 * `vite:preloadError` listener that auto-reloads once, but if a second
 * attempt also fails we render this instead of the default "Hey
 * developer 👋" Router error screen.
 */
function RouteErrorFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f0a1f',
        color: '#fff',
        fontFamily: 'monospace',
        padding: '2rem',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
          Scrum Monsters was updated
        </h1>
        <p style={{ marginBottom: '1.5rem', opacity: 0.85 }}>
          A new version is available. Reload to continue.
        </p>
        <button
          type="button"
          onClick={() => {
            sessionStorage.removeItem('scrum-monsters:chunk-reload-attempted');
            window.location.reload();
          }}
          style={{
            padding: '0.75rem 1.5rem',
            background: '#7c3aed',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontFamily: 'inherit',
          }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

/**
 * Central route definitions using React Router v7 (declarative mode)
 * Clean URLs without hash fragments, proper browser history support
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteErrorFallback />,
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
        // Shareable quick-join URL: /join/CODE → /game/CODE.
        // Pre-existing query-param form (/?join=CODE) is handled in the
        // index loader above; this gives users a memorable path-style URL.
        path: 'join/:lobbyId',
        loader: ({ params }) =>
          redirect(`/game/${(params.lobbyId ?? '').toUpperCase()}`),
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
