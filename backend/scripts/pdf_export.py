import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, KeepTogether
)
from reportlab.platypus import Flowable
from reportlab.lib.colors import HexColor

# ── Brand Colors ──────────────────────────────────────────────
PRIMARY      = HexColor("#1a1a2e")
ACCENT       = HexColor("#4F46E5")
ACCENT_LIGHT = HexColor("#EEF2FF")
MINT         = HexColor("#10B981")
MINT_LIGHT   = HexColor("#D1FAE5")
GOLD         = HexColor("#F59E0B")
GOLD_LIGHT   = HexColor("#FFFBEB")
GRAY_800     = HexColor("#1F2937")
GRAY_600     = HexColor("#4B5563")
GRAY_400     = HexColor("#9CA3AF")
GRAY_100     = HexColor("#F3F4F6")
WHITE        = HexColor("#FFFFFF")
BORDER       = HexColor("#E5E7EB")

W, H   = A4
MARGIN = 18 * mm
CW     = W - 2 * MARGIN   # content width

# ─────────────────────────────────────────────────────────────
# Custom Flowables
# ─────────────────────────────────────────────────────────────
class ColorHR(Flowable):
    def __init__(self, color=BORDER, thickness=0.5, width=None):
        super().__init__()
        self.color     = color
        self.thickness = thickness
        self._width    = width or CW
        self.height    = thickness + 3

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.thickness)
        self.canv.line(0, self.thickness, self._width, self.thickness)


class AccentBar(Flowable):
    """3 pt left accent bar + gray background band for Paragraph headings."""
    def __init__(self, text, styles):
        super().__init__()
        self._text   = text
        self._styles = styles
        self.width   = CW
        self.height  = 28

    def draw(self):
        c = self.canv
        # gray band
        c.setFillColor(GRAY_100)
        c.rect(0, 0, self.width, self.height, fill=1, stroke=0)
        # accent left bar
        c.setFillColor(ACCENT)
        c.rect(0, 0, 3, self.height, fill=1, stroke=0)
        # heading text
        c.setFillColor(PRIMARY)
        c.setFont("Helvetica-Bold", 12)
        c.drawString(12, 8, self._text)


