import pgfire


def add_data(duration, product_id, data):
    """Add or update a product under a duration."""
    pgfire.set("products", f"{duration}/{product_id}", data)


def update_data(duration, product_id, update_fields):
    """Update fields of a product by its ID under a duration."""
    pgfire.update("products", f"{duration}/{product_id}", update_fields)


def remove_data(duration, product_id):
    """Delete a product by its ID under a duration."""
    pgfire.delete("products", f"{duration}/{product_id}")


def search_data_by_keyword(duration, field, keyword):
    """Search products under a duration where a field matches the keyword."""
    all_products = pgfire.get("products", duration)
    results = []
    if isinstance(all_products, dict):
        for prod_id, prod_val in all_products.items():
            if prod_val and field in prod_val and str(prod_val[field]).lower() == str(keyword).lower():
                prod_val['id'] = prod_id
                results.append(prod_val)
    return results


def delete_by_keyword(duration, field, keyword):
    """Delete products under a duration where a field matches the keyword."""
    all_products = pgfire.get("products", duration)
    if isinstance(all_products, dict):
        for prod_id, prod_val in all_products.items():
            if prod_val and field in prod_val and str(prod_val[field]).lower() == str(keyword).lower():
                pgfire.delete("products", f"{duration}/{prod_id}")


def save_product_to_firebase(product):
    duration = product.get("Duration")
    if not duration:
        raise ValueError("Product must have a 'duration' field.")
    ids = [k.split("/", 1)[1] for k in pgfire.list_keys("products", duration)]
    numeric_ids = [int(i) for i in ids if i.isdigit()]
    next_id = str(max(numeric_ids) + 1) if numeric_ids else "1"
    product_to_save = {k: v for k, v in product.items() if k != "Duration"}
    pgfire.set("products", f"{duration}/{next_id}", product_to_save)


def save_quote(target_code=None, username="", scope="normal"):
    """Copy working quote items into the shared 'quotes' store.

    Stored as a dense array indexed by sr_no (index 0 unused) — the exact
    shape the Firebase RTDB used, so fetch/download behave identically.
    """
    from pg import get_conn, dict_cur

    with get_conn() as conn:
        cur = dict_cur(conn)
        if target_code:
            codes = [str(target_code)]
        else:
            cur.execute(
                "SELECT code FROM active_quotes WHERE username = %s AND scope = %s",
                (username, scope),
            )
            codes = [r["code"] for r in cur.fetchall()]

        for code in codes:
            cur.execute(
                "SELECT * FROM quote_items"
                " WHERE username = %s AND scope = %s AND quote_code = %s ORDER BY sr_no",
                (username, scope, code),
            )
            rows = cur.fetchall()
            if not rows:
                continue
            items = []
            for r in rows:
                d = {k: v for k, v in r.items() if k not in ("id", "username", "scope", "quote_code")}
                if not d.get("code"):
                    d["code"] = code
                items.append(d)
            max_sr = max(int(d.get("sr_no") or 0) for d in items)
            arr = [None] * (max_sr + 1)
            for d in items:
                sr = int(d.get("sr_no") or 0)
                arr[sr] = d
            pgfire.set("quotes", code, arr)


def fetch_quote_info():
    quotes_data = pgfire.get("quotes")
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
    quote_data = pgfire.get("quotes", code)
    if quote_data:
        return quote_data
    raise ValueError(f"No quote found for code: {code}")


def get_new_quote_code():
    existing_codes = pgfire.list_keys("quotes")
    numeric_codes = [int(c) for c in existing_codes if str(c).isdigit()]
    return str(max(numeric_codes) + 1) if numeric_codes else "1"


def check_quote_exists(code):
    """Check if a quote with the given code exists."""
    return pgfire.get("quotes", code) is not None


def get_all_durations():
    """Get all durations sorted by their numeric value in ascending order."""
    product_durations = {k.split("/", 1)[0] for k in pgfire.list_keys("products")}
    preset_durations = set(pgfire.list_keys("duration_presets"))
    all_durations = product_durations | preset_durations
    return sorted(all_durations, key=lambda x: int(''.join(filter(str.isdigit, x)) or '0'))


def format_inr(number):
    """Format a number with Indian comma system (e.g., 10,00,00,000.00)"""
    try:
        if number is None or number == "": return "0.00"
        s, *d = str(round(float(number), 2)).partition(".")
        r = ",".join([s[x-2:x] for x in range(-3, -len(s), -2)][::-1] + [s[-3:]])
        return "".join([r] + d)
    except Exception:
        return str(number)
