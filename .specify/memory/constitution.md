# Locaify Backend Constitution

> **Authority Level**: Engineering Standard | **Scope**: All backend services, APIs, webhooks, and infrastructure
> 
> This document defines non-negotiable engineering standards for building, deploying, and maintaining backend systems at Locaify. Compliance is mandatory.

## Core Principles

### I. Layered Architecture with Clear Separation of Concerns

Backend services MUST follow strict layered architecture:

- **Route Layer**: HTTP request/response handling only. No business logic. Validation schemas must be enforced here using libraries like `joi` or `zod`.
- **Service Layer**: All business logic, orchestration, external API calls, and data transformation. Services are reusable and testable in isolation.
- **Data Access Layer**: All database queries, transactions, migrations, and data integrity rules. Must implement repository pattern with type safety.
- **Infrastructure Layer**: Async queues (BullMQ), caching (Redis), logging, metrics, external service integrations.

Each layer MUST have clear boundaries with no cross-layer shortcuts. Services MUST NOT perform HTTP operations. Routes MUST NOT execute database queries directly.

### II. Webhook-First Design for Async Processing

Systems handling webhooks (WhatsApp, Stripe, etc.) MUST implement:

- **Verification**: Signature validation MUST happen before any processing. Invalid signatures MUST return 400 immediately.
- **Idempotency**: Every webhook MUST have an idempotency key stored in the database. Duplicate webhooks with same key MUST return same response without re-processing.
- **Async Processing**: Webhook handlers MUST queue the payload immediately and return 200 to caller. Never perform blocking operations in webhook routes.
- **Retry Logic**: Failed queue jobs MUST be retried with exponential backoff (1s, 4s, 16s, 64s). Max 5 retries before dead-letter queue.
- **Dead-Letter Queue**: Jobs failing all retries MUST go to DLQ with full context (original payload, error, attempts count).

Example structure:
```javascript
// ✅ CORRECT: Return 200 immediately, queue async work
router.post('/webhook/whatsapp', (req, res) => {
  const { signature } = req.headers;
  if (!verifySignature(signature, req.body)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  
  const idempotencyKey = req.body.id;
  if (await idempotencyStore.has(idempotencyKey)) {
    return res.status(200).json({ status: 'processed' });
  }
  
  await messageQueue.add('process-whatsapp', req.body, { jobId: idempotencyKey });
  res.status(200).json({ status: 'queued' });
});
```

### III. Test-First Development (NON-NEGOTIABLE)

TDD is mandatory for all backend code:

- **Red-Green-Refactor Cycle**: Tests written BEFORE implementation. Tests MUST fail initially. Implementation MUST make tests pass.
- **Unit Test Coverage**: Minimum 80% code coverage required. Services, utilities, helpers MUST have isolated unit tests with mocked dependencies.
- **Integration Tests**: All database interactions, queue processing, external API calls MUST have integration tests using real/test databases and services.
- **Contract Tests**: All webhooks, external API responses MUST have contract tests validating payload structure.
- **E2E Tests**: Critical user flows (e.g., complete message lifecycle) MUST have end-to-end tests.

No code MUST be merged without passing all test suites.

### IV. Observability as Core, Not Afterthought

Every service MUST include structured logging, distributed tracing, and metrics from day one:

- **Structured Logging**: All logs MUST be JSON-formatted with required fields: `timestamp`, `level`, `logger`, `message`, `context`, `error` (on error logs).
- **Tracing**: Correlation IDs MUST be generated per request and propagated across all service calls. All logs MUST include correlation ID for request tracing.
- **Metrics**: Request latency, error rates, queue depth, database query times MUST be exposed via Prometheus metrics. Alerts MUST trigger on anomalies.
- **Error Tracking**: All unhandled errors MUST be logged with full stack trace and context. Critical errors MUST trigger alerts.

### V. Security-First Implementation

Security MUST be enforced at every layer:

- **Authentication**: All endpoints MUST validate JWT tokens except public health checks. Token validation MUST happen in middleware before route handlers.
- **Authorization**: Services MUST enforce role-based access control (RBAC). Users MUST NOT access data of other users/organizations without explicit permissions.
- **Input Validation**: All user input MUST be validated against strict schemas. Type validation, length limits, format checks are MANDATORY.
- **Secrets Management**: Secrets MUST NEVER be hardcoded or logged. All secrets MUST be stored in environment variables or secret managers. Rotation policy MUST be enforced.
- **Rate Limiting**: Endpoints MUST enforce per-user/per-IP rate limiting. Critical endpoints MUST have stricter limits (e.g., 10/minute vs 100/minute).
- **HTTPS Enforcement**: All production endpoints MUST use HTTPS. HTTP requests MUST redirect or be rejected.

