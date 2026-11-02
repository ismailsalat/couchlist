# Couchlist v8 social model

Couchlist friends are now the core social relationship. A user can search for another existing Couchlist account, send a friend request, accept it, see that friend's watch activity, compare taste, and use Watch Together without any Discord server integration.

Discord does not expose a normal user's real Discord friends list to Couchlist, so Couchlist never imports or claims to know it. Friend connections are explicit Couchlist relationships.

Connected Discord servers are optional community hubs. When a server owner runs `/admin setup`, members who use Couchlist unlock server-scoped views such as currently watching, highest rated, want-to-watch overlap, member discovery, and title-level server taste. Private profiles remain excluded from community member data.

## Upgrade test

After applying migration `0001_couchlist_friends.sql`:

1. Sign in as account A and account B.
2. On Friends, search for B from A and send a request.
3. Accept from B.
4. Confirm both accounts see each other even without relying on a connected server.
5. Add a Watching title and confirm it appears in Friends Watching.
6. Test Compare and Watch Together.
7. If both users are in a connected server, confirm the server appears only as extra context and its Community Hub page still shows server-wide taste.