# ─────────────────────────────────────────────────────────────
# Styles
# ─────────────────────────────────────────────────────────────
def make_styles():
    return {
        "doc_title": ParagraphStyle(
            "doc_title", fontName="Helvetica-Bold", fontSize=26,
            leading=32, textColor=PRIMARY, spaceAfter=4, alignment=TA_LEFT,
        ),
        "meta": ParagraphStyle(
            "meta", fontName="Helvetica", fontSize=9,
            textColor=GRAY_400, spaceAfter=2,
        ),
        "badge": ParagraphStyle(
            "badge", fontName="Helvetica-Bold", fontSize=8, textColor=ACCENT,
        ),
        "section_heading": ParagraphStyle(
            "section_heading", fontName="Helvetica-Bold", fontSize=13,
            leading=17, textColor=PRIMARY, spaceBefore=14, spaceAfter=6,
        ),
        "sub_heading": ParagraphStyle(
            "sub_heading", fontName="Helvetica-Bold", fontSize=10,
            leading=14, textColor=ACCENT, spaceBefore=10, spaceAfter=3,
        ),
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=10, leading=15,
            textColor=GRAY_800, alignment=TA_JUSTIFY, spaceAfter=6,
        ),
        "body_indent": ParagraphStyle(
            "body_indent", fontName="Helvetica", fontSize=10, leading=15,
            textColor=GRAY_800, alignment=TA_JUSTIFY,
            leftIndent=8*mm, spaceAfter=6,
        ),
        "bullet_text": ParagraphStyle(
            "bullet_text", fontName="Helvetica", fontSize=10, leading=15,
            textColor=GRAY_800, leftIndent=14, spaceAfter=4,
        ),
        "label": ParagraphStyle(
            "label", fontName="Helvetica-Bold", fontSize=9,
            textColor=GRAY_600, spaceAfter=2,
        ),
        "tag": ParagraphStyle(
            "tag", fontName="Helvetica-Bold", fontSize=8, textColor=MINT,
        ),
        "fact": ParagraphStyle(
            "fact", fontName="Helvetica", fontSize=9, leading=13,
            textColor=GRAY_600, leftIndent=12, spaceAfter=3,
        ),
        "table_header": ParagraphStyle(
            "table_header", fontName="Helvetica-Bold", fontSize=9, textColor=WHITE,
        ),
        "table_cell": ParagraphStyle(
            "table_cell", fontName="Helvetica", fontSize=9,
            leading=13, textColor=GRAY_800,
        ),
        "cornell_cue": ParagraphStyle(
            "cornell_cue", fontName="Helvetica", fontSize=9, leading=14,
            textColor=GRAY_800, spaceAfter=6,
        ),
        "cornell_cue_num": ParagraphStyle(
            "cornell_cue_num", fontName="Helvetica-Bold", fontSize=9,
            textColor=ACCENT,
        ),
        "cornell_note": ParagraphStyle(
            "cornell_note", fontName="Helvetica", fontSize=10, leading=15,
            textColor=GRAY_800, spaceAfter=8,
        ),
        "cornell_summary": ParagraphStyle(
            "cornell_summary", fontName="Helvetica", fontSize=10, leading=16,
            textColor=WHITE, alignment=TA_JUSTIFY,
        ),
        "cornell_summary_label": ParagraphStyle(
            "cornell_summary_label", fontName="Helvetica-Bold", fontSize=8,
            textColor=HexColor("#A5B4FC"), spaceAfter=6,
        ),
        "takeaway_label": ParagraphStyle(
            "takeaway_label", fontName="Helvetica-Bold", fontSize=8,
            textColor=GOLD, spaceAfter=3,
        ),
        "takeaway_text": ParagraphStyle(
            "takeaway_text", fontName="Helvetica-Oblique", fontSize=10,
            leading=14, textColor=GRAY_800,
        ),
        "kc_label": ParagraphStyle(
            "kc_label", fontName="Helvetica-Bold", fontSize=8, textColor=ACCENT,
            spaceAfter=2,
        ),
        "kc_title": ParagraphStyle(
            "kc_title", fontName="Helvetica-Bold", fontSize=11,
            leading=15, textColor=PRIMARY, spaceAfter=4,
        ),
    }


# ─────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────
def build_header(story, title, format_name, source, date_str, tags, styles):
    badge_table = Table(
        [[Paragraph(f"  {format_name.upper()}  ", styles["badge"])]],
        colWidths=[None]
    )
    badge_table.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), ACCENT_LIGHT),
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
        ("RIGHTPADDING",  (0,0),(-1,-1), 8),
    ]))

    tag_table = Table(
        [[Paragraph(f"  {t}  ", styles["tag"]) for t in tags]],
        colWidths=[None]*len(tags)
    )
    tag_table.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), MINT_LIGHT),
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 7),
        ("RIGHTPADDING",  (0,0),(-1,-1), 7),
    ]))

    story += [
        badge_table,
        Spacer(1, 8),
        Paragraph(title, styles["doc_title"]),
        Spacer(1, 4),
        Paragraph(f"Source: {source}  ·  Generated: {date_str}", styles["meta"]),
        Spacer(1, 6),
        tag_table,
        Spacer(1, 10),
        ColorHR(ACCENT, thickness=1.5),
        Spacer(1, 4),
    ]


def section_heading(text, styles):
    return Paragraph(
        f'<font color="#4F46E5">●</font>  {text}',
        styles["section_heading"]
    )


def make_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(GRAY_400)
    canvas.setFont("Helvetica", 8)
    canvas.drawCentredString(W/2, 12*mm, f"Lectura  ·  Page {doc.page}")
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 16*mm, W - MARGIN, 16*mm)
    canvas.restoreState()


def new_doc(path):
    return SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN,  bottomMargin=22*mm,
    )


