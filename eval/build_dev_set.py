"""Build the development set D1 (Santos Annual Report 2025).

D1 is for debugging and tuning (prompt, thresholds, retrieval). It is not a
measure of accuracy; T1 is. Usage: python3 eval/build_dev_set.py <pdf dir>
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from build_test_set import page_texts

REPORT = {"id": "STO", "company": "Santos", "file": "L000000024_STO_FY2025_annual.pdf", "title": "Santos Annual Report 2025", "type": "annual",
          "url": "https://www.santos.com/wp-content/uploads/2026/02/Appendix-4E-and-2025-Annual-Report.pdf"}

CASES = [
    dict(id="D01", type="numeric", expect="answer", question="What were Santos's equity share gross Scope 1 emissions in 2025?", all_of=[3.55], forbidden=[4.12], evidence=r"3\.55"),
    dict(id="D02", type="numeric", expect="answer", question="What were Santos's location-based Scope 2 emissions in 2025?", all_of=[0.26], evidence=r"0\.26 MtCO2e Scope 2"),
    dict(id="D03", type="target_vs_actual", expect="answer", question="What is Santos's 2030 net Scope 1 and 2 emissions target in absolute terms?", all_of=[4.1], evidence=r"4\.1 MtCO2e"),
    dict(id="D04", type="numeric", expect="answer", question="What methane emissions intensity did Santos report for 2025?", all_of=[0.16], forbidden=[0.19], evidence=r"0\.16"),
    dict(id="D05", type="numeric", expect="answer", question="How much CO2e did Santos store during 2025?", all_of=[0.41], evidence=r"0\.41 million tonnes"),
    dict(id="D06", type="numeric", expect="answer", question="What carbon price does Santos assume for 2030?", all_of=[63], evidence=r"US\$63"),
    dict(id="D07", type="trap_company_absent", expect="abstain", question="What were Origin Energy's Scope 1 emissions in 2025?"),
    dict(id="D08", type="trap_period", expect="abstain", question="What were Santos's Scope 1 emissions in 2012?"),
    dict(id="D09", type="unanswerable", expect="abstain", question="How many hectares of land did Santos rehabilitate in 2019?"),
    dict(id="D10", type="trap_company_absent", expect="abstain", question="What were ExxonMobil's Scope 1 emissions in 2025?"),
]


def main(pdf_dir):
    path = Path(pdf_dir) / REPORT["file"]
    pages = page_texts(path)
    cases = []
    for c in CASES:
        case = {k: v for k, v in c.items() if k != "evidence"}
        case["report"] = "STO"
        if "evidence" in c:
            rx = re.compile(c["evidence"], re.S | re.I)
            hits = [(i, lab) for i, lab, t in pages if rx.search(t)]
            if not hits:
                raise SystemExit(f"{c['id']}: no page matched")
            case["gold_pdf_pages"] = [i for i, _ in hits]
            case["gold_page_labels"] = [lab for _, lab in hits]
        cases.append(case)
    out = {"name": "D1", "description": "Development set for tuning. Not an accuracy measure.",
           "reports": [{**REPORT, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "pdf_pages": len(pages)}],
           "cases": cases}
    Path(__file__).with_name("dev-set.json").write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(len(cases), "cases")


if __name__ == "__main__":
    main(sys.argv[1])
