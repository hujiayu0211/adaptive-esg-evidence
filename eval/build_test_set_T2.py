"""Build the frozen test set T2 (Evolution Mining Sustainability Report 2025).

T2 was written after the v0.1.0 run on T1 and before any v0.1.1 code change.
It targets the error types seen on T1 (qualifiers in table headers, split
hyphenation, FY-range periods, named entities that the report mentions but does
not report on), on a report that no earlier development step used.

Usage: python3 eval/build_test_set_T2.py <dir with the PDF>
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from build_test_set import SCORING, page_texts

REPORT = {"id": "EVN", "company": "Evolution Mining", "file": "L000000006_EVN_FY2025_sustainability.pdf",
          "title": "Evolution Mining Sustainability Report 2025", "type": "sustainability",
          "url": "https://evolutionmining.com.au/storage/2025/10/Evolution-Mining-Sustainability-Report-WEB.pdf"}

CASES = [
    dict(id="E01", type="numeric", expect="answer", question="What were Evolution's total Scope 1 and 2 emissions in FY25?",
         all_of=[761424], forbidden=[919167], evidence=r"761,424"),
    dict(id="E02", type="numeric", expect="answer", question="What were Evolution's FY25 Scope 2 emissions using the market-based method?",
         all_of=[531744], forbidden=[687344], evidence=r"531,744"),
    dict(id="E03", type="numeric", expect="answer", question="What were Evolution's Scope 1 emissions in the FY20 baseline year?",
         all_of=[231823], forbidden=[229680], evidence=r"231,823"),
    dict(id="E04", type="target_vs_actual", expect="answer", question="By how much have Evolution's Scope 1 and 2 emissions actually fallen against the FY20 baseline?",
         all_of=[17], forbidden=[30], evidence=r"reduction of 17%|~17%\s+Emissions reduction"),
    dict(id="E05", type="numeric", expect="answer", question="What was Evolution's total recordable injury frequency (TRIF) in FY25?",
         all_of=[4.984], evidence=r"4\.984"),
    dict(id="E06", type="target_vs_actual", expect="answer", question="What share of Evolution's workforce was female in FY25?",
         all_of=[21], forbidden=[22], evidence=r"21% female"),
    dict(id="E07", type="numeric", expect="answer", question="By how much did Evolution's freshwater use intensity fall against the FY20 baseline?",
         all_of=[28], evidence=r"freshwater use intensity reducing by 28%|freshwater use intensity by\s+~28%|28% improvement against baseline"),
    dict(id="E08", type="numeric", expect="answer", question="What was Evolution's total economic contribution in FY24?",
         all_of=[3.2], forbidden=[3.7], evidence=r"\$3\.2\s+billion\s+in\s+FY24"),
    dict(id="E09", type="trap_company_present", expect="abstain", question="What were AGL's Scope 1 emissions in FY25?"),
    dict(id="E10", type="trap_period", expect="abstain", question="What were Evolution's Scope 1 and 2 emissions in FY2015?"),
    dict(id="E11", type="unanswerable", expect="abstain", question="How many tonnes of plastic did Evolution recycle in FY25?"),
    dict(id="E12", type="numeric", expect="answer", question="How many hectares of rehabilitated land did Evolution manage?",
         all_of=[1025], evidence=r"1,025 hectares"),
]


def main(pdf_dir):
    path = Path(pdf_dir) / REPORT["file"]
    pages = page_texts(path)
    cases = []
    for c in CASES:
        case = {k: v for k, v in c.items() if k != "evidence"}
        case["report"] = REPORT["id"]
        if "evidence" in c:
            rx = re.compile(c["evidence"], re.S | re.I)
            hits = [(i, lab) for i, lab, t in pages if rx.search(t)]
            if not hits:
                raise SystemExit(f"{c['id']}: evidence regex matched no page")
            case["gold_pdf_pages"] = [i for i, _ in hits]
            case["gold_page_labels"] = [lab for _, lab in hits]
        cases.append(case)
    out = {"name": "T2", "description": "Frozen after the v0.1.0 T1 run and before any v0.1.1 change. Do not edit expected outcomes after a run.",
           "reports": [{**REPORT, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "pdf_pages": len(pages)}],
           "scoring": SCORING, "cases": cases}
    target = Path(__file__).with_name("test-set-T2.json")
    target.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    canon = json.dumps(cases, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    print(len(cases), "cases; cases sha256", hashlib.sha256(canon.encode()).hexdigest())
    for c in cases:
        if "gold_pdf_pages" in c:
            print(c["id"], c["gold_pdf_pages"])


if __name__ == "__main__":
    main(sys.argv[1])