# ─────────────────────────────────────────────────────────────
# FORMAT 1 — CORNELL METHOD
# ─────────────────────────────────────────────────────────────
def build_cornell(story, cues, notes, summary, styles):
    """
    Two-column grid: cues (30%) | notes (70%)
    Full-width navy Summary box at bottom.
    """
    LEFT_W  = CW * 0.30
    RIGHT_W = CW * 0.70

    # ── column headers ────────────────────────────────────────
    col_header_style = TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), PRIMARY),
        ("TOPPADDING",    (0,0),(-1,-1), 6),
        ("BOTTOMPADDING", (0,0),(-1,-1), 6),
        ("LEFTPADDING",   (0,0),(-1,-1), 10),
        ("RIGHTPADDING",  (0,0),(-1,-1), 10),
    ])
    hdr_label = ParagraphStyle(
        "hdr_label", fontName="Helvetica-Bold", fontSize=8, textColor=WHITE
    )
    col_headers = Table(
        [[Paragraph("CUES", hdr_label), Paragraph("NOTES", hdr_label)]],
        colWidths=[LEFT_W, RIGHT_W]
    )
    col_headers.setStyle(col_header_style)
    story.append(col_headers)

    # ── cue + note rows ───────────────────────────────────────
    grid_rows = []
    for i, (cue, note) in enumerate(zip(cues, notes)):
        num   = str(i + 1)
        cue_p = Paragraph(
            f'<font color="#4F46E5"><b>{num}.</b></font>  {cue}',
            styles["cornell_cue"]
        )
        note_p = Paragraph(
            f'<font color="#4F46E5"><b>{num}.</b></font>  {note}',
            styles["cornell_note"]
        )
        grid_rows.append([cue_p, note_p])

    grid = Table(grid_rows, colWidths=[LEFT_W, RIGHT_W])
    grid.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(0,-1),  ACCENT_LIGHT),
        ("BACKGROUND",    (1,0),(1,-1),  WHITE),
        ("LINEBEFORE",    (1,0),(1,-1),  1.5, ACCENT),
        ("GRID",          (0,0),(-1,-1), 0.3, BORDER),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",    (0,0),(-1,-1), 8),
        ("BOTTOMPADDING", (0,0),(-1,-1), 8),
        ("LEFTPADDING",   (0,0),(-1,-1), 10),
        ("RIGHTPADDING",  (0,0),(-1,-1), 10),
        ("ROWBACKGROUNDS",(1,0),(1,-1),  [WHITE, HexColor("#FAFAFA")]),
    ]))
    story.append(grid)
    story.append(Spacer(1, 10))

    # ── Summary navy box ──────────────────────────────────────
    summary_inner = [
        [Paragraph("SUMMARY", styles["cornell_summary_label"])],
        [Paragraph(summary,   styles["cornell_summary"])],
    ]
    summary_box = Table(summary_inner, colWidths=[CW])
    summary_box.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), PRIMARY),
        ("LEFTPADDING",   (0,0),(-1,-1), 16),
        ("RIGHTPADDING",  (0,0),(-1,-1), 16),
        ("TOPPADDING",    (0,0),(0,0),   10),
        ("TOPPADDING",    (0,1),(0,1),   0),
        ("BOTTOMPADDING", (0,0),(-1,-1), 14),
    ]))
    story.append(summary_box)


# ─────────────────────────────────────────────────────────────
# FORMAT 2 — BULLET POINTS
# ─────────────────────────────────────────────────────────────
def build_bullets(story, overview, structures, facts, styles):
    story.append(section_heading("Overview", styles))
    story.append(Paragraph(overview, styles["body"]))
    story.append(ColorHR())

    story.append(section_heading("Core Structures", styles))

    for s in structures:
        rows = [
            [Paragraph("DEFINITION", styles["label"]),
             Paragraph(s.get("definition",""), styles["body"])],
            [Paragraph("FUNCTION",   styles["label"]),
             Paragraph(s.get("function",""),   styles["body"])],
            [Paragraph("EXAMPLES",   styles["label"]),
             Paragraph(s.get("examples",""),   styles["body"])],
        ]
        detail = Table(rows, colWidths=[22*mm, CW - 22*mm - 4])
        detail.setStyle(TableStyle([
            ("VALIGN",        (0,0),(-1,-1), "TOP"),
            ("LEFTPADDING",   (0,0),(-1,-1), 0),
            ("RIGHTPADDING",  (0,0),(-1,-1), 0),
            ("TOPPADDING",    (0,0),(-1,-1), 2),
            ("BOTTOMPADDING", (0,0),(-1,-1), 2),
        ]))

        # Gold takeaway box
        takeaway_inner = [
            [Paragraph("KEY TAKEAWAY", styles["takeaway_label"])],
            [Paragraph(s.get("takeaway",""), styles["takeaway_text"])],
        ]
        takeaway_box = Table(takeaway_inner, colWidths=[CW])
        takeaway_box.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,-1), GRAY_100),
            ("LINEBEFORE",    (0,0),(0,-1),  3, GOLD),
            ("LEFTPADDING",   (0,0),(-1,-1), 12),
            ("RIGHTPADDING",  (0,0),(-1,-1), 12),
            ("TOPPADDING",    (0,0),(0,0),   8),
            ("TOPPADDING",    (0,1),(0,1),   2),
            ("BOTTOMPADDING", (0,0),(-1,-1), 10),
        ]))

        story.append(KeepTogether([
            Paragraph(s["name"], styles["sub_heading"]),
            detail,
            Spacer(1, 4),
            takeaway_box,
            Spacer(1, 12),
        ]))

    story.append(ColorHR())
    story.append(section_heading("Interesting Facts", styles))
    for f in facts:
        story.append(Paragraph(f"• {f}", styles["fact"]))


