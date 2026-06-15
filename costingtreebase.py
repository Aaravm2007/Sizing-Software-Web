import sqlite3
import os
import sys
from basefunctions import *

# Robust path resolution for PyInstaller
if getattr(sys, 'frozen', False):
    db_path = os.path.join(os.path.dirname(sys.executable), 'costing.db')
else:
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'costing.db')

conn = sqlite3.connect(db_path) #:memory:
conn.execute("PRAGMA journal_mode = OFF;")
c = conn.cursor()

c.execute ("""CREATE TABLE IF NOT EXISTS tree (
           "Duration" text,
           "Battery Pack" text,
           "Voltage" int,
           "Ampheres capacity" int,
           "KW calculation" int,
           "Cell Voltage" int,
           "Cell Capacity" int,
           "Combination of Cells in Series" int,
           "Combination of Cells in parallel" int,
           "Total No Of Cells" int,
           "FOB Cost Of Cells" int,
           "Total FOB Cost of Cells" int,
           "Clearing & Customs " int,
           "Total Landed cost In India " int,
           "Cost In INR( Rs 87)-(1)" int,
           "BMS/PCM cost" int,
           "Clearing & Customs" int,
           "Total Landed cost In India" int,
           "Cost In INR( Rs 87)-(2)" int,
           "Cabinet ( INR)" int,
           "Bus Bar" int,
           "Holder/caps" int,
           "Wire & Gasket & Other Assesorries" int,
           "Terminals+ Connectors" int,
           "MCB/Fuse" int,
           "Lugs & Slew" int,
           "Nut Bolts" int,
           "Fiber glass +rod" int,
           "Awg cables" int,
           "Shipping Charges" int,
           "Packaging cost with safety packs" int,
           "Total Other Chargers(3)" int,
           "Landing cost of material (1+2+3)" int,
           "Production Labour & Assembly overheads" int,
           "Warranty  & Service provision" int,
           "Total Cost of Pack (A)" int,
           "Margin @10 % On Cost" int,
           "Estimated Sales Cost-(B)" int,
           "Margin @15% On Cost" int,
           "Estimated Sales Cost-(B+5)" int,
           "Per Kw Pricing @ cost (A)" int,
           "Per Kw pricing @ ist level profit (B)" int,
           "Per Kw pricing @ 2nd evel profit (B+5)" int,
           "BMS/PCM" text,
           "LFP/NCM" text,
           "Centre tap/non centre tap" text,
           "Cylindrical/ Prismatic" text,
           "Application" text,
           "Soft pack/ Metal enclosure" text,
           "If Metal enclosure - Tower- type/rack- mountable" text,
           "Brand and type of cell" text,
           "Installation indoor or outdoor" text,
           "Battery Partcode" text
          )""")
conn.commit()

