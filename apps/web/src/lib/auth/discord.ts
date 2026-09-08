import 'server-only';
import { AppError, ERROR_CODES } from '@couchlist/shared';

/**
 * Discord OAuth.
 *
 * The real implementation talks to discord.com. Everything else in the app
 * depends on the `DiscordOAuth` interface, so tests can substitute a fake
 * without a network call and without weakening the production path.
 *
 * Scopes are the minimum needed: `identify` for the profile, `guilds` for the
 * list of servers the user is in. Couchlist never requests message access.
 */
export const DISCORD_SCOPES = ['identify', 'guilds'] as const;

const DISCORD_API = 'https://discord.com/api/v10';
const DISCORD_AUTHORIZE = 'https://discord.com/oauth2/authorize';

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatarUrl: string | null;
}

export interface DiscordGuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  /** True when the user has Manage Guild, used for admin checks. */
  canManage: boolean;
}

export interface DiscordOAuth {
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<string>;
  fetchUser(accessToken: string): Promise<DiscordUser>;
  fetchGuilds(accessToken: string): Promise<DiscordGuildSummary[]>;
}

/** Discord's Manage Guild permission bit. */
const MANAGE_GUILD = 1n << 5n;

export class RealDiscordOAuth implements DiscordOAuth {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly timeoutMs = 10_000,
  ) {}

  authorizeUrl(state: string, redirectUri: string): string {
    const url = new URL(DISCORD_AUTHORIZE);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', DISCORD_SCOPES.join(' '));
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string, redirectUri: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    const response = await this.request(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    const payload = (await response.json()) as { access_token?: string };
    if (!payload.access_token) {
      // Deliberately vague: the response body may contain the client secret.
      throw new AppError(ERROR_CODES.CL_UNAUTHORIZED, {
        message: 'discord token exchange returned no access token',
      });
    }
    return payload.access_token;
  }

  async fetchUser(accessToken: string): Promise<DiscordUser> {
    const response = await this.request(`${DISCORD_API}/users/@me`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const user = (await response.json()) as {
      id: string;
      username: string;
      global_name?: string | null;
      avatar?: string | null;
    };

    return {
      id: user.id,
      username: user.username,
      globalName: user.global_name ?? null,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : null,
    };
  }

  async fetchGuilds(accessToken: string): Promise<DiscordGuildSummary[]> {
    const response = await this.request(`${DISCORD_API}/users/@me/guilds`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const guilds = (await response.json()) as Array<{
      id: string;
      name: string;
      icon?: string | null;
      permissions?: string;
      owner?: boolean;
    }>;

    return guilds.map((guild) => ({
      id: guild.id,
      name: guild.name,
      iconUrl: guild.icon
        ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`
        : null,
      canManage:
        guild.owner === true ||
        (BigInt(guild.permissions ?? '0') & MANAGE_GUILD) === MANAGE_GUILD,
    }));
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw new AppError(ERROR_CODES.CL_UNAUTHORIZED, {
          message: `discord responded ${response.status}`,
          context: { status: response.status },
        });
      }
      return response;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(ERROR_CODES.CL_UNAUTHORIZED, {
        message: 'discord request failed',
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

let client: DiscordOAuth | undefined;

/** Allows tests to swap in a fake without touching production wiring. */
export function setDiscordOAuth(implementation: DiscordOAuth | undefined): void {
  client = implementation;
}

export function discordOAuth(clientId: string, clientSecret: string): DiscordOAuth {
  return client ?? new RealDiscordOAuth(clientId, clientSecret);
}
