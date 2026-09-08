/**
 * Recorded response shapes from AniList and TMDB.
 *
 * The sandbox has no outbound access to either API, so these stand in for live
 * calls. They mirror the documented response format field for field.
 */
export const aniListSearchFixture = {
  data: {
    Page: {
      media: [
        {
          id: 16498,
          idMal: 16498,
          title: { romaji: 'Shingeki no Kyojin', english: 'Attack on Titan', native: '進撃の巨人' },
          seasonYear: 2013,
          episodes: 25,
          status: 'FINISHED',
          description: 'Humanity fights for survival.',
          genres: ['Action', 'Drama', 'Fantasy'],
          bannerImage: 'https://s4.anilist.co/file/banner/16498.jpg',
          coverImage: {
            large: 'https://s4.anilist.co/file/cover/16498-large.jpg',
            extraLarge: 'https://s4.anilist.co/file/cover/16498-xl.jpg',
          },
          source: 'MANGA',
          studios: { nodes: [{ name: 'WIT Studio' }] },
        },
        {
          id: 110277,
          idMal: 40028,
          title: { romaji: 'Shingeki no Kyojin: The Final Season', english: null, native: null },
          seasonYear: 2020,
          episodes: 16,
          status: 'FINISHED',
          description: 'The final season.',
          genres: ['Action'],
          bannerImage: null,
          coverImage: { large: null, extraLarge: null },
          source: 'MANGA',
          studios: { nodes: [{ name: 'MAPPA' }] },
        },
      ],
    },
  },
};

export const tmdbSearchFixture = {
  results: [
    {
      id: 157336,
      media_type: 'movie',
      title: 'Attack the Block',
      release_date: '2011-05-12',
      poster_path: '/poster.jpg',
      backdrop_path: '/backdrop.jpg',
      overview: 'A teen gang defends their block.',
    },
    {
      id: 1396,
      media_type: 'tv',
      name: 'Breaking Bad',
      first_air_date: '2008-01-20',
      poster_path: '/bb.jpg',
      backdrop_path: null,
      overview: 'A chemistry teacher turns to crime.',
    },
    { id: 999, media_type: 'person', name: 'Someone', poster_path: null },
  ],
};

export const tmdbMovieFixture = {
  id: 157336,
  title: 'Attack the Block',
  release_date: '2011-05-12',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  overview: 'A teen gang defends their block.',
  runtime: 88,
  status: 'Released',
  genres: [{ id: 878, name: 'Science Fiction' }],
  production_companies: [{ name: 'Studio Canal' }],
};