## API Design Standards

### REST API Contract

- **Versioning**: API version MUST be in URL path (`/api/v1/...`). NEVER use headers for versioning.
- **Resource Naming**: Use lowercase, hyphen-separated plural nouns (`/api/v1/messages`, `/api/v1/users`, `/api/v1/webhook-logs`).
- **HTTP Methods**: GET (retrieve), POST (create), PUT (full update), PATCH (partial update), DELETE (remove). Correct semantics MUST be enforced.
- **Status Codes**:
  - 200: Success
  - 201: Created
  - 204: No Content (DELETE)
  - 400: Bad Request (validation errors)
  - 401: Unauthorized (missing/invalid auth)
  - 403: Forbidden (insufficient permissions)
  - 404: Not Found
  - 409: Conflict (e.g., duplicate idempotency key)
  - 429: Rate Limited
  - 500: Server Error
  - 503: Service Unavailable

### Response Format

All responses MUST follow this structure:

**Success (2xx)**:
```json
{
  "status": "success",
  "data": { /* actual response */ },
  "meta": { "timestamp": "2026-05-02T10:30:00Z", "requestId": "uuid" }
}
```

**Error (4xx, 5xx)**:
```json
{
  "status": "error",
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "User validation failed",
    "details": [ { "field": "email", "reason": "Invalid format" } ]
  },
  "meta": { "timestamp": "2026-05-02T10:30:00Z", "requestId": "uuid" }
}
```

### Pagination

All list endpoints MUST support pagination:

```javascript
GET /api/v1/messages?limit=20&offset=0&sort=-createdAt

Response:
{
  "status": "success",
  "data": [ /* messages */ ],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "total": 1500,
    "hasMore": true
  }
}
```

## Data Layer Architecture

### Database Design

- **Schema Versioning**: Database schema MUST be version-controlled. Every schema change MUST have a migration file with up/down functions.
- **Constraints**: Foreign keys, unique constraints, NOT NULL constraints MUST be enforced at database level, not application level.
- **Indexing**: All frequently-queried fields MUST have indices. Composite indices MUST be created for multi-field queries.
- **Transactions**: Multi-row updates MUST use database transactions with ACID compliance. Transaction isolation level MUST be specified.

### Repository Pattern

All data access MUST use repository pattern:

```javascript
// ✅ CORRECT
class MessageRepository {
  async findById(id) { /* query */ }
  async findByUserId(userId, { limit, offset }) { /* paginated query */ }
  async create(messageData) { /* insert + return */ }
  async update(id, updateData) { /* update */ }
  async delete(id) { /* soft or hard delete */ }
}

// ✅ CORRECT: Services use repositories
class MessageService {
  constructor(messageRepository) {
    this.repo = messageRepository;
  }
  
  async sendMessage(userId, phoneNumber, text) {
    // Business logic here, not database logic
    const message = await this.repo.create({ userId, phoneNumber, text });
    return message;
  }
}
```

### Query Optimization

- **N+1 Prevention**: Use JOIN queries or batch loading. Lazy loading is FORBIDDEN.
- **Projection**: SELECT only required fields. `SELECT *` is FORBIDDEN in production.
- **Pagination**: All list queries MUST paginate. No unbounded queries.

## Caching Strategy

### Redis Usage

- **Cache Keys**: Format MUST be `<namespace>:<entity>:<id>`, e.g., `user:profile:123`.
- **TTL**: Cache MUST have TTL. Long-lived caches MUST have TTL of 1 hour max. Session caches MUST have TTL of 24 hours.
- **Invalidation**: On data mutations (create, update, delete), related caches MUST be invalidated immediately.
- **Cache Stampede Prevention**: Use cache locks or probabilistic early expiration for high-traffic keys.

### Cache-Aside Pattern

```javascript
async function getUserProfile(userId) {
  const cacheKey = `user:profile:${userId}`;
  
  // Check cache
  let profile = await redis.get(cacheKey);
  if (profile) return JSON.parse(profile);
  
  // Cache miss: fetch from database
  profile = await userRepository.findById(userId);
  
  // Update cache
  await redis.set(cacheKey, JSON.stringify(profile), 'EX', 3600);
  return profile;
}
```