# ─────────────────────────────────────────────────────────────
# FORMAT 3 — PARAGRAPH
# ─────────────────────────────────────────────────────────────
def build_paragraph(story, sections, styles):
    """
    sections = [{"heading": str, "body": str}, ...]
    First section gets a drop cap on the opening letter.
    """
    for idx, sec in enumerate(sections):
        # Heading band with accent left bar
        story.append(Spacer(1, 6))
        story.append(AccentBar(sec["heading"], styles))
        story.append(Spacer(1, 8))

        body = sec["body"]

        if idx == 0 and body:
            # Drop cap on first letter
            first = body[0]
            rest  = body[1:]
            drop  = (
                f'<font name="Helvetica-Bold" size="28" '
                f'color="#4F46E5">{first}</font>'
                f'<font size="10">{rest}</font>'
            )
            story.append(Paragraph(drop, styles["body_indent"]))
        else:
            story.append(Paragraph(body, styles["body_indent"]))

        if idx < len(sections) - 1:
            story.append(Spacer(1, 6))
            story.append(ColorHR())


# ─────────────────────────────────────────────────────────────
# FORMAT 4 — SMART SUMMARY
# ─────────────────────────────────────────────────────────────
def key_concept_box(kc_label_text, title, body_text, styles):
    inner = [
        [Paragraph(kc_label_text, styles["kc_label"])],
        [Paragraph(title,         styles["kc_title"])],
        [Paragraph(body_text,     styles["body"])],
    ]
    t = Table(inner, colWidths=[CW - 24])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), ACCENT_LIGHT),
        ("LINEBEFORE",    (0,0),(0,-1),  3, ACCENT),
        ("LEFTPADDING",   (0,0),(-1,-1), 14),
        ("RIGHTPADDING",  (0,0),(-1,-1), 12),
        ("TOPPADDING",    (0,0),(0,0),   10),
        ("TOPPADDING",    (0,1),(0,1),   2),
        ("TOPPADDING",    (0,2),(0,2),   4),
        ("BOTTOMPADDING", (0,0),(-1,-1), 10),
    ]))
    return KeepTogether([t, Spacer(1, 8)])


def build_smart(story, video_summary, concepts, table_data, facts, styles):
    story.append(section_heading("Summary of Video Content", styles))
    story.append(Paragraph(video_summary, styles["body"]))
    story.append(ColorHR())

    story.append(section_heading("Key Insights and Core Concepts", styles))
    for c in concepts:
        story.append(key_concept_box(
            "KEY CONCEPT",
            c["title"],
            c["body"],
            styles
        ))

    if table_data:
        story.append(ColorHR())
        story.append(section_heading(table_data["title"], styles))
        headers  = table_data["headers"]
        col_w    = CW / len(headers)
        t_rows   = [[Paragraph(h, styles["table_header"]) for h in headers]]
        for row in table_data["rows"]:
            t_rows.append([Paragraph(cell, styles["table_cell"]) for cell in row])
        t = Table(t_rows, colWidths=[col_w]*len(headers), repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0,0),(-1,0),  PRIMARY),
            ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, GRAY_100]),
            ("GRID",          (0,0),(-1,-1), 0.5, BORDER),
            ("VALIGN",        (0,0),(-1,-1), "TOP"),
            ("TOPPADDING",    (0,0),(-1,-1), 7),
            ("BOTTOMPADDING", (0,0),(-1,-1), 7),
            ("LEFTPADDING",   (0,0),(-1,-1), 8),
            ("RIGHTPADDING",  (0,0),(-1,-1), 8),
        ]))
        story.append(t)

    story.append(Spacer(1, 10))
    story.append(ColorHR())
    story.append(section_heading("Additional Interesting Facts", styles))
    for f in facts:
        story.append(Paragraph(f"• {f}", styles["fact"]))


