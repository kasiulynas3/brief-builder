#!/usr/bin/env python3
import json

with open('data/facebook-ads-direct-links.json', 'r') as f:
    data = json.load(f)

total = 0
for category, companies in data.items():
    for company in companies:
        count = len(company.get('ads', []))
        total += count
        if count > 0:
            print(f"{company['name']}: {count} ads")

print(f"\nTotal ads: {total}")
