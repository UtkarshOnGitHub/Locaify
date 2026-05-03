# AI-Powered Search Flow

## Overview

Locaify uses a multi-step AI pipeline to provide intelligent search results via WhatsApp. Here's how it works:

## 🔄 Message Flow

```
User Message
    ↓
[1] Groq LLM - Query Refinement
    ↓
[2] Tavily API - Web Search (India-focused)
    ↓
[3] Groq LLM - Format & Summarize Results
    ↓
WhatsApp Response
```

## 📋 Detailed Steps

### Step 1: Query Refinement (Groq LLM)
- **Input**: Raw user message (e.g., "best laptops for programming")
- **Process**: Uses Groq to refine the query for better search results
- **Output**: Optimized search query (e.g., "Top programming laptops 2024 India")
- **Model**: Mixtral-8x7b-32768
- **Temperature**: 0.3 (deterministic)

### Step 2: Web Search (Tavily API)
- **Input**: Refined query + Location (India)
- **Process**: Performs advanced web search with location filtering
- **Output**: Top 5 relevant results with titles, content, and URLs
- **Search Depth**: Advanced
- **Country**: India

### Step 3: Result Formatting & Summarization (Groq LLM)
- **Input**: Search results + Original user query
- **Process**: 
  - Extracts top 3 most relevant results
  - Generates concise summary of key information
  - Formats as WhatsApp-friendly message
- **Output**: Readable WhatsApp message with:
  - Result titles and descriptions
  - Source links
  - Key insights summary

### Step 4: WhatsApp Delivery
- **Input**: Formatted response
- **Process**: Sends to user via WhatsApp Business API
- **Output**: Message appears in user's WhatsApp chat

## 🛠️ Services Architecture

### `groqService.js`
```javascript
// Query Refinement
refineQuery(userMessage) 
  → Returns: optimized search query

// Result Formatting
formatSearchResults(query, results)
  → Returns: formatted WhatsApp message

// Summary Generation
generateSummary(query, results)
  → Returns: concise key insights
```

### `tavilyService.js`
```javascript
searchWithLocation(query, location)
  → Returns: search results from web
```

### `whatsappService.js`
```javascript
sendReply(recipientPhone, replyText)
  → Sends message via WhatsApp Business API
```

## 🔑 API Keys Required

1. **Tavily API Key** (Web Search)
   - Get from: https://tavily.com
   - Used for: Finding relevant information
   - Cost: Free tier available

2. **Groq API Key** (LLM)
   - Get from: https://console.groq.com
   - Used for: Query refinement & result formatting
   - Cost: Free tier with generous rate limits (~500 requests/min)

3. **WhatsApp Business API**
   - Get from: Meta Business Platform
   - Used for: Sending/receiving messages

## 📊 Example Request/Response

### User Input
```
"best gaming laptops under 100000 rupees"
```

### Step 1: Query Refinement
```
Refined Query: "Top gaming laptops under ₹100000 India 2024"
```

### Step 2: Search Results (Simplified)
```
[
  {
    title: "Best Gaming Laptops Under 1 Lakh",
    content: "Dell G15, ASUS TUF series...",
    url: "example.com/gaming-laptops"
  },
  ...
]
```

### Step 3: Formatted Response
```
🔍 Search Results for: best gaming laptops under 100000 rupees

1. Best Gaming Laptops Under 1 Lakh
Dell G15, ASUS TUF series recommended...
🔗 Source: example.com/gaming-laptops

2. Budget Gaming Laptops in India...
...

📌 Summary:
• Top models: Dell G15, ASUS TUF
• Price range: ₹70,000 - ₹100,000
• Key specs: RTX 3050+, 16GB RAM
```

## ⚙️ Configuration

All settings are in `src/config/constants.js`:

```javascript
// Groq LLM Settings
GROQ_CONFIG: {
  model: 'mixtral-8x7b-32768',
  temperature: 0.3,
  max_tokens: 500
}

// Tavily Settings
TAVILY_CONFIG: {
  searchDepth: 'advanced',
  max_results: 5
}
```

### Tuning Parameters

- **temperature** (0-1): Lower = more focused, Higher = more creative
  - Current: 0.3 (factual, deterministic)
  
- **max_tokens**: Maximum words in response
  - Current: 500 (suitable for WhatsApp)
  
- **searchDepth**: 'basic' or 'advanced'
  - Current: 'advanced' (more thorough search)

## 🚨 Error Handling

If any step fails:
1. **Query Refinement Fails**: Uses original message
2. **Search Fails**: Returns "No results found" message
3. **Formatting Fails**: Returns raw results
4. **WhatsApp Send Fails**: Logs error, doesn't retry

## 📈 Performance

- **Query Refinement**: ~1-2 seconds (Groq)
- **Web Search**: ~2-3 seconds (Tavily)
- **Result Formatting**: ~1-2 seconds (Groq)
- **Total Response Time**: ~4-7 seconds

## 🔐 Privacy & Rate Limits

- **Groq**: 500 requests/minute (free tier)
- **Tavily**: 1000 requests/month (free tier)
- **WhatsApp**: Rate limited by Meta

## 🎯 Future Enhancements

1. Add conversation context (remember user preferences)
2. Support image/media in WhatsApp messages
3. Add filtering by date range
4. Support multiple languages
5. Add user feedback loop for result quality
6. Implement caching for common queries
7. Add analytics dashboard
8. Support voice messages
