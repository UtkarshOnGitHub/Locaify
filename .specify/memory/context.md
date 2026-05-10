# Locaify — Project Context

> This document captures the current state of the codebase, the POC logic, key design decisions, and the gap between what exists and what the product vision describes. It is the primary reference for any AI agent or developer picking up this project.

---

## What the Product Does

Locaify is a **WhatsApp-based game deal assistant**. A user sends a game name in a WhatsApp chat. The bot finds matching games, shows current prices across multiple stores, recommends the best deal, and lets the user set up automated price tracking with optional target-price alerts.

The entire experience is conversational — no app, no website, just chat.

---

## Tech Stack

| Concern | Technology |
|---|---|
| Runtime | Node.js (CommonJS) |
| Web framework | Express 5 |
| Database | MongoDB via Mongoose 9 |
| Pricing data | CheapShark public API |
| Messaging | WhatsApp Cloud API (Meta Graph API v25.0) |
| AI / NLP | Groq (mixtral-8x7b-32768) — wired, not yet active |
| Background jobs | node-cron |
| HTTP client | axios |
| Dev server | nodemon |

---

## Project Structure

```
index.js                        Entry point — DB connect, cron start, server listen
src/
  app.js                        Express app — middleware, routes, error handler
  config/
    constants.js                All env vars and runtime constants
    db.js                       Mongoose connection
  routes/
    webhookRoutes.js            GET / (verify), POST / (receive), /messages, /latest
    searchRoutes.js             /search, /games, /stores, /deals, /deals/run
  controllers/
    messageController.js        WhatsApp webhook logic + conversational state machine
    searchController.js         REST endpoints for game/deal/store lookup
  services/
    gameDealsApiService.js      CheapShark API wrapper + deal comparison
    dealMonitorService.js       Cron job — checks prices, sends alerts
    whatsappService.js          Sends WhatsApp messages via Graph API
    groqService.js              Groq intent parser (not yet integrated)
  models/
    TrackedGame.js              Mongoose schema for tracked game deals
    Message.js                  In-memory message class (not persisted)
```

---

## The Full Conversational Flow (POC)

### Step 1 — Game Search

User sends any text that doesn't match a known command.

```
User: "Elden Ring"
  -> messageController falls through all command checks
  -> searchGamesByTitle("Elden Ring")
  -> CheapShark GET /games?title=Elden Ring
  -> Exact title match attempted first; falls back to first result
  -> userGameCache.set(phone, bestMatch)   ← single game, not a list
  -> Bot sends image card (thumbnail) with:
     - Game title
     - Best price in INR (USD × 84)
     - Buttons: "Go Ahead" | "Refine Search"
```

### Step 2a — Go Ahead (confirm game)

```
User: "Go Ahead"  (button tap)
  -> GO_AHEAD_REGEX matches
  -> Reads cachedGame from userGameCache
  -> showGameDeals(phone, game)
     -> getGameDetailsWithDeals(gameID)
        -> CheapShark GET /games?id={gameID}
        -> CheapShark GET /stores  (cached 1h)
     -> compareDeals(deals) — sorts by price ascending
     -> userDealCache.set(phone, { gameID, gameTitle, thumbnailUrl, deals, cheapestPriceEver })
  -> Bot sends image card (thumbnail) with:
     - Game title
     - Best deal store + INR price
     - All-time low in INR
     - Top 3 deals (store, INR price, discount %, buy link)
     - Buttons: Track All | Track 1 | Track 2
```

### Step 2b — Refine Search

```
User: "Refine Search"  (button tap)
  -> REFINE_SEARCH_REGEX matches
  -> trackSessions.set(phone, { state: 'awaiting_refine' })
  -> Bot asks user to send the game name again
  -> Next message from user clears the refine state and runs a fresh search
```

### Step 3a — Track All Stores

```
User: "Track All"
  -> TRACK_ALL_REGEX matches
  -> buildTrackingSession({ trackingScope: 'all_stores', deals: all deals })
  -> trackSessions.set(phone, { state: 'awaiting_duration', ... })
  -> Bot asks: "How long should I watch?" + 3 days / 7 days / Until better deal buttons
```

### Step 3b — Track One Store

```
User: "Track 1"  (or "track this" or "track deal 2")
  -> TRACK_COMMAND_REGEX matches
  -> Picks deals[index] from dealCache
  -> buildTrackingSession({ trackingScope: 'store_specific', deals: [chosenDeal] })
  -> trackSessions.set(phone, { state: 'awaiting_duration', ... })
  -> Bot asks: "How long should I watch?" + duration buttons
```

### Step 4 — Duration Selection

```
User: "3 days" / "7 days" / "Until better deal"
  -> parseDurationChoice() returns { trackingMode, days }
  -> trackSessions updated: state = 'awaiting_target'
  -> Bot asks: "Send your target price or reply Skip"
```

### Step 5 — Target Price

```
User: "1500"  or  "Skip"
  -> parseCurrencyNumber() extracts numeric value
  -> saveTrackingSession() called:
     -> For each deal in session.deals:
        -> TrackedGame.findOneAndUpdate (upsert)
        -> Sets baselinePrice, lastCheckedPrice, targetPrice, trackingMode, expiresAt
  -> trackSessions.delete(phone)
  -> Bot confirms: "Tracking started. X stores tracked."
```

### Step 6 — Background Monitoring (Cron)

