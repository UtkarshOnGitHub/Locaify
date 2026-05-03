# Locaify - WhatsApp AI Search Bot

A Node.js application that integrates WhatsApp messaging with AI-powered search using Tavily API.

## 📁 Project Structure

```
locaify/
├── src/
│   ├── config/
│   │   └── constants.js          # Configuration and constants
│   ├── controllers/
│   │   ├── messageController.js  # Handle webhook messages
│   │   └── searchController.js   # Handle search requests
│   ├── models/
│   │   └── Message.js            # Message schema/model
│   ├── services/
│   │   ├── locationService.js    # Location management
│   │   ├── tavilyService.js      # Tavily API integration
│   │   └── whatsappService.js    # WhatsApp message sending
│   ├── routes/
│   │   ├── webhookRoutes.js      # Webhook endpoints
│   │   └── searchRoutes.js       # Search endpoints
│   ├── app.js                    # Express app setup
│   └── server.js                 # Entry point
├── .env                          # Environment variables
├── .gitignore
├── package.json
└── README.md
```

## 🚀 Features

- **WhatsApp Webhook Integration** - Receive and process messages
- **AI Search** - Powered by Tavily API
- **Location-Aware Search** - All searches scoped to India
- **Auto-Replies** - Automatic message responses via WhatsApp
- **Message Storage** - In-memory message history
- **Clean Architecture** - Separated concerns (Controllers, Services, Routes)

## 🛠️ Setup

### Prerequisites
- Node.js 14+
- npm or yarn
- WhatsApp Business API credentials
- Tavily API key

### Installation

```bash
npm install
```

### Environment Variables

Create a `.env` file:

```env
PORT=3000
VERIFY_TOKEN=your_webhook_verify_token
GENERAL_TOKEN=your_whatsapp_business_api_token
TAVILY_API_KEY=your_tavily_api_key
```

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/` | Webhook verification (WhatsApp) |
| POST | `/` | Receive messages (WhatsApp webhook) |
| GET | `/messages` | Get all received messages |
| GET | `/latest` | Get latest message |
| GET | `/search?q=query` | Search with location context |

## 🏃 Running

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## 📊 Architecture

### Controllers
Handle HTTP requests and coordinate between routes and services.

### Services
- **locationService** - Location management (currently hardcoded to India)
- **tavilyService** - Tavily API search integration
- **whatsappService** - WhatsApp message sending

### Models
- **Message** - Represents message data structure

### Routes
- **webhookRoutes** - WhatsApp webhook endpoints
- **searchRoutes** - Search API endpoints

## 🔄 Message Flow

1. WhatsApp sends message to webhook `/` (POST)
2. `messageController.handleWebhook()` processes it
3. Message stored in `receivedMessages` array
4. `tavilyService.searchWithLocation()` performs search
5. `whatsappService.sendReply()` sends reply back to user

## 🌍 Location

Currently **hardcoded to India** for all searches. To modify:
- Edit `src/config/constants.js` - `DEFAULT_LOCATION`
- Edit `src/services/locationService.js` - `getLocation()`

## 📝 Environment Configuration

All configuration is centralized in `src/config/constants.js`:
- API keys and tokens
- Phone number ID
- Default location
- Tavily search settings

## 🛡️ Error Handling

- Try-catch blocks in all async operations
- Proper error logging
- Graceful degradation
- Error responses in API endpoints

## 📦 Dependencies

- **express** - Web framework
- **axios** - HTTP client
- **@tavily/core** - Search API
- **dotenv** - Environment variable management
- **nodemon** - Development auto-reload

## 🔧 Maintenance

### Adding New Routes
1. Create controller method
2. Add route in `src/routes/`
3. Import and use in `src/app.js`

### Adding New Services
1. Create service file in `src/services/`
2. Export functions
3. Import in controllers

### Configuration Changes
Update `src/config/constants.js` for centralized configuration.

## 📄 License

MIT