## Async Processing with Queues

### BullMQ Implementation

All long-running or fire-and-forget operations MUST use message queues:

```javascript
// ✅ CORRECT: Using BullMQ
const messageQueue = new Queue('messages', { connection: redis });

// Producer
await messageQueue.add(
  'send-whatsapp',
  { userId: 123, phoneNumber: '918278721220', text: 'Hello' },
  { 
    jobId: `msg-${Date.now()}`, // Idempotency key
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true
  }
);

// Consumer
messageQueue.process('send-whatsapp', async (job) => {
  const { userId, phoneNumber, text } = job.data;
  await whatsappService.sendMessage(phoneNumber, text);
  return { success: true, messageId: job.id };
});

// Failed jobs
messageQueue.on('failed', async (job, err) => {
  logger.error('Job failed', { jobId: job.id, error: err.message });
  // Move to DLQ after max retries
});
```

### Concurrency and Scaling

- **Concurrency**: Queue consumer MUST process 5-10 jobs concurrently per instance (configurable).
- **Scaling**: Horizontal scaling MUST be supported by running multiple worker instances.
- **Monitoring**: Queue depth, processing time, failure rate MUST be exposed as metrics.

## Error Handling & Failure Design

### Error Hierarchy

```javascript
// ✅ CORRECT: Custom error classes
class AppError extends Error {
  constructor(message, code, statusCode = 500, details = null) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

class NotFoundError extends AppError {
  constructor(message) {
    super(message, 'NOT_FOUND', 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}
```

### Global Error Handling

All endpoints MUST have error handling middleware:

```javascript
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  
  logger.error('Request error', {
    code,
    message: err.message,
    statusCode,
    stack: err.stack,
    requestId: req.id,
    path: req.path
  });
  
  if (statusCode === 500) {
    // Alert on server errors
    alertService.trigger('SERVER_ERROR', { code, message: err.message });
  }
  
  res.status(statusCode).json({
    status: 'error',
    error: {
      code,
      message: err.message,
      details: err.details || null
    },
    meta: { requestId: req.id }
  });
});
```

### Circuit Breaker Pattern

External service calls MUST use circuit breaker to prevent cascading failures:

```javascript
const circuitBreaker = new CircuitBreaker(
  async (phoneNumber, text) => whatsappAPI.send(phoneNumber, text),
  { threshold: 5, timeout: 30000 }
);

// Will fail fast if WhatsApp API is down
try {
  await circuitBreaker.fire(phoneNumber, text);
} catch (error) {
  if (error.code === 'CIRCUIT_BREAKER_OPEN') {
    logger.warn('WhatsApp API unavailable, retrying with fallback');
    await fallbackQueue.add({ phoneNumber, text });
  }
}
```

## Observability Implementation

### Structured Logging with Pino

```javascript
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// ✅ CORRECT: Structured logs
logger.info('User authenticated', {
  userId: 123,
  email: 'user@example.com',
  requestId: req.id
});

logger.error('Message send failed', {
  error: err.message,
  code: err.code,
  userId: 123,
  phoneNumber: '918278721220',
  requestId: req.id,
  stack: err.stack
});
```

### Distributed Tracing

Correlation IDs MUST be generated per request:

```javascript
const correlationIdMiddleware = (req, res, next) => {
  req.id = req.headers['x-correlation-id'] || uuid();
  res.setHeader('x-correlation-id', req.id);
  
  // Attach to all logs
  logger.child({ correlationId: req.id });
  
  next();
};
```

### Prometheus Metrics

```javascript
const messagesSent = new Counter({
  name: 'messages_sent_total',
  help: 'Total messages sent',
  labelNames: ['provider', 'status']
});

const messageLatency = new Histogram({
  name: 'message_send_duration_seconds',
  help: 'Message send latency',
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// Usage
await messageLatency.observe(async () => {
  await sendMessage(phoneNumber, text);
  messagesSent.inc({ provider: 'whatsapp', status: 'success' });
});
```

## Folder Structure

Production-grade Node.js backend MUST follow this structure:

