#!/usr/bin/env python3
"""
quarto-obsidian-render.py
Renders Quarto documents with Obsidian syntax without modifying source files.

This script:
1. Creates a staging copy of the source file in .quarto/staging/
2. Transforms Obsidian wikilinks to standard Markdown in the staged copy
3. Renders the staged file using Quarto (inherits project config)
4. Moves output to the final location 
5. Cleans up staging files
6. The original source file is NEVER modified

Usage:
  python3 quarto-obsidian-render.py file.qmd [quarto render options...]
"""

import sys
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Optional


def find_vault_root(start_dir: Path) -> Optional[Path]:
    """Find the Obsidian vault root by looking for .obsidian folder."""
    current = start_dir.absolute()
    for _ in range(15):
        if (current / ".obsidian").exists():
            return current
        if current.parent == current:
            break
        current = current.parent
    return None


def resolve_path(base_dir: Path, embed_path: str, staging_dir: Path = None) -> str:
    """Resolve an Obsidian embed path to a RELATIVE path.
    Returns path relative to staging_dir to work around LaTeX absolute path issues.
    """
    filename = Path(embed_path).name
    
    # Handle .canvas -> .png swap
    if filename.endswith('.canvas'):
        filename = filename[:-7] + '.png'
    
    # Check .quarto/frames/ first (for auto-exported Excalidraw frames)
    frames_path = base_dir / ".quarto" / "frames" / filename
    if frames_path.exists():
        if staging_dir:
            try:
                return os.path.relpath(frames_path.absolute(), staging_dir.absolute())
            except ValueError:
                return str(frames_path.absolute())
        return str(frames_path.absolute())
    
    # Check local directory
    local_path = base_dir / filename
    if local_path.exists():
        # Return relative path from staging dir to the file
        if staging_dir:
            try:
                return os.path.relpath(local_path.absolute(), staging_dir.absolute())
            except ValueError:
                return str(local_path.absolute())
        return str(local_path.absolute())
    
    # Check vault attachments
    vault_root = find_vault_root(base_dir)
    if vault_root:
        for folder in ["attachments", "Attachments", "assets", "Assets", "."]:
            attach_path = vault_root / folder / filename
            if attach_path.exists():
                if staging_dir:
                    try:
                        return os.path.relpath(attach_path.absolute(), staging_dir.absolute())
                    except ValueError:
                        return str(attach_path.absolute())
                return str(attach_path.absolute())
    
    # Hardcoded fallback for common location
    common = Path("/home/sim/Obsi/attachments") / filename
    if common.exists():
        if staging_dir:
            try:
                return os.path.relpath(common.absolute(), staging_dir.absolute())
            except ValueError:
                return str(common.absolute())
        return str(common.absolute())
    
    return embed_path


