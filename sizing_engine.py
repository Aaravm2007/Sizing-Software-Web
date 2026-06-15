import math

class SizingEngine:

    CELL_VOLTAGES = {
        "LFP": {"nominal": 3.2, "max": 3.6, "end": 2.8},
        "NPM": {"nominal": 3.6, "max": 4.2, "end": 3.0}
    }

    DC_TO_CELLS = {
        12: 4, 24: 8, 36: 11, 48: 15, 72: 23, 96: 30,
        120: 38, 144: 45, 192: 60, 240: 75,
        336: 105, 360: 112, 384: 120,
        408: 128, 480: 150, 512: 160,
        528: 165, 576: 180
    }

    @staticmethod
    def calculate_load(
        actual_kw,
        actual_kva,
        ups_kva,
        power_factor,
        inverter_efficiency
    ):
        if actual_kw > 0:
            return actual_kw / inverter_efficiency
        elif actual_kva > 0:
            return (actual_kva * power_factor) / inverter_efficiency
        elif ups_kva > 0:
            return (ups_kva * power_factor) / inverter_efficiency
        return 0

    @staticmethod
    def number_of_cells(nominal_dc_voltage):
        return SizingEngine.DC_TO_CELLS.get(nominal_dc_voltage, 0)

    @staticmethod
    def voltage_values(no_of_cells, chemistry):
        cell = SizingEngine.CELL_VOLTAGES[chemistry]
        return {
            "max_charge_voltage": round(no_of_cells * cell["max"], 1),
            "end_cell_voltage": round(no_of_cells * cell["end"], 1)
        }

    @staticmethod
    def energy_required(calc_load_kw, backup_minutes):
        return round((calc_load_kw * backup_minutes) / 60, 1)

    @staticmethod
    def capacity_required(energy_kwh, end_cell_voltage):
        return round((energy_kwh * 1000) / end_cell_voltage, 1)

    @staticmethod
    def capacity_with_ageing(base_capacity, ageing_percent):
        return round(base_capacity + (base_capacity * (ageing_percent / 100.0)), 1)
        
    @staticmethod
    def capacity_with_design_margin(capacity_with_age, design_margin_percent):
        return round(capacity_with_age + (capacity_with_age * (design_margin_percent / 100.0)), 1)

    @staticmethod
    def capacity_with_dod_margin(capacity_with_design, dod_margin_percent):
        # DOD Margin is a divisor
        dod_factor = (dod_margin_percent / 100.0) if dod_margin_percent > 0 else 1.0
        return round(capacity_with_design / dod_factor, 1)

    @staticmethod
    def capacity_with_derating(capacity_with_dod, derating_percent):
        return round(capacity_with_dod + (capacity_with_dod * (derating_percent / 100.0)), 1)

    @staticmethod
    def backup_time(
        backup_requirement,
        required_capacity,
        nearest_capacity
    ):
        return math.floor(
            (backup_requirement / required_capacity) * nearest_capacity
        )

    @staticmethod
    def total_available_energy(nominal_dc_voltage, capacity):
        return (nominal_dc_voltage * capacity) / 1000

    @staticmethod
    def offered_battery_config(nominal_dc_voltage, capacity):
        return f"{int(nominal_dc_voltage)}V {int(capacity)}Ah"
