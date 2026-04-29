# LaTeX Documentation Build System
#
# Usage:
#   make pdf        # Convert all .md files in ../ to PDF
#   make clean      # Remove generated files
#   make template   # Create a new document from template.tex

PANDOC = /usr/local/bin/pandoc
PDFLATEX = pdflatex

# Find all markdown files in parent docs dir
MD_FILES = $(wildcard ../*.md)
PDF_FILES = $(patsubst ../%.md,%.pdf,$(MD_FILES))

.PHONY: all pdf clean template help

all: pdf

pdf: $(PDF_FILES)

# Rule: .md -> .pdf via pandoc + pdflatex
%.pdf: ../%.md
	@echo "Building $@ from $<..."
	$(PANDOC) $< -o $(basename $@).tex \
		--standalone --from markdown --to latex \
		--variable geometry:margin=1in \
		--variable fontsize=11pt \
		--variable documentclass=report \
		--variable classoption=oneside \
		--highlight-style=tango
	$(PDFLATEX) -interaction=nonstopmode $(basename $@).tex >/dev/null 2>&1 || true
	$(PDFLATEX) -interaction=nonstopmode $(basename $@).tex >/dev/null 2>&1 || true
	@echo "Done: $@"

# Quick pandoc-only PDF (no .tex output)
%.quick.pdf: ../%.md
	$(PANDOC) $< -o $@ \
		--from markdown --to pdf \
		--variable geometry:margin=1in \
		--variable fontsize=11pt \
		--variable documentclass=report \
		--highlight-style=tango

clean:
	rm -f *.aux *.log *.out *.toc *.tex

template:
	@cp template.tex new-document.tex
	@echo "Created new-document.tex. Edit it and run: pdflatex new-document.tex"

help:
	@echo "Targets:"
	@echo "  pdf      - Build all PDFs from ../ *.md files"
	@echo "  clean    - Remove auxiliary files"
	@echo "  template - Copy template.tex to new-document.tex"
