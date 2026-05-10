# Locaify Backend Constitution

> **Authority Level**: Engineering Standard | **Scope**: All backend services, APIs, webhooks, and infrastructure  
> **Version**: 2.0.0 | **Ratified**: 2026-05-10 | **Last Amended**: 2026-05-10

This document defines the non-negotiable engineering standards for building, deploying, and maintaining the Locaify backend. Compliance is mandatory for all contributors.

---

## What Locaify Is

Locaify is a **conversational game deal assistant** delivered over WhatsApp. Users send natural-language messages to discover game prices, compare deals across stores, and set up automated price tracking. The backend is a Node.js/Express service that:

1. Receives WhatsApp messages via Meta webhook
2. Parses user intent (game search, deal comparison, tracking setup)
3. Fetches live pricing data from the CheapShark API
4. Persists tracking records in MongoDB
5. Runs a background cron job to monitor prices and send WhatsApp alerts

---

## Core Principles

### I. Layered Architecture — No Cross-Layer Shortcuts

The codebase MUST follow strict layer separation:

| Layer | Responsibility | Forbidden |
|---|---|---|
| **Routes** | HTTP routing, request parsing, response dispatch | Business logic, DB queries |
| **Controllers** | Orchestrate service calls, format responses | Direct DB access, external HTTP calls |
| **Services** | Business logic, external API calls, data transformation | Direct DB queries |
| **Models** | Mongoose schemas, DB access | Business logic |
| **Config** | Environment variables, constants | Runtime logic |

Services MUST NOT call other services in circular chains. Controllers MUST NOT call the CheapShark API directly.

### II. Conversational State Is In-Memory (For Now)

The current architecture uses in-process Maps for per-user state:

- `userGameCache` — last search results per phone number
- `userDealCache` — last deal comparison per phone number
- `trackSessions` — active multi-step tracking setup sessions

This is acceptable for the POC phase. Any refactor to distributed state (Redis) MUST preserve the same state machine semantics described in Section V.

### III. Webhook Handling — Respond First, Process After

The WhatsApp webhook handler MUST:

1. Return `200 OK` immediately before any async processing
2. Deduplicate messages using `processedMessageIds` (capped Set, max 1000 entries)
3. Never throw unhandled errors that would cause a non-200 response to Meta

Duplicate webhook delivery is expected from Meta. The deduplication guard is non-negotiable.

### IV. CheapShark API Is the Single Source of Truth for Pricing

All price data MUST come from CheapShark. No hardcoded prices, no other pricing APIs. The three endpoints used are:

| Endpoint | Purpose |
|---|---|
| `GET /games?title={name}` | Search games by title, get `gameID` |
| `GET /games?id={gameID}` | Get all store deals, historical low, deal IDs |
| `GET /deals?id={dealID}` | Get current price for one deal (used by cron) |
| `GET /stores` | Get store metadata (cached 1 hour) |

Store metadata MUST be fetched via `getStores()` and cached. Never call `/stores` on every request.

### V. Tracking State Machine

Every tracked game follows this state machine. Deviations are bugs.

```
[User sends game name]
        |
        v
[Search results shown] --> userGameCache set
        |
  User picks game (game N / select N)
        |
        v
[Deal results shown] --> userDealCache set
        |
  User says "Track All" or "Track N"
        |
        v
[trackSession created: state = awaiting_duration]
        |
  User picks duration (3 days / 7 days / Until better deal)
        |
        v
[trackSession updated: state = awaiting_target]
        |
  User sends target price or "Skip"
        |
        v
[TrackedGame records saved to MongoDB]
[trackSession deleted]
        |
        v
[Cron runs every N hours]
        |
  getDealDetails(dealID) for each active track
        |
  Price improved OR target hit?
        |
        v
[WhatsApp alert sent to userPhone]
[TrackedGame.lastCheckedPrice updated]
```

At any point, "stop / cancel / unsubscribe" MUST clear the active session and confirm cancellation.

### VI. Notification Deduplication

The monitor MUST NOT send the same alert twice for the same price. The `lastNotifiedPrice` field on `TrackedGame` is the deduplication key. A notification is only sent when:

