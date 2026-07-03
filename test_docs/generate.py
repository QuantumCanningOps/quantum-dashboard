"""
Generate smoke-test documents for the Quantum Canning receiving form.

Scenario: FlavorSource Inc ships two ACME flavor lots to Quantum Canning.
Both items require a COA.

Outputs:
  BOL_FLVR_ACME_2026TEST001.pdf   — Bill of Lading (ideal — all fields populated)
  COA_FLVR_RASP_2026001.pdf       — COA for ACME Raspberry Flavoring
  COA_FLVR_LMLM_2026001.pdf       — COA for ACME Lemon Lime Flavoring
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph,
    Spacer, HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
import os

OUT = os.path.dirname(os.path.abspath(__file__))

# ── Palette ─────────────────────────────────────────────────────────────────
NAVY   = colors.HexColor("#1a2e4a")
TEAL   = colors.HexColor("#0d7a6e")
LIGHT  = colors.HexColor("#f0f4f8")
BORDER = colors.HexColor("#cbd5e1")
WHITE  = colors.white
BLACK  = colors.black

styles = getSampleStyleSheet()

def h1(text):
    return Paragraph(text, ParagraphStyle("h1", parent=styles["Normal"],
        fontSize=18, fontName="Helvetica-Bold", textColor=WHITE,
        spaceAfter=0, leading=22))

def h2(text):
    return Paragraph(text, ParagraphStyle("h2", parent=styles["Normal"],
        fontSize=11, fontName="Helvetica-Bold", textColor=NAVY,
        spaceAfter=2, spaceBefore=6))

def h3(text):
    return Paragraph(text, ParagraphStyle("h3", parent=styles["Normal"],
        fontSize=9, fontName="Helvetica-Bold", textColor=TEAL,
        spaceAfter=1, spaceBefore=4, leading=11))

def body(text):
    return Paragraph(text, ParagraphStyle("body", parent=styles["Normal"],
        fontSize=9, fontName="Helvetica", textColor=BLACK,
        spaceAfter=1, leading=12))

def small(text, color=None):
    return Paragraph(text, ParagraphStyle("small", parent=styles["Normal"],
        fontSize=8, fontName="Helvetica", textColor=color or colors.grey,
        leading=10))

def centered(text, size=9, bold=False, color=None):
    fn = "Helvetica-Bold" if bold else "Helvetica"
    return Paragraph(text, ParagraphStyle("cen", parent=styles["Normal"],
        fontSize=size, fontName=fn, textColor=color or BLACK,
        alignment=TA_CENTER, leading=size + 3))

def right_p(text, size=9):
    return Paragraph(text, ParagraphStyle("rp", parent=styles["Normal"],
        fontSize=size, fontName="Helvetica", textColor=BLACK,
        alignment=TA_RIGHT, leading=size + 3))

def tbl(data, col_widths, style_cmds, row_heights=None):
    t = Table(data, colWidths=col_widths, rowHeights=row_heights)
    base = [
        ("FONTNAME",    (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE",    (0, 0), (-1, -1), 8),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("GRID",        (0, 0), (-1, -1), 0.5, BORDER),
        ("BACKGROUND",  (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",   (0, 0), (-1, 0), WHITE),
        ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
    ]
    t.setStyle(TableStyle(base + style_cmds))
    return t


# ═══════════════════════════════════════════════════════════════════════════════
# BOL
# ═══════════════════════════════════════════════════════════════════════════════

def make_bol():
    path = os.path.join(OUT, "BOL_FLVR_ACME_2026TEST001.pdf")
    doc = SimpleDocTemplate(path, pagesize=letter,
                            topMargin=0.5*inch, bottomMargin=0.5*inch,
                            leftMargin=0.65*inch, rightMargin=0.65*inch)
    W = 7.2 * inch
    story = []

    # ── Header banner ────────────────────────────────────────────────────────
    header = Table(
        [[h1("BILL OF LADING"), centered("BOL # BOL-2026-TEST-001", 11, bold=True, color=WHITE)]],
        colWidths=[4*inch, 3.2*inch],
    )
    header.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, -1), NAVY),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",       (1, 0), (1, 0), "RIGHT"),
        ("TOPPADDING",  (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    story.append(header)
    story.append(Spacer(1, 8))

    # ── Meta row ─────────────────────────────────────────────────────────────
    meta = Table([
        [body("<b>Date:</b> June 3, 2026"),
         body("<b>Pro #:</b> CFS-2026-88341"),
         body("<b>PO #:</b> PO-ACME-2026-003"),
         body("<b>Page:</b> 1 of 1")],
    ], colWidths=[1.8*inch, 1.8*inch, 2.2*inch, 1.4*inch])
    meta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEAFTER", (0, 0), (2, -1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(meta)
    story.append(Spacer(1, 10))

    # ── Parties ──────────────────────────────────────────────────────────────
    parties = Table([
        [
            # Shipper
            Table([
                [h3("SHIPPER / CONSIGNOR")],
                [body("<b>FlavorSource Inc</b>")],
                [body("1420 Industrial Pkwy")],
                [body("Portland, OR  97201")],
                [body("Tel: (503) 555-0300")],
                [body("Contact: Maria Chen — mchen@flavorsource.com")],
            ], colWidths=[3.45*inch]),
            # Consignee
            Table([
                [h3("CONSIGNEE / SHIP TO")],
                [body("<b>Quantum Canning</b>")],
                [body("800 Warehouse Row")],
                [body("Denver, CO  80216")],
                [body("Tel: (720) 555-0100")],
                [body("Attn: Receiving Dock — dock1@quantumcanning.com")],
            ], colWidths=[3.45*inch]),
        ]
    ], colWidths=[3.55*inch, 3.55*inch])
    parties.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (0, -1), 0.5, BORDER),
        ("BOX", (1, 0), (1, -1), 0.5, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LINEAFTER", (0, 0), (0, -1), 0.5, BORDER),
    ]))
    story.append(parties)
    story.append(Spacer(1, 10))

    # ── Carrier ──────────────────────────────────────────────────────────────
    carrier = Table([
        [h3("CARRIER"), h3("TRAILER #"), h3("SEAL #"), h3("SCAC")],
        [body("Central Freight Systems"), body("TRL-449822"), body("SL-88990"), body("CFSY")],
    ], colWidths=[2.5*inch, 1.5*inch, 1.5*inch, 1.7*inch])
    carrier.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("BACKGROUND", (0, 0), (-1, 0), LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(carrier)
    story.append(Spacer(1, 10))

    # ── Commodity table ───────────────────────────────────────────────────────
    story.append(h2("Commodity Details"))
    items_data = [
        ["Line", "Description / Product Name", "Lot / Batch #", "Qty", "UOM",
         "Mfr Date", "Exp Date", "Wt (kg)"],
        ["1",
         "ACME Raspberry Flavoring\n(Natural & Artificial, Code: FLVR-RASP)",
         "FLVR-RASP-2026001",
         "1", "Drum\n(30 kg net)", "2026-05-15", "2027-05-15", "30.0"],
        ["2",
         "ACME Lemon Lime Flavoring\n(Natural & Artificial, Code: FLVR-LMLM)",
         "FLVR-LMLM-2026001",
         "1", "Drum\n(25 kg net)", "2026-05-15", "2027-05-15", "25.0"],
        ["3",
         "ACME Orange Flavoring\n(Natural & Artificial, Code: FLVR-ORAN)\n*** NEW ITEM — not yet in system ***",
         "FLVR-ORAN-2026001",
         "1", "Drum\n(20 kg net)", "2026-05-20", "2027-05-20", "20.0"],
        ["", "", "TOTALS", "3", "drums", "", "", "75.0"],
    ]
    items_tbl = tbl(
        items_data,
        col_widths=[0.35*inch, 2.1*inch, 1.25*inch,
                    0.35*inch, 0.7*inch, 0.7*inch, 0.7*inch, 0.6*inch],
        style_cmds=[
            ("FONTSIZE",    (0, 1), (-1, -1), 8),
            ("ALIGN",       (3, 0), (-1, -1), "CENTER"),
            ("ALIGN",       (0, 0), (0, -1), "CENTER"),
            ("FONTNAME",    (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND",  (0, -1), (-1, -1), LIGHT),
            ("TOPPADDING",  (0, 1), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
        ],
    )
    story.append(items_tbl)
    story.append(Spacer(1, 10))

    # ── Special instructions ─────────────────────────────────────────────────
    story.append(h2("Special Instructions / Notes"))
    notes_tbl = Table([
        [body("• Keep refrigerated — do not exceed 45°F during transit.\n"
              "• Product contains natural flavoring materials. Handle with care.\n"
              "• COA documents enclosed with shipment. Retain for QA records.\n"
              "• Notify consignee at least 2 hours prior to delivery: (720) 555-0100.")],
    ], colWidths=[W])
    notes_tbl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(notes_tbl)
    story.append(Spacer(1, 14))

    # ── Signatures ───────────────────────────────────────────────────────────
    sig = Table([
        [
            Table([
                [h3("SHIPPER SIGNATURE")],
                [Spacer(1, 28)],
                [HRFlowable(width=2.8*inch, color=BORDER)],
                [small("Maria Chen — FlavorSource Inc")],
                [small("Date: ________________")],
            ], colWidths=[3.1*inch]),
            Table([
                [h3("CARRIER SIGNATURE")],
                [Spacer(1, 28)],
                [HRFlowable(width=2.8*inch, color=BORDER)],
                [small("Driver signature / date")],
                [small("Date: ________________")],
            ], colWidths=[3.1*inch]),
        ]
    ], colWidths=[3.6*inch, 3.6*inch])
    sig.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(sig)
    story.append(Spacer(1, 6))

    # ── Footer ───────────────────────────────────────────────────────────────
    story.append(HRFlowable(width=W, color=BORDER))
    story.append(Spacer(1, 4))
    story.append(small(
        "This Bill of Lading is a contract of carriage governed by applicable federal and state law. "
        "Received the articles described in apparent good order, except as noted. "
        "Carrier acknowledges receipt of this shipment subject to the terms and conditions of this BOL.",
        color=colors.grey))

    doc.build(story)
    print(f"  ✓  {os.path.basename(path)}")


# ═══════════════════════════════════════════════════════════════════════════════
# COA helper
# ═══════════════════════════════════════════════════════════════════════════════

def make_coa(
    filename, product_name, item_code, lot_number,
    mfr_date, exp_date, quantity, client,
    tests,           # list of (test_name, method, spec, result, status)
    description,
):
    path = os.path.join(OUT, filename)
    doc = SimpleDocTemplate(path, pagesize=letter,
                            topMargin=0.5*inch, bottomMargin=0.5*inch,
                            leftMargin=0.65*inch, rightMargin=0.65*inch)
    W = 7.2 * inch
    story = []

    # ── Header ───────────────────────────────────────────────────────────────
    header = Table(
        [[
            h1("CERTIFICATE OF ANALYSIS"),
            Table([
                [centered("FlavorSource Inc", 9, bold=True, color=WHITE)],
                [centered("1420 Industrial Pkwy, Portland, OR 97201", 8, color=WHITE)],
                [centered("QA Dept: qa@flavorsource.com | (503) 555-0310", 8, color=WHITE)],
            ], colWidths=[3.0*inch]),
        ]],
        colWidths=[4.1*inch, 3.1*inch],
    )
    header.setStyle(TableStyle([
        ("BACKGROUND",  (0, 0), (-1, -1), TEAL),
        ("VALIGN",      (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",  (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("ALIGN",       (1, 0), (1, 0), "RIGHT"),
    ]))
    story.append(header)
    story.append(Spacer(1, 10))

    # ── Product identity ─────────────────────────────────────────────────────
    story.append(h2("Product Identification"))
    id_data = [
        ["Product Name", product_name, "Item Code", item_code],
        ["Lot / Batch #", lot_number, "Client / Brand", client],
        ["Manufacture Date", mfr_date, "Expiration Date", exp_date],
        ["Quantity", quantity, "Country of Origin", "USA"],
    ]
    id_tbl = Table(id_data, colWidths=[1.4*inch, 2.2*inch, 1.4*inch, 2.2*inch])
    id_tbl.setStyle(TableStyle([
        ("FONTSIZE",    (0, 0), (-1, -1), 9),
        ("FONTNAME",    (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME",    (2, 0), (2, -1), "Helvetica-Bold"),
        ("TEXTCOLOR",   (0, 0), (0, -1), TEAL),
        ("TEXTCOLOR",   (2, 0), (2, -1), TEAL),
        ("BOX",         (0, 0), (-1, -1), 0.5, BORDER),
        ("GRID",        (0, 0), (-1, -1), 0.5, BORDER),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [WHITE, LIGHT]),
        ("TOPPADDING",  (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(id_tbl)
    story.append(Spacer(1, 6))

    # ── Description ──────────────────────────────────────────────────────────
    story.append(h2("Product Description"))
    story.append(Table([[body(description)]], colWidths=[W]))
    story.append(Spacer(1, 10))

    # ── Test results ─────────────────────────────────────────────────────────
    story.append(h2("Analytical Test Results"))
    test_header = ["Test Parameter", "Method", "Specification", "Result", "Status"]
    test_rows = [test_header] + list(tests)

    def status_p(s):
        color = colors.HexColor("#166534") if s == "PASS" else colors.HexColor("#991b1b")
        bg = colors.HexColor("#dcfce7") if s == "PASS" else colors.HexColor("#fee2e2")
        return s  # plain text; style via table commands

    test_tbl = Table(
        test_rows,
        colWidths=[1.9*inch, 1.1*inch, 1.55*inch, 1.25*inch, 0.7*inch],
    )
    pass_rows = [i + 1 for i, r in enumerate(tests) if r[4] == "PASS"]
    fail_rows = [i + 1 for i, r in enumerate(tests) if r[4] != "PASS"]
    cmds = [
        ("FONTSIZE",    (0, 0), (-1, -1), 8),
        ("FONTNAME",    (0, 0), (-1, 0), "Helvetica-Bold"),
        ("BACKGROUND",  (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR",   (0, 0), (-1, 0), WHITE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, LIGHT]),
        ("GRID",        (0, 0), (-1, -1), 0.5, BORDER),
        ("ALIGN",       (4, 0), (4, -1), "CENTER"),
        ("FONTNAME",    (4, 1), (4, -1), "Helvetica-Bold"),
        ("TOPPADDING",  (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ]
    for r in pass_rows:
        cmds.append(("TEXTCOLOR", (4, r), (4, r), colors.HexColor("#166534")))
        cmds.append(("BACKGROUND", (4, r), (4, r), colors.HexColor("#dcfce7")))
    for r in fail_rows:
        cmds.append(("TEXTCOLOR", (4, r), (4, r), colors.HexColor("#991b1b")))
        cmds.append(("BACKGROUND", (4, r), (4, r), colors.HexColor("#fee2e2")))
    test_tbl.setStyle(TableStyle(cmds))
    story.append(test_tbl)
    story.append(Spacer(1, 10))

    # ── Conclusion ───────────────────────────────────────────────────────────
    concl = Table([[
        body("<b>Conclusion:</b> The above product lot has been tested and found to comply with all "
             "specified quality parameters. This Certificate of Analysis is issued in accordance "
             "with FlavorSource Inc Quality Management System (ISO 9001:2015)."),
    ]], colWidths=[W])
    concl.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.5, TEAL),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0fdf4")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(concl)
    story.append(Spacer(1, 16))

    # ── Signatures ───────────────────────────────────────────────────────────
    sig = Table([
        [
            Table([
                [h3("ANALYZED BY")],
                [Spacer(1, 22)],
                [HRFlowable(width=2.6*inch, color=BORDER)],
                [small("Dr. Andrea Kim, Senior Analyst")],
                [small("FlavorSource QA Laboratory")],
            ], colWidths=[2.9*inch]),
            Table([
                [h3("APPROVED & RELEASED BY")],
                [Spacer(1, 22)],
                [HRFlowable(width=2.6*inch, color=BORDER)],
                [small("James Park, QA Director")],
                [small(f"Date Issued: {mfr_date}")],
            ], colWidths=[2.9*inch]),
        ]
    ], colWidths=[3.6*inch, 3.6*inch])
    sig.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(sig)
    story.append(Spacer(1, 6))

    # ── Footer ───────────────────────────────────────────────────────────────
    story.append(HRFlowable(width=W, color=BORDER))
    story.append(Spacer(1, 4))
    story.append(small(
        f"COA Reference: {lot_number} | Issued: {mfr_date} | "
        "This document is valid only for the lot number stated above. "
        "FlavorSource Inc warrants that the product conforms to the specifications "
        "shown at the time of manufacture. Retain this document for your quality records.",
        color=colors.grey))

    doc.build(story)
    print(f"  ✓  {os.path.basename(path)}")


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("Generating smoke-test documents…")

    make_bol()  # regenerated — now includes 3 lots

    make_coa(
        filename="COA_FLVR_RASP_2026001.pdf",
        product_name="ACME Raspberry Flavoring",
        item_code="FLVR-RASP",
        lot_number="FLVR-RASP-2026001",
        mfr_date="2026-05-15",
        exp_date="2027-05-15",
        quantity="30 kg (1 drum)",
        client="Acme Beverage Co",
        description=(
            "Natural and artificial raspberry flavoring compound formulated for use in "
            "carbonated soft drinks. Water-soluble. Kosher certified (OU). "
            "Allergen-free — does not contain peanuts, tree nuts, dairy, egg, wheat, soy, "
            "fish, or shellfish. Store refrigerated below 45°F. Shelf life 12 months from manufacture."
        ),
        tests=[
            ("Appearance",          "Visual",      "Clear to sl. hazy liquid",  "Clear liquid",    "PASS"),
            ("Color",               "Visual",      "Pink to deep red",          "Deep pink-red",   "PASS"),
            ("Odor",                "Organoleptic","Raspberry — true to type",  "True to type",    "PASS"),
            ("Taste",               "Organoleptic","Sweet, fruity raspberry",   "Characteristic",  "PASS"),
            ("pH (10% aq. sol.)",   "AOAC 973.41", "3.0 – 4.5",               "3.8",             "PASS"),
            ("Specific Gravity",    "ASTM D891",   "1.030 – 1.060",            "1.044",           "PASS"),
            ("Refractive Index",    "AOAC 932.12", "1.400 – 1.430",            "1.418",           "PASS"),
            ("Total Plate Count",   "FDA BAM",     "≤ 1,000 CFU/g",            "< 100 CFU/g",     "PASS"),
            ("Yeast & Mold",        "FDA BAM",     "≤ 100 CFU/g",              "< 10 CFU/g",      "PASS"),
            ("Coliforms",           "FDA BAM",     "Negative / 10 g",          "Negative",        "PASS"),
            ("Lead (Pb)",           "ICP-MS",      "≤ 0.1 ppm",               "< 0.01 ppm",      "PASS"),
            ("Arsenic (As)",        "ICP-MS",      "≤ 0.1 ppm",               "< 0.01 ppm",      "PASS"),
            ("Cadmium (Cd)",        "ICP-MS",      "≤ 0.05 ppm",              "< 0.005 ppm",     "PASS"),
            ("Mercury (Hg)",        "ICP-MS",      "≤ 0.05 ppm",              "< 0.005 ppm",     "PASS"),
        ],
    )

    make_coa(
        filename="COA_FLVR_LMLM_2026001.pdf",
        product_name="ACME Lemon Lime Flavoring",
        item_code="FLVR-LMLM",
        lot_number="FLVR-LMLM-2026001",
        mfr_date="2026-05-15",
        exp_date="2027-05-15",
        quantity="25 kg (1 drum)",
        client="Acme Beverage Co",
        description=(
            "Natural and artificial lemon-lime flavoring compound formulated for use in "
            "carbonated soft drinks and sparkling beverages. Water-soluble. Kosher certified (OU). "
            "Allergen-free — does not contain peanuts, tree nuts, dairy, egg, wheat, soy, "
            "fish, or shellfish. Store refrigerated below 45°F. Shelf life 12 months from manufacture."
        ),
        tests=[
            ("Appearance",          "Visual",      "Clear to sl. hazy liquid",  "Clear liquid",    "PASS"),
            ("Color",               "Visual",      "Colorless to pale yellow",  "Pale yellow",     "PASS"),
            ("Odor",                "Organoleptic","Lemon-lime — true to type", "True to type",    "PASS"),
            ("Taste",               "Organoleptic","Tart citrus, lemon-lime",   "Characteristic",  "PASS"),
            ("pH (10% aq. sol.)",   "AOAC 973.41", "2.8 – 4.2",               "3.4",             "PASS"),
            ("Specific Gravity",    "ASTM D891",   "1.025 – 1.055",            "1.039",           "PASS"),
            ("Refractive Index",    "AOAC 932.12", "1.395 – 1.430",            "1.412",           "PASS"),
            ("Citral Content",      "GC-FID",      "≥ 0.5%",                   "0.73%",           "PASS"),
            ("Total Plate Count",   "FDA BAM",     "≤ 1,000 CFU/g",            "< 100 CFU/g",     "PASS"),
            ("Yeast & Mold",        "FDA BAM",     "≤ 100 CFU/g",              "< 10 CFU/g",      "PASS"),
            ("Coliforms",           "FDA BAM",     "Negative / 10 g",          "Negative",        "PASS"),
            ("Lead (Pb)",           "ICP-MS",      "≤ 0.1 ppm",               "< 0.01 ppm",      "PASS"),
            ("Arsenic (As)",        "ICP-MS",      "≤ 0.1 ppm",               "< 0.01 ppm",      "PASS"),
            ("Cadmium (Cd)",        "ICP-MS",      "≤ 0.05 ppm",              "< 0.005 ppm",     "PASS"),
            ("Mercury (Hg)",        "ICP-MS",      "≤ 0.05 ppm",              "< 0.005 ppm",     "PASS"),
        ],
    )

    make_coa(
        filename="COA_FLVR_ORAN_2026001.pdf",
        product_name="ACME Orange Flavoring",
        item_code="FLVR-ORAN",
        lot_number="FLVR-ORAN-2026001",
        mfr_date="2026-05-20",
        exp_date="2027-05-20",
        quantity="20 kg (1 drum)",
        client="Acme Beverage Co",
        description=(
            "Natural and artificial orange flavoring compound formulated for use in "
            "carbonated soft drinks. Water-soluble. Kosher certified (OU). "
            "Allergen-free — does not contain peanuts, tree nuts, dairy, egg, wheat, soy, "
            "fish, or shellfish. Store refrigerated below 45°F. Shelf life 12 months from manufacture. "
            "NOTE: This is a new item — create it in the system before receiving."
        ),
        tests=[
            ("Appearance",          "Visual",      "Clear to sl. hazy liquid",  "Clear liquid",    "PASS"),
            ("Color",               "Visual",      "Colorless to pale orange",  "Pale orange",     "PASS"),
            ("Odor",                "Organoleptic","Orange — true to type",     "True to type",    "PASS"),
            ("Taste",               "Organoleptic","Sweet, citrus orange",      "Characteristic",  "PASS"),
            ("pH (10% aq. sol.)",   "AOAC 973.41", "3.2 – 4.6",               "3.9",             "PASS"),
            ("Specific Gravity",    "ASTM D891",   "1.028 – 1.058",            "1.041",           "PASS"),
            ("Refractive Index",    "AOAC 932.12", "1.398 – 1.428",            "1.415",           "PASS"),
            ("Limonene Content",    "GC-FID",      "≥ 1.0%",                   "1.34%",           "PASS"),
            ("Total Plate Count",   "FDA BAM",     "≤ 1,000 CFU/g",            "< 100 CFU/g",     "PASS"),
            ("Yeast & Mold",        "FDA BAM",     "≤ 100 CFU/g",              "< 10 CFU/g",      "PASS"),
            ("Coliforms",           "FDA BAM",     "Negative / 10 g",          "Negative",        "PASS"),
            ("Lead (Pb)",           "ICP-MS",      "≤ 0.1 ppm",               "< 0.01 ppm",      "PASS"),
            ("Arsenic (As)",        "ICP-MS",      "≤ 0.1 ppm",               "< 0.01 ppm",      "PASS"),
            ("Cadmium (Cd)",        "ICP-MS",      "≤ 0.05 ppm",              "< 0.005 ppm",     "PASS"),
            ("Mercury (Hg)",        "ICP-MS",      "≤ 0.05 ppm",              "< 0.005 ppm",     "PASS"),
        ],
    )

    print("Done. Files written to:", OUT)
