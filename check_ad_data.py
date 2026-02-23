#!/usr/bin/env python3
import json

with open('data/facebook-ads-direct-links.json', 'r') as f:
    data = json.load(f)

for cat, companies in data.items():
    for company in companies[:1]:
        if len(company.get('ads', [])) > 0:
            print(f"{company['name']} sample ad:")
            ad = company['ads'][0]
            print(f"  Library ID: {ad.get('library_id')}")
            print(f"  Hook: '{ad.get('hook', '')}'")
            print(f"  Headline: '{ad.get('headline', '')}'")
            print(f"  Raw text: '{ad.get('raw_text', '')[:100]}'")
            print()
        break
