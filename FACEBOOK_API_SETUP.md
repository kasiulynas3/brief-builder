# Facebook Marketing API Setup Guide

## Get Real Competitor Ad Data Legally & Reliably

Facebook's official API is the **recommended** way to access ad library data:
- ✅ Legal and compliant with Facebook's Terms of Service
- ✅ Reliable (no scraping issues or CAPTCHAs)
- ✅ Structured data (easy to parse)
- ✅ Includes ad copy, images, targeting info, and ad IDs
- ✅ Filters by country (USA), date ranges, etc.

---

## Step 1: Create a Facebook App

1. **Go to Facebook Developers**
   - Visit: https://developers.facebook.com/
   - Click "Get Started" or "My Apps"

2. **Create a New App**
   - Click "Create App"
   - Select app type: "Business" (for ad library access)
   - Fill in:
     - App Name: "Competitor Ad Intelligence Tool"
     - App Contact Email: your email
     - Business Account: Create or select one

3. **Add Ad Library API**
   - In your app dashboard
   - Click "Add Product"
   - Find "Marketing API" and click "Set Up"

---

## Step 2: Get Access Token

### Option A: Short-term Token (Testing - 1 hour)

1. Go to: https://developers.facebook.com/tools/explorer/
2. Select your app from the dropdown
3. Click "Generate Access Token"
4. Copy the token

### Option B: Long-term Token (Production - 60 days)

1. Get short-term token from Graph API Explorer
2. Exchange it for long-term token:

```bash
curl -X GET "https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=YOUR_APP_ID&client_secret=YOUR_APP_SECRET&fb_exchange_token=YOUR_SHORT_TERM_TOKEN"
```

3. Save the returned `access_token`

---

## Step 3: Configure Your App

1. **Create `.env` file** in your project root:

```bash
cd /Users/antanaskasiulynas/brief-builder
touch .env
```

2. **Add your credentials** to `.env`:

```env
FACEBOOK_APP_ID=your_app_id_here
FACEBOOK_APP_SECRET=your_app_secret_here
FACEBOOK_ACCESS_TOKEN=your_access_token_here
```

3. **Keep it secret** (already in .gitignore)

---

## Step 4: Test the API

Run the test script I created:

```bash
node scraper/facebook-api-scraper.js
```

This will:
- Load your competitors from `data/competitors.json`
- Search Facebook Ad Library API for each one
- Filter by USA country
- Extract ad copy, images, and ad IDs
- Update your database automatically

---

## Step 5: Automate It

### Option A: Hourly Cron Job

Add to your crontab (`crontab -e`):

```cron
0 * * * * cd /Users/antanaskasiulynas/brief-builder && node scraper/facebook-api-scraper.js >> logs/fb-api.log 2>&1
```

### Option B: Run with Your Server

The scraper is already integrated into your hourly scraper via `server.js`.

---

## API Endpoints You'll Use

### Ad Library Search
```
GET https://graph.facebook.com/v18.0/ads_archive
```

**Parameters:**
- `access_token` - Your access token
- `ad_reached_countries` - `['US']` (USA only)
- `search_terms` - Competitor name
- `ad_active_status` - 'ALL' (active + inactive)
- `ad_type` - 'ALL'
- `fields` - What data to retrieve

**Example Request:**
```bash
curl "https://graph.facebook.com/v18.0/ads_archive?access_token=YOUR_TOKEN&ad_reached_countries=['US']&search_terms=Ro&fields=id,ad_creative_body,ad_creative_link_title,ad_snapshot_url,page_name"
```

---

## Available Fields

You can request these fields in the `fields` parameter:

- `id` - Unique ad ID
- `ad_creative_body` - Main ad text/hook
- `ad_creative_link_title` - Headline
- `ad_snapshot_url` - Link to view the ad
- `page_name` - Advertiser page name
- `ad_delivery_start_time` - When ad started
- `ad_delivery_stop_time` - When ad stopped
- `impressions` - View count range
- `spend` - Spend range (if available)
- `demographic_distribution` - Age/gender targeting
- `region_distribution` - Geographic targeting

**Full field list**: https://developers.facebook.com/docs/marketing-api/reference/ads_archive/

---

## Rate Limits

Facebook API has rate limits:
- **200 calls per hour** per app
- **4,800 calls per day** per app

The scraper includes:
- Automatic rate limiting
- Delays between requests
- Error handling for rate limit errors

---

## Costs

Facebook Ad Library API is **FREE**:
- No cost for basic ad library access
- No cost for searching ads
- No cost for reading ad data

Limits:
- Rate limits (see above)
- Data age: Up to 7 years of historic ads

---

## Troubleshooting

### "Invalid OAuth access token"
- Token expired (generate new one)
- Token doesn't have required permissions
- App not approved for Ad Library API

### "User must be an admin of the app"
- Your Facebook account isn't an admin of the app
- Add yourself in App Dashboard → Roles

### "Too many calls"
- Hit rate limit
- Wait 1 hour or until next day
- Reduce scraping frequency

### "Ad archive search not available"
- App not approved for Ad Library API
- Complete app review process
- Add privacy policy URL

---

## Next Steps

1. ✅ Create Facebook app
2. ✅ Get access token
3. ✅ Add to `.env` file
4. ✅ Run `node scraper/facebook-api-scraper.js`
5. ✅ Check `data/competitors.json` for new ads with real URLs
6. ✅ Restart your server to see the ads

---

## Support

- **Facebook Developer Docs**: https://developers.facebook.com/docs/marketing-api/
- **Ad Library API Reference**: https://developers.facebook.com/docs/marketing-api/reference/ads_archive/
- **App Review**: https://developers.facebook.com/docs/app-review/

---

## Privacy & Compliance

✅ Ad Library API is public data  
✅ No user data collected  
✅ Compliant with Meta's Terms of Service  
✅ GDPR/CCPA compliant (public ads only)  
✅ Attribution required (keep "via Facebook Ad Library" in your app)