```
src/
├── routes/                    # Express route handlers
│   ├── messages.js
│   ├── webhooks.js
│   └── health.js
├── services/                  # Business logic
│   ├── MessageService.js
│   ├── WhatsAppService.js
│   └── UserService.js
├── repositories/              # Data access
│   ├── MessageRepository.js
│   ├── UserRepository.js
│   └── LogRepository.js
├── middleware/                # Express middleware
│   ├── auth.js
│   ├── validation.js
│   ├── errorHandler.js
│   └── correlationId.js
├── queues/                    # Message queues
│   ├── messageQueue.js
│   └── webhookQueue.js
├── models/                    # TypeScript interfaces, schemas
│   ├── Message.ts
│   ├── User.ts
│   └── WebhookLog.ts
├── utils/                     # Utilities
│   ├── logger.js
│   ├── metrics.js
│   ├── validators.js
│   └── errors.js
├── config/                    # Configuration
│   ├── database.js
│   ├── redis.js
│   └── env.js
├── migrations/                # Database migrations
│   ├── 001_create_messages_table.js
│   └── 002_create_users_table.js
├── tests/                     # Test files (mirror src structure)
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── app.js                     # Express app initialization
```

## Dependency Management

- **Minimum Versions**: All dependencies MUST be pinned in `package-lock.json`. No floating versions.
- **Audit**: `npm audit` MUST pass. No vulnerabilities allowed in production code.
- **Security Updates**: Critical security updates MUST be applied within 24 hours. Regular updates MUST be batched and tested.
- **Dependency Count**: Keep dependencies minimal. Evaluate cost/benefit for each dependency.

## Testing Strategy

### Unit Tests

- **Coverage**: 80% minimum code coverage.
- **Mocking**: External dependencies (repositories, services, APIs) MUST be mocked.
- **Assertions**: Multiple assertions per test enforcing all side effects.
- **Naming**: `describe('MessageService', () => { it('should send message to valid phone number', () => { ... }) })`

### Integration Tests

- **Setup**: Use test fixtures for databases, Redis. Reset state between tests.
- **Isolation**: Tests MUST NOT depend on each other. Execution order MUST NOT matter.
- **Cleanup**: All test data MUST be cleaned up after tests.

### E2E Tests

- **Flow Coverage**: Test complete user journeys from API request to queue processing.
- **Database**: Use real test database, not mocks.
- **External Services**: Use mocked external APIs (Stripe, WhatsApp) with fixtures.

## CI/CD Standards

### Build Pipeline

- **Linting**: `eslint`, `prettier` MUST pass.
- **Type Checking**: `tsc --noEmit` MUST pass (TypeScript required for new services).
- **Tests**: All tests MUST pass with 80%+ coverage.
- **Security Scan**: `npm audit`, `snyk` MUST pass.
- **Build**: Docker image MUST build successfully.

### Deployment Pipeline

- **Staging**: Deploy to staging environment. Run smoke tests.
- **Approval**: Manual approval required before production deployment.
- **Production**: Blue-green or canary deployment. Monitor error rates for 5 minutes.
- **Rollback**: Automatic rollback on error rate > 1%.

## Versioning Strategy

- **Format**: `MAJOR.MINOR.PATCH` (e.g., 2.1.5)
- **MAJOR**: Breaking API changes, incompatible schema changes, removed features
- **MINOR**: New features, enhancements, non-breaking changes
- **PATCH**: Bug fixes, documentation, non-functional improvements
- **Release**: Every production deployment MUST increment version and create git tag

## Configuration Management

### Environment-Specific Config

```javascript
// ✅ CORRECT: env-based configuration
const config = {
  database: {
    url: process.env.DATABASE_URL,
    pool: {
      min: process.env.DB_POOL_MIN || 5,
      max: process.env.DB_POOL_MAX || 20
    }
  },
  redis: {
    url: process.env.REDIS_URL,
    maxRetriesPerRequest: null
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  whatsapp: {
    apiToken: process.env.WHATSAPP_API_TOKEN,
    webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET
  }
};

// FORBIDDEN: Hardcoded values
// const apiToken = 'EAA94W5EZ...'; // NEVER!
```

### Secrets Rotation

- **Rotation Policy**: API tokens MUST be rotated every 90 days.
- **Process**: New token generated → Deployed with feature flag → Old token deprecated → Old token removed.

## Code Quality Standards

### Linting & Formatting

- **ESLint**: Enforce strict rules. `no-console`, `no-var`, `eqeqeq` MUST be enforced.
- **Prettier**: Auto-format all code. Line width: 100 characters.
- **Pre-commit Hook**: Linting MUST run on every commit.