def transform_wikilinks(content: str, base_dir: Path, staging_dir: Path = None) -> str:
    """Transform Obsidian ![[wikilinks]] to standard Markdown images.
    
    Handles:
    - Basic: ![[image.png]]
    - With caption: ![[image.png|Caption]]
    - With attrs: ![[image.png]]{#fig-id}
    - Canvas files: ![[file.canvas]] -> file.png
    - Excalidraw: ![[file.excalidraw.md#^frame=01]] -> file-frame-01.png
    - Excalidraw group: ![[file.excalidraw.md#^group=ID]] -> file-group-ID.png
    """
    
    def replace_wikilink(match):
        full_path = match.group(1)  # path including #fragment
        caption_part = match.group(2) or ""
        attrs = match.group(3) or ""
        
        # Parse fragment (e.g., #^frame=01, #^group=xyz)
        embed_path = full_path
        fragment = ""
        fragment_type = ""
        fragment_id = ""
        
        if "#" in full_path:
            parts = full_path.split("#", 1)
            embed_path = parts[0]
            fragment = parts[1] if len(parts) > 1 else ""
            
            # Parse Excalidraw fragment types: ^frame=XX, ^group=XX, ^area=XX
            frag_match = re.match(r'\^?(frame|group|area)=(.+)', fragment)
            if frag_match:
                fragment_type = frag_match.group(1)
                fragment_id = frag_match.group(2)
        
        # Parse caption (after | )
        caption = ""
        if caption_part.startswith("|"):
            caption = caption_part[1:].strip()
        
        # Handle Excalidraw files
        is_excalidraw = '.excalidraw' in embed_path.lower()
        
        if is_excalidraw:
            # For excalidraw with frame/group, look for exported PNG
            base_name = Path(embed_path).stem.replace('.excalidraw', '').replace('.md', '')
            
            if fragment_type and fragment_id:
                # Look for frame-specific export: filename-frame-01.png
                png_name = f"{base_name}-{fragment_type}-{fragment_id}.png"
            else:
                # Whole excalidraw: filename.png
                png_name = f"{base_name}.png"
            
            # If no caption, use meaningful default
            if not caption:
                if fragment_type:
                    caption = f"{base_name} ({fragment_type} {fragment_id})"
                else:
                    caption = base_name
            
            # Try to find the PNG
            resolved = resolve_path(base_dir, png_name, staging_dir)
            
            # Check if resolved file exists, if not, warn and use placeholder
            check_path = Path(resolved) if Path(resolved).is_absolute() else (staging_dir / resolved if staging_dir else base_dir / resolved)
            if not check_path.exists():
                print(f"  ⚠ Excalidraw export not found: {png_name}")
                print(f"    → Export from Obsidian: Open {embed_path}, right-click frame → Copy as PNG")
                # Return a placeholder that will fail gracefully
                return f"<!-- Excalidraw export needed: {png_name} -->\n\n**[Missing: {png_name}]**"
            
            return f"![{caption}]({resolved}){attrs}"
        
        # If no caption, use filename without extension
        if not caption:
            caption = Path(embed_path).stem
            caption = caption.replace(".excalidraw", "")
        
        # Resolve the path (relative to staging dir)
        resolved = resolve_path(base_dir, embed_path, staging_dir)
        
        # Build standard markdown
        return f"![{caption}]({resolved}){attrs}"
    
    # Pattern: ![[path#fragment|caption]]{attrs} or ![[path]]{attrs}
    # Now captures everything before | or ] as the path (including #fragment)
    pattern = r'!\[\[([^\]|]+)([^\]]*)\]\](\{[^}]+\})?'
    
    content = re.sub(pattern, replace_wikilink, content)
    
    # Also handle standard markdown images with .canvas extension
    # Pattern: ![alt](path.canvas) -> ![alt](path.png)
    def replace_canvas_image(match):
        alt = match.group(1)
        path = match.group(2)
        attrs = match.group(3) or ""
        
        # Swap .canvas to .png
        if path.endswith('.canvas'):
            new_path = path[:-7] + '.png'
            # Try to resolve it (relative to staging dir)
            resolved = resolve_path(base_dir, new_path, staging_dir)
            return f"![{alt}]({resolved}){attrs}"
        return match.group(0)
    
    canvas_pattern = r'!\[([^\]]*)\]\(([^)]+\.canvas)\)(\{[^}]+\})?'
    content = re.sub(canvas_pattern, replace_canvas_image, content)
    
    # Handle standard markdown images with .excalidraw.md#frame=XX
    # Pattern: ![alt](path.excalidraw.md#frame=01) -> ![alt](path-frame-01.png)
    def replace_excalidraw_md_link(match):
        alt = match.group(1)
        full_path = match.group(2)  # e.g., Drawing.excalidraw.md#frame=01
        attrs = match.group(3) or ""
        
        # Parse the path and fragment
        if '#' in full_path:
            path, fragment = full_path.split('#', 1)
        else:
            path = full_path
            fragment = ""
        
        # Parse fragment type (frame=XX, group=XX, area=XX)
        frag_match = re.match(r'\^?(frame|group|area)=(.+)', fragment)
        if frag_match:
            frag_type = frag_match.group(1)
            frag_id = frag_match.group(2)
        else:
            # No frame reference, just the whole excalidraw
            frag_type = None
            frag_id = None
        
        # Build PNG filename
        base_name = Path(path).stem.replace('.excalidraw', '')
        if frag_type and frag_id:
            png_name = f"{base_name}-{frag_type}-{frag_id}.png"
        else:
            png_name = f"{base_name}.png"
        
        # Resolve path
        resolved = resolve_path(base_dir, png_name, staging_dir)
        
        return f"![{alt}]({resolved}){attrs}"
    
    excalidraw_md_pattern = r'!\[([^\]]*)\]\(([^)]+\.excalidraw\.md[^)]*)\)(\{[^}]+\})?'
    content = re.sub(excalidraw_md_pattern, replace_excalidraw_md_link, content)
    
    return content


