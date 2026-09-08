import { AppError } from "@couchlist/shared";
import { apiRoute } from "@/lib/api/handler";
import { requireUser } from "@/lib/api/guards";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { config } from "@/lib/config";
import {
  getBrowsePage,
  MAX_BROWSE_PAGES,
  type AnimeBrowseKind,
  type BrowseFilter,
  type BrowseSort,
} from "@/lib/services/media";

export const dynamic = "force-dynamic";

const FILTERS = new Set<BrowseFilter>(["anime", "movie", "tv"]);
const SORTS = new Set<BrowseSort>(["trending", "popular", "top-rated"]);
const ANIME_KINDS = new Set<AnimeBrowseKind>(["all", "series", "movies"]);

export const GET = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`browse:${user.id}`, config().RATE_LIMIT_SEARCH_PER_MINUTE);

  const url = new URL(request.url);
  const filter = url.searchParams.get("type") as BrowseFilter | null;
  const sort = url.searchParams.get("sort") as BrowseSort | null;
  const animeKind = (url.searchParams.get("anime") ?? "all") as AnimeBrowseKind;
  const pageValue = Number.parseInt(url.searchParams.get("page") ?? "1", 10);

  if (!filter || !FILTERS.has(filter)) {
    throw AppError.validation("Choose Anime, Movies, or TV Shows.");
  }
  if (!sort || !SORTS.has(sort)) {
    throw AppError.validation("Choose Trending, Popular, or Top Rated.");
  }
  if (filter === "anime" && !ANIME_KINDS.has(animeKind)) {
    throw AppError.validation("Choose All Anime, Series, or Anime Movies.");
  }
  if (
    !Number.isInteger(pageValue) ||
    pageValue < 1 ||
    pageValue > MAX_BROWSE_PAGES
  ) {
    throw AppError.validation(
      `Browse page must be between 1 and ${MAX_BROWSE_PAGES}.`,
    );
  }

  return getBrowsePage(filter, sort, pageValue, animeKind);
});
