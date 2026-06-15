#!/usr/bin/env python3
"""Mark all existing Firebase products (without active=true) as active=false.
Run this ONCE before uploading new_products.json."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from firebase_init import init_firebase
from firebase_admin import db

init_firebase()


def run():
    all_data = db.reference("products").get()
    if not all_data:
        print("No products found in Firebase.")
        return

    updated = 0
    items = all_data.items() if isinstance(all_data, dict) else enumerate(all_data)
    for duration, products in items:
        if not products:
            continue
        prod_items = products.items() if isinstance(products, dict) else enumerate(products)
        for idx, product in prod_items:
            if not isinstance(product, dict):
                continue
            if product.get("active") is True:
                continue  # already marked active (new product) — skip
            db.reference(f"products/{duration}/{idx}").update({"active": False})
            updated += 1
            if updated % 100 == 0:
                print(f"  {updated} products archived so far...")

    print(f"Done. {updated} old products marked active=false.")


if __name__ == "__main__":
    run()