def add_to_temp_tree(duration, keyword):
    data = search_data_by_keyword(duration, "Battery Pack", keyword)
    for product in data:
        Battery_Pack = product.get("Battery Pack", "")
        Voltage = product.get("Voltage", 0)
        Ampheres_capacity = product.get("Ampheres capacity", 0)
        KW_calculation = product.get("KW calculation", 0)
        Cell_Voltage = product.get("Cell Voltage", 0)
        Cell_Capacity = product.get("Cell Capacity", 0)
        Combination_of_Cells_in_Series = product.get("Combination of Cells in Series", 0)
        Combination_of_Cells_in_parallel = product.get("Combination of Cells in parallel", 0)
        Total_No_Of_Cells = product.get("Total No Of Cells", 0)
        FOB_Cost_Of_Cells = product.get("FOB Cost Of Cells", 0)
        Total_FOB_Cost_of_Cells = product.get("Total FOB Cost of Cells", 0)
        Clearing_Customs_1 = product.get("Clearing & Customs 1", 0)
        Total_Landed_cost_In_India_1 = product.get("Total Landed cost In India 1", 0)
        Cost_In_INR_1 = product.get("Cost In INR-(1)", 0)
        BMS_PCM_cost = product.get("BMS or PCM cost", 0)
        Clearing_Customs_2 = product.get("Clearing & Customs 2", 0)
        Total_Landed_cost_In_India_2 = product.get("Total Landed cost In India 2", 0)
        Cost_In_INR_2 = product.get("Cost In INR-(2)", 0)
        Cabinet_INR = product.get("Cabinet", 0)
        Bus_Bar = product.get("Bus Bar", 0)
        Holder_caps = product.get("Holder or Caps", 0)
        Wire_Gasket_Other_Assesorries = product.get("Wire & Gasket & Other Assesorries", 0)
        Terminals_Connectors = product.get("Terminals+ Connectors", 0)
        MCB_Fuse = product.get("MCB or Fuse", 0)
        Lugs_Slew = product.get("Lugs & Slew", 0)
        Nut_Bolts = product.get("Nut Bolts", 0)
        Fiber_glass_rod = product.get("Fiber glass +rod", 0)
        Awg_cables = product.get("Awg cables", 0)
        Shipping_Charges = product.get("Shipping Charges", 0)
        Packaging_cost_with_safety_packs = product.get("Packaging cost with safety packs", 0)
        Total_Other_Chargers_3 = product.get("Total Other Chargers(3)", 0)
        Landing_cost_of_material = product.get("Landing cost of material (1+2+3)", 0)
        Production_Labour_Assembly_overheads = product.get("Production Labour & Assembly overheads", 0)
        Warranty_Service_provision = product.get("Warranty  & Service provision", 0)
        Total_Cost_of_Pack_A = product.get("Total Cost of Pack (A)", 0)
        Margin_10_percent_On_Cost = product.get("Margin @10 % On Cost", 0)
        Estimated_Sales_Cost_B = product.get("Estimated Sales Cost-(B)", 0)
        Margin_15_percent_On_Cost = product.get("Margin @15% On Cost", 0)
        Estimated_Sales_Cost_B5 = product.get("Estimated Sales Cost-(B+5)", 0)
        Per_Kw_Pricing_cost_A = product.get("Per Kw Pricing @ cost (A)", 0)
        Per_Kw_pricing_ist_level_profit_B = product.get("Per Kw pricing @ ist level profit (B)", 0)
        Per_Kw_pricing_2nd_level_profit_B5 = product.get("Per Kw pricing @ 2nd evel profit (B+5)", 0)
        BMS_PCM = product.get("BMS or PCM", "")
        LFP_NCM = product.get("Cell Chemistry", "")
        Centre_tap_non_centre_tap = product.get("Centre tapping", "")
        Cylindrical_Prismatic = product.get("Type of Cell", "")
        Application = product.get("Application", "")
        Soft_pack_Metal_enclosure = product.get("Enclosure", "")
        If_Metal_enclosure_Tower_type_rack_mountable = product.get("Mount", "")
        Brand_and_type_of_cell = product.get("Brand and type of cell", "")
        Installation_indoor_or_outdoor = product.get("Installation indoor or outdoor", "")
        Battery_partcode = product.get("Battery Partcode", "")    

        columns = ["Duration",
            "Battery Pack", "Voltage", "Ampheres capacity", "KW calculation", "Cell Voltage", "Cell Capacity",
            "Combination of Cells in Series", "Combination of Cells in parallel", "Total No Of Cells",
            "FOB Cost Of Cells", "Total FOB Cost of Cells", "Clearing & Customs ", "Total Landed cost In India ",
            "Cost In INR( Rs 87)-(1)", "BMS/PCM cost", "Clearing & Customs", "Total Landed cost In India",
            "Cost In INR( Rs 87)-(2)", "Cabinet ( INR)", "Bus Bar", "Holder/caps", "Wire & Gasket & Other Assesorries",
            "Terminals+ Connectors", "MCB/Fuse", "Lugs & Slew", "Nut Bolts", "Fiber glass +rod", "Awg cables",
            "Shipping Charges", "Packaging cost with safety packs", "Total Other Chargers(3)",
            "Landing cost of material (1+2+3)", "Production Labour & Assembly overheads", "Warranty  & Service provision",
            "Total Cost of Pack (A)", "Margin @10 % On Cost", "Estimated Sales Cost-(B)" , "Margin @15% On Cost",
            "Estimated Sales Cost-(B+5)", "Per Kw Pricing @ cost (A)", "Per Kw pricing @ ist level profit (B)",
            "Per Kw pricing @ 2nd evel profit (B+5)", "BMS/PCM", "LFP/NCM", "Centre tap/non centre tap",
            "Cylindrical/ Prismatic", "Application", "Soft pack/ Metal enclosure",
            "If Metal enclosure - Tower- type/rack- mountable", "Brand and type of cell", "Installation indoor or outdoor",
            "Battery Partcode"
        ]

        values = [duration,
            Battery_Pack, Voltage, Ampheres_capacity, KW_calculation, Cell_Voltage, Cell_Capacity,
            Combination_of_Cells_in_Series, Combination_of_Cells_in_parallel, Total_No_Of_Cells,
            FOB_Cost_Of_Cells, Total_FOB_Cost_of_Cells, Clearing_Customs_1, Total_Landed_cost_In_India_1,
            Cost_In_INR_1, BMS_PCM_cost, Clearing_Customs_2, Total_Landed_cost_In_India_2,
            Cost_In_INR_2, Cabinet_INR, Bus_Bar, Holder_caps, Wire_Gasket_Other_Assesorries,
            Terminals_Connectors, MCB_Fuse, Lugs_Slew, Nut_Bolts, Fiber_glass_rod, Awg_cables,
            Shipping_Charges, Packaging_cost_with_safety_packs, Total_Other_Chargers_3,
            Landing_cost_of_material, Production_Labour_Assembly_overheads, Warranty_Service_provision,
            Total_Cost_of_Pack_A, Margin_10_percent_On_Cost, Estimated_Sales_Cost_B, Margin_15_percent_On_Cost,
            Estimated_Sales_Cost_B5, Per_Kw_Pricing_cost_A, Per_Kw_pricing_ist_level_profit_B,
            Per_Kw_pricing_2nd_level_profit_B5, BMS_PCM, LFP_NCM, Centre_tap_non_centre_tap,
            Cylindrical_Prismatic, Application, Soft_pack_Metal_enclosure,
            If_Metal_enclosure_Tower_type_rack_mountable, Brand_and_type_of_cell, Installation_indoor_or_outdoor,Battery_partcode
        ]
        if len(columns) != len(values):
            raise ValueError(f"Number of columns ({len(columns)}) does not match number of values ({len(values)})")
        placeholders = ','.join(['?'] * len(columns))
        quoted_columns = [f'"{col}"' for col in columns]
        query = f'INSERT INTO tree ({",".join(quoted_columns)}) VALUES ({placeholders})'
        c.execute(query, values)
        conn.commit()