# ─────────────────────────────────────────────────────────────
# DEMO BUILDERS
# ─────────────────────────────────────────────────────────────
OUT = "/mnt/user-data/outputs"

def demo_cornell():
    path   = f"{OUT}/Cornell_Cold_War_Beautiful.pdf"
    doc    = new_doc(path)
    styles = make_styles()
    story  = []

    build_header(story,
        title      = "The Cold War: Ideological Struggle and Global Impact",
        format_name= "Cornell Method",
        source     = "YouTube",
        date_str   = "23.02.2026",
        tags       = ["Cold War", "Containment", "Soviet Union",
                      "US Foreign Policy", "Nuclear Arms Race"],
        styles     = styles,
    )

    build_cornell(story,
        cues = [
            "What global division emerged after WWII?",
            "How did early US policy counter Soviet expansion?",
            "What did the Berlin Blockade signify?",
            "How did the Cold War extend to Asia?",
            "How was the Cuban Missile Crisis resolved?",
            "What reforms led to the Soviet Union's collapse?",
        ],
        notes = [
            "Post-WWII, the world polarized into US-led capitalist and Soviet-dominated communist blocs, "
            "with Stalin's Eastern European buffer prompting Churchill's famous 'Iron Curtain' speech.",
            "President Truman initiated containment with military aid to Greece and Turkey (Truman Doctrine); "
            "the Marshall Plan further supported European economic recovery to diminish communism's appeal.",
            "Stalin's 1948 Berlin Blockade attempted to expel Western powers but was overcome by the Berlin Airlift, "
            "leading to Germany's formal division and the formation of NATO.",
            "China's communist revolution (1949) and the Korean War (1950–53) brought Cold War conflict "
            "to Asia, serving as a costly test of containment outside Europe.",
            "A US naval blockade and tense negotiations led to Soviet missile withdrawal in exchange for "
            "a US non-invasion pledge, establishing a direct Washington–Moscow hotline.",
            "Gorbachev's Perestroika (economic restructuring) and Glasnost (political transparency) "
            "inadvertently exposed Soviet weaknesses, catalyzing democratic revolutions and the USSR's "
            "peaceful dissolution in 1991.",
        ],
        summary = (
            "The Cold War was a post-WWII ideological struggle between the US and Soviet Union that shaped "
            "global affairs for over four decades. The US pursued containment through the Truman Doctrine and "
            "Marshall Plan, preventing communism's spread in a divided Europe symbolized by the Berlin Wall. "
            "Crises such as the Cuban Missile Crisis pushed the world to nuclear brinkmanship, prompting "
            "improved communication. Ultimately, Gorbachev's reforms and arms reduction agreements catalyzed "
            "the collapse of communist regimes and the Soviet Union's peaceful dissolution in 1991."
        ),
        styles = styles,
    )

    doc.build(story, onFirstPage=make_footer, onLaterPages=make_footer)
    return path


