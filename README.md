# Locaify

Locaify is being reshaped into a conversational game deal assistant. The app now uses the CheapShark API flow for lookup and tracking.

## Current Scope

- WhatsApp webhook for chat-based interactions
- Game lookup by title through CheapShark
- Game details with all store deals, discounts, deal IDs, and historical low
- Store metadata lookup for real store names and images
- Image-led WhatsApp result cards using game thumbnails
- Paginated game matching with a More Games action
- Mongo-backed tracking records keyed by `gameID` and `dealID`
- Scheduled background checks using the specific deal endpoint
- WhatsApp alerts when a tracked deal improves or hits a target price

## Project Structure

```text
src/
  config/
    constants.js
    db.js
  controllers/
    messageController.js
    searchController.js
  models/
    Message.js
    TrackedGame.js
  routes/
    searchRoutes.js
    webhookRoutes.js
  services/
    dealMonitorService.js
    gameDealsApiService.js
    groqService.js
    whatsappService.js
index.js
test/
  dealMonitoring.test.js
```

## API Flow

```text
User enters game name
  -> GET /api/1.0/games?title={gameName}
  -> System gets gameID
  -> GET /api/1.0/games?id={gameID}
  -> GET /api/1.0/stores
  -> Backend compares all deals
  -> User can buy, track all stores, or track one store
  -> Cron calls GET /api/1.0/deals?id={dealID}
  -> WhatsApp alert is sent when a better deal or target price is detected
```

## Local Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Health check |
| GET | `/` | WhatsApp webhook verification |
| POST | `/` | WhatsApp webhook receiver |
| GET | `/messages` | In-memory received message list |
| GET | `/latest` | Latest received message |
| GET | `/search?q=game-title` | Backward-compatible game title search |
| GET | `/games?title=game-title` | Search matching games |
| GET | `/games?id=gameID` | Fetch game details with all deals |
| GET | `/stores` | Fetch CheapShark store metadata |
| GET | `/deals?id=dealID` | Fetch one deal by deal ID |
| GET | `/deals/run` | Manually run one monitoring cycle |

## Environment

```env
PORT=3000

VERIFY_TOKEN=your_webhook_verify_token
GENERAL_TOKEN=your_whatsapp_business_api_token

CHEAPSHARK_API_BASE_URL=https://www.cheapshark.com/api/1.0
GROQ_API_KEY=gsk-your_api_key

MONGODB_URI=mongodb://127.0.0.1:27017/locaify

TRACKING_CRON=0 */6 * * *
TRACKING_MAX_TRACKS_PER_RUN=25
TRACKING_REQUEST_TIMEOUT_MS=12000
TRACKING_REQUEST_DELAY_MS=1000
TRACKING_CURRENCY=USD
TRACKING_REGION=GLOBAL
TRACKING_BYPASS_PRICE_CHECK=false
```

## Run

```bash
npm install
npm run dev
```

For Windows PowerShell environments where script execution blocks `npm`, use:

```bash
npm.cmd run dev
```

## Test

```bash
npm test
```

or:

```bash
npm.cmd test
```

## Next Product Work

- Add normalized recommendation scoring beyond cheapest price.
- Improve all-store tracking controls and notification frequency.
- Add user preferences for platforms, stores, and alert cadence.
- Add conversational intent parsing for commands like "Track Elden Ring".