### Code Review Requirements

- **Reviewers**: Minimum 2 approvals required before merge.
- **Coverage**: Code coverage MUST NOT decrease.
- **Performance**: No API latency regressions > 10%.
- **Security**: No hardcoded secrets, proper input validation, authentication checks.

### Naming Conventions

- **Variables/Functions**: camelCase (const userId, function sendMessage)
- **Classes**: PascalCase (class MessageService)
- **Constants**: UPPER_SNAKE_CASE (const MAX_RETRY_ATTEMPTS = 5)
- **Database Tables**: snake_case (users, message_logs)
- **Routes**: kebab-case (/api/v1/message-logs)

## Documentation Standards

### Code Documentation

- **JSDoc**: All public functions MUST have JSDoc comments.
- **Types**: TypeScript types MUST be used (no `any`).
- **Examples**: Complex functions MUST include usage examples.

Example:
```javascript
/**
 * Sends a WhatsApp message to the specified phone number.
 * 
 * @param {string} phoneNumber - E.164 format phone number (e.g., '918278721220')
 * @param {string} message - Message text (max 1024 characters)
 * @returns {Promise<{messageId: string, status: string}>}
 * @throws {ValidationError} If phone number format is invalid
 * @throws {RateLimitError} If user has exceeded message quota
 * 
 * @example
 * const result = await messageService.sendWhatsAppMessage('918278721220', 'Hello!');
 * console.log(result.messageId); // 'msg_123456'
 */
async sendWhatsAppMessage(phoneNumber, message) {
  // Implementation
}
```

### API Documentation

- **Swagger/OpenAPI**: All endpoints MUST be documented in OpenAPI spec.
- **Request/Response Examples**: Every endpoint MUST include example requests and responses.
- **Error Cases**: All possible error codes MUST be documented with examples.

## Performance & Scalability Guidelines

### Database Performance

- **Query Time**: All queries MUST complete in < 500ms. Slow queries MUST be optimized.
- **Connection Pooling**: Database connection pool size MUST be: `min = CPU cores, max = CPU cores * 4`
- **Connection Timeout**: Connection timeouts MUST be < 5 seconds.

### API Performance

- **Response Time**: 95th percentile response time MUST be < 2 seconds.
- **Throughput**: System MUST handle minimum 1000 requests/second per instance.
- **Memory**: Memory usage MUST not exceed 512MB per Node process.

### Scaling Strategy

- **Horizontal**: All services MUST be stateless and horizontally scalable.
- **Load Balancing**: Round-robin or least-connections strategy MUST be used.
- **Caching**: High-traffic endpoints MUST implement caching (Redis, ETags).

## Incident Handling & Recovery

### Incident Classification

- **Severity 1**: Complete service outage, data loss, security breach
- **Severity 2**: Partial service outage, degraded performance
- **Severity 3**: Minor issues, workarounds available

### Response Time SLA

- **Severity 1**: Response within 15 minutes, resolution within 4 hours
- **Severity 2**: Response within 1 hour, resolution within 8 hours
- **Severity 3**: Response within 4 hours, resolution within 24 hours

### Post-Incident Process

- **Postmortem**: Written postmortem MUST be completed within 48 hours.
- **Root Cause**: Five Whys technique MUST be applied to identify root cause.
- **Action Items**: All action items MUST be tracked and completed. No "lessons learned only" incidents.

## Governance

### Constitution Authority

This Constitution supersedes all other engineering practices, conventions, and guidelines. When conflicts arise, Constitution rules take precedence.

### Compliance Verification

- **PR Reviews**: All PRs MUST be reviewed for Constitution compliance before merge.
- **Code Audits**: Quarterly code audits MUST verify compliance across the codebase.
- **Violations**: Constitution violations MUST be addressed immediately. Repeated violations result in escalation.

### Amendment Process

- **Proposal**: Any team member can propose Constitution amendments via RFC (Request for Comments).
- **Discussion**: Minimum 1-week review period with team feedback.
- **Ratification**: Amendments require unanimous team approval.
- **Documentation**: All amendments MUST include migration plan for existing code.
- **Version Bump**: Each amendment increments version (MAJOR for breaking, MINOR for additions).

---

**Version**: 1.0.0 | **Ratified**: 2026-05-02 | **Last Amended**: 2026-05-02