def insert_data_to_temp_tree(product):
    Duration = product.get("Duration", "")
    Battery_Pack = product.get("Battery_Pack", "")
    Voltage = product.get("Voltage", 0)
    Ampheres_capacity = product.get("Ampheres_capacity", 0)
    KW_calculation = product.get("KW_calculation", 0)
    Cell_Voltage = product.get("Cell_Voltage", 0)
    Cell_Capacity = product.get("Cell_Capacity", 0)
    Combination_of_Cells_in_Series = product.get("Combination_of_Cells_in_Series", 0)
    Combination_of_Cells_in_parallel = product.get("Combination_of_Cells_in_parallel", 0)
    Total_No_Of_Cells = product.get("Total_No_Of_Cells", 0)
    FOB_Cost_Of_Cells = product.get("FOB_Cost_Of_Cells", 0)
    Total_FOB_Cost_of_Cells = product.get("Total_FOB_Cost_of_Cells", 0)
    Clearing_Customs_1 = product.get("Clearing_Customs_1", 0)
    Total_Landed_cost_In_India_1 = product.get("Total_Landed_cost_In_India_1", 0)
    Cost_In_INR_1 = product.get("Cost_In_INR_1", 0)
    BMS_PCM_cost = product.get("BMS_PCM_cost", 0)
    Clearing_Customs_2 = product.get("Clearing_Customs_2", 0)
    Total_Landed_cost_In_India_2 = product.get("Total_Landed_cost_In_India_2", 0)
    Cost_In_INR_2 = product.get("Cost_In_INR_2", 0)
    Cabinet_INR = product.get("Cabinet_INR", 0)
    Bus_Bar = product.get("Bus_Bar", 0)
    Holder_caps = product.get("Holder_caps", 0)
    Wire_Gasket_Other_Assesorries = product.get("Wire_Gasket_Other_Assesorries", 0)
    Terminals_Connectors = product.get("Terminals_Connectors", 0)
    MCB_Fuse = product.get("MCB_Fuse", 0)
    Lugs_Slew = product.get("Lugs_Slew", 0)
    Nut_Bolts = product.get("Nut_Bolts", 0)
    Fiber_glass_rod = product.get("Fiber_glass_rod", 0)
    Awg_cables = product.get("Awg_cables", 0)
    Shipping_Charges = product.get("Shipping_Charges", 0)
    Packaging_cost_with_safety_packs = product.get("Packaging_cost_with_safety_packs", 0)
    Total_Other_Chargers_3 = product.get("Total_Other_Chargers_3", 0)
    Landing_cost_of_material = product.get("Landing_cost_of_material", 0)
    Production_Labour_Assembly_overheads = product.get("Production_Labour_Assembly_overheads", 0)
    Warranty_Service_provision = product.get("Warranty_Service_provision", 0)
    Total_Cost_of_Pack_A = product.get("Total_Cost_of_Pack_A", 0)
    Margin_10_percent_On_Cost = product.get("Margin_10_percent_On_Cost", 0)
    Estimated_Sales_Cost_B = product.get("Estimated_Sales_Cost_B", 0)
    Margin_15_percent_On_Cost = product.get("Margin_15_percent_On_Cost", 0)
    Estimated_Sales_Cost_B5 = product.get("Estimated_Sales_Cost_B5", 0)
    Per_Kw_Pricing_cost_A = product.get("Per_Kw_Pricing_cost_A", 0)
    Per_Kw_pricing_ist_level_profit_B = product.get("Per_Kw_pricing_ist_level_profit_B", 0)
    Per_Kw_pricing_2nd_level_profit_B5 = product.get("Per_Kw_pricing_2nd_level_profit_B5", 0)
    BMS_PCM = product.get("BMS_PCM", "")
    LFP_NCM = product.get("LFP_NCM", "")
    Centre_tap_non_centre_tap = product.get("Centre_tap_non_centre_tap", "")
    Cylindrical_Prismatic = product.get("Cylindrical_Prismatic", "")
    Application = product.get("Application", "")
    Soft_pack_Metal_enclosure = product.get("Soft_pack_Metal_enclosure", "")
    If_Metal_enclosure_Tower_type_rack_mountable = product.get(
        "If_Metal_enclosure_Tower_type_rack_mountable", ""
    )
    Brand_and_type_of_cell = product.get("Brand_and_type_of_cell", "")
    Installation_indoor_or_outdoor = product.get("Installation_indoor_or_outdoor", "")
    Battery_partcode = product.get("Battery_partcode", "")

    columns = [
        "Duration", "Battery Pack", "Voltage", "Ampheres capacity", "KW calculation",
        "Cell Voltage", "Cell Capacity", "Combination of Cells in Series",
        "Combination of Cells in parallel", "Total No Of Cells",
        "FOB Cost Of Cells", "Total FOB Cost of Cells", "Clearing & Customs ",
        "Total Landed cost In India ", "Cost In INR( Rs 87)-(1)",
        "BMS/PCM cost", "Clearing & Customs", "Total Landed cost In India",
        "Cost In INR( Rs 87)-(2)", "Cabinet ( INR)", "Bus Bar", "Holder/caps",
        "Wire & Gasket & Other Assesorries", "Terminals+ Connectors", "MCB/Fuse",
        "Lugs & Slew", "Nut Bolts", "Fiber glass +rod", "Awg cables",
        "Shipping Charges", "Packaging cost with safety packs",
        "Total Other Chargers(3)", "Landing cost of material (1+2+3)",
        "Production Labour & Assembly overheads", "Warranty  & Service provision",
        "Total Cost of Pack (A)", "Margin @10 % On Cost",
        "Estimated Sales Cost-(B)", "Margin @15% On Cost",
        "Estimated Sales Cost-(B+5)", "Per Kw Pricing @ cost (A)",
        "Per Kw pricing @ ist level profit (B)",
        "Per Kw pricing @ 2nd evel profit (B+5)", "BMS/PCM", "LFP/NCM",
        "Centre tap/non centre tap", "Cylindrical/ Prismatic", "Application",
        "Soft pack/ Metal enclosure",
        "If Metal enclosure - Tower- type/rack- mountable",
        "Brand and type of cell", "Installation indoor or outdoor",
        "Battery Partcode"
    ]

    values = [
        Duration, Battery_Pack, Voltage, Ampheres_capacity, KW_calculation,
        Cell_Voltage, Cell_Capacity, Combination_of_Cells_in_Series,
        Combination_of_Cells_in_parallel, Total_No_Of_Cells,
        FOB_Cost_Of_Cells, Total_FOB_Cost_of_Cells, Clearing_Customs_1,
        Total_Landed_cost_In_India_1, Cost_In_INR_1, BMS_PCM_cost,
        Clearing_Customs_2, Total_Landed_cost_In_India_2, Cost_In_INR_2,
        Cabinet_INR, Bus_Bar, Holder_caps, Wire_Gasket_Other_Assesorries,
        Terminals_Connectors, MCB_Fuse, Lugs_Slew, Nut_Bolts,
        Fiber_glass_rod, Awg_cables, Shipping_Charges,
        Packaging_cost_with_safety_packs, Total_Other_Chargers_3,
        Landing_cost_of_material, Production_Labour_Assembly_overheads,
        Warranty_Service_provision, Total_Cost_of_Pack_A,
        Margin_10_percent_On_Cost, Estimated_Sales_Cost_B,
        Margin_15_percent_On_Cost, Estimated_Sales_Cost_B5,
        Per_Kw_Pricing_cost_A, Per_Kw_pricing_ist_level_profit_B,
        Per_Kw_pricing_2nd_level_profit_B5, BMS_PCM, LFP_NCM,
        Centre_tap_non_centre_tap, Cylindrical_Prismatic,
        Application, Soft_pack_Metal_enclosure,
        If_Metal_enclosure_Tower_type_rack_mountable,
        Brand_and_type_of_cell, Installation_indoor_or_outdoor,
        Battery_partcode
    ]

    if len(columns) != len(values):
        raise ValueError(
            f"Number of columns ({len(columns)}) does not match number of values ({len(values)})"
        )

    placeholders = ",".join(["?"] * len(columns))
    quoted_columns = [f'"{col}"' for col in columns]
    query = f'INSERT INTO tree ({",".join(quoted_columns)}) VALUES ({placeholders})'

    c.execute(query, values)
    conn.commit()



