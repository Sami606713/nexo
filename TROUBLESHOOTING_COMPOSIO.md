# Composio Integration Troubleshooting

## Current Issue

Getting "Couldn't connect" error when trying to connect channels via Composio.

## Debugging Steps

### 1. Check Server Logs

When you click "Connect channel" and select a platform, watch your terminal where `npm run dev` is running. You should see logs like:

```
[Composio Redirect] Starting OAuth for: { network: 'YOUTUBE', brandId: 'xxx' }
[Composio Redirect] User authenticated: user_xxx
[Composio Redirect] Entity ID: entity_xxx
[Composio Redirect] App name: youtube
[Composio Redirect] Generated OAuth URL, redirecting...
```

If you see an error instead, that will tell us what's failing.

### 2. Check Environment Variables

Make sure these are set in `.env`:

```bash
COMPOSIO_API_KEY=ak_rED79dp24rFf5j2KGqLH
APP_URL=http://localhost:3000
```

Verify in terminal:
```bash
echo $COMPOSIO_API_KEY  # Should show: ak_rED79dp24rFf5j2KGqLH
```

Or in Node.js (in your server):
```javascript
console.log('COMPOSIO_API_KEY:', process.env.COMPOSIO_API_KEY?.substring(0, 10) + '...');
console.log('APP_URL:', process.env.APP_URL);
```

### 3. Test Composio API Key

Test if the API key works:

```bash
curl -H "X-API-Key: ak_rED79dp24rFf5j2KGqLH" \
  https://backend.composio.dev/api/v1/apps
```

Should return a list of apps. If you get 401/403, the API key is invalid.

### 4. Check Modal Networks

Open the "Connect channel" modal and check what networks appear:
- ✅ Should show: YouTube, Instagram, Facebook, TikTok, LinkedIn, Pinterest, X, Threads, Google Business
- ❌ If only showing: Bluesky, Mastodon, Telegram, Discord, Slack → Composio networks not loading

### 5. Check Browser Console

Press F12 → Console tab. Look for errors when:
1. Modal opens
2. You click a network button
3. During redirect

Common errors:
- `fetch failed` → Network issue
- `401 Unauthorized` → API key issue
- `Module not found` → Import issue

### 6. Common Issues

#### Issue: "COMPOSIO_API_KEY environment variable is required"
**Solution:** 
```bash
# Add to .env file
echo "COMPOSIO_API_KEY=ak_rED79dp24rFf5j2KGqLH" >> .env

# Restart server
npm run dev
```

#### Issue: "Network X not supported by Composio"
**Solution:** Check `networkToComposioApp()` mapping in `composio-client.ts`

#### Issue: Modal only shows 6 networks (no OAuth platforms)
**Solution:** 
1. Check `availableNetworks()` returns Composio networks
2. Check `getAdapter(network, null)` works for OAuth networks
3. Restart server after code changes

#### Issue: Redirect fails with 404
**Solution:** URL should be `/app/{brandId}/channels`, not `/channels`

### 7. Manual Test

Test the redirect endpoint directly:

```bash
# Get your brand ID
psql postline -c "SELECT id FROM \"Brand\" LIMIT 1;"

# Test redirect (replace BRAND_ID)
curl -L "http://localhost:3000/api/channels/composio/redirect?network=YOUTUBE&brandId=BRAND_ID" \
  -H "Cookie: your_session_cookie"
```

Should redirect to Composio/Google OAuth page.

## Quick Fixes

### Fix 1: Restart Everything

```bash
# Kill all Node processes
pkill -f node

# Kill port 3000
sudo fuser -k 3000/tcp

# Restart Docker
docker compose restart

# Start fresh
npm run dev
```

### Fix 2: Clear Next.js Cache

```bash
rm -rf apps/web/.next
npm run dev
```

### Fix 3: Verify Composio SDK

```bash
# Check installed version
npm list composio-core

# Should show: composio-core@0.5.39 or higher

# Reinstall if needed
npm uninstall composio-core
npm install composio-core
```

### Fix 4: Test Composio Client Directly

Create test file `test-composio.js`:

```javascript
const { Composio } = require('composio-core');

const composio = new Composio({
  apiKey: 'ak_rED79dp24rFf5j2KGqLH'
});

async function test() {
  try {
    console.log('Testing Composio...');
    
    // Test 1: List apps
    const apps = await composio.apps.list();
    console.log('✅ Apps found:', apps.length);
    
    // Test 2: Create entity
    const entity = await composio.createEntity({ id: 'test-user-123' });
    console.log('✅ Entity created:', entity.id);
    
    // Test 3: Get entity
    const fetched = await composio.getEntity('test-user-123');
    console.log('✅ Entity fetched:', fetched.id);
    
    console.log('✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

test();
```

Run:
```bash
node test-composio.js
```

## Expected Behavior

### Successful Flow:

1. User clicks "Connect channel"
2. Modal shows all platforms (including YouTube, Instagram, etc.)
3. User clicks "YouTube"
4. Browser redirects to `/api/channels/composio/redirect?network=YOUTUBE&brandId=xxx`
5. Server logs show Composio initialization
6. Browser redirects to Google OAuth page
7. User authorizes
8. Redirects to `/api/channels/composio/callback?code=xxx&state=brandId:YOUTUBE`
9. Server saves channel to database
10. Redirects to `/app/{brandId}/channels?connected=1`
11. Channel appears as "CONNECTED"

## Still Not Working?

Share:
1. Server terminal logs (when clicking connect)
2. Browser console errors (F12)
3. Screenshot of modal (what networks appear)
4. Output of: `curl -H "X-API-Key: ak_rED79dp24rFf5j2KGqLH" https://backend.composio.dev/api/v1/apps`
