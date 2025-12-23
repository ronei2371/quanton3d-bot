#!/usr/bin/env python3
"""
Import Print Parameters from HTML (Trio Office export) to JSON Database.

Usage:
  python scripts/import_print_params_from_html.py <html_file> [output_path]
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


class TableHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tables: List[List[List[str]]] = []
        self._in_table = False
        self._in_row = False
        self._in_cell = False
        self._current_table: List[List[str]] = []
        self._current_row: List[str] = []
        self._current_cell: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, Optional[str]]]) -> None:
        if tag == "table":
            self._in_table = True
            self._current_table = []
        elif tag == "tr" and self._in_table:
            self._in_row = True
            self._current_row = []
        elif tag in {"td", "th"} and self._in_row:
            self._in_cell = True
            self._current_cell = []

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._current_cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag in {"td", "th"} and self._in_cell:
            cell_text = unescape("".join(self._current_cell))
            cell_text = cell_text.replace("\xa0", " ").strip()
            self._current_row.append(cell_text)
            self._in_cell = False
            self._current_cell = []
        elif tag == "tr" and self._in_row:
            self._current_table.append(self._current_row)
            self._in_row = False
            self._current_row = []
        elif tag == "table" and self._in_table:
            self.tables.append(self._current_table)
            self._in_table = False
            self._current_table = []


def slugify(text: str) -> str:
    if not text:
        return ""
    text = str(text).lower().strip()
    replacements = {
        "á": "a",
        "à": "a",
        "ã": "a",
        "â": "a",
        "ä": "a",
        "é": "e",
        "è": "e",
        "ê": "e",
        "ë": "e",
        "í": "i",
        "ì": "i",
        "î": "i",
        "ï": "i",
        "ó": "o",
        "ò": "o",
        "õ": "o",
        "ô": "o",
        "ö": "o",
        "ú": "u",
        "ù": "u",
        "û": "u",
        "ü": "u",
        "ç": "c",
        "ñ": "n",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")


def clean_raw_value(raw: str) -> str:
    cleaned = raw.strip()
    cleaned = re.sub(r"(mm)+", "mm", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"(s)+", "s", cleaned, flags=re.IGNORECASE)
    return cleaned


def parse_numeric_value(value: Any) -> Tuple[Optional[float], str, str]:
    if value is None:
        return None, "", "empty"

    raw = str(value).strip()
    if not raw:
        return None, "", "empty"

    raw = clean_raw_value(raw)
    lowered = raw.lower()

    if lowered in {"em breve", "coming soon", "n/a", "nan", "undefined", "-"}:
        return None, raw, "coming_soon"

    cleaned = re.sub(r"[^0-9,.-]+", "", lowered)
    cleaned = cleaned.replace(",", ".")

    if cleaned in {"", ".", "-"}:
        return None, raw, "empty"

    try:
        numeric = float(cleaned)
        return numeric, raw, "ok"
    except ValueError:
        return None, raw, "coming_soon"


def extract_resin_name(sheet_name: str) -> str:
    name = re.sub(r"^PAR[ÂA]METROS?\s+", "", sheet_name, flags=re.IGNORECASE)
    return name.strip()


def map_column_name(col_name: str) -> Optional[str]:
    col_upper = col_name.upper().strip()

    if col_upper in {"MARCA IMPRESSORA", "MARCA"}:
        return "brand"
    if col_upper == "MODELO":
        return "model"
    if col_upper in {"ALTURA CAMADA", "ALTURA DE CAMADA", "LAYER HEIGHT"}:
        return "layerHeightMm"
    if col_upper in {"CAMADAS DE BASE", "CAMADAS BASE", "BASE LAYERS", "BOTTOM LAYERS"}:
        return "baseLayers"

    if any(
        key in col_upper
        for key in {
            "EXPOSIÇÃO BASE",
            "EXPOSICAO BASE",
            "BASE EXPOSURE",
            "BOTTOM EXPOSURE",
            "TEMPO EXPOSIÇÃO BASE",
            "TEMPO EXPOSICAO BASE",
        }
    ):
        return "baseExposureTimeS"

    if any(
        key in col_upper
        for key in {
            "TEMPO EXPOSIÇÃO",
            "TEMPO EXPOSICAO",
            "NORMAL EXPOSURE",
            "LAYER TIME",
            "EXPOSURE TIME",
        }
    ) and "BASE" not in col_upper and "BOTTOM" not in col_upper:
        return "exposureTimeS"

    if any(
        key in col_upper
        for key in {
            "RETARDO DESL. UV BASE",
            "RETARDO DESLIGAR UV BASE",
            "UV OFF DELAY BASE",
        }
    ):
        return "uvOffDelayBaseS"

    if any(
        key in col_upper
        for key in {
            "RETARDO DESLIGAR UV",
            "RETARDO DESL. UV",
            "UV OFF DELAY",
        }
    ) and "BASE" not in col_upper:
        return "uvOffDelayS"

    if any(
        key in col_upper
        for key in {
            "DESCANSO ANTES DA ELEVAÇÃO",
            "DESCANSO ANTES DA ELEVACAO",
            "REST BEFORE LIFT",
        }
    ):
        return "restBeforeLiftS"
    if any(
        key in col_upper
        for key in {
            "DESCANSO APÓS A ELEVAÇÃO",
            "DESCANSO APOS A ELEVACAO",
            "REST AFTER LIFT",
        }
    ):
        return "restAfterLiftS"
    if any(
        key in col_upper
        for key in {
            "DESCANSO APÓS A RETRAÇÃO",
            "DESCANSO APOS A RETRACAO",
            "REST AFTER RETRACT",
        }
    ):
        return "restAfterRetractS"

    if any(key in col_upper for key in {"POTÊNCIA UV", "POTENCIA UV", "UV POWER"}):
        return "uvPower"

    return None


def parse_table(rows: List[List[str]], sheet_name: str) -> List[Dict[str, Any]]:
    profiles: List[Dict[str, Any]] = []
    resin_name = extract_resin_name(sheet_name)
    resin_id = slugify(resin_name)

    current_brand: Optional[str] = None
    column_mapping: Dict[int, str] = {}

    for row in rows:
        row_values = [cell.strip() for cell in row]
        first_cell = row_values[0] if row_values else ""

        if first_cell and "PARÂMETROS DE IMPRESSÃO" in first_cell.upper():
            parts = [part.strip() for part in first_cell.split("-") if part.strip()]
            if parts:
                current_brand = parts[-1].strip()
            continue

        if first_cell and (
            "MARCA IMPRESSORA" in first_cell.upper()
            or (len(row_values) > 1 and "MODELO" in row_values[1].upper())
        ):
            column_mapping = {}
            for idx, col_name in enumerate(row_values):
                mapped = map_column_name(col_name)
                if mapped:
                    column_mapping[idx] = mapped
            continue

        if not column_mapping:
            continue

        if not first_cell and not current_brand:
            continue

        brand = first_cell or current_brand
        model = row_values[1] if len(row_values) > 1 else ""
        if not brand or not model:
            continue

        params: Dict[str, Optional[float]] = {}
        raw_params: Dict[str, str] = {}
        all_empty = True
        all_zero = True

        for col_idx, param_name in column_mapping.items():
            if param_name in {"brand", "model"}:
                continue
            if col_idx >= len(row_values):
                continue
            numeric, raw, _status = parse_numeric_value(row_values[col_idx])
            params[param_name] = numeric
            raw_params[param_name] = raw
            if numeric is not None:
                all_empty = False
                if numeric != 0:
                    all_zero = False

        profile_status = "coming_soon" if (all_empty or all_zero) else "ok"

        printer_id = f"{slugify(brand)}__{slugify(model)}"
        profile_id = f"{resin_id}__{printer_id}"

        profiles.append(
            {
                "id": profile_id,
                "resinId": resin_id,
                "resinName": resin_name,
                "printerId": printer_id,
                "brand": brand,
                "model": model,
                "params": params,
                "raw": raw_params,
                "status": profile_status,
            }
        )

    return profiles


def build_output(resin_names: List[str], profiles: List[Dict[str, Any]]) -> Dict[str, Any]:
    resins = []
    for name in resin_names:
        resins.append(
            {
                "id": slugify(extract_resin_name(name)),
                "name": extract_resin_name(name),
                "sourceSheet": name,
            }
        )

    printers_map: Dict[str, Dict[str, str]] = {}
    for profile in profiles:
        printer_id = profile["printerId"]
        if printer_id not in printers_map:
            printers_map[printer_id] = {
                "id": printer_id,
                "brand": profile["brand"],
                "model": profile["model"],
            }

    stats = {
        "totalProfiles": len(profiles),
        "totalResins": len(resins),
        "totalPrinters": len(printers_map),
        "okProfiles": sum(1 for p in profiles if p["status"] == "ok"),
        "comingSoonProfiles": sum(1 for p in profiles if p["status"] != "ok"),
    }

    return {
        "version": 1,
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "units": {"time": "s", "layerHeight": "mm"},
        "stats": stats,
        "resins": resins,
        "printers": list(printers_map.values()),
        "profiles": profiles,
    }


def generate_rag_digest(profiles: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    chunks = []

    for profile in profiles:
        if profile["status"] == "coming_soon":
            text = f"Resina {profile['resinName']} | Impressora {profile['brand']} {profile['model']}: Parâmetros em breve."
        else:
            params = profile.get("params", {})
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
            if params.get("uvOffDelayBaseS") is not None:
                param_parts.append(f"retardo UV base={params['uvOffDelayBaseS']}s")
            if params.get("restBeforeLiftS") is not None:
                param_parts.append(f"descanso antes elevação={params['restBeforeLiftS']}s")
            if params.get("restAfterLiftS") is not None:
                param_parts.append(f"descanso após elevação={params['restAfterLiftS']}s")
            if params.get("restAfterRetractS") is not None:
                param_parts.append(f"descanso após retração={params['restAfterRetractS']}s")
            if params.get("uvPower") is not None:
                param_parts.append(f"potência UV={params['uvPower']}")

            text = (
                f"Resina {profile['resinName']} | Impressora {profile['brand']} {profile['model']}: "
                f"{', '.join(param_parts)}"
            )

        chunks.append(
            {
                "id": profile["id"],
                "resin": profile["resinName"],
                "printer": f"{profile['brand']} {profile['model']}",
                "text": text,
                "status": profile["status"],
            }
        )

    return chunks


def extract_sheet_names(html_text: str) -> List[str]:
    matches = re.findall(r"Planilha\s+\d+:\s*<em>(.*?)</em>", html_text, flags=re.IGNORECASE)
    return [unescape(match).strip() for match in matches]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("html_file", type=Path)
    parser.add_argument("output_path", type=Path, nargs="?", default=Path("data/resins_extracted.json"))
    args = parser.parse_args()

    html_text = args.html_file.read_text(encoding="utf-8", errors="ignore")
    sheet_names = extract_sheet_names(html_text)

    table_parser = TableHTMLParser()
    table_parser.feed(html_text)

    tables = table_parser.tables
    if sheet_names and len(sheet_names) != len(tables):
        print(
            f"⚠️ Aviso: {len(sheet_names)} planilhas encontradas, {len(tables)} tabelas detectadas.\n"
            "Usando o menor total para o processamento."
        )

    count = min(len(sheet_names), len(tables)) if sheet_names else len(tables)
    profiles: List[Dict[str, Any]] = []
    used_sheet_names = sheet_names[:count] if sheet_names else []

    for idx in range(count):
        sheet_name = used_sheet_names[idx] if used_sheet_names else f"Planilha {idx + 1}"
        profiles.extend(parse_table(tables[idx], sheet_name))

    output = build_output(used_sheet_names if used_sheet_names else [f"Planilha {i+1}" for i in range(count)], profiles)
    args.output_path.parent.mkdir(parents=True, exist_ok=True)
    args.output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Gerado {args.output_path} com {len(profiles)} perfis.")

    rag_output = generate_rag_digest(profiles)
    db_path = args.output_path.parent / "print-parameters-db.json"
    rag_path = args.output_path.parent / "print-parameters-rag.json"
    db_path.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    rag_path.write_text(json.dumps(rag_output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Gerado {db_path} e {rag_path}.")


if __name__ == "__main__":
    main()
