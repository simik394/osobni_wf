#!/usr/bin/env python3
"""
restore_obsidian_syntax.py
Guarantees source restoration and finalizes PDF output.
"""
import sys
import shutil
import os
from pathlib import Path

def restore_source(qmd_path: Path):
    backup_file = qmd_path.parent / ".quarto" / f"original_{qmd_path.name}"
    if backup_file.exists():
        original_content = backup_file.read_text(encoding='utf-8')
        qmd_path.write_text(original_content, encoding='utf-8')
        backup_file.unlink()
        print(f"  ✓ [Post-Render] Restored {qmd_path.name} to original state")

def move_pdf(qmd_path: Path):
    project_root = qmd_path.parent
    build_dir = project_root / "_build"
    out_dir = project_root / "out"
    out_dir.mkdir(exist_ok=True)

    # Check for atomic candidate or standard name
    candidate = build_dir / qmd_path.with_suffix(".pdf").name
    if not candidate.exists():
        candidate = build_dir / "__atomic_candidate.pdf"

    if candidate.exists():
        final_output = out_dir / qmd_path.with_suffix(".pdf").name
        shutil.move(str(candidate), str(final_output))
        print(f"  ✅ [Output] PDF ready at: {final_output}")

if __name__ == "__main__":
    for arg in sys.argv[1:]:
        path = Path(arg)
        if path.suffix == '.qmd' and path.exists():
            restore_source(path)
            move_pdf(path)