---
name: Online Ludo architecture
description: Durable constraints for multiplayer room and game synchronization.
---

The online game must use the API server as the single authority for room membership, color reservations, readiness, dice rolls, turn ownership, and piece movement; browser-local state is only a rendering cache.

**Why:** The supplied legacy implementation used PeerJS browser-to-browser authority, which made rooms, reconnects, large images, and security validation unreliable.

**How to apply:** Keep offline state separate, publish room snapshots through the server's realtime stream, and validate every mutating action against the caller's player ID and current server state.