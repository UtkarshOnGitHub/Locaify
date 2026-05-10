# Conversational Deal Flow

## Purpose

Locaify is moving into a personal game deal assistant. Lookup and tracking now use the CheapShark API endpoints directly.

## Current POC Flow

```text
User enters game name
  -> GET /api/1.0/games?title={gameName}
  -> Show matching games
  -> User selects a game
  -> GET /api/1.0/games?id={gameID}
  -> GET /api/1.0/stores
  -> Compare all available deals
  -> Show best deal, discounts, historical low, and purchase links
  -> User chooses Track All or Track N
  -> Store gameID/dealID tracking records
  -> Cron calls GET /api/1.0/deals?id={dealID}
  -> Send WhatsApp alert when price improves or target is hit
```

## API Responsibilities

### Search Game By Name

`GET /api/1.0/games?title={gameName}`

- Search game from user input.
- Return matching games.
- Provide the `gameID` used for detail lookup.

### Get Game Details And All Deals

`GET /api/1.0/games?id={gameID}`

- Fetch all store prices.
- Fetch discounts.
- Fetch historical lowest prices.
- Fetch deal IDs.
- Feed comparison and recommendation logic.

### Get Specific Deal Details

`GET /api/1.0/deals?id={dealID}`

- Fetch latest deal information.
- Power cron checks.
- Support periodic price monitoring.
- Detect better deals or target-price hits.

### Get Store Metadata

`GET /api/1.0/stores`

- Fetch store IDs and display names.
- Fetch active/inactive store status.
- Fetch store image paths for future UI use.
- Enrich all deal responses that only include `storeID`.

## Assistant Responsibilities

- Detect whether the user wants search, comparison, tracking, or target-price alerts.
- Ask follow-up questions only when required.
- Show matching games before tracking when the title is ambiguous.
- Compare current store prices from the game details endpoint.
- Recommend the best available deal with direct purchase links.
- Support tracking across all stores or one selected store.
- Store `dealID`s so background jobs can refresh prices directly.

## Recommendation Inputs

- Current price
- Discount percentage
- Historical low
- Store reliability
- Availability
- Platform/store preference
- User target price
- Recent pricing trend

## Planned Service Split

- `intentService`: classify natural-language user messages.
- `gameDealsApiService`: wrap CheapShark game and deal endpoints.
- `dealComparisonService`: compare prices and discounts across stores.
- `recommendationService`: score deals and explain the best option.
- `dealMonitorService`: run background checks and alert users.

## Current Limitations

- Recommendation is still mostly cheapest-price based.
- Prediction and upcoming-sale logic are not implemented.
- User preferences and notification cadence are not fully modeled yet.
