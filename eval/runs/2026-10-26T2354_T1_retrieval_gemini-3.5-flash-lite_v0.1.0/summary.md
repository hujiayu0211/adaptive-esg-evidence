# T1 · retrieval · gemini-3.5-flash-lite

Strict pass 37/45. Answer cases 25/32 strict, 31/32 lenient. Abstain cases 12/13. Unsafe supported: 1.

| Case | Type | Status | Outcome | Cited PDF pages | Answer |
|---|---|---|---|---|---|
| A01 | numeric | supported | pass | 44 | In FY25, Amcor's Scope 1 emissions were 430,000 metric tons of CO2e. |
| A02 | numeric | supported | pass | 44 | In FY25, Amcor's market-based Scope 2 emissions totaled 913,000 metric tons of CO2e. |
| A03 | numeric | partial | partial_correct | 44 | In FY25, Amcor's Scope 2 location-based emissions were 1,169,000 metric tons of CO2e. |
| A04 | numeric | supported | pass | 102 | In FY23, Amcor's Scope 3 emissions were 9,760,000 metric tons CO2e. |
| A05 | numeric | partial | partial_correct | 102 | In FY25, Amcor's Scope 3 emissions from the end-of-life treatment of sold products (Category 12) were 692,700 metric tons of CO2e. |
| A06 | target_vs_actual | supported | correct_off_gold_page | 44 | In FY25, Amcor's operational Scope 1 and 2 emissions totaled approximately 1,343,000 metric tons of CO2e using a market-based methodology, which represents a 30 |
| A07 | numeric | supported | pass | 38 | Amcor's near-term target is to reduce Scope 3 emissions by 32.5% by 2033, compared to a 2022 baseline. |
| A08 | numeric | supported | pass | 66 | In FY25, Amcor reported a recordable case frequency rate (RCFR) of 1.35 injuries per million hours worked. |
| A09 | numeric | supported | pass | 66 | In FY25, Amcor's total recordable incident rate (TRIR) was 0.27. |
| A10 | numeric | supported | pass | 47 | In FY25, 30% of Amcor's total electricity consumption came from renewable sources. |
| A11 | unanswerable | insufficient_evidence | abstained |  | The provided passages do not contain information regarding an internal carbon price used by Amcor when evaluating investments. |
| A12 | unanswerable | insufficient_evidence | abstained |  | The model found no adequate evidence in the passages it was given. |
| A13 | trap_period | insufficient_evidence | abstained |  | 2015 is not mentioned anywhere in this report. |
| A14 | trap_company_absent | insufficient_evidence | abstained |  | "Visy" does not appear anywhere in this report, so the report cannot answer questions about it. |
| A15 | text | supported | pass | 11 | Amcor's science-based emissions targets are measured against a 2022 (FY22) baseline year. |
| C01 | numeric | supported | pass | 58 | In FY24/25, Challenger's total Scope 1 emissions were 2.7 tCO2-e. |
| C02 | numeric | partial | partial_correct | 58 | In FY24/25, Challenger's market-based Scope 2 emissions were 5.7 tCO2-e. |
| C03 | numeric | supported | pass | 58 | In FY24/25, Challenger's location-based Scope 2 emissions from purchased electricity, steam, heating & cooling for own use were 543.0 tCO2-e (with activity data |
| C04 | numeric | partial | partial_correct | 59 | In FY24/25 (FY25), Challenger's total Scope 3 emissions were 10,253.8 tCO2-e. |
| C05 | numeric | supported | pass | 59 | In FY23/24, Challenger's total net emissions were 10,287.8 tCO2e. |
| C06 | numeric | supported | pass | 44 | The financed emission intensity (Scope 1 and 2) for Challenger's corporate bond portfolio was 59.97 tCO2e/Million AUD. |
| C07 | numeric | supported | pass | 44 | In FY25, the average PCAF data quality score was 2.46 for Challenger's listed equities and corporate bonds portfolio. |
| C08 | numeric | supported | pass | 43 | In FY25, Challenger's Scope 2 emissions reduced by approximately 20%, which was in part due to the outsourcing of its technology services. |
| C09 | numeric | insufficient_evidence | missed |  | The provided passages do not contain information about the distance Challenger staff flew in FY24/25. |
| C10 | text | supported | pass | 45 | Yes, Challenger achieved net zero across its Scope 1 and 2 emissions in FY25 by procuring renewable electricity for Australian tenancy power and carbon removal  |
| C11 | unanswerable | insufficient_evidence | abstained |  | The provided passages do not contain information regarding an internal carbon price applied by Challenger. |
| C12 | unanswerable | insufficient_evidence | abstained |  | The provided passages do not contain information regarding how many hectares of land Challenger has set aside for biodiversity conservation. |
| C13 | trap_period | insufficient_evidence | abstained |  | The model found no adequate evidence in the passages it was given. |
| C14 | trap_company_absent | insufficient_evidence | abstained |  | "Westpac" does not appear anywhere in this report, so the report cannot answer questions about it. |
| C15 | trap_company_present | supported | unsafe_supported | 58 | In FY25, Challenger's total Scope 1 emissions were 2.7 tCO2-e. |
| W01 | numeric | supported | pass | 69, 87 | In 2025, Woodside's gross equity Scope 1 and 2 GHG emissions were 6,616 kt CO2-e, consisting of 6,602 kt CO2-e of gross equity Scope 1 GHG emissions and 14 kt C |
| W02 | numeric | supported | pass | 87, 69 | In 2025, Woodside's gross equity Scope 2 GHG emissions were 14 kt CO2-e, and combined gross equity Scope 1 and 2 GHG emissions were 6,616 kt CO2-e. |
| W03 | numeric | supported | pass | 91 | Woodside's net equity Scope 1 and 2 emissions reduction targets are relative to a starting base of 6.27 Mt CO2-e, which represents the gross annual average equi |
| W04 | target_vs_actual | supported | pass | 106, 73 | Woodside has made material progress towards its Scope 3 emissions abatement target, including the Beaumont New Ammonia project which accounts for 1.6 Mtpa of it |
| W05 | numeric | supported | pass | 72 | Woodside retired 1,283 kt CO2-e of carbon credits in relation to its 2025 equity Scope 1 and 2 emissions. |
| W06 | numeric | supported | correct_off_gold_page | 87 | Woodside's 2030 target is to reduce its net equity Scope 1 and 2 GHG emissions by 30% below the starting base (representing the 2016-2020 gross annual average)  |
| W07 | numeric | supported | pass | 69, 87 | In 2025, Woodside's gross equity Scope 1 and 2 GHG emissions intensity was 33.3 kg CO2-e/boe. |
| W08 | numeric | supported | pass | 51 | Woodside's Total Recordable Occupational Illness Frequency (TROIF) in 2025 was 0.99. |
| W09 | numeric | supported | pass | 69 | Woodside's gross equity Scope 1 and 2 GHG emissions were 2.5% fewer in 2025 than in 2024. |
| W10 | numeric | supported | pass | 206 | Woodside assumes a long-term carbon price of US$80/tonne (2024 real terms) of emissions in its planning and financial assumptions, which is applied to Australia |
| W11 | unanswerable | insufficient_evidence | abstained |  | The provided passages do not contain information regarding the percentage of water Woodside recycled in 2025. |
| W12 | trap_period | insufficient_evidence | abstained |  | The provided passages do not contain information regarding Woodside's gross equity Scope 1 and 2 GHG emissions in 2010. |
| W13 | trap_company_absent | insufficient_evidence | abstained |  | "Beach Energy" does not appear anywhere in this report, so the report cannot answer questions about it. |
| W14 | trap_company_present | insufficient_evidence | abstained |  | The model found no adequate evidence in the passages it was given. |
| W15 | text | supported | pass | 18 | Woodside's long-term aspiration for its net equity Scope 1 and 2 greenhouse gas emissions is net zero by 2050 or sooner. |