```
Cron fires (default: every 6 hours)
  -> runDealMonitoringCheck()
  -> Finds all active TrackedGame records (not expired, limit 25)
  -> For each track:
     -> getDealDetails(dealID)
        -> CheapShark GET /deals?id={dealID}
     -> shouldNotifyBetterDeal? (newPrice < lastCheckedPrice AND != lastNotifiedPrice)
     -> shouldNotifyTargetHit? (newPrice <= targetPrice AND != lastNotifiedPrice)
     -> If notify: sendReply(userPhone, alertMessage)
     -> Update: lastCheckedPrice, lastCheckedAt, checkCount, lastNotifiedPrice
     -> If expired or until_better_deal triggered: isActive = false
  -> Bulk deactivate any expired records
```

### Cancel at Any Time

```
User: "stop" / "cancel" / "unsubscribe"
  -> trackSessions.delete(phone)
  -> Bot confirms cancellation
```

---

## Key Design Decisions

### Currency Conversion

All prices from CheapShark are in USD. The controller converts to INR using a fixed multiplier (`USD_TO_INR = 84`). Target prices entered by users are in INR and converted back to USD before being stored in MongoDB, so cron comparisons against CheapShark prices remain in USD.

### Game Result: Single Card, Not a List

Search returns the best match (exact title match preferred, otherwise first result) as a single image card with "Go Ahead" / "Refine Search" buttons. This replaces the old numbered list of 3 games.

### Store Cache

`getStores()` caches the CheapShark store list for 1 hour in memory. This avoids a `/stores` call on every game detail lookup. The cache is process-local — a restart clears it.

### Upsert on Re-Track

`TrackedGame.findOneAndUpdate` with `upsert: true` on `{ userPhone, gameID, dealID }` means re-tracking the same game/deal resets the tracking parameters rather than creating duplicates.

### Processed Message ID Cap

`processedMessageIds` is a Set capped at 1000 entries. When it exceeds 1000, the oldest entry is evicted. This prevents unbounded memory growth while still deduplicating recent webhook retries.

### Groq Is Wired But Inactive

`groqService.js` exists and can parse natural-language intents. It is NOT called anywhere in the current message flow. The controller uses regex matching only. Groq integration is the next major feature.

---

## Current Limitations (Known Gaps vs. POC Vision)

| Gap | Current State | POC Vision |
|---|---|---|
| Intent parsing | Regex only | Groq NLP for "Track Elden Ring", "Notify me when GTA V drops below ₹1000" |
| Recommendation | Cheapest price only | Multi-factor scoring (store reliability, discount quality, historical trend) |
| User preferences | Not stored | Platform/store preferences, notification cadence |
| Prediction | Not implemented | Upcoming sale detection, best-time-to-buy |
| Session state | In-process Maps | Redis (required for multi-instance deployment) |
| Webhook queue | Synchronous | BullMQ async queue for resilience |
| Multi-tenant | Single phone number ID hardcoded | Env-configurable per deployment |
| Test coverage | One test file (`test/dealMonitoring.test.js`) | Full unit + integration coverage |

---

## API Endpoints Reference

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/` | WhatsApp webhook verification |
| POST | `/` | WhatsApp webhook receiver |
| GET | `/messages` | In-memory received message list |
| GET | `/latest` | Latest received message |
| GET | `/search?q=` | Backward-compatible game search |
| GET | `/games?title=` | Search games by title |
| GET | `/games?id=` | Game details + all store deals |
| GET | `/stores` | CheapShark store metadata |
| GET | `/deals?id=` | Single deal details |
| GET | `/deals/run` | Manually trigger one monitoring cycle |

---

## Environment Variables

```env
PORT=3000
VERIFY_TOKEN=                        # Meta webhook verification token
GENERAL_TOKEN=                       # WhatsApp Cloud API bearer token
CHEAPSHARK_API_BASE_URL=https://www.cheapshark.com/api/1.0
GROQ_API_KEY=                        # Groq API key (optional, falls back gracefully)
MONGODB_URI=mongodb://127.0.0.1:27017/locaify
TRACKING_CRON=0 */6 * * *            # Cron expression for monitoring
TRACKING_MAX_TRACKS_PER_RUN=25       # Max records checked per cron run
TRACKING_REQUEST_TIMEOUT_MS=12000    # CheapShark request timeout
TRACKING_REQUEST_DELAY_MS=1000       # Delay between cron deal checks
TRACKING_CURRENCY=USD
TRACKING_REGION=GLOBAL
TRACKING_BYPASS_PRICE_CHECK=false    # Set true to always notify (dev mode)
```

---

## Immediate Next Steps (Prioritized)

1. **Integrate Groq intent parsing** — route natural-language messages through `groqService.parseUserIntent()` before falling back to game search. This unlocks commands like "Track Elden Ring" and "Notify me when GTA V drops below ₹1000".

2. **Improve recommendation scoring** — `compareDeals()` currently sorts by price only. Add a scoring function that weights discount percentage, historical low proximity, and store reliability.

3. **User preference storage** — add a `UserPreference` model to store platform/store preferences and notification cadence per phone number.

4. **Redis session state** — replace in-process Maps with Redis so the service can scale horizontally.

5. **Test coverage** — expand `test/dealMonitoring.test.js` to cover the full message controller state machine and the API service normalization functions.
