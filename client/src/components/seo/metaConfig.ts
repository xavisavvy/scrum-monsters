export const SITE_NAME = 'Scrum Monsters';
export const SITE_URL = 'https://scrummonsters.com'; // Production URL, used for OG tags
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

export interface PageMeta {
  title: string;
  description: string;
  ogType?: string; // defaults to 'website'
  ogImage?: string; // defaults to DEFAULT_OG_IMAGE
  canonicalPath?: string; // path portion for og:url
  twitterCard?: 'summary' | 'summary_large_image'; // defaults to 'summary_large_image'
}

export const META_CONFIG: Record<string, PageMeta> = {
  landing: {
    title: 'Scrum Monsters - Battle Tickets in Epic JRPG Style',
    description: 'Real-time multiplayer scrum poker estimation with JRPG-style boss battles. Turn sprint planning into an epic adventure!',
    canonicalPath: '/',
  },
  about: {
    title: 'About Scrum Monsters - The Story Behind the Quest',
    description: 'Learn how Scrum Monsters transforms boring sprint planning into exciting JRPG boss battles. Meet the vision behind the game.',
    canonicalPath: '/about',
  },
  features: {
    title: 'Features - Scrum Monsters Game Mechanics & Tools',
    description: 'Explore Scrum Monsters features: real-time voting, boss battles, team competitions, class abilities, and more. Everything you need for engaging sprint planning.',
    canonicalPath: '/features',
  },
  pricing: {
    title: 'Pricing - Scrum Monsters Plans & Options',
    description: 'Scrum Monsters pricing and plans. Free to play with optional features for teams who want more from their estimation sessions.',
    canonicalPath: '/pricing',
  },
  support: {
    title: 'Support - Scrum Monsters Help & Contact',
    description: 'Get help with Scrum Monsters. Find answers to common questions, report issues, or reach out to the development team.',
    canonicalPath: '/support',
  },
  play: {
    title: 'Play Scrum Monsters - Start Your Quest',
    description: 'Create or join a Scrum Monsters lobby. Start estimating story points in epic JRPG style.',
    canonicalPath: '/play',
  },
};

export function getGameMeta(lobbyName?: string, lobbyId?: string): PageMeta {
  return {
    title: lobbyName ? `${lobbyName} - Scrum Monsters Battle` : 'Scrum Monsters Battle',
    description: 'Live Scrum Monsters estimation battle in progress. Join the fight against scope creep!',
    ogType: 'website',
    canonicalPath: lobbyId ? `/game/${lobbyId}` : undefined,
  };
}