def clear_temp_tree():
    c.execute('DELETE FROM tree')
    conn.commit()

def delete_row_by_list(data_list):
    # Fetch all rows from the table
    c.execute('SELECT rowid, * FROM tree')
    rows = c.fetchall()
    for row in rows:
        row_data_str = [str(item) for item in row[1:]]
        data_list_str = [str(item) for item in data_list]
        if row_data_str == data_list_str:
            c.execute('DELETE FROM tree WHERE rowid = ?', (row[0],))
            conn.commit()
            break

def create_item_from_list(costing_data):
    columns = [ "Duration",
            "Battery Pack", "Voltage", "Ampheres capacity", "KW calculation", "Cell Voltage", "Cell Capacity",
            "Combination of Cells in Series", "Combination of Cells in parallel", "Total No Of Cells",
            "FOB Cost Of Cells", "Total FOB Cost of Cells", "Clearing & Customs ", "Total Landed cost In India ",
            "Cost In INR( Rs 87)-(1)", "BMS/PCM cost", "Clearing & Customs", "Total Landed cost In India",
            "Cost In INR( Rs 87)-(2)", "Cabinet ( INR)", "Bus Bar", "Holder/caps", "Wire & Gasket & Other Assesorries",
            "Terminals+ Connectors", "MCB/Fuse", "Lugs & Slew", "Nut Bolts", "Fiber glass +rod", "Awg cables",
            "Shipping Charges", "Packaging cost with safety packs", "Total Other Chargers(3)",
            "Landing cost of material (1+2+3)", "Production Labour & Assembly overheads", "Warranty  & Service provision",
            "Total Cost of Pack (A)", "Margin @10 % On Cost", "Estimated Sales Cost-(B)" , "Margin @15% On Cost",
            "Estimated Sales Cost-(B+5)", "Per Kw Pricing @ cost (A)", "Per Kw pricing @ ist level profit (B)",
            "Per Kw pricing @ 2nd evel profit (B+5)", "BMS/PCM", "LFP/NCM", "Centre tap/non centre tap",
            "Cylindrical/ Prismatic", "Application", "Soft pack/ Metal enclosure",
            "If Metal enclosure - Tower- type/rack- mountable", "Brand and type of cell", "Installation indoor or outdoor","Battery Partcode"
    ]
    if len(costing_data) != len(columns):
        raise ValueError(f"Input list must have {len(columns)} elements, got {len(costing_data)}")
    placeholders = ','.join(['?'] * len(columns))
    quoted_columns = [f'"{col}"' for col in columns]
    query = f'INSERT INTO tree ({",".join(quoted_columns)}) VALUES ({placeholders})'
    c.execute(query, costing_data)
    conn.commit()

