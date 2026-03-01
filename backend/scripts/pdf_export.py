#!/usr/bin/env python3
"""
Lectura — PDF Export System
===========================
Production-ready PDF generator for all 4 summary formats.
Uses only built-in ReportLab fonts (Helvetica family).

CLI:  python pdf_export.py <format> <json_payload> <output_path>
Demo: python pdf_export.py   (no args → generates 4 demo PDFs)
"""

import json
import os
import sys

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Flowable, KeepTogether,
)

# ─────────────────────────────────────────────────────────────
# Page & color constants
# ─────────────────────────────────────────────────────────────
W, H   = A4
MARGIN = 18 * mm
CW     = W - 2 * MARGIN

PRIMARY      = HexColor("#1a1a2e")
ACCENT       = HexColor("#4F46E5")
ACCENT_LIGHT = HexColor("#EEF2FF")
MINT         = HexColor("#10B981")
MINT_LIGHT   = HexColor("#D1FAE5")
GOLD         = HexColor("#F59E0B")
GRAY_800     = HexColor("#1F2937")
GRAY_600     = HexColor("#4B5563")
GRAY_400     = HexColor("#9CA3AF")
GRAY_100     = HexColor("#F3F4F6")
WHITE        = HexColor("#FFFFFF")
BORDER       = HexColor("#E5E7EB")


# ─────────────────────────────────────────────────────────────
# Custom Flowables
# ─────────────────────────────────────────────────────────────
class ColorHR(Flowable):
    """Horizontal rule with configurable color and thickness."""

    def __init__(self, color=BORDER, thickness=0.5, width=None):
        super().__init__()
        self.color     = color
        self.thickness = thickness
        self._width    = width or CW
        self.height    = thickness + 3

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.height / 2, self._width, self.height / 2)


class AccentBar(Flowable):
    """Full-width gray band with a 3pt accent bar on the left edge.
    Used for Paragraph format section headings."""

    def __init__(self, text, styles):
        super().__init__()
        self._text   = text
        self._styles = styles
        self.width   = CW
        self.height  = 28

    def draw(self):
        c = self.canv
        # Gray background band
        c.setFillColor(GRAY_100)
        c.rect(0, 0, self.width, self.height, stroke=0, fill=1)
        # 3pt indigo accent bar on left
        c.setFillColor(ACCENT)
        c.rect(0, 0, 3, self.height, stroke=0, fill=1)
        # Heading text
        c.setFillColor(PRIMARY)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(12, 8, self._text)


# ─────────────────────────────────────────────────────────────
# Styles
# ─────────────────────────────────────────────────────────────
def make_styles():
    """Build the full style dictionary for all formats."""
    s = {}

    s["doc_title"] = ParagraphStyle(
        "doc_title", fontName="Helvetica-Bold", fontSize=26,
        textColor=PRIMARY, leading=32, alignment=TA_LEFT,
    )
    s["meta"] = ParagraphStyle(
        "meta", fontName="Helvetica", fontSize=9,
        textColor=GRAY_400,
    )
    s["badge"] = ParagraphStyle(
        "badge", fontName="Helvetica-Bold", fontSize=8,
        textColor=ACCENT, alignment=TA_CENTER,
    )
    s["section_heading"] = ParagraphStyle(
        "section_heading", fontName="Helvetica-Bold", fontSize=13,
        textColor=PRIMARY, leading=17,
        spaceBefore=14, spaceAfter=6,
    )
    s["sub_heading"] = ParagraphStyle(
        "sub_heading", fontName="Helvetica-Bold", fontSize=10,
        textColor=ACCENT, leading=14,
        spaceBefore=10, spaceAfter=3,
    )
    s["body"] = ParagraphStyle(
        "body", fontName="Helvetica", fontSize=10,
        textColor=GRAY_800, leading=15,
        alignment=TA_JUSTIFY, spaceAfter=6,
    )
    s["body_indent"] = ParagraphStyle(
        "body_indent", fontName="Helvetica", fontSize=10,
        textColor=GRAY_800, leading=15,
        alignment=TA_JUSTIFY, spaceAfter=6,
        leftIndent=8 * mm,
    )
    s["bullet_text"] = ParagraphStyle(
        "bullet_text", fontName="Helvetica", fontSize=10,
        textColor=GRAY_800, leading=15,
        leftIndent=14, spaceAfter=4,
    )
    s["label"] = ParagraphStyle(
        "label", fontName="Helvetica-Bold", fontSize=9,
        textColor=GRAY_600, spaceAfter=2,
    )
    s["tag"] = ParagraphStyle(
        "tag", fontName="Helvetica-Bold", fontSize=8,
        textColor=MINT, alignment=TA_CENTER,
    )
    s["fact"] = ParagraphStyle(
        "fact", fontName="Helvetica", fontSize=9,
        textColor=GRAY_600, leading=13,
        leftIndent=12, spaceAfter=3,
    )
    s["table_header"] = ParagraphStyle(
        "table_header", fontName="Helvetica-Bold", fontSize=9,
        textColor=WHITE,
    )
    s["table_cell"] = ParagraphStyle(
        "table_cell", fontName="Helvetica", fontSize=9,
        textColor=GRAY_800, leading=13,
    )
    s["cornell_cue"] = ParagraphStyle(
        "cornell_cue", fontName="Helvetica", fontSize=9,
        textColor=GRAY_800, leading=14, spaceAfter=6,
    )
    s["cornell_note"] = ParagraphStyle(
        "cornell_note", fontName="Helvetica", fontSize=10,
        textColor=GRAY_800, leading=15, spaceAfter=8,
    )
    s["cornell_summary_label"] = ParagraphStyle(
        "cornell_summary_label", fontName="Helvetica-Bold", fontSize=8,
        textColor=HexColor("#A5B4FC"), spaceAfter=6,
    )
    s["cornell_summary"] = ParagraphStyle(
        "cornell_summary", fontName="Helvetica", fontSize=10,
        textColor=WHITE, leading=16, alignment=TA_JUSTIFY,
    )
    s["takeaway_label"] = ParagraphStyle(
        "takeaway_label", fontName="Helvetica-Bold", fontSize=8,
        textColor=GOLD, spaceAfter=3,
    )
    s["takeaway_text"] = ParagraphStyle(
        "takeaway_text", fontName="Helvetica-Oblique", fontSize=10,
        textColor=GRAY_800, leading=14,
    )
    s["kc_label"] = ParagraphStyle(
        "kc_label", fontName="Helvetica-Bold", fontSize=8,
        textColor=ACCENT, spaceAfter=2,
    )
    s["kc_title"] = ParagraphStyle(
        "kc_title", fontName="Helvetica-Bold", fontSize=11,
        textColor=PRIMARY, leading=15, spaceAfter=4,
    )

    return s


