# 🔐 Login Credentials & Quick Access

## Default Login (Demo Account)

**Email:** `test@example.com`  
**Password:** `password123`

**Brand:** Northwind Coffee Co.  
**Demo Channels:** 8 pre-configured channels (Bluesky, Mastodon, Telegram, Discord, Slack, Custom Webhook, LinkedIn, X)

---

## Quick Start

### 1. Start the Application

```bash
# Make sure Docker is running
docker compose up -d

# Start web app
cd apps/web
npm run dev

# In another terminal, start worker
cd apps/worker
npm run dev
```

### 2. Access the App

**URL:** http://localhost:3000

**Login Page:** http://localhost:3000/login

### 3. Navigate to Channels

After login, go to:
- **Channels Page:** Click "Channels" in sidebar
- **Or direct URL:** http://localhost:3000/app/{brandId}/channels

---

## Testing Composio Integration

### Connect Your First Social Media Account

1. **Login** with `test@example.com` / `password123`

2. **Go to Channels** page

3. **Click "Connect channel"** button (top right)

4. **Select a platform:**
   - ✅ YouTube (OAuth via Composio)
   - ✅ Instagram (OAuth via Composio)
   - ✅ Facebook (OAuth via Composio)
   - ✅ TikTok (OAuth via Composio)
   - ✅ LinkedIn (OAuth via Composio)
   - ✅ Pinterest (OAuth via Composio)
   - ✅ X/Twitter (OAuth via Composio)
   - ✅ Threads (OAuth via Composio)
   - ✅ Google Business (OAuth via Composio)

5. **Authorize** on the platform's OAuth page

6. **Success!** Your channel should appear as "CONNECTED"

---

## Database Access

```bash
# Connect to database
psql postgresql://postline:postline@127.0.0.1:5433/postline

# Useful queries:
SELECT email, name FROM "User";
SELECT id, name, "ownerId" FROM "Brand";
SELECT network, name, health, "composioConnectionId" FROM "Channel";
```

---

## Demo Data

If you want to recreate demo data:

```bash
npm run seed:demo
```

This creates:
- User: test@example.com
- Brand: Northwind Coffee Co.
- 8 demo channels
- ~76 posts with analytics
- Campaigns, workflows, inbox conversations
- Bio page: http://localhost:3000/b/northwind

---

## Environment Variables

**Key variables in `.env`:**

```bash
# App URL (for OAuth callbacks)
APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://postline:postline@127.0.0.1:5433/postline

# Redis
REDIS_URL=redis://127.0.0.1:6380

# Composio (for social media OAuth)
COMPOSIO_API_KEY=ak_rED79dp24rFf5j2KGqLH

# Auth
AUTH_SECRET=ti4v4t5AwuXcXhgIIGLFbBWQId3vqkR6BniyZUdv408=

# Token encryption
TOKEN_ENCRYPTION_KEY=nder9EZC+FDQG6DFDK85DYHCuuiutUfJvOOQbOZIhqo=

# AI (Agnes AI)
LLM_BASE_URL=https://apihub.agnes-ai.com/v1
LLM_API_KEY=sk-K3yyAjeJ42lHkqwkAIPIjzYh6cY2e064NRhbE07lsjMaJcdL
AI_TEXT_MODEL=agnes-3.0-flash
```

---

## Troubleshooting

### "Port 3000 already in use"

```bash
sudo fuser -k 3000/tcp
```

### "Cannot connect to database"

```bash
docker compose up -d
```

### "Channel connection failed"

Check:
1. `COMPOSIO_API_KEY` is set in `.env`
2. `APP_URL` matches your actual URL
3. Check browser console for errors
4. Check server logs for Composio errors

---

## Useful Commands

```bash
# Kill port 3000
sudo fuser -k 3000/tcp

# Restart Docker services
docker compose restart

# Check running containers
docker ps

# View logs
docker compose logs postgres
docker compose logs redis

# Database migrations
npx prisma migrate dev
npx prisma db push

# Regenerate Prisma client
npx prisma generate
```

---

## API Testing

### Test Composio OAuth Flow

```bash
# 1. Get your brand ID
psql postline -c "SELECT id, name FROM \"Brand\" WHERE \"ownerId\" = (SELECT id FROM \"User\" WHERE email = 'test@example.com');"

# 2. Test redirect endpoint (replace YOUR_BRAND_ID)
curl "http://localhost:3000/api/channels/composio/redirect?network=YOUTUBE&brandId=YOUR_BRAND_ID" \
  -H "Cookie: your_session_cookie"
```

---

## Quick Links

- **App:** http://localhost:3000
- **Login:** http://localhost:3000/login
- **Channels:** http://localhost:3000/app/{brandId}/channels
- **Planner:** http://localhost:3000/app/{brandId}/planner
- **Bio Page Demo:** http://localhost:3000/b/northwind
- **Composio Dashboard:** https://app.composio.dev

---

## Support

- **Implementation Docs:** `COMPOSIO_IMPLEMENTATION_COMPLETE.md`
- **Quick Start:** `COMPOSIO_QUICK_START.md`
- **Full Plan:** `COMPOSIO_INTEGRATION_PLAN.md`
- **Architecture:** `ARCHITECTURE.md`

---

**Note:** The demo account has 8 pre-configured channels that simulate publishing (no real social accounts). To test real publishing, connect your own social media accounts via the new Composio integration! 🚀