def demo_bullets():
    path   = f"{OUT}/Bullets_Great_Depression_Beautiful.pdf"
    doc    = new_doc(path)
    styles = make_styles()
    story  = []

    build_header(story,
        title      = "The Great Depression: Causes, Crash, & Reforms",
        format_name= "Bullet Points",
        source     = "YouTube",
        date_str   = "23.02.2026",
        tags       = ["Great Depression", "Stock Market Crash",
                      "Economic History", "Financial Regulation", "Roaring Twenties"],
        styles     = styles,
    )

    build_bullets(story,
        overview = (
            "The Great Depression, a global downturn, arose from 1920s speculation and debt, "
            "culminating in the 1929 market crash and prompting sweeping financial reforms that "
            "reshaped the modern economic landscape."
        ),
        structures = [
            {
                "name":       "Roaring Twenties",
                "definition": "Post-WWI U.S. economic growth era marked by prosperity and easy credit.",
                "function":   "Fostered unprecedented consumer spending and speculative investment.",
                "examples":   "Consumer appliances, the Model T, booming stock markets.",
                "takeaway":   "Unbridled optimism created an unsustainable market bubble that set the stage for catastrophic collapse.",
            },
            {
                "name":       "Stock Market Speculation",
                "definition": "Investing for quick gains, often with borrowed money (buying on margin).",
                "function":   "Artificially inflated stock prices far beyond their intrinsic value.",
                "examples":   "Citizens investing life savings; banks using depositor funds in the market.",
                "takeaway":   "Debt-fueled trading caused market collapse, wiping out immense wealth and triggering bank failures.",
            },
            {
                "name":       "Black Thursday and Black Tuesday",
                "definition": "October 24th/29th, 1929 — catastrophic market sell-offs that triggered the crash.",
                "function":   "Triggered total market collapse, eroding investor and public confidence.",
                "examples":   "Record share volumes traded; the Dow Jones fell 12% in a single day.",
                "takeaway":   "These two days destroyed public trust in financial markets, initiating severe economic contraction.",
            },
            {
                "name":       "The Great Depression",
                "definition": "The most profound industrialized economic crisis in modern history.",
                "function":   "Caused mass unemployment, widespread bank failures, and global poverty.",
                "examples":   "24.9% U.S. unemployment; the Dow Jones lost 90% of its peak value.",
                "takeaway":   "This crisis underscored the urgent need for governmental oversight of financial markets.",
            },
            {
                "name":       "Financial Safeguards (FDIC, SEC)",
                "definition": "Post-Depression government agencies and regulations established to prevent recurrence.",
                "function":   "Secure bank deposits, regulate securities markets, and restore public confidence.",
                "examples":   "Federal Deposit Insurance Corporation (FDIC); Securities and Exchange Commission (SEC).",
                "takeaway":   "Without these safeguards, future financial crises could inflict the same widespread devastation.",
            },
        ],
        facts = [
            "Global despair from the Depression fueled the rise of Hitler and ultimately contributed to World War II.",
            "Paradoxically, WWII's massive economic stimulus was what finally ended the Great Depression.",
            "America's wealth had doubled by 1929; stock market investments had risen 218% since 1922.",
            "Banks investing customer funds directly in the stock market exacerbated their own failures when markets crashed.",
        ],
        styles = styles,
    )

    doc.build(story, onFirstPage=make_footer, onLaterPages=make_footer)
    return path