# ─────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────
def build_header(story, title, format_name, source, date_str, tags, styles):
    """Append the universal document header block to story."""
    # 1) Format badge
    badge_para = Paragraph("&nbsp;&nbsp;" + format_name.upper() + "&nbsp;&nbsp;", styles["badge"])
    badge_tbl = Table(
        [[badge_para]],
        colWidths=[None],
    )
    badge_tbl.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, -1), ACCENT_LIGHT),
        ("TOPPADDING",  (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("ALIGN",       (0, 0), (-1, -1), "LEFT"),
    ]))
    story.append(badge_tbl)

    # 2) Spacer
    story.append(Spacer(1, 8))

    # 3) Document title
    story.append(Paragraph(title, styles["doc_title"]))

    # 4) Spacer
    story.append(Spacer(1, 4))

    # 5) Meta line
    meta_text = "Source: {}  &middot;  Generated: {}".format(_esc(source), _esc(date_str))
    story.append(Paragraph(meta_text, styles["meta"]))

    # 6) Spacer
    story.append(Spacer(1, 6))

    # 7) Tags row
    if tags:
        tag_cells = []
        for t in tags:
            p = Paragraph("&nbsp;&nbsp;" + _esc(t) + "&nbsp;&nbsp;", styles["tag"])
            tag_cells.append(p)
        tag_tbl = Table(
            [tag_cells],
            colWidths=[None] * len(tag_cells),
        )
        tag_style = [
            ("BACKGROUND",    (0, 0), (-1, -1), MINT_LIGHT),
            ("TOPPADDING",    (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING",   (0, 0), (-1, -1), 7),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
            ("ALIGN",         (0, 0), (-1, -1), "LEFT"),
        ]
        tag_tbl.setStyle(TableStyle(tag_style))
        story.append(tag_tbl)

    # 8) Spacer
    story.append(Spacer(1, 10))

    # 9) Accent HR
    story.append(ColorHR(ACCENT, thickness=1.5))

    # 10) Spacer
    story.append(Spacer(1, 4))


def section_heading(text, styles):
    """Return a section heading paragraph with an indigo dot prefix."""
    return Paragraph(
        '<font color="#4F46E5">\u25cf</font>&nbsp;&nbsp;' + _esc(text),
        styles["section_heading"],
    )


def make_footer(canvas, doc):
    """Draw footer on every page: page number + thin rule."""
    canvas.saveState()
    # Horizontal rule
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 16 * mm, W - MARGIN, 16 * mm)
    # Footer text
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(GRAY_400)
    footer_text = "Lectura  \u00b7  Page {}".format(doc.page)
    canvas.drawCentredString(W / 2, 12 * mm, footer_text)
    canvas.restoreState()


def new_doc(path):
    """Create a SimpleDocTemplate with standard Lectura margins."""
    return SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=22 * mm,
    )


