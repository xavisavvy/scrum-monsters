import { Helmet } from 'react-helmet-async';
import { SITE_NAME, SITE_URL, DEFAULT_OG_IMAGE, type PageMeta as PageMetaType } from './metaConfig';

interface Props {
  meta: PageMetaType;
}

export function PageMeta({ meta }: Props) {
  const fullUrl = meta.canonicalPath ? `${SITE_URL}${meta.canonicalPath}` : SITE_URL;
  const ogImage = meta.ogImage || DEFAULT_OG_IMAGE;
  const twitterCard = meta.twitterCard || 'summary_large_image';

  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />

      {/* Open Graph */}
      <meta property="og:type" content={meta.ogType || 'website'} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:url" content={fullUrl} />

      {/* Twitter Card */}
      <meta name="twitter:card" content={twitterCard} />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={ogImage} />

      {/* Canonical URL */}
      {meta.canonicalPath && <link rel="canonical" href={fullUrl} />}
    </Helmet>
  );
}
