// Server-side meta tag injection for social media crawlers
// Injects Open Graph and Twitter Card meta tags into index.html

const SITE_NAME = 'Scrum Monsters';
const SITE_URL = process.env.SITE_URL || 'https://scrummonsters.com';
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-image.png`;

interface MetaConfig {
  title: string;
  description: string;
  ogType?: string;
  ogImage?: string;
  canonicalUrl?: string;
}

// Mirror of client-side META_CONFIG -- keep in sync with client/src/components/seo/metaConfig.ts
const ROUTE_META: Record<string, MetaConfig> = {
  '/': {
    title: 'Scrum Monsters - Battle Tickets in Epic JRPG Style',
    description: 'Real-time multiplayer scrum poker estimation with JRPG-style boss battles. Turn sprint planning into an epic adventure!',
  },
  '/about': {
    title: 'About Scrum Monsters - The Story Behind the Quest',
    description: 'Learn how Scrum Monsters transforms boring sprint planning into exciting JRPG boss battles. Meet the vision behind the game.',
  },
  '/features': {
    title: 'Features - Scrum Monsters Game Mechanics & Tools',
    description: 'Explore Scrum Monsters features: real-time voting, boss battles, team competitions, class abilities, and more. Everything you need for engaging sprint planning.',
  },
  '/pricing': {
    title: 'Pricing - Scrum Monsters Plans & Options',
    description: 'Scrum Monsters pricing and plans. Free to play with optional features for teams who want more from their estimation sessions.',
  },
  '/support': {
    title: 'Support - Scrum Monsters Help & Contact',
    description: 'Get help with Scrum Monsters. Find answers to common questions, report issues, or reach out to the development team.',
  },
  '/play': {
    title: 'Play Scrum Monsters - Start Your Quest',
    description: 'Create or join a Scrum Monsters lobby. Start estimating story points in epic JRPG style.',
  },
};

function getMetaForPath(path: string): MetaConfig {
  // Exact match first
  if (ROUTE_META[path]) return ROUTE_META[path];

  // Game route pattern: /game/:lobbyId
  if (path.startsWith('/game/')) {
    const lobbyId = path.split('/')[2];
    return {
      title: lobbyId ? `${lobbyId} - Scrum Monsters Battle` : 'Scrum Monsters Battle',
      description: 'Live Scrum Monsters estimation battle in progress. Join the fight against scope creep!',
    };
  }

  // Default fallback
  return ROUTE_META['/'];
}

export function injectMetaTags(html: string, requestPath: string): string {
  const meta = getMetaForPath(requestPath);
  const canonicalUrl = `${SITE_URL}${requestPath === '/' ? '' : requestPath}`;
  const ogImage = meta.ogImage || DEFAULT_OG_IMAGE;

  const metaTags = `
    <title>${meta.title}</title>
    <meta name="description" content="${meta.description}" />
    <meta property="og:type" content="${meta.ogType || 'website'}" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${meta.title}" />
    <meta property="og:description" content="${meta.description}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:url" content="${canonicalUrl}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${meta.title}" />
    <meta name="twitter:description" content="${meta.description}" />
    <meta name="twitter:image" content="${ogImage}" />
    <link rel="canonical" href="${canonicalUrl}" />`;

  // Inject before </head> in the HTML template
  // Remove any existing <title> tag to prevent duplicates
  let processed = html.replace(/<title>.*?<\/title>/i, '');
  // Remove any existing meta description to prevent duplicates
  processed = processed.replace(/<meta\s+name="description"[^>]*>/i, '');
  // Inject new meta tags before </head>
  processed = processed.replace('</head>', `${metaTags}\n  </head>`);

  return processed;
}
