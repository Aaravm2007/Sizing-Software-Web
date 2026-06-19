import pyrebase
import json
import os
import firebase_admin
from firebase_admin import credentials, db
from dotenv import load_dotenv
import sqlite3

import sys

if getattr(sys, 'frozen', False):
    # Running in a PyInstaller bundle
    bundle_dir = sys._MEIPASS
else:
    # Running in a normal Python environment
    bundle_dir = os.path.dirname(os.path.abspath(__file__))

dotenv_path = os.path.join(bundle_dir, ".env")
load_dotenv(dotenv_path)

creds_json = os.environ['GOOGLE_CREDENTIALS']  # Replace with your actual variable name
creds_dict = json.loads(creds_json)

# Initialize Firebase app if not already initialized
if not firebase_admin._apps:
    cred = credentials.Certificate(creds_dict)
    firebase_admin.initialize_app(cred, {
        'databaseURL': os.environ['DATABASE_URL']  # You can also hardcode the URL here if needed
    })

def add_data(duration, product_id, data):
    """Add or update a product under a duration."""
    ref = db.reference(f'products/{duration}/{product_id}')
    ref.set(data)

def update_data(duration, product_id, update_fields):
    """Update fields of a product by its ID under a duration."""
    ref = db.reference(f'products/{duration}/{product_id}')
    ref.update(update_fields)

def remove_data(duration, product_id):
    """Delete a product by its ID under a duration."""
    ref = db.reference(f'products/{duration}/{product_id}')
    ref.delete()

def search_data_by_keyword(duration, field, keyword):
    """Search products under a duration where a field matches the keyword."""
    ref = db.reference(f'products/{duration}')
    all_products = ref.get()
    results = []
    if isinstance(all_products, dict):
        for prod_id, prod_val in all_products.items():
            if prod_val and field in prod_val and str(prod_val[field]).lower() == str(keyword).lower():
                prod_val['id'] = prod_id
                results.append(prod_val)
    elif isinstance(all_products, list):
        for idx, prod_val in enumerate(all_products):
            if prod_val and isinstance(prod_val, dict) and field in prod_val and str(prod_val[field]).lower() == str(keyword).lower():
                prod_val['id'] = str(idx)
                results.append(prod_val)
    return results

def delete_by_keyword(duration, field, keyword):
    """Delete products under a duration where a field matches the keyword."""
    ref = db.reference(f'products/{duration}')
    all_products = ref.get()
    if all_products:
        for prod_id, prod_val in all_products.items():
            if prod_val and field in prod_val and str(prod_val[field]).lower() == str(keyword).lower():
                db.reference(f'products/{duration}/{prod_id}').delete()

def save_product_to_firebase(product):
    duration = product.get("Duration")
    if not duration:
        raise ValueError("Product must have a 'duration' field.")
    ref = db.reference(f'products/{duration}')
    all_products = ref.get()
    if all_products:
        if isinstance(all_products, dict):
            numeric_ids = [int(pid) for pid in all_products.keys() if str(pid).isdigit()]
            next_id = str(max(numeric_ids) + 1) if numeric_ids else "1"
        elif isinstance(all_products, list):
            next_id = str(len(all_products))
        else:
            next_id = "1"
    else:
        next_id = "1"
    ref = db.reference(f'products/{duration}/{next_id}')
    product_to_save = {k: v for k, v in product.items() if k != "Duration"}
    ref.set(product_to_save)

def save_quote(target_code=None): 
    conn = sqlite3.connect('temp.db')
    cursor = conn.cursor()
    
    codes_to_save = []
    if target_code:
        codes_to_save.append(target_code)
    else:
        try:
            cursor.execute("SELECT code FROM active_quotes")
            rows = cursor.fetchall()
            codes_to_save = [r[0] for r in rows]
        except sqlite3.OperationalError:
            pass # active_quotes definition might be missing if no quotes

    for code in codes_to_save:
        # Sanitize code for table name (simple alphanumeric)
        sanitized = "".join(c for c in str(code) if c.isalnum())
        table_name = f"items_{sanitized}"
        
        try:
            cursor.execute(f"SELECT * FROM {table_name}")
            columns = [description[0] for description in cursor.description]
            rows = cursor.fetchall()
            
            # Save to Firebase
            # Note: This overwrites existing items for this quote
            for row in rows:
                row_dict = dict(zip(columns, row))
                # Ensure code is set (it should be in the row)
                if 'code' not in row_dict: row_dict['code'] = code
                
                sr_no = row_dict.get('sr_no')
                if code is not None and sr_no is not None:
                    ref = db.reference(f'quotes/{code}/{sr_no}')
                    ref.set(row_dict)
                    
        except sqlite3.OperationalError:
            # Table items_{code} might not exist
            pass
            
    conn.close()

def fetch_quote_info():
    ref = db.reference('quotes')
    quotes_data = ref.get()
    quotes = []
    if quotes_data:
        for code, code_quotes in quotes_data.items():
            quote = None
            if isinstance(code_quotes, dict):
                for sr_no, q in code_quotes.items():
                    if q:
                        quote = q
                        break
            elif isinstance(code_quotes, list):
                for q in code_quotes:
                    if q:
                        quote = q
                        break
            if quote:
                quotes.append({
                    "code": quote.get("code"),
                    "date": quote.get("date"),
                    "customer_name": quote.get("customer_name"),
                    "solution_provider": quote.get("solution_provider")
                })
    return quotes


def download_quote_from_firebase(code):
    """Download a quote by code."""
    ref = db.reference(f'quotes/{code}')
    quote_data = ref.get()
    if quote_data:
        return quote_data
    else:
        raise ValueError(f"No quote found for code: {code}")
    
def get_new_quote_code():
    ref = db.reference('quotes')
    existing_codes = ref.get()
    if existing_codes and isinstance(existing_codes, dict):
        numeric_codes = [int(code) for code in existing_codes.keys() if str(code).isdigit()]
        next_code = str(max(numeric_codes) + 1) if numeric_codes else "1"
    else:
        next_code = "1"
    return next_code

def check_quote_exists(code):
    """Check if a quote with the given code exists."""
    ref = db.reference(f'quotes/{code}')
    return ref.get() is not None

def get_all_durations():
    """Get all durations sorted by their numeric value in ascending order."""
    products_data = db.reference('products').get() or {}
    presets_data = db.reference('duration_presets').get() or {}
    all_durations = set(products_data.keys()) | set(presets_data.keys())
    return sorted(all_durations, key=lambda x: int(''.join(filter(str.isdigit, x)) or '0'))


'''def get_all_durations():
    all_durations= []
    """Print only the subgroup names under the group 'products'."""
    ref = db.reference('products')
    products_data = ref.get()
    if products_data:
        for subgroup in products_data.keys():
            all_durations.append(subgroup)
    return all_durations'''
            
def format_inr(number):
    """Format a number with Indian comma system (e.g., 10,00,00,000.00)"""
    try:
        if number is None or number == "": return "0.00"
        s, *d = str(round(float(number), 2)).partition(".")
        r = ",".join([s[x-2:x] for x in range(-3, -len(s), -2)][::-1] + [s[-3:]])
        return "".join([r] + d)
    except Exception:
        return str(number)
