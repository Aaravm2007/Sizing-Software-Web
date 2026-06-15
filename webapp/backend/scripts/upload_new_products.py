#!/usr/bin/env python3
"""Upload new_products.json to Firebase, each product tagged active=true.
Run AFTER archive_old_products.py."""
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from firebase_init import init_firebase
from firebase_admin import db

init_firebase()

NEW_PRODUCTS_FILE = Path(__file__).parent.parent.parent.parent / "new_products.json"


def run():
    with open(NEW_PRODUCTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    uploaded = 0
    for duration, products in data.items():
        if not products:
            continue
        prod_items = products.items() if isinstance(products, dict) else enumerate(products)
        for _, product in prod_items:
            if not isinstance(product, dict):
                continue
            product["active"] = True
            db.reference(f"products/{duration}").push(product)
            uploaded += 1
            if uploaded % 50 == 0:
                print(f"  {uploaded} products uploaded...")

    print(f"Done. {uploaded} new products uploaded with active=true.")


if __name__ == "__main__":
    run()
