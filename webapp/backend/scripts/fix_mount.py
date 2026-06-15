#!/usr/bin/env python3
"""Fix Mount field on all active Firebase products:
  - empty/missing → "System"
  - any other value → "Rack"
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from firebase_init import init_firebase
from firebase_admin import db

init_firebase()


def run():
    all_data = db.reference("products").get()
    if not all_data:
        print("No products found.")
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
            if not product.get("active"):
                continue  # skip archived products
            mount_val = product.get("Mount", "")
            new_val = "System" if not mount_val else "Rack"
            db.reference(f"products/{duration}/{idx}").update({"Mount": new_val})
            updated += 1
            if updated % 100 == 0:
                print(f"  {updated} updated...")

    print(f"Done. {updated} active products updated.")


if __name__ == "__main__":
    run()