def demo_paragraph():
    path   = f"{OUT}/Paragraph_Cold_War_Beautiful.pdf"
    doc    = new_doc(path)
    styles = make_styles()
    story  = []

    build_header(story,
        title      = "The Cold War: A Four-Decade Global Struggle",
        format_name= "Paragraph",
        source     = "YouTube",
        date_str   = "23.02.2026",
        tags       = ["Cold War", "Geopolitics", "Containment",
                      "Soviet Collapse", "Nuclear Arms Race"],
        styles     = styles,
    )

    build_paragraph(story,
        sections = [
            {
                "heading": "Overview",
                "body": (
                    "The post-World War II landscape saw the emergence of two global superpowers — the United States "
                    "and the Soviet Union — initiating an ideological struggle rather than direct military confrontation. "
                    "Europe became the primary theater for this division, symbolized by Churchill's 'Iron Curtain' "
                    "separating the Soviet-dominated Eastern Bloc from the capitalist West. The United States articulated "
                    "the Truman Doctrine, committing aid to nations resisting communist influence and establishing "
                    "containment as the foundational principle of its Cold War foreign policy. This strategy was further "
                    "bolstered by the Marshall Plan, designed to rebuild European economies and diminish communism's appeal."
                ),
            },
            {
                "heading": "Global Confrontations and Brinkmanship",
                "body": (
                    "The ideological contest soon expanded beyond Europe into a worldwide struggle. China's communist "
                    "revolution in 1949 and the Korean War demonstrated the global reach of the conflict, with the latter "
                    "serving as a costly test of the containment doctrine. Leadership changes in the Soviet Union brought "
                    "Nikita Khrushchev to power, whose volatile tenure saw the construction of the Berlin Wall — a stark "
                    "physical manifestation of the continent's ideological divide. The most perilous moment arrived with "
                    "the Cuban Missile Crisis, where Soviet nuclear weapons in Cuba brought the world to the precipice of "
                    "atomic warfare, ultimately resolved through tense negotiations and the critical judgment of a single "
                    "Soviet officer who refused to authorize a nuclear torpedo launch."
                ),
            },
            {
                "heading": "Shifting Strategies and Stagnation",
                "body": (
                    "Following the Cuban Missile Crisis, the Cold War entered a period characterized by both proxy "
                    "conflicts and attempts at de-escalation. The protracted Vietnam War, where American efforts to "
                    "contain communism proved unsuccessful, highlighted the limitations and human cost of military "
                    "intervention. The Soviet Union under Brezhnev experienced growing internal economic stagnation, "
                    "paving the way for détente — a phase of eased tensions marked by strategic arms limitation talks "
                    "(SALT) aimed at managing the nuclear arsenals of both superpowers."
                ),
            },
            {
                "heading": "Reagan, Reforms, and Resolution",
                "body": (
                    "The era of détente gave way to renewed confrontation under Ronald Reagan, who advocated 'Peace "
                    "Through Strength' and launched the Strategic Defense Initiative (SDI) to pressure the economically "
                    "strained Soviet Union into an unsustainable arms race. Mikhail Gorbachev responded with Perestroika "
                    "and Glasnost, which inadvertently catalyzed democratic revolutions across Eastern Europe, most "
                    "notably the fall of the Berlin Wall. These internal and external pressures led to the surprisingly "
                    "swift and largely peaceful dissolution of the Soviet Union in 1991, concluding a four-decade global "
                    "struggle that continues to inform geopolitical strategies today."
                ),
            },
        ],
        styles = styles,
    )

    doc.build(story, onFirstPage=make_footer, onLaterPages=make_footer)
    return path


