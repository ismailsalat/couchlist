import type { MetadataRoute } from 'next';

/**
 * Small, boring PWA manifest on purpose.
 * Couchlist stays a normal web app; installability is just another way to open it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Couchlist',
    short_name: 'Couchlist',
    description: 'Good shows. Better company.',
    start_url: '/home',
    display: 'standalone',
    background_color: '#080b0f',
    theme_color: '#0b1220',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