def _esc(text):
    """Escape basic XML entities for ReportLab Paragraph."""
    if not text:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


# ─────────────────────────────────────────────────────────────
# FORMAT 1 — CORNELL METHOD
# ─────────────────────────────────────────────────────────────
def build_cornell(story, cues, notes, summary, styles):
    """
    Two-column grid: cues (30%) | notes (70%)
    Full-width navy Summary box at bottom.
    """
    col_cue  = CW * 0.30
    col_note = CW * 0.70

    # Step 1 — Column headers
    hdr_style = ParagraphStyle(
        "_cornell_hdr", fontName="Helvetica-Bold", fontSize=8,
        textColor=WHITE,
    )
    hdr_tbl = Table(
        [[Paragraph("CUES", hdr_style), Paragraph("NOTES", hdr_style)]],
        colWidths=[col_cue, col_note],
    )
    hdr_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), PRIMARY),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ]))
    story.append(hdr_tbl)

    # Step 2 — Cue/Note rows
    pairs = list(zip(cues, notes))
    grid_rows = []
    for i, (cue, note) in enumerate(pairs):
        num = i + 1
        left = Paragraph(
            '<font color="#4F46E5"><b>{}.</b></font>&nbsp;&nbsp;{}'.format(num, _esc(cue)),
            styles["cornell_cue"],
        )
        right = Paragraph(
            '<font color="#4F46E5"><b>{}.</b></font>&nbsp;&nbsp;{}'.format(num, _esc(note)),
            styles["cornell_note"],
        )
        grid_rows.append([left, right])

    if grid_rows:
        grid_tbl = Table(grid_rows, colWidths=[col_cue, col_note])
        grid_cmds = [
            ("BACKGROUND",  (0, 0), (0, -1), ACCENT_LIGHT),
            ("BACKGROUND",  (1, 0), (1, -1), WHITE),
            ("LINEBEFORE",  (1, 0), (1, -1), 1.5, ACCENT),
            ("GRID",        (0, 0), (-1, -1), 0.3, BORDER),
            ("VALIGN",      (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING",  (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ]
        # Alternating row backgrounds for notes column
        for row_idx in range(len(grid_rows)):
            bg = WHITE if row_idx % 2 == 0 else HexColor("#FAFAFA")
            grid_cmds.append(("BACKGROUND", (1, row_idx), (1, row_idx), bg))
        grid_tbl.setStyle(TableStyle(grid_cmds))
        story.append(grid_tbl)

    # Step 3 — Navy summary box
    summary_tbl = Table(
        [
            [Paragraph("SUMMARY", styles["cornell_summary_label"])],
            [Paragraph(_esc(summary), styles["cornell_summary"])],
        ],
        colWidths=[CW],
    )
    summary_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), PRIMARY),
        ("LEFTPADDING",   (0, 0), (-1, -1), 16),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 16),
        ("TOPPADDING",    (0, 0), (0, 0), 10),
        ("TOPPADDING",    (0, 1), (0, 1), 0),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 14),
    ]))
    story.append(summary_tbl)


# ─────────────────────────────────────────────────────────────
# FORMAT 2 — BULLET POINTS
# ─────────────────────────────────────────────────────────────
def build_bullets(story, overview, structures, facts, styles):
    """Structured bullet points with overview, core structures, and facts."""

    # Step 1 — Overview
    story.append(section_heading("Overview", styles))
    story.append(Paragraph(_esc(overview), styles["body"]))
    story.append(ColorHR())

    # Step 2 — Core Structures
    story.append(section_heading("Core Structures", styles))

    for struct in structures:
        elements = []

        # a) Name as sub_heading
        name_para = Paragraph(_esc(struct.get("name", "")), styles["sub_heading"])
        elements.append(name_para)

        # b) Definition / Function / Examples table
        detail_rows = []
        for field, label in [("definition", "DEFINITION"), ("function", "FUNCTION"), ("examples", "EXAMPLES")]:
            val = struct.get(field, "")
            if val:
                detail_rows.append([
                    Paragraph(label, styles["label"]),
                    Paragraph(_esc(val), styles["body"]),
                ])

        if detail_rows:
            detail_tbl = Table(
                detail_rows,
                colWidths=[22 * mm, CW - 22 * mm - 4],
            )
            detail_tbl.setStyle(TableStyle([
                ("VALIGN",        (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING",    (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("LEFTPADDING",   (0, 0), (-1, -1), 0),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ]))
            elements.append(detail_tbl)

        # c) Gold KEY TAKEAWAY box
        takeaway = struct.get("takeaway", "")
        if takeaway:
            elements.append(Spacer(1, 4))
            tk_tbl = Table(
                [
                    [Paragraph("KEY TAKEAWAY", styles["takeaway_label"])],
                    [Paragraph(_esc(takeaway), styles["takeaway_text"])],
                ],
                colWidths=[CW],
            )
            tk_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), GRAY_100),
                ("LINEBEFORE",    (0, 0), (0, -1), 3, GOLD),
                ("LEFTPADDING",   (0, 0), (-1, -1), 12),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
                ("TOPPADDING",    (0, 0), (0, 0), 8),
                ("TOPPADDING",    (0, 1), (0, 1), 2),
                ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
            ]))
            elements.append(tk_tbl)

        elements.append(Spacer(1, 12))

        # d) Wrap in KeepTogether
        story.append(KeepTogether(elements))

    # Step 3 — Interesting Facts
    story.append(ColorHR())
    story.append(section_heading("Interesting Facts", styles))
    for f in facts:
        story.append(Paragraph("\u2022&nbsp;&nbsp;" + _esc(f), styles["fact"]))