def transform_layout_to_subfigure(content: str, staging_dir: Path) -> str:
    """Transform Quarto layout-ncol divs to proper LaTeX subfigure for better caption handling.
    
    Converts:
    ::: {#fig-id layout-ncol=2}
    ![caption1](img1.png){#fig-sub1}
    ![caption2](img2.png){#fig-sub2}
    Main caption
    :::
    
    To raw LaTeX subfigure environment with proper caption alignment.
    """
    # Pattern to find layout-ncol divs
    # Match ::: {#id layout-ncol=N} ... :::
    layout_pattern = re.compile(
        r'^::: \{#([a-zA-Z0-9_-]+)\s+layout-ncol=(\d+)\}\s*\n'
        r'(.*?)\n'
        r'^:::$',
        re.MULTILINE | re.DOTALL
    )
    
    def replace_layout(match):
        fig_id = match.group(1)
        ncol = int(match.group(2))
        body = match.group(3).strip()
        
        # Parse images from body
        # Pattern: ![caption](path){#id ...}
        img_pattern = re.compile(
            r'!\[([^\]]*)\]\(([^)]+)\)(?:\{#([a-zA-Z0-9_-]+)[^}]*\})?'
        )
        
        images = list(img_pattern.finditer(body))
        
        if len(images) < 2:
            # Not enough images for subfigure, leave as-is
            return match.group(0)
        
        # Calculate width per image
        width = round(0.95 / ncol, 2)
        
        # Find caption text (last non-empty, non-image line)
        lines = body.split('\n')
        main_caption = ""
        for line in reversed(lines):
            line = line.strip()
            if line and not line.startswith('!'):
                main_caption = line
                break
        
        # Track IDs that need reference transformation
        transformed_ids.add(fig_id)
        for img_match in images:
            sub_id = img_match.group(3)
            if sub_id:
                transformed_ids.add(sub_id)
        
        # Build LaTeX subfigure
        latex_parts = [
            '```{=latex}',
            '\\begin{figure}[H]',
            '\\centering'
        ]
        
        for i, img_match in enumerate(images):
            caption = img_match.group(1)
            path = img_match.group(2)
            sub_id = img_match.group(3) or f"{fig_id}-sub{i+1}"
            
            latex_parts.extend([
                f'\\begin{{subfigure}}[t]{{{width}\\textwidth}}',
                '\\centering',
                f'\\includegraphics[width=\\linewidth]{{{path}}}',
                f'\\caption{{{caption}}}',
                f'\\label{{{sub_id}}}',
                '\\end{subfigure}'
            ])
            
            # Add spacing between subfigures (except last)
            if i < len(images) - 1:
                latex_parts.append('\\hfill')
        
        if main_caption:
            latex_parts.append(f'\\caption{{{main_caption}}}')
        latex_parts.extend([
            f'\\label{{{fig_id}}}',
            '\\end{figure}',
            '```'
        ])
        
        return '\n'.join(latex_parts)
    
    # Track which figure IDs get transformed to LaTeX
    transformed_ids = set()
    
    # First pass: transform layout divs and collect IDs
    content = layout_pattern.sub(replace_layout, content)
    
    # Second pass: transform @fig-... references to \ref{} for transformed figures
    if transformed_ids:
        def replace_ref(match):
            ref_id = match.group(1)
            if ref_id in transformed_ids:
                return f'`\\ref{{{ref_id}}}`{{=latex}}'
            return match.group(0)  # Leave non-transformed refs as-is
        
        content = re.sub(r'@(fig-[a-zA-Z0-9_-]+)', replace_ref, content)
    
    return content