def demo_smart():
    path   = f"{OUT}/Smart_Sun_Tzu_Beautiful.pdf"
    doc    = new_doc(path)
    styles = make_styles()
    story  = []

    build_header(story,
        title      = "Sun Tzu's Art of War: Strategy Beyond the Battlefield",
        format_name= "Smart Summary",
        source     = "YouTube",
        date_str   = "23.02.2026",
        tags       = ["Sun Tzu", "Art of War", "Strategy", "Leadership", "Business"],
        styles     = styles,
    )

    build_smart(story,
        video_summary = (
            "The lecture explores the enduring relevance of Sun Tzu's \"The Art of War,\" an ancient Chinese "
            "military treatise, by highlighting its core philosophies and their application across various "
            "historical conflicts and contemporary domains. Sun Tzu's strategic wisdom — centered on avoiding "
            "direct confrontation, understanding adversaries, employing deception, and dividing enemy forces — "
            "provides a universal framework for achieving victory with minimal combat, enabling success in "
            "warfare, politics, sports, and business alike."
        ),
        concepts = [
            {
                "title": "Supreme Excellence in Non-Combat Victory",
                "body":  (
                    "The highest form of military achievement involves subduing an opponent without direct, "
                    "destructive fighting. In business, this translates to developing a superior product that "
                    "renders competitors obsolete without aggressive price wars — securing dominance through "
                    "innovation rather than attrition."
                ),
            },
            {
                "title": "The Imperative of Self and Enemy Knowledge",
                "body":  (
                    "Comprehensive understanding of both one's own capabilities and an adversary's weaknesses "
                    "is paramount for success. For a political campaign, this means extensive polling and "
                    "opposition research to understand voter sentiment and anticipate counter-arguments."
                ),
            },
            {
                "title": "Warfare as Deception",
                "body":  (
                    "All military engagements involve deception — misleading the opponent about true intentions "
                    "or strength. In cybersecurity, this is applied through 'honeypots': decoy systems designed "
                    "to attract and study cyberattackers while protecting critical infrastructure."
                ),
            },
            {
                "title": "Exploiting Weakness and Avoiding Strength",
                "body":  (
                    "Actively engage an adversary where they are weakest while circumventing their strengths. "
                    "A basketball team might consistently target an opposing player with defensive vulnerabilities "
                    "rather than challenge their strongest defender."
                ),
            },
            {
                "title": "The Power of Dividing Forces",
                "body":  (
                    "Compelling an adversary to disperse resources across multiple fronts dilutes their overall "
                    "strength. In project management, assigning multiple urgent tasks to a competing team forces "
                    "them thin while your team focuses on key objectives."
                ),
            },
        ],
        table_data = {
            "title":   "Key Principles and Historical Applications",
            "headers": ["Principle", "Description", "Historical Example"],
            "rows": [
                [
                    "Avoiding Strength, Striking Weakness",
                    "Identifying and exploiting vulnerabilities rather than confronting superior capabilities.",
                    "Athenians attacked weary Persian forces as they disembarked, before a camp was established.",
                ],
                [
                    "Breaking Resistance Without Fighting",
                    "Victory through strategic positioning and psychological pressure without direct combat.",
                    "Viet Cong guerrilla tactics outmaneuvered the numerically superior American military.",
                ],
                [
                    "Deception in Warfare",
                    "Misinformation to mislead the enemy about intentions, strength, or location.",
                    "D-Day deception created fictional units and false radio chatter about Scandinavia.",
                ],
                [
                    "Knowing Self and Enemy",
                    "Comprehensive intelligence on one's own capabilities and the adversary's disposition.",
                    "Viet Cong tunnel networks and terrain knowledge allowed sustained evasion of US forces.",
                ],
                [
                    "Dividing Enemy Forces",
                    "Compelling the adversary to disperse military assets across multiple fronts.",
                    "Soviet forces pinned one million German divisions on the Eastern Front during D-Day.",
                ],
            ],
        },
        facts = [
            "Sun Tzu's work, originally 'Master Sun's Military Methods,' is now universally known as 'The Art of War.'",
            "The treatise is structured into 13 chapters, each detailing a specific aspect of military strategy.",
            "'The Art of War' influenced commanders from the Japanese Samurai to the Napoleonic Wars.",
            "Sun Tzu's philosophies have found resonance in politics, competitive sports, and modern business.",
            "Sun Tzu called his work 'of vital importance to the state' — a path to either safety or ruin.",
            "D-Day deception included fictional military units in Scotland and inflatable tank models.",
        ],
        styles = styles,
    )

    doc.build(story, onFirstPage=make_footer, onLaterPages=make_footer)
    return path


# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import sys, json

    if len(sys.argv) < 4:
        print("Usage: pdf_export.py <format> <json_payload> <output_path>")
        sys.exit(1)

    fmt         = sys.argv[1]
    payload     = json.loads(sys.argv[2])
    output_path = sys.argv[3]

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    doc    = new_doc(output_path)
    styles = make_styles()
    story  = []

    build_header(story,
        title       = payload["title"],
        format_name = payload["format_name"],
        source      = payload["source"],
        date_str    = payload["date_str"],
        tags        = payload["tags"],
        styles      = styles,
    )

    if fmt == "cornell":
        build_cornell(story,
            cues    = payload["cues"],
            notes   = payload["notes"],
            summary = payload["summary"],
            styles  = styles,
        )
    elif fmt == "bullets":
        build_bullets(story,
            overview   = payload["overview"],
            structures = payload["structures"],
            facts      = payload["facts"],
            styles     = styles,
        )
    elif fmt == "paragraph":
        build_paragraph(story,
            sections = payload["sections"],
            styles   = styles,
        )
    elif fmt == "smart":
        build_smart(story,
            video_summary = payload["video_summary"],
            concepts      = payload["concepts"],
            table_data    = payload.get("table_data"),
            facts         = payload["facts"],
            styles        = styles,
        )
    else:
        print(f"Unknown format: {fmt}")
        sys.exit(1)

    doc.build(story, onFirstPage=make_footer, onLaterPages=make_footer)
    print(f"OK:{output_path}")
