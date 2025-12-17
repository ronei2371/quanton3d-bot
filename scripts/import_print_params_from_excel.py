#!/usr/bin/env python3
"""
Import Print Parameters from Excel to JSON Database

This script reads the Quanton3D parameters Excel file and generates a structured
JSON database for use by the backend API and RAG system.

Usage:
    python import_print_params_from_excel.py <excel_file> [output_dir]
"""

import pandas as pd
import json
import re
import sys
import os
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

def slugify(text: str) -> str:
    """Convert text to a URL-safe slug."""
    if not text or pd.isna(text):
        return ""
    text = str(text).lower().strip()
    # Remove accents
    replacements = {
        'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
        'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
        'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
        'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
        'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
        'ç': 'c', 'ñ': 'n'
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    # Replace non-alphanumeric with underscore
    text = re.sub(r'[^a-z0-9]+', '_', text)
    # Remove leading/trailing underscores
    text = text.strip('_')
    return text

def parse_numeric_value(value: Any) -> Tuple[Optional[float], str, str]:
    """
    Parse a cell value to extract numeric value.
    Returns: (numeric_value, raw_value, status)
    Status can be: 'ok', 'coming_soon', 'empty'
    """
    if value is None or pd.isna(value):
        return None, "", "empty"
    
    raw = str(value).strip()
    if not raw:
        return None, raw, "empty"
    
    # Check for explicit "Em breve" or similar
    if raw.lower() in ['em breve', 'coming soon', 'n/a', 'nan']:
        return None, raw, "coming_soon"
    
    # Remove common suffixes
    cleaned = raw.lower()
    cleaned = re.sub(r'\s*(s|mm|%)\s*$', '', cleaned)
    
    # Replace comma with dot for decimal
    cleaned = cleaned.replace(',', '.')
    
    # Try to parse as float
    try:
        numeric = float(cleaned)
        # Check if it's a "coming soon" indicator (all zeros in a row)
        return numeric, raw, "ok"
    except ValueError:
        return None, raw, "coming_soon"

def extract_resin_name(sheet_name: str) -> str:
    """Extract resin name from sheet name."""
    # Remove "PARÂMETROS " prefix if present
    name = re.sub(r'^PAR[ÂA]METROS?\s+', '', sheet_name, flags=re.IGNORECASE)
    return name.strip()

def parse_sheet(df: pd.DataFrame, sheet_name: str) -> List[Dict[str, Any]]:
    """
    Parse a single sheet and extract all printer profiles.
    Returns a list of profile dictionaries.
    """
    profiles = []
    resin_name = extract_resin_name(sheet_name)
    resin_id = slugify(resin_name)
    
    current_brand = None
    header_row = None
    column_mapping = {}
    
    # Column mapping function - checks more specific patterns first to avoid substring collisions
    def map_column_name(col_name: str) -> Optional[str]:
        """Map a column header to a parameter name, checking specific patterns first."""
        col_upper = col_name.upper().strip()
        
        # Direct/exact matches first
        if col_upper in ['MARCA IMPRESSORA', 'MARCA']:
            return 'brand'
        if col_upper == 'MODELO':
            return 'model'
        if col_upper in ['ALTURA CAMADA', 'ALTURA DE CAMADA', 'LAYER HEIGHT']:
            return 'layerHeightMm'
        if col_upper in ['CAMADAS DE BASE', 'CAMADAS BASE', 'BASE LAYERS', 'BOTTOM LAYERS']:
            return 'baseLayers'
        
        # IMPORTANT: Check BASE/BOTTOM exposure BEFORE normal exposure (substring collision fix)
        if any(x in col_upper for x in ['EXPOSIÇÃO BASE', 'EXPOSICAO BASE', 'BASE EXPOSURE', 'BOTTOM EXPOSURE', 'TEMPO EXPOSIÇÃO BASE', 'TEMPO EXPOSICAO BASE']):
            return 'baseExposureTimeS'
        
        # Normal exposure (only after ruling out base exposure)
        if any(x in col_upper for x in ['TEMPO EXPOSIÇÃO', 'TEMPO EXPOSICAO', 'NORMAL EXPOSURE', 'LAYER TIME', 'EXPOSURE TIME']):
            if 'BASE' not in col_upper and 'BOTTOM' not in col_upper:
                return 'exposureTimeS'
        
        # UV delay columns - check BASE first
        if any(x in col_upper for x in ['RETARDO DESL. UV BASE', 'RETARDO DESLIGAR UV BASE', 'UV OFF DELAY BASE']):
            return 'uvOffDelayBaseS'
        if any(x in col_upper for x in ['RETARDO DESLIGAR UV', 'RETARDO DESL. UV', 'UV OFF DELAY']):
            if 'BASE' not in col_upper:
                return 'uvOffDelayS'
        
        # Rest/delay columns
        if any(x in col_upper for x in ['DESCANSO ANTES DA ELEVAÇÃO', 'DESCANSO ANTES DA ELEVACAO', 'REST BEFORE LIFT']):
            return 'restBeforeLiftS'
        if any(x in col_upper for x in ['DESCANSO APÓS A ELEVAÇÃO', 'DESCANSO APOS A ELEVACAO', 'REST AFTER LIFT']):
            return 'restAfterLiftS'
        if any(x in col_upper for x in ['DESCANSO APÓS A RETRAÇÃO', 'DESCANSO APOS A RETRACAO', 'REST AFTER RETRACT']):
            return 'restAfterRetractS'
        
        # UV Power
        if any(x in col_upper for x in ['POTÊNCIA UV', 'POTENCIA UV', 'UV POWER']):
            return 'uvPower'
        
        return None
    
    for idx, row in df.iterrows():
        row_values = [str(v).strip() if not pd.isna(v) else '' for v in row.values]
        first_cell = row_values[0] if row_values else ''
        
        # Check if this is a section header (e.g., "PARÂMETROS DE IMPRESSÃO CHITUBOX - RESINA PYROBLAST - ANYCUBIC")
        if 'PARÂMETROS DE IMPRESSÃO' in first_cell.upper() or 'PARAMETROS DE IMPRESSAO' in first_cell.upper():
            # Extract brand from section header
            parts = first_cell.split('-')
            if len(parts) >= 3:
                current_brand = parts[-1].strip()
            continue
        
        # Check if this is a header row
        if 'MARCA IMPRESSORA' in first_cell.upper() or 'MODELO' in row_values[1].upper() if len(row_values) > 1 else False:
            header_row = idx
            column_mapping = {}
            for col_idx, col_name in enumerate(row_values):
                mapped = map_column_name(col_name)
                if mapped:
                    column_mapping[col_idx] = mapped
            
            # Validation: ensure we found both exposure columns
            mapped_params = set(column_mapping.values())
            if 'exposureTimeS' not in mapped_params:
                print(f"  WARNING: 'exposureTimeS' (normal exposure) not found in header row!")
            if 'baseExposureTimeS' not in mapped_params:
                print(f"  WARNING: 'baseExposureTimeS' (base exposure) not found in header row!")
            
            continue
        
        # Skip empty rows
        if not first_cell or first_cell.upper() == 'NAN':
            continue
        
        # Skip if we haven't found a header yet
        if not column_mapping:
            continue
        
        # This should be a data row
        brand = first_cell if first_cell else current_brand
        model = row_values[1] if len(row_values) > 1 else ''
        
        if not model or model.upper() == 'NAN':
            continue
        
        # Extract parameters
        params = {}
        raw_params = {}
        all_empty = True
        all_zero = True
        
        for col_idx, param_name in column_mapping.items():
            if param_name in ['brand', 'model']:
                continue
            if col_idx < len(row_values):
                numeric, raw, status = parse_numeric_value(row_values[col_idx])
                params[param_name] = numeric
                raw_params[param_name] = raw
                if numeric is not None:
                    all_empty = False
                    if numeric != 0:
                        all_zero = False
        
        # Determine profile status
        if all_empty:
            profile_status = "coming_soon"
        elif all_zero:
            profile_status = "coming_soon"
        else:
            profile_status = "ok"
        
        # Create printer ID
        printer_id = f"{slugify(brand)}__{slugify(model)}"
        profile_id = f"{resin_id}__{printer_id}"
        
        profile = {
            "id": profile_id,
            "resinId": resin_id,
            "resinName": resin_name,
            "printerId": printer_id,
            "brand": brand,
            "model": model,
            "params": params,
            "raw": raw_params,
            "status": profile_status
        }
        
        profiles.append(profile)
    
    return profiles

def generate_rag_digest(profiles: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Generate RAG-friendly text chunks for chatbot context."""
    chunks = []
    
    for profile in profiles:
        if profile["status"] == "coming_soon":
            text = f"Resina {profile['resinName']} | Impressora {profile['brand']} {profile['model']}: Parâmetros em breve."
        else:
            params = profile["params"]
            param_parts = []
            
            if params.get("layerHeightMm") is not None:
                param_parts.append(f"altura de camada={params['layerHeightMm']}mm")
            if params.get("baseLayers") is not None:
                param_parts.append(f"camadas de base={int(params['baseLayers'])}")
            if params.get("exposureTimeS") is not None:
                param_parts.append(f"tempo de exposição={params['exposureTimeS']}s")
            if params.get("baseExposureTimeS") is not None:
                param_parts.append(f"exposição base={params['baseExposureTimeS']}s")
            if params.get("uvOffDelayS") is not None:
                param_parts.append(f"retardo UV={params['uvOffDelayS']}s")
            if params.get("restBeforeLiftS") is not None:
                param_parts.append(f"descanso antes elevação={params['restBeforeLiftS']}s")
            if params.get("restAfterLiftS") is not None:
                param_parts.append(f"descanso após elevação={params['restAfterLiftS']}s")
            if params.get("restAfterRetractS") is not None:
                param_parts.append(f"descanso após retração={params['restAfterRetractS']}s")
            if params.get("uvPower") is not None:
                param_parts.append(f"potência UV={params['uvPower']}")
            
            text = f"Resina {profile['resinName']} | Impressora {profile['brand']} {profile['model']}: {', '.join(param_parts)}"
        
        chunks.append({
            "id": profile["id"],
            "resin": profile["resinName"],
            "printer": f"{profile['brand']} {profile['model']}",
            "text": text,
            "status": profile["status"]
        })
    
    return chunks

def main():
    if len(sys.argv) < 2:
        print("Usage: python import_print_params_from_excel.py <excel_file> [output_dir]")
        sys.exit(1)
    
    excel_file = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    print(f"Reading Excel file: {excel_file}")
    print(f"Output directory: {output_dir}")
    
    # Read all sheets
    xl = pd.ExcelFile(excel_file)
    print(f"Found {len(xl.sheet_names)} sheets: {xl.sheet_names}")
    
    all_profiles = []
    resins = {}
    printers = {}
    
    for sheet_name in xl.sheet_names:
        print(f"\nProcessing sheet: {sheet_name}")
        df = pd.read_excel(excel_file, sheet_name=sheet_name, header=None)
        
        profiles = parse_sheet(df, sheet_name)
        print(f"  Found {len(profiles)} profiles")
        
        # Collect unique resins and printers
        for profile in profiles:
            resin_id = profile["resinId"]
            if resin_id not in resins:
                resins[resin_id] = {
                    "id": resin_id,
                    "name": profile["resinName"],
                    "sourceSheet": sheet_name
                }
            
            printer_id = profile["printerId"]
            if printer_id not in printers:
                printers[printer_id] = {
                    "id": printer_id,
                    "brand": profile["brand"],
                    "model": profile["model"]
                }
        
        all_profiles.extend(profiles)
    
    # Create the database structure
    database = {
        "version": 1,
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "units": {
            "time": "s",
            "layerHeight": "mm"
        },
        "stats": {
            "totalProfiles": len(all_profiles),
            "totalResins": len(resins),
            "totalPrinters": len(printers),
            "okProfiles": len([p for p in all_profiles if p["status"] == "ok"]),
            "comingSoonProfiles": len([p for p in all_profiles if p["status"] == "coming_soon"])
        },
        "resins": list(resins.values()),
        "printers": list(printers.values()),
        "profiles": all_profiles
    }
    
    # Generate RAG digest
    rag_digest = generate_rag_digest(all_profiles)
    
    # Ensure data directory exists
    data_dir = os.path.join(output_dir, 'data')
    os.makedirs(data_dir, exist_ok=True)
    
    # Write database file
    db_file = os.path.join(data_dir, 'print-parameters-db.json')
    with open(db_file, 'w', encoding='utf-8') as f:
        json.dump(database, f, ensure_ascii=False, indent=2)
    print(f"\nDatabase written to: {db_file}")
    
    # Write RAG digest file
    rag_file = os.path.join(data_dir, 'print-parameters-rag.json')
    with open(rag_file, 'w', encoding='utf-8') as f:
        json.dump(rag_digest, f, ensure_ascii=False, indent=2)
    print(f"RAG digest written to: {rag_file}")
    
    # Print summary
    print(f"\n=== IMPORT SUMMARY ===")
    print(f"Total Resins: {len(resins)}")
    print(f"Total Printers: {len(printers)}")
    print(f"Total Profiles: {len(all_profiles)}")
    print(f"  - OK: {database['stats']['okProfiles']}")
    print(f"  - Coming Soon: {database['stats']['comingSoonProfiles']}")
    
    print("\nResins:")
    for resin in resins.values():
        print(f"  - {resin['name']} ({resin['id']})")
    
    print("\nPrinters (first 10):")
    for i, printer in enumerate(list(printers.values())[:10]):
        print(f"  - {printer['brand']} {printer['model']} ({printer['id']})")
    if len(printers) > 10:
        print(f"  ... and {len(printers) - 10} more")
    
    # DEBUG: Print example profiles for validation
    print("\n=== DEBUG: EXAMPLE PROFILES FOR VALIDATION ===")
    
    # Find IRON resin profiles with MARS or PHOTON printers
    example_profiles = []
    for p in all_profiles:
        resin_lower = p['resinName'].lower()
        model_lower = p['model'].lower()
        # Look for IRON + MARS or IRON + PHOTON CLASSICA
        if 'iron' in resin_lower and ('mars' in model_lower or 'photon' in model_lower):
            example_profiles.append(p)
    
    # Show first 3 examples
    for p in example_profiles[:3]:
        print(f"\n--- {p['resinName']} + {p['brand']} {p['model']} ---")
        print(f"  Profile ID: {p['id']}")
        print(f"  Status: {p['status']}")
        print(f"  Parameters:")
        print(f"    layerHeightMm: {p['params'].get('layerHeightMm')} (raw: {p['raw'].get('layerHeightMm', '')})")
        print(f"    baseLayers: {p['params'].get('baseLayers')} (raw: {p['raw'].get('baseLayers', '')})")
        print(f"    exposureTimeS: {p['params'].get('exposureTimeS')} (raw: {p['raw'].get('exposureTimeS', '')})")
        print(f"    baseExposureTimeS: {p['params'].get('baseExposureTimeS')} (raw: {p['raw'].get('baseExposureTimeS', '')})")
        print(f"    uvOffDelayS: {p['params'].get('uvOffDelayS')} (raw: {p['raw'].get('uvOffDelayS', '')})")
        print(f"    restBeforeLiftS: {p['params'].get('restBeforeLiftS')} (raw: {p['raw'].get('restBeforeLiftS', '')})")
        print(f"    restAfterLiftS: {p['params'].get('restAfterLiftS')} (raw: {p['raw'].get('restAfterLiftS', '')})")
        print(f"    restAfterRetractS: {p['params'].get('restAfterRetractS')} (raw: {p['raw'].get('restAfterRetractS', '')})")
        print(f"    uvPower: {p['params'].get('uvPower')} (raw: {p['raw'].get('uvPower', '')})")
    
    if not example_profiles:
        print("  No IRON + MARS/PHOTON profiles found for validation")
    
    print("\n=== VALIDATION CHECK ===")
    print("Expected for IRON + PHOTON CLASSICA: exposureTimeS=6.5, baseExposureTimeS=55")
    print("If these values are swapped or blank, the column mapping is still incorrect!")

if __name__ == "__main__":
    main()