# ─────────────────────────────────────────────────────────────
# FORMAT 3 — PARAGRAPH
# ─────────────────────────────────────────────────────────────
def build_paragraph(story, sections, styles):
    """
    Flowing prose with AccentBar headings.
    First section gets a drop cap on the opening letter.
    """
    for idx, sec in enumerate(sections):
        heading = sec.get("heading", "")
        body    = sec.get("body", "")

        story.append(Spacer(1, 6))
        story.append(AccentBar(heading, styles))
        story.append(Spacer(1, 8))

        if idx == 0 and body:
            first_letter = body[0]
            rest = body[1:]
            drop_cap = (
                '<font name="Helvetica-Bold" size="28" color="#4F46E5">'
                + _esc(first_letter)
                + '</font>'
                + '<font size="10">' + _esc(rest) + '</font>'
            )
            story.append(Paragraph(drop_cap, styles["body_indent"]))
        else:
            story.append(Paragraph(_esc(body), styles["body_indent"]))

        if idx < len(sections) - 1:
            story.append(Spacer(1, 6))
            story.append(ColorHR())


# ─────────────────────────────────────────────────────────────
# FORMAT 4 — SMART SUMMARY
# ─────────────────────────────────────────────────────────────
def key_concept_box(kc_label_text, title, body_text, styles):
    """Indigo-tinted card for a key concept."""
    tbl = Table(
        [
            [Paragraph(_esc(kc_label_text), styles["kc_label"])],
            [Paragraph(_esc(title), styles["kc_title"])],
            [Paragraph(_esc(body_text), styles["body"])],
        ],
        colWidths=[CW - 24],
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), ACCENT_LIGHT),
        ("LINEBEFORE",    (0, 0), (0, -1), 3, ACCENT),
        ("LEFTPADDING",   (0, 0), (-1, -1), 14),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("TOPPADDING",    (0, 0), (0, 0), 10),
        ("TOPPADDING",    (0, 1), (0, 1), 2),
        ("TOPPADDING",    (0, 2), (0, 2), 4),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 10),
    ]))
    return KeepTogether([tbl, Spacer(1, 8)])


