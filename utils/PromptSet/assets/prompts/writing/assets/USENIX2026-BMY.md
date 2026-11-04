---
title: USENIX2026-BMY

---

# USENIX2026-BMY
Thanks for the reviews. Unless noted, experiments use Enron at 0.1% leakage.
# ==============Review#A==============

**Review#A-Q1: Motivation.**

We agree known-data attacks are traditionally stronger than similar-data attacks, as they assume non-trivial plaintext access. Our focus is a different yet practical setting: ultra-low leakage (<1%). On Enron, 0.1% is ~30 documents, realistically arising from logs or historical database versions. Our goal is to revisit the feasibility of known-data attacks under ultra-low leakage with LLM assistance, showing previously infeasible settings become practical. Fig. 1 and motivation will be revised.

**Review#A-Q2: AI vs. Design.**

Ablation shows both components contribute.
| Method | CRR |
| ---- | --------- |
| VAL | 16.74% |
| Whisper w/o AI-assisted | 24.60% |
| Whisper | 40.96% |

Adding LLM-generated documents to VAL without modifying its logic drops CRR from 16.74% to 14.98%: naive AI augmentation can hurt, as noisy pseudo-document co-occurrences disrupt matching and may be misidentified as real plaintext.



**Review#A-Q3: Alg.2 Details.**

Correct. Identical-pattern keywords/queries form candidate sets matched by Hungarian. Unmatched queries remain unresolved that iteration, so only attacker-known queries meeting the discrimination condition are recovered. 

σ(ed)=σ(d) is a modeling simplification rather than strict equality. Alg.2 uses relative volume/ranking. Will clarify.


# ==============Review#B==============

**Review#B-Q1: Semantic Similarity Incorporation.**

(1) vs. Direct Propagation. Two-hop propagation along semantic neighbors is limited under ultra-low leakage, since it relies on existing co-occurrences that are extremely sparse; Whisper directly fills zeros with the semantic prior, yielding 41.15% CRR vs. Propagation's 30.34%.


(2) vs. Late Fusion. Given the same external semantic data, late fusion amplifies noise in sparse K', whereas Whisper (soft prior → single cosine) preserves relative signal by directly filling sparse entries, achieving 40.16% CRR vs. Late Fusion's 36.83%.




**Review#B-Q2: Embedding vs LLM.**

The ablation shows both components are essential and complementary. Embedding provides a stable general semantic prior, while LLM synthesis supplements domain-specific co-occurrences.

| Configuration                | CRR    |
| ---------------------------- | ------ |
| VAL                | 16.74% |
| Whisper (w/o AI-assisted)    | 24.60% |
| Whisper (w/o embedding)      | 27.61% |
| Whisper (w/o LLM)            | 39.11% |
| Whisper               | 40.96% |

**Review#B-Q3: Document Synthesis.**
LLMs cannot reliably emit co-occurrence values. Direct "do X,Y co-occur?" prompts hallucinate, and pairwise prediction scales quadratically with vocabulary (4,718 vs. 11 LLM calls), incurring excessive queries and tokens.



**Review#B-Q4: Attack/Implementation Details.**

Each trial is independent (resampled known-plaintext, rebuilt co-occurrence matrix, regenerated synthetic documents). The LLM is a one-shot black box with no shared state. 

Text is truncated to 150 words to control prompt length while preserving context and generation quality. 

We will add a VAL description, unify figures, and clarify co-occurrence counting (newly added pairs may overlap existing ones).

# ==============Review#C==============

**Review#C-Q1: Vendor Notification.**

This is attack-paradigm-level cryptanalysis rather than a vendor-specific vulnerability, so vendor-by-vendor disclosure does not directly apply. We will add a brief ethics discussion on affected parties.

**Review#C-Q2: Cost.**

The attack is inexpensive: total API cost on Enron is about $0.10/$0.37/$0.61 at 0.1%/0.3%/0.5% leakage. Overhead statistics will be included.

