#!/bin/bash
# =============================================================================
# Quick build script: Markdown -> LaTeX -> PDF
# =============================================================================
# Usage:
#   ./build.sh <input.md> [output.pdf]
#
# Example:
#   ./build.sh ../THEME_TO_SCREENSHOT.md
#   ./build.sh ../THEME_TO_SCREENSHOT.md my-document.pdf
# =============================================================================

set -euo pipefail

PANDOC="/usr/local/bin/pandoc"
PDFLATEX="pdflatex"

if [ $# -lt 1 ]; then
    echo "Usage: $0 <input.md> [output.pdf]"
    echo "Example: $0 ../README.md"
    exit 1
fi

INPUT="$1"
BASENAME=$(basename "$INPUT" .md)
OUTPUT="${2:-${BASENAME}.pdf}"
TEXFILE="${BASENAME}.tex"

if [ ! -f "$INPUT" ]; then
    echo "Error: Input file not found: $INPUT"
    exit 1
fi

echo "Converting $INPUT -> $TEXFILE ..."
$PANDOC "$INPUT" -o "$TEXFILE" \
    --standalone \
    --from markdown \
    --to latex \
    --variable geometry:margin=1in \
    --variable fontsize=11pt \
    --variable documentclass=report \
    --variable classoption=oneside \
    --highlight-style=tango

echo "Compiling $TEXFILE -> $OUTPUT ..."
$PDFLATEX -interaction=nonstopmode "$TEXFILE" >/dev/null 2>&1 || true
$PDFLATEX -interaction=nonstopmode "$TEXFILE" >/dev/null 2>&1 || true

# Rename output if requested
if [ "$OUTPUT" != "${BASENAME}.pdf" ]; then
    mv "${BASENAME}.pdf" "$OUTPUT"
fi

if [ -f "$OUTPUT" ]; then
    echo "Success: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
else
    echo "Warning: PDF may not have been created. Check ${BASENAME}.log for errors."
fi
