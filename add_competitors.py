#!/usr/bin/env python3
import json

# Load existing data
with open('data/competitors.json', 'r') as f:
    data = json.load(f)

# Add Pendulum Life to gut_health_probiotics
pendulum_link = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=110585076988359"
data['competitors']['gut_health_probiotics']['pendulum_life'] = {
    "name": "Pendulum Life",
    "category": "Gut Health & Probiotics",
    "positioning": "Science-backed probiotic supplements for gut health",
    "ad_links": [pendulum_link],
    "mainMessaging": [],
    "key_benefits": [],
    "ads_observed": []
}

# Add Triquetra Health to wellness_supplements
triquetra_link = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=219491014912328"
data['competitors']['wellness_supplements']['triquetra_health'] = {
    "name": "Triquetra Health",
    "category": "Wellness Supplements",
    "positioning": "Health and wellness supplement brand",
    "ad_links": [triquetra_link],
    "mainMessaging": [],
    "key_benefits": [],
    "ads_observed": []
}

# Add Rosabella to wellness_supplements
rosabella_link = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&is_targeted_country=false&media_type=all&search_type=page&view_all_page_id=389183070942458"
data['competitors']['wellness_supplements']['rosabella'] = {
    "name": "Rosabella",
    "category": "Wellness Supplements",
    "positioning": "Premium wellness and beauty supplement brand",
    "ad_links": [rosabella_link],
    "mainMessaging": [],
    "key_benefits": [],
    "ads_observed": []
}

# Update timestamp
data['lastUpdated'] = "2026-02-23T00:02:00.000Z"

# Save updated data
with open('data/competitors.json', 'w') as f:
    json.dump(data, f, indent=2)

print("✅ Added 3 new competitors to competitors.json:")
print("   • Pendulum Life (gut_health_probiotics)")
print("   • Triquetra Health (wellness_supplements)")
print("   • Rosabella (wellness_supplements)")
