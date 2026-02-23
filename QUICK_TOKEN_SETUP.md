# Quick Facebook API Token Setup (No App Required)

## Easiest Method - Use Graph API Explorer Directly

### Step 1: Go to Graph API Explorer
Visit: https://developers.facebook.com/tools/explorer/

### Step 2: Use "Meta App" (Built-in Test App)
1. In the top-right dropdown that says "Facebook App"
2. Select **"Meta App"** or **"Graph API Explorer"** from the list
   - This is a built-in test app that doesn't require setup

### Step 3: Get Token
1. Click the **"Generate Access Token"** button
2. It may ask you to log in - use your Facebook account
3. Click **"Continue as [Your Name]"**
4. Copy the token that appears

### Step 4: Add to .env
```bash
# Open your .env file
nano /Users/antanaskasiulynas/brief-builder/.env

# Add this line (paste your copied token):
FACEBOOK_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Save and exit (Ctrl+X, then Y, then Enter)

### Step 5: Test It
```bash
cd /Users/antanaskasiulynas/brief-builder
node scraper/facebook-api-scraper.js
```

---

## Alternative: Create Your Own App (For Production Use)

If the above doesn't work, create a proper app:

### 1. Create Facebook App
- Go to: https://developers.facebook.com/apps/create/
- Choose **"Business"** as app type
- Fill in:
  - **App Name**: "Ad Research Tool"
  - **Contact Email**: Your email
- Click **"Create App"**

### 2. Configure App for Ad Library
1. In your app dashboard, click **"Add Product"**
2. Find **"Marketing API"** → Click **"Set Up"**
3. You don't need to complete full setup for just reading ads

### 3. Get Token from Your App
1. Go back to: https://developers.facebook.com/tools/explorer/
2. Select YOUR app from dropdown (not "Meta App")
3. Click **"Generate Access Token"**
4. Copy the token

---

## Troubleshooting

### "Facebook Login is currently unavailable for this app"
**Solution**: Use "Meta App" instead of creating your own app (see Step 2 above)

### "This app is in Development Mode"
**Solution**: That's fine! You can still use it. Just make sure you're an admin/developer of the app.

### "Invalid OAuth access token"
**Causes**:
- Token expired (they expire in 1-2 hours by default)
- Wrong token copied

**Solution**: Generate a new token

### Token expires too quickly?
For longer-lasting tokens (60 days):

```bash
# Exchange short token for long token
curl -X GET "https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_TOKEN"
```

---

## Quick Test

After adding token to `.env`, test if it works:

```bash
# Test API connection
curl "https://graph.facebook.com/v18.0/ads_archive?access_token=YOUR_TOKEN&ad_reached_countries=['US']&search_terms=Nike&fields=id&limit=1"
```

If you see JSON data with an ad ID, it's working! ✅

---

## Still Having Issues?

Try this **zero-setup option**:

Instead of Facebook API, I can create a manual workflow where you:
1. Visit Facebook Ad Library manually: https://www.facebook.com/ads/library/
2. Search for competitors
3. Copy ad URLs
4. Paste them into a file
5. Script automatically imports them

Would you prefer that approach?