def convert_excalidraw_frames(content: str, project_dir: Path):
    """Find Excalidraw frame references and auto-export to PNG if needed.
    
    Detects patterns like: 
    - Wikilink: ![[file.excalidraw.md#^frame=01]]
    - Standard MD: ![alt](file.excalidraw.md#frame=01)
    And auto-exports the frame to: file-frame-01.png
    """
    
    excalidraw_refs = []
    
    # Pattern 1: Wikilinks ![[path.excalidraw.md#^frame=XX]]
    wikilink_pattern = r'!\[\[([^\]|#]+\.excalidraw\.md)#\^?(frame|group|area)=([^\]|]+)'
    for match in re.finditer(wikilink_pattern, content):
        excalidraw_refs.append({
            'path': match.group(1),
            'type': match.group(2),
            'id': match.group(3)
        })
    
    # Pattern 2: Standard markdown ![alt](path.excalidraw.md#frame=XX)
    md_pattern = r'!\[[^\]]*\]\(([^)#]+\.excalidraw\.md)#\^?(frame|group|area)=([^)]+)\)'
    for match in re.finditer(md_pattern, content):
        excalidraw_refs.append({
            'path': match.group(1),
            'type': match.group(2),
            'id': match.group(3)
        })
    
    if not excalidraw_refs:
        return
    
    # Get the export script
    export_script = Path(__file__).parent / "excalidraw-frame-export.py"
    if not export_script.exists():
        print(f"  ⚠ excalidraw-frame-export.py not found, skipping auto-export")
        return
    
    # Check if lzstring is available
    try:
        import lzstring
    except ImportError:
        print(f"  ⚠ lzstring not installed, skipping Excalidraw auto-export")
        print(f"    → Install with: pip install lzstring")
        return
    
    # Create frames directory inside .quarto (keeps project root clean)
    frames_dir = project_dir / ".quarto" / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)
    
    for ref in excalidraw_refs:
        excalidraw_file = None
        
        # Try to find the excalidraw file
        # Check if it's a relative path from vault root
        if ref['path'].startswith('Prods/') or '/' in ref['path']:
            # It's a vault-relative path, try to resolve from vault root
            vault_root = find_vault_root(project_dir)
            if vault_root:
                check_path = vault_root / ref['path']
                if check_path.exists():
                    excalidraw_file = check_path
        
        # Check local directory
        if not excalidraw_file:
            local_path = project_dir / Path(ref['path']).name
            if local_path.exists():
                excalidraw_file = local_path
        
        # Check project directory with full relative path
        if not excalidraw_file:
            check_path = project_dir / ref['path']
            if check_path.exists():
                excalidraw_file = check_path
        
        if not excalidraw_file:
            print(f"  ⚠ Excalidraw file not found: {ref['path']}")
            continue
        
        # Determine output PNG name - store in .quarto/frames/
        base_name = excalidraw_file.stem.replace('.excalidraw', '').replace('.md', '')
        png_name = f"{base_name}-{ref['type']}-{ref['id']}.png"
        png_path = frames_dir / png_name
        
        # Check if PNG already exists and is newer
        if png_path.exists():
            if png_path.stat().st_mtime >= excalidraw_file.stat().st_mtime:
                print(f"  ✓ Excalidraw frame up-to-date: {png_name}")
                continue
        
        # Auto-export the frame
        print(f"  → Exporting Excalidraw frame: {ref['type']}={ref['id']} → {png_name}")
        try:
            result = subprocess.run(
                [sys.executable, str(export_script), str(excalidraw_file), ref['id'], str(png_path)],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                print(f"  ✓ Created: {png_name}")
            else:
                print(f"  ⚠ Export failed: {result.stderr[:200] if result.stderr else result.stdout[:200]}")
        except Exception as e:
            print(f"  ⚠ Export error: {e}")


def convert_canvas_files(content: str, project_dir: Path):
    """Find .canvas references and auto-convert to PNG if needed.
    
    This uses the canvas-to-png.py script to render canvases that
    don't have corresponding .png files.
    """
    import re
    
    # Find all .canvas references
    canvas_refs = set()
    
    # Wikilinks: ![[file.canvas]]
    for match in re.finditer(r'!\[\[([^\]|#]+\.canvas)', content):
        canvas_refs.add(match.group(1))
    
    # Standard markdown: ![...](file.canvas)
    for match in re.finditer(r'!\[.*?\]\(([^)]+\.canvas)\)', content):
        canvas_refs.add(match.group(1))
    
    if not canvas_refs:
        return
    
    canvas_script = Path(__file__).parent / "canvas-to-png.py"
    if not canvas_script.exists():
        print(f"  ⚠ canvas-to-png.py not found, skipping auto-conversion")
        return
    
    for canvas_name in canvas_refs:
        # Try to find the canvas file
        canvas_path = None
        png_path = None
        
        # Check local directory
        local_canvas = project_dir / Path(canvas_name).name
        if local_canvas.exists():
            canvas_path = local_canvas
            png_path = local_canvas.with_suffix('.png')
        
        # Check vault attachments
        if not canvas_path:
            vault_root = find_vault_root(project_dir)
            if vault_root:
                for folder in ["attachments", "Attachments", "assets", ""]:
                    check_path = vault_root / folder / Path(canvas_name).name
                    if check_path.exists():
                        canvas_path = check_path
                        png_path = check_path.with_suffix('.png')
                        break
        
        if not canvas_path:
            print(f"  ⚠ Canvas not found: {canvas_name}")
            continue
        
        # Check if PNG already exists and is newer than canvas
        if png_path.exists():
            if png_path.stat().st_mtime >= canvas_path.stat().st_mtime:
                print(f"  ✓ PNG up-to-date: {png_path.name}")
                continue
        
        # Convert canvas to PNG
        print(f"  → Converting: {canvas_path.name} → {png_path.name}")
        try:
            result = subprocess.run(
                [sys.executable, str(canvas_script), str(canvas_path), str(png_path)],
                capture_output=True, text=True
            )
            if result.returncode == 0:
                print(f"  ✓ Created: {png_path.name}")
            else:
                print(f"  ⚠ Conversion failed: {result.stderr[:200]}")
        except Exception as e:
            print(f"  ⚠ Conversion error: {e}")

def needs_staging(content: str) -> bool:
    """Check if content has wikilinks that require staging transformation.
    
    Returns False if content only has:
    - Standard markdown images
    - Excalidraw frame references that can be pre-exported
    
    Returns True if content has:
    - ![[wikilinks]] that need vault resolution
    - .canvas references
    """
    # Check for wikilinks (excluding Excalidraw frames which are handled separately)
    wikilink_pattern = r'!\[\[(?!.*\.excalidraw\.md#)'
    has_wikilinks = bool(re.search(wikilink_pattern, content))
    
    # Check for .canvas in standard markdown
    has_canvas = '.canvas' in content
    
    # Check for .excalidraw.md in standard markdown (needs path transformation)
    has_excalidraw_md = bool(re.search(r'!\[[^\]]*\]\([^)]*\.excalidraw\.md', content))
    
    return has_wikilinks or has_canvas or has_excalidraw_md


def render_with_staging(source_file: Path, extra_args: list) -> int:
    """Render the document using a staged copy."""
    
    project_dir = source_file.parent.absolute()
    
    # Read source first to check what mode we need
    content = source_file.read_text(encoding='utf-8')
    
    # Auto-export any Excalidraw frames (always needed)
    convert_excalidraw_frames(content, project_dir)
    
    # Check if we need full staging mode or can use simple direct render
    if not needs_staging(content):
        print("  ℹ Simple mode: only Excalidraw frames, no wikilink staging needed")
        # Just render directly - Excalidraw PNGs are already exported
        cmd = ["quarto", "render", str(source_file.name)] + extra_args
        print(f"  → Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=str(project_dir))
        return result.returncode
    
    # Full staging mode for wikilinks/canvas
    print("  ℹ Full mode: wikilinks detected, using staging")
    
    # Use _staging instead of .quarto/staging so project config applies
    staging_dir = project_dir / "_staging"
    staging_dir.mkdir(parents=True, exist_ok=True)
    
    # Copy _quarto.yml to staging so it inherits project config 
    quarto_config = project_dir / "_quarto.yml"
    staging_config = staging_dir / "_quarto.yml"
    if quarto_config.exists():
        shutil.copy2(str(quarto_config), str(staging_config))
        print(f"  ✓ Copied project config to staging")
    
    staged_file = staging_dir / source_file.name
    
    try:
        # Auto-convert any .canvas files referenced in the document
        convert_canvas_files(content, project_dir)
        
        # Transform wikilinks (pass staging_dir for relative path calculation)
        transformed = transform_wikilinks(content, project_dir, staging_dir)
        
        # Transform layout-ncol divs to LaTeX subfigure for proper caption handling
        transformed = transform_layout_to_subfigure(transformed, staging_dir)
        
        # Write staged file
        staged_file.write_text(transformed, encoding='utf-8')
        print(f"  ✓ Created staged file: {staged_file.relative_to(project_dir)}")

        
        # Build Quarto command - render from project directory 
        rel_staged = staged_file.relative_to(project_dir)
        cmd = ["quarto", "render", str(rel_staged)] + extra_args
        
        print(f"  → Running: {' '.join(cmd)}")
        result = subprocess.run(cmd, cwd=str(project_dir))
        
        # Find and move output PDF - check both _build and staging
        out_dir = project_dir / "out"
        out_dir.mkdir(exist_ok=True)
        
        pdf_found = False
        
        # Check _staging/_build first (output-dir in copied _quarto.yml)
        staging_build_dir = staging_dir / "_build"
        if staging_build_dir.exists():
            for pdf_file in staging_build_dir.glob("*.pdf"):
                pdf_found = True
                final_name = source_file.with_suffix(".pdf").name if pdf_file.name == "__atomic_candidate.pdf" else pdf_file.name
                dest = out_dir / final_name
                shutil.move(str(pdf_file), str(dest))
                print(f"  ✅ PDF output: {dest.relative_to(project_dir)}")
        
        # Check _build in project root (if output-dir is set in _quarto.yml)
        if not pdf_found:
            build_dir = project_dir / "_build"
            if build_dir.exists():
                for pdf_file in build_dir.glob("*.pdf"):
                    pdf_found = True
                    final_name = source_file.with_suffix(".pdf").name if pdf_file.name == "__atomic_candidate.pdf" else pdf_file.name
                    dest = out_dir / final_name
                    shutil.move(str(pdf_file), str(dest))
                    print(f"  ✅ PDF output: {dest.relative_to(project_dir)}")
        
        # Check staging directory (Quarto may output there)
        if not pdf_found:
            for pdf_file in staging_dir.glob("*.pdf"):
                pdf_found = True
                # Use original source filename
                final_name = source_file.with_suffix(".pdf").name
                dest = out_dir / final_name
                shutil.move(str(pdf_file), str(dest))
                print(f"  ✅ PDF output: {dest.relative_to(project_dir)}")

        
        # Clean up staging
        if staged_file.exists():
            staged_file.unlink()
            print(f"  ✓ Cleaned up staged file")
        
        # Verify source is unchanged
        current_content = source_file.read_text(encoding='utf-8')
        if current_content == content:
            print(f"  ✓ Source file unchanged: {source_file.name}")
        else:
            print(f"  ⚠ WARNING: Source file was modified!")
        
        return result.returncode
        
    except Exception as e:
        print(f"  ✗ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


def main():
    if len(sys.argv) < 2:
        print("Usage: quarto-obsidian-render.py file.qmd [options...]")
        return 1
    
    source_file = Path(sys.argv[1]).absolute()
    if not source_file.exists():
        print(f"Error: File not found: {source_file}")
        return 1
    
    if source_file.suffix != '.qmd':
        print(f"Error: Expected .qmd file, got {source_file.suffix}")
        return 1
    
    extra_args = sys.argv[2:]
    
    print(f"\n{'='*60}")
    print(f"Obsidian-aware Quarto render (source-preserving)")
    print(f"Source: {source_file}")
    print(f"{'='*60}")
    
    return render_with_staging(source_file, extra_args)


if __name__ == "__main__":
    sys.exit(main())
