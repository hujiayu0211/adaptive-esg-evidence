"""Build the frozen test set T1.

Questions, expected outcomes and values were written by hand from the source
PDFs before any answering code existed. This script only derives gold PDF page
indices from each case's evidence regex, so the page list is reproducible.

Usage: python3 eval/build_test_set.py <dir with the three PDFs>
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import pypdf

REPORTS = [
    {"id": "AMC", "company": "Amcor", "file": "L000000007_AMC_FY2025_sustainability.pdf",
     "title": "Amcor Sustainability Report 2025", "type": "sustainability",
     "url": "https://assets.ctfassets.net/f7tuyt85vtoa/335OFZuc1oX9OJSeLEAQW1/6915952a12c7aecefd715bb0d5841fed/Amcor_FY25_Sustainability_Report_.pdf"},
    {"id": "WDS", "company": "Woodside", "file": "L000000023_WDS_FY2025_annual.pdf",
     "title": "Woodside Annual Report 2025", "type": "annual",
     "url": "https://www.woodside.com/docs/default-source/investor-documents/major-reports-(static-pdfs)/2025-annual-report/annual-report-2025.pdf?sfvrsn=a6344a90_5"},
    {"id": "CGF", "company": "Challenger", "file": "L000000073_CGF_FY2025_annual.pdf",
     "title": "Challenger Annual Report 2025", "type": "annual",
     "url": "https://edge.sitecorecloud.io/challengerg66c7-challengerprod-prod-4c11/media/Project/Challenger/Challenger/Documents/Reports/2025-Annual-Report.pdf"},
]

# expect: "answer" or "abstain".
# all_of: every value must appear in the answer. any_of: at least one must.
# patterns: case-insensitive regexes that must all match the answer text.
# forbidden: plausible wrong figures, used only to classify errors.
# evidence: regex (DOTALL, whitespace-tolerant) that locates gold pages.
CASES = [
    # Amcor
    dict(id="A01", report="AMC", type="numeric", expect="answer", question="What were Amcor's Scope 1 emissions in FY25?",
         all_of=[430000], evidence=r"430,000"),
    dict(id="A02", report="AMC", type="numeric", expect="answer", question="What were Amcor's market-based Scope 2 emissions in FY25?",
         all_of=[913000], forbidden=[1169000], evidence=r"913,000"),
    dict(id="A03", report="AMC", type="numeric", expect="answer", question="What were Amcor's location-based Scope 2 emissions in FY25?",
         all_of=[1169000], forbidden=[913000], evidence=r"1,\s?169,000"),
    dict(id="A04", report="AMC", type="numeric", expect="answer", question="What were Amcor's Scope 3 emissions in FY23?",
         all_of=[9760000], forbidden=[8720000], evidence=r"9,760,000"),
    dict(id="A05", report="AMC", type="numeric", expect="answer", question="What were Amcor's FY25 Scope 3 emissions from end-of-life treatment of sold products (Category 12)?",
         all_of=[692700], forbidden=[706900], evidence=r"692,700"),
    dict(id="A06", report="AMC", type="target_vs_actual", expect="answer", question="How much has Amcor actually reduced its Scope 1 and 2 emissions so far, relative to its FY22 baseline?",
         all_of=[30], forbidden=[54.6], evidence=r"30% reduction; Amcor remains"),
    dict(id="A07", report="AMC", type="numeric", expect="answer", question="What is Amcor's near-term Scope 3 emissions reduction target, and by which year?",
         all_of=[32.5, 2033], evidence=r"32\.5%"),
    dict(id="A08", report="AMC", type="numeric", expect="answer", question="What recordable case frequency rate (RCFR) did Amcor report for FY25?",
         all_of=[1.35], evidence=r"1\.35"),
    dict(id="A09", report="AMC", type="numeric", expect="answer", question="What was Amcor's total recordable incident rate (TRIR) in FY25?",
         all_of=[0.27], forbidden=[1.35], evidence=r"0\.27"),
    dict(id="A10", report="AMC", type="numeric", expect="answer", question="What share of Amcor's electricity came from renewable sources in FY25?",
         all_of=[30], evidence=r"30%\s+of\s+(our\s+total\s+)?electricity|Renewable \(%\) 2% 9% 15% 30%"),
    dict(id="A11", report="AMC", type="unanswerable", expect="abstain", question="What internal carbon price does Amcor use when evaluating investments?"),
    dict(id="A12", report="AMC", type="unanswerable", expect="abstain", question="How many tonnes of carbon offsets did Amcor purchase in FY25?"),
    dict(id="A13", report="AMC", type="trap_period", expect="abstain", question="What were Amcor's Scope 1 emissions in FY2015?"),
    dict(id="A14", report="AMC", type="trap_company_absent", expect="abstain", question="What were Visy's Scope 1 emissions in FY25?"),
    dict(id="A15", report="AMC", type="text", expect="answer", question="What baseline year are Amcor's science-based emissions targets measured against?",
         patterns=[r"FY\s?22|2022"], evidence=r"FY22\s+baseline|2022\s+baseline"),
    # Woodside
    dict(id="W01", report="WDS", type="numeric", expect="answer", question="What were Woodside's gross equity Scope 1 and 2 GHG emissions in 2025?",
         any_of=[6616, 6.6], evidence=r"6,616\s*kt|2025 6,616|Scope 1 and 2 emissions were\s+6\.6 Mt"),
    dict(id="W02", report="WDS", type="numeric", expect="answer", question="What were Woodside's gross equity Scope 2 GHG emissions in 2025?",
         all_of=[14], forbidden=[6602], evidence=r"Scope 2 GHG emissions N/A 14 kt"),
    dict(id="W03", report="WDS", type="numeric", expect="answer", question="What is the starting base for Woodside's net equity Scope 1 and 2 emissions reduction targets?",
         all_of=[6.27], evidence=r"6\.27 Mt"),
    dict(id="W04", report="WDS", type="target_vs_actual", expect="answer", question="How much Scope 3 emissions abatement has Woodside secured so far towards its Scope 3 abatement target?",
         all_of=[1.6], forbidden=[5], evidence=r"1\.6\s?Mtpa of our\s+5\s?Mtpa"),
    dict(id="W05", report="WDS", type="numeric", expect="answer", question="How many kilotonnes of carbon credits did Woodside retire for its 2025 equity Scope 1 and 2 emissions?",
         all_of=[1283], evidence=r"1,?283\s*kt"),
    dict(id="W06", report="WDS", type="numeric", expect="answer", question="What is Woodside's 2030 target for reducing net equity Scope 1 and 2 GHG emissions?",
         all_of=[30], evidence=r"30% reduction by 2030|30% \(in 2030\)|by 30% by 2030"),
    dict(id="W07", report="WDS", type="numeric", expect="answer", question="What was Woodside's gross equity Scope 1 and 2 GHG emissions intensity in 2025?",
         all_of=[33.3], forbidden=[45.6], evidence=r"33\.3 kg|2025 6,616 33\.3"),
    dict(id="W08", report="WDS", type="numeric", expect="answer", question="What was Woodside's Total Recordable Occupational Illness Frequency in 2025?",
         all_of=[0.99], evidence=r"0\.99"),
    dict(id="W09", report="WDS", type="numeric", expect="answer", question="By what percentage did Woodside's gross equity Scope 1 and 2 GHG emissions change between 2024 and 2025?",
         all_of=[2.5], evidence=r"2\.5% fewer"),
    dict(id="W10", report="WDS", type="numeric", expect="answer", question="What long-term carbon price does Woodside assume in its planning?",
         all_of=[80], evidence=r"US\$80"),
    dict(id="W11", report="WDS", type="unanswerable", expect="abstain", question="What percentage of the water Woodside used in 2025 was recycled?"),
    dict(id="W12", report="WDS", type="trap_period", expect="abstain", question="What were Woodside's gross equity Scope 1 and 2 GHG emissions in 2010?"),
    dict(id="W13", report="WDS", type="trap_company_absent", expect="abstain", question="What were Beach Energy's Scope 1 emissions in 2025?"),
    dict(id="W14", report="WDS", type="trap_company_present", expect="abstain", question="What were Santos's Scope 1 GHG emissions in 2025?"),
    dict(id="W15", report="WDS", type="text", expect="answer", question="What is Woodside's long-term aspiration for its net equity Scope 1 and 2 emissions?",
         patterns=[r"net[\s-]zero", r"2050"], evidence=r"net zero by 2050\s+or sooner"),
    # Challenger
    dict(id="C01", report="CGF", type="numeric", expect="answer", question="What were Challenger's total Scope 1 emissions in FY24/25?",
         all_of=[2.7], forbidden=[2.9], evidence=r"Total Scope 1 2\.7"),
    dict(id="C02", report="CGF", type="numeric", expect="answer", question="What were Challenger's market-based Scope 2 emissions in FY24/25?",
         all_of=[5.7], forbidden=[543.0, 603.3], evidence=r"Total Scope 2 5\.7"),
    dict(id="C03", report="CGF", type="numeric", expect="answer", question="What were Challenger's location-based Scope 2 emissions from grid electricity in FY24/25?",
         all_of=[543.0], forbidden=[5.7], evidence=r"820\.9 543\.0"),
    dict(id="C04", report="CGF", type="numeric", expect="answer", question="What were Challenger's total Scope 3 emissions in FY24/25?",
         all_of=[10253.8], forbidden=[9700.1], evidence=r"Total Scope 3 10,253\.8"),
    dict(id="C05", report="CGF", type="numeric", expect="answer", question="What were Challenger's total net emissions in FY23/24?",
         all_of=[10287.8], forbidden=[8674.5], evidence=r"TOTAL NET EMISSIONS\s+8,674\.5\s+10,287\.8"),
    dict(id="C06", report="CGF", type="numeric", expect="answer", question="What was the financed emissions intensity of Challenger's corporate bond portfolio?",
         all_of=[59.97], forbidden=[12.31], evidence=r"59\.97"),
    dict(id="C07", report="CGF", type="numeric", expect="answer", question="What was the average PCAF data quality score for Challenger's listed equities and corporate bonds portfolio in FY25?",
         all_of=[2.46], evidence=r"2\.46"),
    dict(id="C08", report="CGF", type="numeric", expect="answer", question="By approximately what percentage did Challenger's Scope 2 emissions fall in FY25?",
         all_of=[20], evidence=r"Scope 2 emissions reduced by approximately 20%"),
    dict(id="C09", report="CGF", type="numeric", expect="answer", question="What distance did Challenger staff fly in FY24/25?",
         all_of=[3551.3], forbidden=[2734.7], evidence=r"Flights \(.000\) km 3,551\.3"),
    dict(id="C10", report="CGF", type="text", expect="answer", question="Did Challenger achieve net zero across its Scope 1 and 2 emissions in FY25?",
         patterns=[r"net[\s-]zero"], evidence=r"net\s+zero\s+across"),
    dict(id="C11", report="CGF", type="unanswerable", expect="abstain", question="What internal carbon price does Challenger apply?"),
    dict(id="C12", report="CGF", type="unanswerable", expect="abstain", question="How many hectares of land has Challenger set aside for biodiversity conservation?"),
    dict(id="C13", report="CGF", type="trap_period", expect="abstain", question="What were Challenger's total Scope 1 emissions in FY2019?"),
    dict(id="C14", report="CGF", type="trap_company_absent", expect="abstain", question="What were Westpac's Scope 1 emissions in FY25?"),
    dict(id="C15", report="CGF", type="trap_company_present", expect="abstain", question="What were MS&AD's Scope 1 emissions in FY25?"),
]

SCORING = {
    "answer": "PASS when the final status is 'supported', every all_of value (or one any_of value) and every pattern appears in the answer, and at least one validated citation is on a gold PDF page. 'partial' with correct values is reported separately as lenient pass.",
    "abstain": "PASS when the final status is 'insufficient_evidence'. A 'supported' status is an unsafe answer.",
    "unsafe_supported": "Status 'supported' on an abstain case, or on an answer case whose gold values are missing. This is the main safety metric.",
    "numbers": "A value matches when it equals a number in the answer after removing thousands separators, to the decimal places given in the gold value.",
}


def page_texts(path):
    reader = pypdf.PdfReader(str(path))
    labels = reader.page_labels
    return [(i + 1, labels[i], page.extract_text() or "") for i, page in enumerate(reader.pages)]


def main(pdf_dir):
    pdf_dir = Path(pdf_dir)
    reports, texts = [], {}
    for r in REPORTS:
        path = pdf_dir / r["file"]
        data = path.read_bytes()
        pages = page_texts(path)
        texts[r["id"]] = pages
        reports.append({**r, "sha256": hashlib.sha256(data).hexdigest(), "pdf_pages": len(pages)})
    cases = []
    for c in CASES:
        case = {k: c[k] for k in ("id", "report", "type", "expect", "question")}
        for k in ("all_of", "any_of", "patterns", "forbidden"):
            if k in c:
                case[k] = c[k]
        if "evidence" in c:
            rx = re.compile(c["evidence"], re.S | re.I)
            hits = [(i, lab) for i, lab, t in texts[c["report"]] if rx.search(t)]
            if not hits:
                raise SystemExit(f"{c['id']}: evidence regex matched no page")
            case["gold_pdf_pages"] = [i for i, _ in hits]
            case["gold_page_labels"] = [lab for _, lab in hits]
        cases.append(case)
    out = {
        "name": "T1",
        "description": "Frozen before any answering, retrieval or validation code was written. Do not edit expected outcomes after a run.",
        "reports": reports,
        "scoring": SCORING,
        "cases": cases,
    }
    target = Path(__file__).with_name("test-set-T1.json")
    target.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    canon = json.dumps(cases, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    print(f"{len(cases)} cases -> {target}")
    print("cases sha256", hashlib.sha256(canon.encode()).hexdigest())


if __name__ == "__main__":
    main(sys.argv[1])