def fetch_all_column_names():
    c.execute('PRAGMA table_info(tree)')
    columns = [column[1] for column in c.fetchall()]
    return columns

def save_costing_to_db(data_list):
    c.execute('SELECT rowid, * FROM tree')
    rows = c.fetchall()
    found = False
    for row in rows:
        row_data_str = [str(item) for item in row[1:]]
        data_list_str = [str(item) for item in data_list]
        if row_data_str == data_list_str:
            product = {
                "Duration": data_list[0],
                "Battery Pack": data_list[1],
                "Voltage": data_list[2],
                "Ampheres capacity": data_list[3],
                "KW calculation": data_list[4],
                "Cell Voltage": data_list[5],
                "Cell Capacity": data_list[6],
                "Combination of Cells in Series": data_list[7],
                "Combination of Cells in parallel": data_list[8],
                "Total No Of Cells": data_list[9],
                "FOB Cost Of Cells": data_list[10],
                "Total FOB Cost of Cells": data_list[11],
                "Clearing & Customs 1": data_list[12],
                "Total Landed cost In India 1": data_list[13],
                "Cost In INR-(1)": data_list[14],
                "BMS or PCM cost": data_list[15],
                "Clearing & Customs 2": data_list[16],
                "Total Landed cost In India 2": data_list[17],
                "Cost In INR-(2)": data_list[18],
                "Cabinet": data_list[19],
                "Bus Bar": data_list[20],
                "Holder or Caps": data_list[21],
                "Wire & Gasket & Other Assesorries": data_list[22],
                "Terminals+ Connectors": data_list[23],
                "MCB or Fuse": data_list[24],
                "Lugs & Slew": data_list[25],
                "Nut Bolts": data_list[26],
                "Fiber glass +rod": data_list[27],
                "Awg cables": data_list[28],
                "Shipping Charges": data_list[29],
                "Packaging cost with safety packs": data_list[30],
                "Total Other Chargers(3)": data_list[31],
                "Landing cost of material (1+2+3)": data_list[32],
                "Production Labour & Assembly overheads": data_list[33],
                "Warranty  & Service provision": data_list[34],
                "Total Cost of Pack (A)": data_list[35],
                "Margin @10 % On Cost": data_list[36],
                "Estimated Sales Cost-(B)": data_list[37],
                "Margin @15% On Cost": data_list[38],
                "Estimated Sales Cost-(B+5)": data_list[39],
                "Per Kw Pricing @ cost (A)": data_list[40],
                "Per Kw pricing @ ist level profit (B)": data_list[41],
                "Per Kw pricing @ 2nd evel profit (B+5)": data_list[42],
                "BMS or PCM": data_list[43],
                "Cell Chemistry": data_list[44],
                "Centre tapping": data_list[45],
                "Type of Cell": data_list[46],
                "Application": data_list[47],
                "Enclosure": data_list[48],
                "Mount": data_list[49],
                "Brand and type of cell": data_list[50],
                "Installation indoor or outdoor": data_list[51],
                "Battery Partcode": data_list[52]
            }
            found = True
            break  # Stop after the first match
    if not found:
        raise ValueError("Input list does not match the expected format.")
    save_product_to_firebase(product)