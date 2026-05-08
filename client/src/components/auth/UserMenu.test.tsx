import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserMenu } from './UserMenu';
import { useAuth } from '@/lib/stores/useAuth';

// Mock the Zustand store — pattern matches LevelUpCelebration.test.tsx:7-12.
vi.mock('@/lib/stores/useAuth', () => ({
  useAuth: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(useAuth).mockReset();
});

describe('UserMenu render gate', () => {
  it('renders nothing while loading', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: true,
      providersConfigured: null,
      login: vi.fn(),
      logout: vi.fn(),
      profile: null,
      stats: null,
    } as any);
    const { container } = render(<UserMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when unconfigured', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      providersConfigured: false,
      login: vi.fn(),
      logout: vi.fn(),
      profile: null,
      stats: null,
    } as any);
    const { container } = render(<UserMenu />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders Sign In when configured anon', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      providersConfigured: true,
      login: vi.fn(),
      logout: vi.fn(),
      profile: null,
      stats: null,
    } as any);
    render(<UserMenu />);
    expect(
      screen.getByRole('button', { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it('renders avatar when authed', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        id: 1,
        username: 'alice',
        displayName: 'Alice User',
        avatarUrl: null,
        email: 'alice@example.com',
      },
      isLoading: false,
      providersConfigured: true,
      login: vi.fn(),
      logout: vi.fn(),
      profile: null,
      stats: null,
    } as any);
    render(<UserMenu />);
    // Avatar dropdown trigger renders — assert the Sign In button is NOT present.
    expect(
      screen.queryByRole('button', { name: /sign in/i })
    ).not.toBeInTheDocument();
  });
});
