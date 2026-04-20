"""
Generate a PDF that matches the on-screen HTML layout (Chromium).

Browser "Print → Save as PDF" often applies @media print and may omit
backgrounds unless "Background graphics" is enabled. This script uses
Playwright with screen media + print_background so the PDF matches what
you see when viewing the file in a normal browser tab.

Usage (from inside a dated newsletter_runs folder):

    pip install -r ../../requirements-pdf.txt
    playwright install chromium
    python ../../tools/render_pdf.py

Optional:

    python ../../tools/render_pdf.py path/to/ai_newsletter_weekly_2026-04-19.html
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path


def _resolve_html_and_pdf(explicit_html: str | None) -> tuple[Path, Path]:
    if explicit_html:
        html_path = Path(explicit_html).resolve()
    else:
        cwd = Path.cwd()
        folder = cwd.name
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", folder):
            date_str = folder
        else:
            date_str = date.today().strftime("%Y-%m-%d")
        html_path = cwd / f"ai_newsletter_weekly_{date_str}.html"

    if not html_path.is_file():
        print(f"ERROR: HTML not found: {html_path}", file=sys.stderr)
        sys.exit(1)

    pdf_path = html_path.with_suffix(".pdf")
    return html_path, pdf_path


def main() -> None:
    ap = argparse.ArgumentParser(description="Render newsletter HTML to PDF (Chromium).")
    ap.add_argument(
        "html",
        nargs="?",
        default=None,
        help="Path to ai_newsletter_weekly_*.html (default: cwd issue file)",
    )
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "ERROR: Playwright is not installed.\n"
            "  pip install -r requirements-pdf.txt\n"
            "  playwright install chromium",
            file=sys.stderr,
        )
        sys.exit(1)

    html_path, pdf_path = _resolve_html_and_pdf(args.html)
    file_url = html_path.as_uri()

    # A4 margins aligned with @page in convert_to_pdf.py CSS
    margin = {"top": "14mm", "right": "16mm", "bottom": "16mm", "left": "16mm"}

    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page()
            # PDF generation defaults to print media in Chromium; force screen
            # so layout matches a normal browser tab (not @media print tweaks).
            page.emulate_media(media="screen")
            page.goto(file_url, wait_until="networkidle", timeout=120_000)
            page.evaluate("() => document.fonts.ready")
            page.pdf(
                path=str(pdf_path),
                format="A4",
                print_background=True,
                margin=margin,
                prefer_css_page_size=False,
            )
        finally:
            browser.close()

    print(f"Done: {pdf_path}")


if __name__ == "__main__":
    main()
