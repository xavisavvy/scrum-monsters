export const SITE_NAME = 'ScrumQuest';
export const SITE_URL = 'https://scrumquest.app'; // Production URL, used for OG tags
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
    title: 'ScrumQuest - Battle Tickets in Epic JRPG Style',
    description: 'Real-time multiplayer scrum poker estimation with JRPG-style boss battles. Turn sprint planning into an epic adventure!',
    canonicalPath: '/',
  },
  about: {
    title: 'About ScrumQuest - The Story Behind the Quest',
    description: 'Learn how ScrumQuest transforms boring sprint planning into exciting JRPG boss battles. Meet the vision behind the game.',
    canonicalPath: '/about',
  },
  features: {
    title: 'Features - ScrumQuest Game Mechanics & Tools',
    description: 'Explore ScrumQuest features: real-time voting, boss battles, team competitions, class abilities, and more. Everything you need for engaging sprint planning.',
    canonicalPath: '/features',
  },
  pricing: {
    title: 'Pricing - ScrumQuest Plans & Options',
    description: 'ScrumQuest pricing and plans. Free to play with optional features for teams who want more from their estimation sessions.',
    canonicalPath: '/pricing',
  },
  support: {
    title: 'Support - ScrumQuest Help & Contact',
    description: 'Get help with ScrumQuest. Find answers to common questions, report issues, or reach out to the development team.',
    canonicalPath: '/support',
  },
  play: {
    title: 'Play ScrumQuest - Start Your Quest',
    description: 'Create or join a ScrumQuest lobby. Start estimating story points in epic JRPG style.',
    canonicalPath: '/play',
  },
};

export function getGameMeta(lobbyName?: string, lobbyId?: string): PageMeta {
  return {
    title: lobbyName ? `${lobbyName} - ScrumQuest Battle` : 'ScrumQuest Battle',
    description: 'Live ScrumQuest estimation battle in progress. Join the fight against scope creep!',
    ogType: 'website',
    canonicalPath: lobbyId ? `/game/${lobbyId}` : undefined,
  };
}