**Review#C-Q3: Multilingual.**

Our main evaluation is in English, but the framework is not English-specific. We test Spanish/French/Chinese on CC-News-2026 at 0.1% leakage with paraphrase-multilingual-mpnet-base-v2 as embedding model, and re-run English on the same model. Whisper consistently outperforms VAL, though performance varies with target-language LLM/embedding quality.

| Language | VAL-CRR | Whisper-CRR |
| -------- | ------- | ----------- |
| Spanish  | 26.23%  | 50.48%      |
| French   | 23.27%  | 44.52%      |
| Chinese  | 14.70%  | 29.02%      |
| English  | 16.72%  | 46.73%      |


**Review#C-Q4: Other Mitigations.**

We additionally evaluated two defenses, both of which reduce Whisper substantially, yet it still exceeds VAL by over 10 pp.

| Mitigation                | VAL-CRR | Whisper-CRR | 
| ---------------------- | ------- | ----------- | 
| None            | 17.85%  | 42.09%      |                         
| CLRZ | 10.41%  | 24.02%      |               
| SEAL   | 10.52%  | 20.84%      | 


# ==============Review#D==============

**Review#D-Q1: Prior-attack comparison.**

We will add a detailed comparison table.

**Review#D-Q2: Baseline selection.**

Our baselines prioritize attacks that are representative and directly comparable under our setting. VAL is the closest baseline, while COUNT/LEAP provides complementary references.

**Review#D-Q3: IKK Requirement.**

Our wording was inaccurate. What we intended to convey is that early known-data attacks generally require non-trivial known data (>10%), with IKK a representative example at ~90%. Will revise.


**Review#D-Q4: Zipfian Anchors.**

Under a Zipfian distribution, a few high-frequency keywords have distinctive volumes that anchor inference of the rest.


**Review#D-Q5: Typo.**

Should be m′<m. Will fix.

**Review#D-Q6: Unique Feasible Candidate.**

This check is implemented at Line 12 of Alg.2. We will add a brief comment.

**Review#D-Q7: Joint Generation Context.**

Feeding mixed-topic leaked documents into LLM as one context blends unrelated themes into unrealistic co-occurrences, so we cluster by topic first.

**Review#D-Q8: Sampling Temperature.**

An LLM API-call parameter. Will clarify.


# ==============Review#E==============

**Review#E-Q1: Disclosure Rationale.**

This work is attack-paradigm-level cryptanalysis, not a vendor-specific vulnerability, so vendor-by-vendor notification does not apply. The attack exploits access-pattern, a well-studied statistical leakage, and introduces no new implementation-level flaws, making academic disclosure the appropriate channel for driving stronger defense standards. Final version will state this rationale explicitly.

**Review#E-Q2: Defense Limits.**

Defenses fall into two classes: lightweight obfuscation (padding, volume hiding, access-pattern obfuscation) and strong defenses (ORAM, PIR). Lightweight methods mitigate leakage under traditional attacks, but are weakened when LLMs/embeddings help complete sparse statistics. Strong defenses fundamentally eliminate pattern leakage at higher overhead. The key takeaway is that AI shifts the attack boundary, such that "low leakage implies security" no longer holds, and lightweight obfuscation alone is insufficient. Semantically robust defenses are needed.


**Review#E-Q3: CfP Ethics Elements.**

Final version will expand along the four CfP elements:
- **Stakeholders**: encrypted-search users, ops teams, cloud providers, SSE designers, and product vendors.
- **Impact**: On the positive side, it pushes stronger leakage-mitigation standards and corrects "ultra-low leakage = safe"; on the negative side, potential misuse against deployments, which motivates the disclosure rationale in Q1.
- **Mitigation**: public datasets only, inputs anonymized before the LLM, controlled experiments with no real-system interaction.
- **Publication decision**: assessed under responsible-research principles; as an extension of known attack paradigms (consistent with e.g., Jigsaw), academic and defense-standard benefits outweigh misuse risk.