def build_smart(story, video_summary, concepts, table_data, facts, styles):
    """Smart Summary: overview + key concepts + data table + facts."""

    # Step 1 — Video summary
    story.append(section_heading("Summary of Video Content", styles))
    story.append(Paragraph(_esc(video_summary), styles["body"]))
    story.append(ColorHR())

    # Step 2 — Key Insights
    story.append(section_heading("Key Insights and Core Concepts", styles))
    for concept in concepts:
        story.append(key_concept_box(
            "KEY CONCEPT",
            concept.get("title", ""),
            concept.get("body", ""),
            styles,
        ))

    # Step 3 — Data table
    if table_data:
        story.append(ColorHR())
        story.append(section_heading(table_data.get("title", "Data Table"), styles))

        headers = table_data.get("headers", [])
        rows    = table_data.get("rows", [])

        if headers and rows:
            n_cols = len(headers)
            col_w  = CW / n_cols

            # Header row
            hdr_row = [Paragraph(_esc(h), styles["table_header"]) for h in headers]
            # Data rows
            data_rows = []
            for row in rows:
                data_rows.append([Paragraph(_esc(cell), styles["table_cell"]) for cell in row])

            all_rows = [hdr_row] + data_rows
            tbl = Table(all_rows, colWidths=[col_w] * n_cols, repeatRows=1)

            tbl_cmds = [
                ("BACKGROUND",  (0, 0), (-1, 0), PRIMARY),
                ("GRID",        (0, 0), (-1, -1), 0.5, BORDER),
                ("VALIGN",      (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING",  (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
            # Alternating row backgrounds for data rows
            for i in range(1, len(all_rows)):
                bg = WHITE if (i - 1) % 2 == 0 else GRAY_100
                tbl_cmds.append(("BACKGROUND", (0, i), (-1, i), bg))

            tbl.setStyle(TableStyle(tbl_cmds))
            story.append(tbl)

    # Step 4 — Facts
    story.append(Spacer(1, 10))
    story.append(ColorHR())
    story.append(section_heading("Additional Interesting Facts", styles))
    for f in facts:
        story.append(Paragraph("\u2022&nbsp;&nbsp;" + _esc(f), styles["fact"]))


# ─────────────────────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────────────────────
def generate_pdf(fmt, payload, output_path):
    """Generate a PDF for the given format and JSON payload."""
    styles = make_styles()
    story  = []

    build_header(
        story,
        payload.get("title", "Untitled"),
        payload.get("format_name", fmt),
        payload.get("source", ""),
        payload.get("date_str", ""),
        payload.get("tags", []),
        styles,
    )

    if fmt == "cornell":
        build_cornell(
            story,
            payload.get("cues", []),
            payload.get("notes", []),
            payload.get("summary", ""),
            styles,
        )
    elif fmt == "bullets":
        build_bullets(
            story,
            payload.get("overview", ""),
            payload.get("structures", []),
            payload.get("facts", []),
            styles,
        )
    elif fmt == "paragraph":
        build_paragraph(
            story,
            payload.get("sections", []),
            styles,
        )
    elif fmt == "smart":
        build_smart(
            story,
            payload.get("video_summary", ""),
            payload.get("concepts", []),
            payload.get("table_data"),
            payload.get("facts", []),
            styles,
        )
    else:
        raise ValueError("Unknown format: {}".format(fmt))

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    doc = new_doc(output_path)
    doc.build(story, onFirstPage=make_footer, onLaterPages=make_footer)
    return output_path


# ─────────────────────────────────────────────────────────────
# DEMO BUILDERS — rich content for testing
# ─────────────────────────────────────────────────────────────
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "demo_pdfs")


def demo_cornell():
    """Generate a Cornell Method demo PDF with Cold War content."""
    payload = {
        "title": "The Cold War: A Global Ideological Struggle",
        "format_name": "Cornell Method",
        "source": "youtube.com/watch?v=cold-war-overview",
        "date_str": "2026-03-01",
        "tags": ["History", "Geopolitics", "Cold War", "20th Century"],
        "cues": [
            "What policy did President Truman establish in 1947 to counter Soviet expansion?",
            "How did the Marshall Plan reshape post-war Europe economically?",
            "What was the significance of the Berlin Wall erected in 1961?",
            "How close did the Cuban Missile Crisis bring the world to nuclear war in October 1962?",
            "What role did the Strategic Defense Initiative play in ending the Cold War?",
            "Which event in 1991 formally marked the dissolution of the Soviet Union?",
        ],
        "notes": [
            "The Truman Doctrine committed US economic and military aid to nations threatened by communist expansion, beginning with Greece and Turkey. It established the principle of containment that guided American foreign policy for the next four decades, fundamentally reshaping the global balance of power.",
            "The Marshall Plan injected over $13 billion into Western European economies between 1948 and 1952, rebuilding industrial infrastructure and stabilizing democratic governments. It created lasting economic ties between the US and Europe while deliberately excluding Soviet-aligned states from participation.",
            "The Berlin Wall physically divided East and West Berlin for 28 years, becoming the most potent symbol of the Iron Curtain. Its construction halted a mass exodus of skilled workers from East Germany, with over 140 documented deaths of people attempting to cross it during its existence.",
            "During 13 days in October 1962, the discovery of Soviet nuclear missiles in Cuba triggered the most dangerous confrontation of the Cold War. President Kennedy imposed a naval blockade while secret negotiations with Khrushchev ultimately led to Soviet missile withdrawal in exchange for a US pledge not to invade Cuba.",
            "President Reagan's Strategic Defense Initiative, announced in 1983, proposed a space-based missile defense system that would render nuclear weapons obsolete. Though technologically ambitious, SDI exerted enormous economic pressure on the Soviet Union, which could not match the required spending.",
            "On December 25, 1991, Mikhail Gorbachev resigned as Soviet president, and the Soviet flag was lowered over the Kremlin for the last time. The 15 constituent republics became independent nations, ending 74 years of communist rule and the Cold War's bipolar world order.",
        ],
        "summary": "The Cold War (1947-1991) was a defining geopolitical struggle between the United States and the Soviet Union that shaped the modern world without direct military confrontation between the superpowers. Through proxy wars, nuclear brinkmanship, economic competition, and ideological contests, both sides sought global influence. Key turning points — from the Truman Doctrine and Marshall Plan through the Cuban Missile Crisis and SDI — demonstrate how the conflict evolved from military containment to economic and technological competition, ultimately contributing to the Soviet Union's dissolution and the emergence of a unipolar world order.",
    }
    path = os.path.join(OUT, "demo_cornell.pdf")
    generate_pdf("cornell", payload, path)
    return path


def demo_bullets():
    """Generate a Bullet Points demo PDF with Great Depression content."""
    payload = {
        "title": "The Great Depression: Causes, Impact, and Recovery",
        "format_name": "Bullet Points",
        "source": "youtube.com/watch?v=great-depression-crash-course",
        "date_str": "2026-03-01",
        "tags": ["Economics", "History", "Great Depression", "New Deal"],
        "overview": "The Great Depression (1929-1939) was the most severe worldwide economic downturn in modern history. Triggered by the stock market crash of October 1929, it resulted in unprecedented unemployment, bank failures, and industrial collapse across the globe. The crisis fundamentally reshaped economic theory and government policy, leading to the New Deal programs in the United States and the development of Keynesian economics as a framework for understanding macroeconomic instability.",
        "structures": [
            {
                "name": "Stock Market Crash of 1929",
                "definition": "The dramatic collapse of stock prices on the New York Stock Exchange beginning on October 24, 1929 (Black Thursday), with the most devastating declines occurring on October 28-29 (Black Monday and Black Tuesday).",
                "function": "The crash destroyed billions of dollars in wealth overnight, triggering a chain reaction of bank failures, business closures, and consumer spending collapse that spread across the entire economy.",
                "examples": "The Dow Jones Industrial Average fell 25% in two days; $30 billion in stock value was erased within a week; by 1932, stocks had lost 89% of their peak value.",
                "takeaway": "Without the speculative excesses of the 1920s stock market, the crash might have been a normal correction rather than the trigger for a decade-long economic catastrophe that affected every industrialized nation.",
            },
            {
                "name": "Bank Failures and Credit Collapse",
                "definition": "The systematic failure of thousands of commercial banks between 1930 and 1933, caused by depositor panic, loan defaults, and insufficient federal deposit insurance.",
                "function": "Bank failures destroyed personal savings, eliminated credit availability for businesses, and froze the money supply, deepening and prolonging the economic contraction far beyond what market forces alone would have produced.",
                "examples": "Over 9,000 banks failed between 1930-1933; the Bank of United States collapse in December 1930 affected 400,000 depositors; 4,000 banks failed in the first two months of 1933 alone.",
                "takeaway": "The creation of the FDIC in 1933 directly addressed this failure, and no similar cascade of bank failures occurred in the United States until the 2008 financial crisis — a gap of 75 years.",
            },
            {
                "name": "The New Deal Programs",
                "definition": "A series of federal programs, public works projects, financial reforms, and regulations enacted by President Franklin D. Roosevelt between 1933 and 1939 to provide relief, recovery, and reform.",
                "function": "The New Deal provided immediate employment through public works (WPA, CCC), stabilized the financial system (Glass-Steagall Act, SEC), and established a social safety net (Social Security) that permanently expanded the role of the federal government.",
                "examples": "The WPA employed 8.5 million people and built 650,000 miles of roads; the CCC enrolled 3 million young men in conservation projects; Social Security provided retirement benefits to millions.",
                "takeaway": "The New Deal established the principle that the federal government has a responsibility to manage economic crises and protect citizens from market failures — a concept that remains foundational to American economic policy today.",
            },
            {
                "name": "Dust Bowl and Agricultural Collapse",
                "definition": "A decade of severe dust storms and drought affecting the Great Plains region from 1930 to 1940, caused by poor farming practices and natural climate conditions.",
                "function": "The Dust Bowl displaced over 2.5 million people from the Plains states, destroyed agricultural livelihoods, and compounded the economic misery of the Depression in rural America.",
                "examples": "Black Sunday (April 14, 1935) saw a massive dust storm that traveled 2,000 miles; Oklahoma lost 440,000 residents to migration; topsoil losses averaged 480 tons per acre in affected areas.",
                "takeaway": "The Dust Bowl led directly to modern soil conservation practices and the creation of the Soil Conservation Service, fundamentally changing how America manages its agricultural resources.",
            },
            {
                "name": "Keynesian Economics Revolution",
                "definition": "The economic theory developed by John Maynard Keynes arguing that government spending and monetary policy can stabilize economic cycles and mitigate recessions.",
                "function": "Keynesian theory provided the intellectual framework for government intervention during economic downturns, challenging the classical view that markets are self-correcting and justifying deficit spending as a tool for economic recovery.",
                "examples": "Keynes published 'The General Theory' in 1936; his ideas influenced the New Deal's public spending programs; post-war fiscal policies in the US and Europe adopted Keynesian principles.",
                "takeaway": "Without the intellectual revolution triggered by the Great Depression, governments might still rely solely on austerity during recessions — a counterfactual that makes the Depression one of the most consequential events in the history of economic thought.",
            },
        ],
        "facts": [
            "At the Depression's worst point in 1933, unemployment in the United States reached 24.9%, leaving one in four workers without a job.",
            "Global GDP declined by an estimated 15% between 1929 and 1932, making the Great Depression far more severe than the 2008 financial crisis, which saw a 1% global GDP decline.",
            "Herbert Hoover's name became so associated with economic failure that homeless encampments were called 'Hoovervilles' and newspapers used as blankets were called 'Hoover blankets.'",
            "The Smoot-Hawley Tariff Act of 1930, intended to protect American industry, instead triggered retaliatory tariffs that reduced international trade by 65% and worsened the global downturn.",
            "The Great Depression directly contributed to the rise of extremist political movements in Europe, including the Nazi Party in Germany, which exploited economic despair to gain electoral support.",
            "The economic recovery was not fully achieved until World War II mobilization, when defense spending finally absorbed the remaining unemployment and industrial overcapacity.",
        ],
    }
    path = os.path.join(OUT, "demo_bullets.pdf")
    generate_pdf("bullets", payload, path)
    return path


def demo_paragraph():
    """Generate a Paragraph format demo PDF with Sun Tzu content."""
    payload = {
        "title": "Sun Tzu's Art of War: Strategy Beyond the Battlefield",
        "format_name": "Paragraph",
        "source": "youtube.com/watch?v=art-of-war-lecture",
        "date_str": "2026-03-01",
        "tags": ["Military Strategy", "Philosophy", "Leadership", "Sun Tzu"],
        "sections": [
            {
                "heading": "The Philosophy of Strategic Supremacy",
                "body": "Sun Tzu's Art of War, composed in the 5th century BCE, represents far more than a military manual — it is a comprehensive framework for understanding conflict, competition, and human decision-making. The treatise's central thesis holds that the supreme art of war is to subdue the enemy without fighting, a principle that elevates strategic thinking above tactical execution. This philosophy distinguishes Sun Tzu from Western military theorists like Clausewitz, who emphasized decisive engagement. For Sun Tzu, the ideal victory requires no battle at all; it is achieved through superior intelligence, psychological manipulation, and the careful exploitation of the enemy's weaknesses before hostilities commence. This principle has found remarkable application beyond military contexts, influencing business strategy, diplomatic negotiations, and competitive sports in the modern era.",
            },
            {
                "heading": "Intelligence as the Foundation of Victory",
                "body": "Central to Sun Tzu's strategic framework is the absolute primacy of intelligence and information. He argued that a commander who knows both himself and his enemy need not fear the result of a hundred battles, while ignorance of either guarantees defeat. This emphasis on intelligence gathering was revolutionary for its time and remains foundational in modern military doctrine. Sun Tzu categorized spies into five types — local, inside, reverse, dead, and living — creating what is arguably the first systematic framework for espionage operations. His insistence that intelligence spending is never wasteful and that commanders must personally manage their intelligence networks demonstrates a sophisticated understanding of information warfare that predates modern intelligence agencies by millennia.",
            },
            {
                "heading": "Terrain, Timing, and Adaptability",
                "body": "Sun Tzu devoted significant attention to the relationship between terrain, timing, and tactical flexibility. He identified nine varieties of ground, each demanding specific responses from a competent commander. His famous analogy comparing the ideal military force to water — which flows around obstacles rather than confronting them directly — captures his emphasis on adaptability and formlessness. A rigid strategy, Sun Tzu warned, is a dead strategy; the successful commander reads changing conditions and adjusts accordingly. Modern applications of this principle appear in agile software development, adaptive business strategies, and counterinsurgency doctrine, where the ability to respond to changing conditions often matters more than the initial plan.",
            },
            {
                "heading": "Leadership and the Moral Dimension",
                "body": "Perhaps the most overlooked aspect of the Art of War is its emphasis on moral and ethical leadership. Sun Tzu argued that a commander's first duty is to the welfare of the troops and the state, not personal glory. He criticized generals who sacrificed soldiers needlessly as incompetent, regardless of whether they won the battle. This moral dimension extends to the treatment of defeated enemies and captured territories, where Sun Tzu advocated clemency and incorporation rather than destruction. His argument that a nation impoverished by military campaigns has failed strategically, even if it wins every engagement, remains a powerful critique of wars that achieve tactical success at unacceptable strategic cost.",
            },
        ],
    }
    path = os.path.join(OUT, "demo_paragraph.pdf")
    generate_pdf("paragraph", payload, path)
    return path


def demo_smart():
    """Generate a Smart Summary demo PDF with neuroscience content."""
    payload = {
        "title": "How Your Brain Works: Structure and Function",
        "format_name": "Smart Summary",
        "source": "youtube.com/watch?v=brain-crash-course",
        "date_str": "2026-03-01",
        "tags": ["Neuroscience", "Biology", "Brain", "Cognitive Science"],
        "video_summary": "The human brain, weighing approximately 1.4 kilograms, operates as the most complex organ in the known universe. This lecture explores its hierarchical organization, from the ancient brain stem that controls involuntary functions to the massive cerebral cortex responsible for consciousness, language, and abstract thought. The brain processes information through approximately 86 billion neurons forming over 100 trillion synaptic connections, consuming 20% of the body's energy despite representing only 2% of its mass. Understanding brain structure reveals how evolution has layered increasingly sophisticated processing capabilities atop more primitive survival systems, creating an organ capable of contemplating its own existence.",
        "concepts": [
            {
                "title": "The Cerebrum's Computational Dominance",
                "body": "The cerebrum constitutes roughly 85% of total brain mass and is divided into two hemispheres connected by the corpus callosum, a bundle of 200-250 million nerve fibers. Each hemisphere contains four lobes specialized for distinct functions: the frontal lobe handles executive function and planning, the temporal lobe processes auditory information and memory formation, the parietal lobe integrates sensory data, and the occipital lobe manages visual processing. This specialization allows parallel processing of multiple information streams simultaneously.",
            },
            {
                "title": "The Cerebellum as a Precision Engine",
                "body": "Despite containing over half of all the brain's neurons, the cerebellum represents only about 10% of brain mass. It functions as a precision calibration system for motor coordination, balance, and learned physical movements. Damage to the cerebellum does not cause paralysis but instead produces ataxia — imprecise, uncoordinated movements that reveal the cerebellum's role in fine-tuning rather than initiating motor commands.",
            },
            {
                "title": "Neuroplasticity and Adaptive Rewiring",
                "body": "The brain's capacity to reorganize neural pathways in response to learning, injury, or environmental changes — known as neuroplasticity — challenges the historical view that adult brains are fixed structures. Studies of London taxi drivers show measurably enlarged hippocampi from years of spatial navigation, while stroke recovery research demonstrates that undamaged brain regions can assume functions previously handled by destroyed tissue.",
            },
            {
                "title": "The Amygdala's Threat Detection System",
                "body": "The amygdala processes emotional responses faster than conscious awareness can register them, creating a rapid threat-detection system that bypasses the slower cortical processing pathway. This dual-pathway architecture explains why fear responses can be triggered before a person consciously recognizes what they are afraid of, and why traumatic memories can produce physiological stress responses years after the original event.",
            },
        ],
        "table_data": {
            "title": "Brain Structure and Functions",
            "headers": ["Brain Region", "Primary Function", "Key Characteristics"],
            "rows": [
                ["Cerebrum", "Conscious thought, language, reasoning", "85% of brain mass; divided into 4 specialized lobes"],
                ["Cerebellum", "Motor coordination, balance, learned movements", "Contains 50%+ of all neurons; 10% of brain mass"],
                ["Brain Stem", "Breathing, heart rate, sleep cycles", "Oldest evolutionary structure; connects to spinal cord"],
                ["Amygdala", "Emotional processing, fear response", "Faster than conscious awareness; dual-pathway threat detection"],
                ["Hippocampus", "Memory formation, spatial navigation", "Critical for converting short-term to long-term memory"],
                ["Corpus Callosum", "Inter-hemispheric communication", "200-250 million nerve fibers connecting left and right hemispheres"],
            ],
        },
        "facts": [
            "The human brain generates approximately 12-25 watts of electrical power — enough to power a low-wattage LED light bulb, yet sufficient to support consciousness and complex cognition.",
            "Information travels through myelinated neurons at speeds up to 268 miles per hour (431 km/h), comparable to the speed of a Formula 1 race car.",
            "The brain consumes 20% of the body's oxygen and energy supply despite representing only 2% of total body weight, making it the most metabolically expensive organ.",
            "A single human brain contains more synaptic connections (over 100 trillion) than there are stars in the Milky Way galaxy (estimated at 100-400 billion).",
            "The notion that humans only use 10% of their brains is a persistent myth — neuroimaging studies consistently show that virtually all brain regions are active, though not all simultaneously.",
        ],
    }
    path = os.path.join(OUT, "demo_smart.pdf")
    generate_pdf("smart", payload, path)
    return path


# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if len(sys.argv) >= 4:
        # CLI mode: python pdf_export.py <format> <json_payload> <output_path>
        fmt          = sys.argv[1]
        json_payload = sys.argv[2]
        output_path  = sys.argv[3]
        try:
            payload = json.loads(json_payload)
            result  = generate_pdf(fmt, payload, output_path)
            print("OK:" + result)
        except Exception as e:
            print("ERROR: " + str(e), file=sys.stderr)
            sys.exit(1)
    else:
        # Demo mode: generate all 4 format samples
        os.makedirs(OUT, exist_ok=True)
        print("Generating demo PDFs in", OUT)
        print("  Cornell:  ", demo_cornell())
        print("  Bullets:  ", demo_bullets())
        print("  Paragraph:", demo_paragraph())
        print("  Smart:    ", demo_smart())
        print("Done — 4 PDFs generated.")
