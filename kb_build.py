"""Ferramenta para gerar o kb_index.json em partes controladas.

Objetivos principais:
- Evitar estouros de tempo/memória permitindo limitar quantos arquivos são processados.
- Verificar se a variável OPENAI_API_KEY está presente antes de chamar a API.
- Possibilitar dry-run (sem chamadas à API) para validar o pipeline rapidamente.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

try:
    from openai import OpenAI  # type: ignore
except Exception:  # pragma: no cover - import guard
    OpenAI = None  # type: ignore

MODEL_NAME = "text-embedding-3-large"
DEFAULT_INPUT_DIR = Path("rag-knowledge")
DEFAULT_OUTPUT = Path("kb_index.json")


def load_existing_index(output_path: Path) -> Dict[str, dict]:
    if not output_path.exists():
        return {}

    try:
        raw = json.loads(output_path.read_text())
        docs = raw.get("documents", raw)
        return {doc.get("id") or doc.get("path"): doc for doc in docs if isinstance(doc, dict)}
    except json.JSONDecodeError:
        print(f"⚠️  Arquivo {output_path} está corrompido ou vazio. Iniciando novo índice.")
        return {}


def save_index(output_path: Path, documents: List[dict]) -> None:
    payload = {
        "model": MODEL_NAME,
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "documents": documents,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))


def get_files(input_dir: Path, start: int, limit: Optional[int]) -> List[Path]:
    files = sorted(input_dir.glob("*.txt"))
    sliced = files[start:]
    if limit is not None:
        sliced = sliced[:limit]
    return sliced


def build_index(
    input_dir: Path,
    output_path: Path,
    start: int,
    limit: Optional[int],
    batch_size: int,
    max_chars: int,
    dry_run: bool,
) -> None:
    if not input_dir.exists():
        raise SystemExit(f"Diretório de conhecimento não encontrado: {input_dir}")

    existing = load_existing_index(output_path)
    documents: List[dict] = list(existing.values())

    if not dry_run:
        if OpenAI is None:
            raise SystemExit("Biblioteca `openai` não instalada. Execute `pip install openai`.\n" "Use --dry-run para testar sem API.")
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise SystemExit("OPENAI_API_KEY não configurada no ambiente.")
        client = OpenAI(api_key=api_key)
    else:
        client = None

    files = get_files(input_dir, start, limit)
    if not files:
        print("Nenhum arquivo .txt encontrado para processar.")
        return

    processed = 0
    new_docs = 0

    for idx, file_path in enumerate(files, start=1):
        file_id = file_path.name
        if file_id in existing:
            print(f"↪️  Pulando {file_id} (já presente no índice)")
            continue

        text = file_path.read_text(encoding="utf-8", errors="ignore").strip()
        title, _, body = text.partition("\n")
        embed_input = text[:max_chars]

        embedding: List[float]
        if dry_run:
            embedding = []
        else:
            response = client.embeddings.create(model=MODEL_NAME, input=embed_input)
            embedding = response.data[0].embedding

        documents.append(
            {
                "id": file_id,
                "source": str(file_path),
                "title": title or file_path.stem,
                "content": body.strip() or text,
                "embedding_model": MODEL_NAME,
                "embedding": embedding,
            }
        )

        new_docs += 1
        processed += 1

        if new_docs % batch_size == 0:
            save_index(output_path, documents)
            print(f"💾 Progresso salvo após {new_docs} novos documentos (arquivo: {file_id})")

        print(f"✅ Processado {file_id} ({idx}/{len(files)})")

    if new_docs:
        save_index(output_path, documents)
        print(f"🎉 Index final salvo com {len(documents)} documentos no total.")
    else:
        print("Nenhum novo documento adicionado. Índice permanece inalterado.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Gerar kb_index.json em lotes menores")
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR, help="Pasta com arquivos .txt da base de conhecimento")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Arquivo de saída (kb_index.json)")
    parser.add_argument("--start", type=int, default=0, help="Arquivo inicial (offset) para processar")
    parser.add_argument("--limit", type=int, help="Quantidade máxima de arquivos a processar")
    parser.add_argument("--batch-size", type=int, default=5, help="Grava a cada N novos documentos")
    parser.add_argument("--max-chars", type=int, default=8000, help="Trunca o texto enviado para a API")
    parser.add_argument("--dry-run", action="store_true", help="Não chama a API; útil para testes rápidos")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    try:
        build_index(
            input_dir=args.input_dir,
            output_path=args.output,
            start=args.start,
            limit=args.limit,
            batch_size=args.batch_size,
            max_chars=args.max_chars,
            dry_run=args.dry_run,
        )
    except SystemExit as exc:  # Propagar mensagens amigáveis
        print(str(exc))
        sys.exit(1)
