# Couchlist Product Principles

Couchlist is built to last, not to constantly reinvent itself.

## 1. Stable core
The main product should remain familiar for years:

- Home
- Friends
- Watch Together
- Communities
- Profile

New features should fit around this core instead of forcing people to relearn the app.

## 2. Boring technology is a feature
Prefer simple, proven code over clever abstractions:

- one Next.js web app
- one small Discord bot
- one PostgreSQL database
- Drizzle for database access
- simple HTTP routes
- no microservices unless scale actually requires them
- no dependency just to save a few lines of code

A feature that needs constant repair is worse than a smaller feature that works for years.

## 3. Couchlist works without a Discord server
A user can track media, add friends, compare taste and use Watch Together without connecting a server.

Connected servers are optional community perks. They add shared taste, community watching and discovery without becoming a requirement for the rest of Couchlist.

## 4. Watch parties stay simple
A Couchlist watch party should ask only what is necessary:

- what are you watching?
- who is invited / which community?
- optional time

Do not require episode, streaming service, exact timestamp, subtitle language or synchronized playback. People can decide those details together in Discord.

Couchlist organizes the group. It does not try to become the streaming service.

## 5. Live means live
"Watching" means a title is currently on someone's list.

"Live" should only mean they are actually in an active Couchlist watch party or another explicit supported live source. If a party belongs to a connected server, the server/community name should be shown with the live status.

## 6. Optional integrations must stay optional
AniList, TMDB and Discord make Couchlist better, but a non-critical integration failure should not take down unrelated parts of the app.

Avoid making Couchlist dependent on fragile activity-detection or streaming integrations.

## 7. UI should be playful, not busy
The visual identity is a dark, cozy couch-night feel:

- rounded shapes
- simple blue accents
- relaxed copy
- Discord avatars for real users
- media artwork supplies most of the color
- no giant dashboards
- no constant redesigns

Polish the same layout instead of replacing it every few months.

## 8. Feature admission rule
Before adding a feature, ask:

1. Does it make tracking, friends, watching together or communities noticeably better?
2. Can it be explained in one sentence?
3. Can it work without a fragile background service?
4. Can we maintain it without weekly fixes?
5. Does it avoid duplicating a feature that already exists?

If most answers are no, do not add it.