- `newPrice < lastCheckedPrice` (better deal), AND
- `newPrice !== lastNotifiedPrice`

OR:

- `newPrice <= targetPrice` (target hit), AND
- `newPrice !== lastNotifiedPrice`

`bypassPriceCheck` mode (env flag) sends a heartbeat on every cron run regardless — for development/testing only.

### VII. Message Formatting Rules

All WhatsApp messages MUST:

- Use `*bold*` for titles (WhatsApp markdown)
- End with the footer: `\n--------------\nReply STOP to cancel tracking`
- Truncate interactive button titles to 20 characters
- Truncate interactive body text to 1024 characters
- Include at most 3 buttons per interactive message

### VIII. Error Handling

- All async route handlers and webhook processing MUST be wrapped in try/catch
- Errors MUST be logged with `console.error` including the message
- User-facing errors MUST send a friendly WhatsApp reply, never expose stack traces
- The webhook handler MUST NOT re-throw — a thrown error would cause Meta to retry delivery

### IX. Environment Configuration

All runtime configuration MUST come from environment variables. No hardcoded values except:

- `PHONE_NUMBER_ID` — currently hardcoded in constants.js (acceptable for single-tenant POC, must be env var before multi-tenant)
- `GRAPH_API_VERSION` — acceptable to hardcode, update manually on Meta API version bumps

Required env vars:

```
PORT
VERIFY_TOKEN
GENERAL_TOKEN
CHEAPSHARK_API_BASE_URL
GROQ_API_KEY
MONGODB_URI
TRACKING_CRON
TRACKING_MAX_TRACKS_PER_RUN
TRACKING_REQUEST_TIMEOUT_MS
TRACKING_REQUEST_DELAY_MS
TRACKING_CURRENCY
TRACKING_REGION
TRACKING_BYPASS_PRICE_CHECK
```

### X. Groq / AI Intent Parsing

`groqService.parseUserIntent()` is wired but NOT yet integrated into the message flow. The current controller uses regex-based intent matching. When Groq is integrated:

- It MUST be used as a fallback after regex matching fails, not as the primary parser
- It MUST return a typed intent object: `{ intent, gameTitle, targetPrice, storePreference }`
- Failures MUST fall back to treating the full message as a game title search
- The Groq call MUST have a timeout consistent with `TRACKING_REQUEST_TIMEOUT_MS`

---

## Data Model Contracts

### TrackedGame (MongoDB)

| Field | Type | Notes |
|---|---|---|
| `userPhone` | String | E.164 format WhatsApp number |
| `gameID` | String | CheapShark gameID |
| `dealID` | String | CheapShark dealID — the cron key |
| `gameTitle` | String | Display name |
| `purchaseUrl` | String | `cheapshark.com/redirect?dealID=...` |
| `storeName` | String | Human-readable store name |
| `storeID` | String | CheapShark storeID |
| `baselinePrice` | Number | Price at time of tracking setup |
| `lastCheckedPrice` | Number | Updated every cron run |
| `targetPrice` | Number\|null | User-defined alert threshold |
| `trackingScope` | Enum | `all_stores` or `store_specific` |
| `trackingMode` | Enum | `duration` or `until_better_deal` |
| `expiresAt` | Date\|null | null = no expiry |
| `isActive` | Boolean | false = expired or cancelled |
| `lastNotifiedPrice` | Number\|null | Deduplication key |
| `checkCount` | Number | Total cron checks performed |

Unique index: `{ userPhone, gameID, dealID }` — upsert on re-track.

---

## What Is NOT Yet Built (Planned)

These are explicitly out of scope for the current codebase and must not be assumed to exist:

- Intent parsing via Groq (wired but not integrated)
- Recommendation scoring beyond cheapest price
- Prediction / upcoming sale detection
- User preference storage (platform, store, alert cadence)
- Redis-backed session state
- BullMQ async queue for webhook processing
- Multi-tenant phone number support
- Web UI or REST API for end users

---

## Amendment Process

Amendments require a written proposal, one-week review, and unanimous team approval. Breaking changes increment MAJOR version. Additions increment MINOR.

---

**Version**: 2.0.0 | **Ratified**: 2026-05-10
