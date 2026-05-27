#!/usr/bin/env python3
"""
Production-Grade RAG ETL Pipeline for Ditto Insurance Data  v2.0
=================================================================
Converts raw scraped Ditto sitemap JSONL into 7 output files:
  1. cleaned_rag_chunks.jsonl         – embedding-ready chunks (main)
  2. faq_dataset.jsonl                – glossary term Q&A pairs
  3. claims_process_dataset.jsonl     – structured claims guidance
  4. review_sentiment_dataset.jsonl   – per-review sentiment records
  5. comparison_dataset.jsonl         – plan-vs-plan comparison records
  6. insurer_profiles.jsonl           – insurer overview + stats
  7. pipeline_report.json             – run stats & diagnostics
"""

import json
import re
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone
from collections import defaultdict
from typing import Optional

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("rag_pipeline")

# ── Paths ─────────────────────────────────────────────────────────────────────
INPUT_FILE = Path(
    "/Users/priyansh/Desktop/Code/Scrapegraph-ai/data/ditto_raw_sitemap_dataset.jsonl"
)
OUTPUT_DIR = Path(
    "/Users/priyansh/Desktop/Code/priyansh-insurance/data/rag"
)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Noise removal ─────────────────────────────────────────────────────────────
# These exact strings repeat on EVERY scraped page – strip them first.

# The big navigation block always starts with "Ditto Buy Insurance Open menu"
# and ends just before the actual page content.
_NAV_BLOCK = re.compile(
    r"Ditto Buy Insurance Open menu.*?(?=Buy Insurance|Health Insurance Glossary|Star Health|HDFC|Niva|Care Health|ICICI|Aditya|Bajaj|Manipal|Tata|Royal|Oriental|SBI|United|Universal|IFFCO|Digit|Zuno|Acko|Navi|Reliance|Ditto Insurance Hotline|FILE A CLAIM|Founded in|\d{4},\s+[A-Z])",
    re.DOTALL,
)
# Ditto Insurance Hotline block (some pages only)
_HOTLINE_BLOCK = re.compile(
    r"Ditto Insurance Hotline.*?WhatsApp Us(?:\s+If you'd.*?WhatsApp Us)?",
    re.DOTALL,
)
# Inline class= artifacts (residual HTML)
_HTML_CLASS = re.compile(r'class="[^"]*"[^>]*>', re.DOTALL)
_HTML_TAG   = re.compile(r"<[^>]+>")

# Rating widget (4.9 22,000+...)
_RATING_WIDGET = re.compile(r"4\.9\s+22,000\+\s*ratings on Google", re.IGNORECASE)

# CTA banners
_EXPERT_CTA = re.compile(
    r"Talk to an expert today and find the right insurance for you\.?\s*"
    r"Book a Free Call\s*Book a Free Call\s*Chat on WhatsApp\s*Chat on WhatsApp",
    re.IGNORECASE,
)
_BOOK_CTA = re.compile(
    r"(?:Book a [Ff]ree [Cc]all(?:\s*now)?(?:\s*Book a Free Call)?|"
    r"Book a free call|Chat on WhatsApp|WhatsApp Us?|"
    r"Chat with us on WhatsApp)\s*",
    re.IGNORECASE,
)

# Footer CTA strip
_FOOTER_CTA = re.compile(
    r"A product by Finshots.*?make better decisions\.",
    re.DOTALL | re.IGNORECASE,
)

# Footer nav links (duplicated twice on each page)
_FOOTER_NAV = re.compile(
    r"Products Health Insurance Term Insurance Articles.*?We are hiring Contact Us",
    re.DOTALL,
)

# Legal disclaimer + copyright
_LEGAL = re.compile(
    r"Finshots © 2021.*",
    re.DOTALL,
)

# Support contact block
_SUPPORT_BLOCK = re.compile(
    r"Need help\?.*?careers@joinditto\.in",
    re.DOTALL,
)

# Alphabetical glossary sidebar (appears on every glossary page)
_GLOSSARY_SIDEBAR = re.compile(
    r"\bA\s+Accident\s+Accumulation Period.*?Waiting Period\b",
    re.DOTALL,
)

# Glossary sidebar (short form — sometimes only partial index survives after first pass)
_GLOSSARY_SIDEBAR_SHORT = re.compile(
    r"\b(?:Sub-Limit\s+Sum Insured\s+T\s+Terminal Illness.*?Waiting Period|" 
    r"(?:[A-Z]\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+){5,})",
    re.DOTALL,
)

# "Other X Comparisons …" links block at page bottom
_OTHER_COMPARISONS = re.compile(
    r"Other .{3,60}? Comparisons\s*(?:[^\n]+\n){0,10}",
)

# Repeated testimonial block on claims page
_TESTIMONIALS_BLOCK = re.compile(
    r"What people think about us.*?FILE A CLAIM YOURSELF",
    re.DOTALL | re.IGNORECASE,
)

# Social media handles like "@joinditto" tweets
_SOCIAL_HANDLES = re.compile(r"@[A-Za-z0-9_]+\s")

# "Understand Your Policy … Check now" widget
_POLICY_WIDGET = re.compile(
    r"Understand Your Policy.*?Check now",
    re.DOTALL | re.IGNORECASE,
)

# Recent searches widget
_RECENT_SEARCHES = re.compile(r"Recent Searches.*?(?=\n\n|\Z)", re.DOTALL)

# Phone number duplicates (080-XXXXXXXX 080-XXXXXXXX pattern)
_PHONE_DUP = re.compile(r"(080-\d+)\s+\1")


def remove_noise(text: str) -> str:
    """Strip all navigation, footer, CTA, disclaimer, and widget noise."""
    text = _NAV_BLOCK.sub("", text)
    text = _HOTLINE_BLOCK.sub("", text)
    text = _HTML_CLASS.sub("", text)
    text = _HTML_TAG.sub("", text)
    text = _RATING_WIDGET.sub("", text)
    text = _EXPERT_CTA.sub("", text)
    text = _TESTIMONIALS_BLOCK.sub("", text)   # must come before BOOK_CTA
    text = _FOOTER_CTA.sub("", text)
    text = _FOOTER_NAV.sub("", text)
    text = _SUPPORT_BLOCK.sub("", text)
    text = _LEGAL.sub("", text)
    text = _GLOSSARY_SIDEBAR.sub("", text)
    text = _GLOSSARY_SIDEBAR_SHORT.sub("", text)
    text = _OTHER_COMPARISONS.sub("", text)
    text = _POLICY_WIDGET.sub("", text)
    text = _RECENT_SEARCHES.sub("", text)
    text = _PHONE_DUP.sub(r"\1", text)
    text = _BOOK_CTA.sub("", text)
    text = _SOCIAL_HANDLES.sub("", text)

    # Collapse whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


# ── Insurer normalization ─────────────────────────────────────────────────────
INSURER_MAP: dict[str, str] = {
    "star-health":           "Star Health",
    "hdfc-ergo":             "HDFC Ergo",
    "niva-bupa":             "Niva Bupa",
    "care":                  "Care Health",
    "care-health":           "Care Health",
    "icici-lombard":         "ICICI Lombard",
    "aditya-birla":          "Aditya Birla Health",
    "bajaj-general":         "Bajaj Allianz General",
    "manipal-cigna":         "Manipal Cigna",
    "new-india-assurance":   "New India Assurance",
    "national-insurance":    "National Insurance",
    "tata-aig":              "Tata AIG",
    "royal-sundaram":        "Royal Sundaram",
    "oriental-insurance":    "Oriental Insurance",
    "sbi":                   "SBI Health",
    "united-india":          "United India Insurance",
    "universal-sompo":       "Universal Sompo",
    "iffco-tokio":           "IFFCO Tokio",
    "digit":                 "Digit Insurance",
    "zuno":                  "Zuno Health",
    "acko":                  "Acko Health",
    "navi":                  "Navi Health",
    "reliance":              "Reliance Health",
    "tata-aia":              "Tata AIA Life",
    "hdfc-life":             "HDFC Life",
    "max-life":              "Max Life",
    "bajaj-life":            "Bajaj Allianz Life",
    "icici-prudential":      "ICICI Prudential Life",
    "aditya-birla-sun-life": "Aditya Birla Sun Life",
    "kotak-life":            "Kotak Life",
}

INSURER_STATS: dict[str, dict] = {
    "Star Health":           {"claim_settlement_ratio": "85%",  "network_hospitals": "14,000", "incurred_claim_ratio": "67%"},
    "HDFC Ergo":             {"claim_settlement_ratio": "~90%", "network_hospitals": "13,000+","incurred_claim_ratio": "~82%"},
    "Niva Bupa":             {"claim_settlement_ratio": "~91%", "network_hospitals": "10,000+","incurred_claim_ratio": "~80%"},
    "Care Health":           {"claim_settlement_ratio": "~90%", "network_hospitals": "22,000+","incurred_claim_ratio": "~62%"},
    "ICICI Lombard":         {"claim_settlement_ratio": "~84%", "network_hospitals": "15,000+","incurred_claim_ratio": "~79%"},
    "Aditya Birla Health":   {"claim_settlement_ratio": "~95%", "network_hospitals": "10,000+","incurred_claim_ratio": "~93%"},
    "Bajaj Allianz General": {"claim_settlement_ratio": "~87%", "network_hospitals": "8,000+", "incurred_claim_ratio": "~84%"},
    "Manipal Cigna":         {"claim_settlement_ratio": "~83%", "network_hospitals": "8,500+", "incurred_claim_ratio": "~75%"},
    "Tata AIG":              {"claim_settlement_ratio": "~86%", "network_hospitals": "9,000+", "incurred_claim_ratio": "~80%"},
    "Royal Sundaram":        {"claim_settlement_ratio": "~85%", "network_hospitals": "7,000+", "incurred_claim_ratio": "~78%"},
    "SBI Health":            {"claim_settlement_ratio": "~89%", "network_hospitals": "6,000+", "incurred_claim_ratio": "~76%"},
    "New India Assurance":   {"claim_settlement_ratio": "~91%", "network_hospitals": "8,000+", "incurred_claim_ratio": "~90%"},
    "National Insurance":    {"claim_settlement_ratio": "~90%", "network_hospitals": "6,500+", "incurred_claim_ratio": "~85%"},
    "Oriental Insurance":    {"claim_settlement_ratio": "~88%", "network_hospitals": "4,000+", "incurred_claim_ratio": "~89%"},
    "United India Insurance":{"claim_settlement_ratio": "~88%", "network_hospitals": "7,000+", "incurred_claim_ratio": "~87%"},
}


def get_stats(insurer: str) -> dict:
    return INSURER_STATS.get(insurer, {
        "claim_settlement_ratio": "",
        "network_hospitals": "",
        "incurred_claim_ratio": "",
    })


# ── Sentiment keywords ────────────────────────────────────────────────────────
POSITIVE_WORDS = {
    "excellent", "great", "amazing", "best", "fantastic", "helpful",
    "smooth", "quick", "easy", "recommended", "perfect", "outstanding",
    "superb", "wonderful", "brilliant", "good", "satisfied", "happy",
    "pleased", "effortless", "seamless", "professional", "knowledgeable",
    "friendly", "reliable", "trustworthy", "love", "kudos", "unmatched",
    "top", "appreciate", "awesome", "relief", "excellent", "star",
}
NEGATIVE_WORDS = {
    "bad", "poor", "worst", "horrible", "terrible", "denied", "rejected",
    "pathetic", "useless", "fraud", "cheat", "scam", "arrogant", "slow",
    "delay", "delayed", "disappointing", "disappointed", "unacceptable",
    "rude", "unprofessional", "unhelpful", "avoid", "nightmare",
    "frustrating", "annoying", "waste", "issue", "problem", "trouble",
    "complaint", "unfair", "harassment", "arogant",
}

TOPIC_KEYWORDS: dict[str, list[str]] = {
    "claims":           ["claim", "settlement", "settled", "reject", "denied", "approval"],
    "customer_support": ["support", "advisor", "agent", "service", "help", "call", "response", "staff", "team"],
    "premium":          ["premium", "price", "cost", "afford", "cheap", "expensive", "fee"],
    "cashless":         ["cashless", "network hospital", "empanelled", "tpa"],
    "maternity":        ["maternity", "pregnancy", "delivery", "newborn", "childbirth"],
    "renewal":          ["renewal", "renew", "renewed", "continuity"],
    "reimbursement":    ["reimburs", "out-of-pocket", "receipt", "invoice", "reimburse"],
    "hospital_network": ["hospital", "network", "empanelled"],
    "waiting_period":   ["waiting period", "pre-existing", "ped"],
    "covid":            ["covid", "corona", "pandemic"],
    "diabetes":         ["diabetes", "diabetic", "sugar"],
    "senior_citizen":   ["senior", "elderly", "old age"],
    "family_floater":   ["family floater", "family plan", "floater"],
    "ombudsman":        ["ombudsman", "grievance", "escalat"],
}


def detect_sentiment(text: str) -> str:
    words = set(re.findall(r"\b\w+\b", text.lower()))
    pos = len(words & POSITIVE_WORDS)
    neg = len(words & NEGATIVE_WORDS)
    return "positive" if pos > neg else "negative" if neg > pos else "neutral"


def detect_topics(text: str) -> list[str]:
    tl = text.lower()
    return [t for t, kws in TOPIC_KEYWORDS.items() if any(k in tl for k in kws)]


# ── Tag generation ────────────────────────────────────────────────────────────
TAG_CHECKS: dict[str, list[str]] = {
    "cashless":         ["cashless"],
    "reimbursement":    ["reimburs"],
    "claim":            ["claim"],
    "family_floater":   ["family floater", "family plan", "floater"],
    "maternity":        ["maternity", "pregnancy"],
    "senior_citizen":   ["senior citizen", "elderly"],
    "diabetes":         ["diabetes", "diabetic"],
    "chronic_disease":  ["chronic", "pre-existing", "ped"],
    "covid":            ["covid", "corona"],
    "hiv":              ["hiv"],
    "waiting_period":   ["waiting period"],
    "no_claim_bonus":   ["no claim bonus", "ncb"],
    "room_rent":        ["room rent"],
    "co_payment":       ["co-pay", "copay"],
    "domiciliary":      ["domiciliary"],
    "ayush":            ["ayush"],
    "opd":              ["outpatient", "opd"],
    "restoration":      ["restoration"],
    "network_hospital": ["network hospital"],
    "exclusion":        ["exclus"],
    "premium":          ["premium"],
    "sub_limit":        ["sub-limit", "sublimit"],
    "deductible":       ["deductible"],
    "top_up":           ["top-up", "super top"],
    "critical_illness": ["critical illness"],
    "portability":      ["portab"],
    "ombudsman":        ["ombudsman"],
    "term_insurance":   ["term insurance", "term plan", "life cover"],
    "health_insurance": ["health insurance", "health plan", "medical insurance"],
}


def detect_tags(text: str, insurer: str, extra: Optional[list] = None) -> list[str]:
    tl = text.lower()
    tags: set[str] = set(extra or [])
    if insurer:
        tags.add(insurer.lower().replace(" ", "_"))
    for tag, kws in TAG_CHECKS.items():
        if any(k in tl for k in kws):
            tags.add(tag)
    return sorted(tags)


# ── ID & summary helpers ──────────────────────────────────────────────────────
def make_id(base: str) -> str:
    return hashlib.md5(base.encode()).hexdigest()[:16]


def summarize(text: str, max_chars: int = 300) -> str:
    sents = re.split(r"(?<=[.!?])\s+", text)
    out = ""
    for s in sents:
        if len(out) + len(s) <= max_chars:
            out += s + " "
        else:
            break
    return out.strip()


def priority(content_type: str, has_insurer: bool, word_count: int) -> int:
    base = {
        "claims_process": 9, "cashless_claim": 9, "reimbursement": 9,
        "comparison": 8, "policy_feature": 8, "faq": 8, "exclusion": 8,
        "eligibility": 8, "premium": 7, "review": 6,
        "customer_support": 5, "support": 5,
    }.get(content_type, 5)
    if has_insurer:
        base = min(base + 1, 10)
    if word_count > 400:
        base = min(base + 1, 10)
    return base


# ── URL classifier ────────────────────────────────────────────────────────────
def classify_url(url: str) -> tuple[str, str, str, str]:
    """Returns (insurance_type, category, content_type, insurer_slug)"""
    path = url.replace("https://joinditto.in/", "").rstrip("/")

    # Health reviews
    m = re.match(r"health-insurance/([a-z\-]+)/reviews$", path)
    if m:
        return "health", "insurer_reviews", "review", m.group(1)

    # Health compare plans
    if re.match(r"health-insurance/compare-plans/", path):
        return "health", "plan_comparison", "comparison", ""

    # Health glossary
    m = re.match(r"health-insurance/glossary/(.+)$", path)
    if m:
        return "health", "glossary", "faq", ""

    # Health insurer sub-pages
    m = re.match(r"health-insurance/([a-z\-]+)/(.+)$", path)
    if m:
        slug, sub = m.group(1), m.group(2)
        if "faq" in sub:
            return "health", "faq_page", "faq", slug
        if "claim" in sub:
            return "health", "claims", "claims_process", slug
        return "health", "insurer_subpage", "policy_feature", slug

    # Health insurer root pages
    m = re.match(r"health-insurance/([a-z\-]+)$", path)
    if m:
        slug = m.group(1)
        if slug in {"articles", "compare-plans", "checklist", "glossary"}:
            return "health", "health_general", "policy_feature", ""
        return "health", "insurer_overview", "policy_feature", slug

    # General health-insurance pages
    if path.startswith("health-insurance/"):
        return "health", "health_general", "policy_feature", ""

    # Term reviews
    m = re.match(r"term-insurance/([a-z\-]+)/reviews$", path)
    if m:
        return "term", "insurer_reviews", "review", m.group(1)

    # Term compare plans
    if re.match(r"term-insurance/compare-plans/", path):
        return "term", "plan_comparison", "comparison", ""

    # Term insurer pages
    m = re.match(r"term-insurance/([a-z\-]+)/?(.*)$", path)
    if m:
        return "term", "insurer_page", "policy_feature", m.group(1)

    # Articles
    if re.match(r"articles/", path):
        if "health" in path:
            return "health", "article", "policy_feature", ""
        if "term" in path or "life" in path:
            return "term", "article", "policy_feature", ""
        return "general", "article", "policy_feature", ""

    # Claims assistance
    if "claim" in path:
        return "general", "claims_page", "claims_process", ""

    # Contact/support
    if "contact" in path:
        return "general", "support_page", "customer_support", ""

    return "general", "general", "policy_feature", ""


def resolve_insurer(slug: str, url: str = "") -> str:
    """Return normalised human-readable insurer name from slug or URL."""
    if slug and slug in INSURER_MAP:
        return INSURER_MAP[slug]
    for s, name in INSURER_MAP.items():
        if s in url:
            return name
    return ""


# ── Chunking ──────────────────────────────────────────────────────────────────
APPROX_CPT   = 4       # chars per token
MIN_CHARS    = 400 * APPROX_CPT   # 1,600
MAX_CHARS    = 800 * APPROX_CPT   # 3,200
OVERLAP_CHARS = 75 * APPROX_CPT  # 300


def sentence_split(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n\n+", text) if s.strip()]


def smart_chunk(text: str) -> list[str]:
    if not text:
        return []
    sentences = sentence_split(text)
    chunks: list[str] = []
    current: list[str] = []
    cur_len = 0

    for sent in sentences:
        slen = len(sent)
        if cur_len + slen > MAX_CHARS and current:
            chunk_val = " ".join(current)
            if len(chunk_val) >= MIN_CHARS:
                chunks.append(chunk_val)
            # overlap
            overlap: list[str] = []
            olen = 0
            for s in reversed(current):
                if olen + len(s) > OVERLAP_CHARS:
                    break
                overlap.insert(0, s)
                olen += len(s)
            current, cur_len = overlap, olen
        current.append(sent)
        cur_len += slen

    if current:
        val = " ".join(current)
        if len(val) > 100:
            chunks.append(val)

    return chunks


def dedup(records: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for r in records:
        fp = hashlib.md5(r.get("content", "")[:200].encode()).hexdigest()
        if fp not in seen:
            seen.add(fp)
            out.append(r)
    return out


# ── Record builders ───────────────────────────────────────────────────────────
def build_chunk(
    text: str, idx: int, url: str, title: str,
    insurer: str, ins_type: str, content_type: str,
    category: str, plan_name: str, scraped_at: str, word_count: int,
) -> dict:
    st = get_stats(insurer)
    return {
        "id": make_id(f"{url}:c{idx}:{text[:40]}"),
        "insurance_company": insurer,
        "insurance_type": ins_type,
        "plan_name": plan_name,
        "category": category,
        "content_type": content_type,
        "title": title,
        "content": text,
        "summary": summarize(text),
        "tags": detect_tags(text, insurer),
        "metadata": {
            "claim_settlement_ratio": st["claim_settlement_ratio"],
            "network_hospitals":      st["network_hospitals"],
            "incurred_claim_ratio":   st["incurred_claim_ratio"],
            "country": "India",
            "source": url,
            "last_updated": scraped_at,
            "review_sentiment": "",
            "coverage_type": ins_type,
            "priority_score": priority(content_type, bool(insurer), word_count),
            "chunk_index": idx,
        },
    }


# ── REVIEW extractor (v2) ─────────────────────────────────────────────────────
# Ditto review format (all on one flat line, no newlines between reviews):
#   "S Shreeya Gupta Bhaya Good policy No complaints…  S Soham prajapati Best insurance…"
# Pattern: single uppercase letter, space, then Title-case name(s), then title/body text,
# until the NEXT occurrence of the same pattern.
_REVIEW_SPLITTER = re.compile(
    r"(?:^|\s)([A-Z])\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?=[A-Z])",
)


def extract_reviews(clean_text: str, insurer: str, url: str, scraped_at: str) -> list[dict]:
    """
    Parse flat-text review blocks from /reviews pages.
    Reviews are identified by the pattern: INITIAL FIRSTNAME [LASTNAME] TITLE text…
    They are concatenated on a single line (no newlines between them).
    """
    # Find the start of the review section (after the stats block)
    review_section = clean_text
    stats_end = re.search(
        r"Incurred Claim Ratio.*?\d+%", clean_text, re.IGNORECASE
    )
    if stats_end:
        review_section = clean_text[stats_end.end():]

    # Each review starts with: SINGLE_LETTER SPACE CAPITALIZED_WORD(S) CAPITALIZED_TITLE
    # We split on the boundary between one review's text and the next review's initial+name
    # Pattern: letter, 1-3 name words, then a short (<=8 word) title, then body
    review_pattern = re.compile(
        r"(?<!\w)([A-Z])\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+([A-Z][^\n]{5,80}?)(?=\s+(?:[A-Z]\s+[A-Z][a-z]|\Z))",
        re.DOTALL,
    )

    # Approach: find all positions where a new reviewer starts
    # A reviewer starts with: space + single uppercase letter + space + Capitalized name
    boundary = re.compile(r"(?<=[a-z.!?])\s+([A-Z])\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+")
    positions = [(0, 0)]  # (start_of_reviewer_content, start_of_body)
    for m in boundary.finditer(review_section):
        positions.append((m.start(), m.end()))

    records: list[dict] = []
    st = get_stats(insurer)

    for i, (seg_start, body_start) in enumerate(positions):
        seg_end = positions[i + 1][0] if i + 1 < len(positions) else len(review_section)
        segment = review_section[seg_start:seg_end].strip()

        # Extract reviewer initial + name from segment start
        hdr = re.match(r"^([A-Z])\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(.*)", segment, re.DOTALL)
        if not hdr:
            continue

        reviewer_name = hdr.group(2).strip()
        body = hdr.group(3).strip()

        if not body or len(body) < 15:
            continue

        # First sentence/phrase is usually the review title (short, <=60 chars)
        title_match = re.match(r"^(.{5,60}?)(?:\s{2,}|\.\s+)(.+)", body, re.DOTALL)
        if title_match and len(title_match.group(1)) <= 60:
            rev_title = title_match.group(1).strip().rstrip(".")
            rev_text  = title_match.group(2).strip()
        else:
            rev_title = ""
            rev_text  = body

        if len(rev_text) < 15:
            rev_text = body
            rev_title = ""

        sentiment = detect_sentiment(rev_text)
        topics    = detect_topics(rev_text)
        tags      = detect_tags(rev_text, insurer, ["review"] + topics)

        records.append({
            "id": make_id(f"{url}:rev:{reviewer_name}:{rev_text[:30]}"),
            "insurance_company": insurer,
            "insurance_type": "health" if "health" in url else "term",
            "plan_name": "",
            "category": "review",
            "content_type": "review",
            "title": rev_title or f"{insurer} — customer review",
            "reviewer_name": reviewer_name,
            "content": rev_text,
            "summary": rev_text[:200],
            "tags": tags,
            "metadata": {
                "claim_settlement_ratio": st["claim_settlement_ratio"],
                "network_hospitals":      st["network_hospitals"],
                "incurred_claim_ratio":   st["incurred_claim_ratio"],
                "country": "India",
                "source": url,
                "last_updated": scraped_at,
                "review_sentiment": sentiment,
                "coverage_type": "health" if "health" in url else "term",
                "priority_score": 6,
                "topics": topics,
            },
        })

    return records


# ── INSURER STATS extractor from review page ──────────────────────────────────
def extract_insurer_stats(text: str) -> dict:
    csr = re.search(r"Claim Settlement Ratio\s*[-–]\s*(\d+(?:\.\d+)?)\s*%", text, re.IGNORECASE)
    nih = re.search(r"Network Hospitals\s*[-–]\s*([0-9,]+)", text, re.IGNORECASE)
    icr = re.search(r"Incurred Claim Ratio\s*[-–]\s*(\d+(?:\.\d+)?)\s*%", text, re.IGNORECASE)
    return {
        "claim_settlement_ratio": (csr.group(1) + "%") if csr else "",
        "network_hospitals":       nih.group(1)          if nih else "",
        "incurred_claim_ratio":   (icr.group(1) + "%") if icr else "",
    }


def build_insurer_profile(
    clean_text: str, insurer: str, ins_type: str,
    url: str, scraped_at: str, live_stats: dict,
) -> dict:
    st = get_stats(insurer)
    # Override with live-scraped stats if available
    if live_stats.get("claim_settlement_ratio"):
        st = live_stats

    # Founded sentence
    # Strip "Buy Insurance" prefix that sometimes survives noise removal
    clean_text = re.sub(r"^Buy Insurance\s+", "", clean_text)
    founded = re.search(r"Founded in \d{4}[^.]+\.", clean_text)
    # Try to grab longer meaningful text: founded sentence + next 1-2 sentences
    if founded:
        start = founded.start()
        overview_raw = clean_text[start:start + 600]
        overview_text = overview_raw
    else:
        # Skip any navigation-like prefix up to first insurance-related keyword
        first_ins = re.search(
            r"(?:Insurance|insurer|health|policy|claim|hospital|founded)",
            clean_text, re.IGNORECASE
        )
        overview_text = clean_text[first_ins.start():first_ins.start()+500] if first_ins else clean_text[:500]

    return {
        "id": make_id(f"profile:{insurer}:{ins_type}"),
        "insurance_company": insurer,
        "insurance_type": ins_type,
        "plan_name": "",
        "category": "insurer_overview",
        "content_type": "policy_feature",
        "title": f"{insurer} — Insurer Profile",
        "content": overview_text,
        "summary": overview_text[:300],
        "tags": detect_tags(clean_text, insurer, ["insurer_profile"]),
        "metadata": {
            "claim_settlement_ratio": st.get("claim_settlement_ratio", ""),
            "network_hospitals":      st.get("network_hospitals", ""),
            "incurred_claim_ratio":   st.get("incurred_claim_ratio", ""),
            "country": "India",
            "source": url,
            "last_updated": scraped_at,
            "review_sentiment": "",
            "coverage_type": ins_type,
            "priority_score": 8,
        },
    }


# ── GLOSSARY / FAQ extractor ──────────────────────────────────────────────────
def extract_glossary_faq(
    clean_text: str, url: str, scraped_at: str,
) -> Optional[dict]:
    """Extract the definition from a /glossary/<term> page as a FAQ record."""
    term_slug = url.split("/glossary/")[-1].replace("-", " ")
    term_title = term_slug.title()

    # The page has: "Health Insurance Glossary <Term Title> <definition text> <sidebar>"
    # After noise removal the sidebar is gone; find the definition between term header and end
    defn_match = re.search(
        rf"{re.escape(term_title)}\s+(.+?)(?:\s+\d\.\d\s|\Z)",
        clean_text, re.DOTALL | re.IGNORECASE,
    )
    if not defn_match:
        # Fallback: first substantive paragraph after "Glossary"
        gloss_match = re.search(r"Glossary\s+(.+)", clean_text, re.DOTALL)
        if gloss_match:
            defn_text = gloss_match.group(1)[:800].strip()
        else:
            return None
    else:
        defn_text = defn_match.group(1).strip()[:800]

    # Strip any alphabetical index leakage (e.g. "Sub-Limit Sum Insured T Terminal...")
    defn_text = re.sub(
        r"(?:[A-Z]\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+){4,}", "", defn_text
    ).strip()

    if len(defn_text) < 20:
        return None

    question = f"What is '{term_title}' in health insurance?"
    content  = f"Q: {question}\n\nA: {defn_text}"
    tags     = detect_tags(defn_text, "", ["faq", "glossary", term_slug.replace(" ", "_")])

    return {
        "id": make_id(f"faq:{url}"),
        "insurance_company": "",
        "insurance_type": "health",
        "plan_name": "",
        "category": "glossary",
        "content_type": "faq",
        "title": question,
        "question": question,
        "answer": defn_text,
        "content": content,
        "summary": defn_text[:200],
        "tags": tags,
        "metadata": {
            "claim_settlement_ratio": "",
            "network_hospitals": "",
            "incurred_claim_ratio": "",
            "country": "India",
            "source": url,
            "last_updated": scraped_at,
            "review_sentiment": "",
            "coverage_type": "health",
            "priority_score": 8,
        },
    }


# ── CLAIMS extractor ──────────────────────────────────────────────────────────
_EMERGENCY_HOSP = re.compile(
    r"Emergency Hospitalization\s+(.*?)(?=Planned Treatment|Reimbursement|How to make|FILE A CLAIM|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_PLANNED_HOSP = re.compile(
    r"Planned Treatment\s+(.*?)(?=How to make|Reimbursement|FILE A CLAIM|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_REIMBURSEMENT_PROC = re.compile(
    r"[Rr]eimbursement(?: [Bb]asis)?\s+(.*?)(?=How to make a claim.*term|FILE A CLAIM|$)",
    re.DOTALL,
)
_TERM_CLAIM = re.compile(
    r"term insurance policy.*?\n(.*?)(?=\Z|FILE A CLAIM)",
    re.DOTALL | re.IGNORECASE,
)
_ESCALATION = re.compile(
    r"escalat\w*.*?\n(.*?)(?=ombudsman|document|\Z)",
    re.DOTALL | re.IGNORECASE,
)
_OMBUDSMAN = re.compile(
    r"[Oo]mbudsman(.*?)(?=\Z|FILE A CLAIM|escalat)",
    re.DOTALL,
)


def extract_claims(
    clean_text: str, insurer: str, ins_type: str,
    url: str, scraped_at: str,
) -> list[dict]:
    st = get_stats(insurer)
    records: list[dict] = []

    sections = [
        ("cashless_claim",  _EMERGENCY_HOSP,    "Emergency / Cashless Claim Process"),
        ("hospitalization",  _PLANNED_HOSP,     "Planned Hospitalization Process"),
        ("reimbursement",   _REIMBURSEMENT_PROC,"Reimbursement Claim Process"),
        ("claims_process",  _TERM_CLAIM,        "Term Insurance Claim Process"),
        ("grievance",       _ESCALATION,        "Claim Escalation Process"),
        ("grievance",       _OMBUDSMAN,         "Ombudsman Process"),
    ]

    for ct, pat, label in sections:
        m = pat.search(clean_text)
        if not m:
            continue
        body = m.group(1).strip() if m.lastindex else m.group(0).strip()
        body = body[:2000]
        if len(body) < 80:
            continue
        tags = detect_tags(body, insurer, [ct, "claims"])
        records.append({
            "id": make_id(f"claim:{url}:{ct}"),
            "insurance_company": insurer or "Ditto / General",
            "insurance_type": ins_type,
            "plan_name": "",
            "category": "claims",
            "content_type": ct,
            "title": f"{insurer or 'General'} — {label}",
            "content": body,
            "summary": summarize(body),
            "tags": tags,
            "metadata": {
                "claim_settlement_ratio": st["claim_settlement_ratio"],
                "network_hospitals":      st["network_hospitals"],
                "incurred_claim_ratio":   st["incurred_claim_ratio"],
                "country": "India",
                "source": url,
                "last_updated": scraped_at,
                "review_sentiment": "",
                "coverage_type": ins_type,
                "priority_score": 9,
            },
        })

    return records


# ── COMPARISON extractor ──────────────────────────────────────────────────────
_CONCLUSION = re.compile(
    r"Final Conclusion\s+(.*?)(?:Other .{3,60}? Comparisons|\Z)",
    re.DOTALL,
)
_FEATURE_BLOCKS = {
    "co_payment":    re.compile(r"(?:co.?payment|co.?pay)[^\n]{0,200}", re.IGNORECASE),
    "room_rent":     re.compile(r"room rent[^\n]{0,200}", re.IGNORECASE),
    "waiting_period":re.compile(r"waiting period[^\n]{0,200}", re.IGNORECASE),
    "no_claim_bonus":re.compile(r"no.?claim bonus[^\n]{0,200}", re.IGNORECASE),
    "maternity":     re.compile(r"maternity[^\n]{0,200}", re.IGNORECASE),
    "domiciliary":   re.compile(r"domiciliary[^\n]{0,200}", re.IGNORECASE),
    "ayush":         re.compile(r"ayush[^\n]{0,200}", re.IGNORECASE),
    "pre_post_hosp": re.compile(r"pre and post hospitalization[^\n]{0,200}", re.IGNORECASE),
    "sub_limits":    re.compile(r"sub.?limit[^\n]{0,200}", re.IGNORECASE),
    "opd":           re.compile(r"out patient[^\n]{0,200}", re.IGNORECASE),
    "restoration":   re.compile(r"restoration[^\n]{0,200}", re.IGNORECASE),
}


def extract_comparison(
    clean_text: str, url: str, title: str, scraped_at: str,
) -> dict:
    slug = url.split("/compare-plans/")[-1]
    parts = slug.split("-vs-")
    plan_a_slug = parts[0] if parts else slug
    plan_b_slug = parts[1] if len(parts) > 1 else ""
    plan_a = plan_a_slug.replace("-", " ").title()
    plan_b = plan_b_slug.replace("-", " ").title()

    # Identify insurers
    insurers: set[str] = set()
    for s, name in INSURER_MAP.items():
        if s in plan_a_slug or s in plan_b_slug:
            insurers.add(name)
    insurer_str = " vs ".join(sorted(insurers)) if insurers else "Multiple Insurers"

    # Extract feature comparisons
    features: dict[str, str] = {}
    for feat, pat in _FEATURE_BLOCKS.items():
        m = pat.search(clean_text)
        if m:
            features[feat] = m.group(0)[:200]

    conclusion = ""
    cm = _CONCLUSION.search(clean_text)
    if cm:
        conclusion = cm.group(1).strip()[:600]

    tags = detect_tags(clean_text, insurer_str, ["comparison"])

    return {
        "id": make_id(url),
        "insurance_company": insurer_str,
        "insurance_type": "health" if "health" in url else "term",
        "plan_name": f"{plan_a} vs {plan_b}",
        "plan_a": plan_a,
        "plan_b": plan_b,
        "category": "comparison",
        "content_type": "comparison",
        "title": title or f"{plan_a} vs {plan_b}",
        "content": clean_text[:2500],
        "summary": f"{plan_a} vs {plan_b}. " + (conclusion[:200] if conclusion else ""),
        "conclusion": conclusion,
        "features_compared": features,
        "tags": tags,
        "metadata": {
            "claim_settlement_ratio": "",
            "network_hospitals": "",
            "incurred_claim_ratio": "",
            "country": "India",
            "source": url,
            "last_updated": scraped_at,
            "review_sentiment": "",
            "coverage_type": "health" if "health" in url else "term",
            "priority_score": priority("comparison", bool(insurers), len(clean_text.split())),
        },
    }


# ── Main pipeline ─────────────────────────────────────────────────────────────
def run() -> dict:
    log.info("=" * 64)
    log.info("Ditto RAG ETL Pipeline v2.0  starting")
    log.info(f"Input : {INPUT_FILE}")
    log.info(f"Output: {OUTPUT_DIR}")
    log.info("=" * 64)

    raw_records: list[dict] = []
    with open(INPUT_FILE, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                raw_records.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    log.info(f"Loaded {len(raw_records):,} raw records")

    all_chunks:      list[dict] = []
    faq_records:     list[dict] = []
    claim_records:   list[dict] = []
    review_records:  list[dict] = []
    compare_records: list[dict] = []
    profile_map:     dict[str, dict] = {}

    stats: dict[str, int] = defaultdict(int)

    for idx, raw in enumerate(raw_records):
        if idx % 1000 == 0:
            log.info(f"  [{idx:>5,}/{len(raw_records):,}] "
                     f"chunks={len(all_chunks):,} "
                     f"reviews={len(review_records):,} "
                     f"faqs={len(faq_records):,} "
                     f"claims={len(claim_records):,} "
                     f"comparisons={len(compare_records):,}")

        url        = raw.get("url", "")
        title      = raw.get("title", "")
        raw_text   = raw.get("text", "")
        word_count = raw.get("word_count", 0)
        scraped_at = raw.get("scraped_at", datetime.now(timezone.utc).strftime("%Y-%m-%d"))

        if word_count < 80:
            stats["skipped_too_short"] += 1
            continue

        ins_type, category, content_type, slug = classify_url(url)
        insurer = resolve_insurer(slug, url)
        clean   = remove_noise(raw_text)

        if len(clean) < 150:
            stats["skipped_empty_after_clean"] += 1
            continue

        # ── REVIEW pages ──────────────────────────────────────────────────
        if category == "insurer_reviews":
            live_stats = extract_insurer_stats(clean)
            reviews = extract_reviews(clean, insurer, url, scraped_at)
            review_records.extend(reviews)
            stats["reviews"] += len(reviews)

            # Build insurer profile once per insurer+type
            pkey = f"{insurer}:{ins_type}"
            if pkey not in profile_map and insurer:
                profile_map[pkey] = build_insurer_profile(
                    clean, insurer, ins_type, url, scraped_at, live_stats
                )

            # Also chunk the overview paragraph for generic retrieval
            for ci, chunk in enumerate(smart_chunk(clean)):
                all_chunks.append(build_chunk(
                    chunk, ci, url, title, insurer, ins_type,
                    "review", category, "", scraped_at, word_count,
                ))
            stats["review_pages"] += 1
            continue

        # ── COMPARISON pages ──────────────────────────────────────────────
        if category == "plan_comparison":
            comp = extract_comparison(clean, url, title, scraped_at)
            compare_records.append(comp)
            stats["comparisons"] += 1

            # Also chunk for generic retrieval
            for ci, chunk in enumerate(smart_chunk(clean)):
                all_chunks.append(build_chunk(
                    chunk, ci, url, title, insurer, ins_type,
                    "comparison", category, comp["plan_name"], scraped_at, word_count,
                ))
            continue

        # ── GLOSSARY pages ────────────────────────────────────────────────
        if category == "glossary":
            faq = extract_glossary_faq(clean, url, scraped_at)
            if faq:
                faq_records.append(faq)
                stats["faqs"] += 1
            continue  # Glossary terms are short; chunk not needed

        # ── CLAIMS pages ──────────────────────────────────────────────────
        if category in ("claims_page", "claims"):
            claims = extract_claims(clean, insurer, ins_type, url, scraped_at)
            claim_records.extend(claims)
            stats["claims_sections"] += len(claims)
            for ci, chunk in enumerate(smart_chunk(clean)):
                all_chunks.append(build_chunk(
                    chunk, ci, url, title, insurer, ins_type,
                    "claims_process", category, "", scraped_at, word_count,
                ))
            stats["claims_pages"] += 1
            continue

        # ── INSURER OVERVIEW pages ────────────────────────────────────────
        if category == "insurer_overview":
            pkey = f"{insurer}:{ins_type}"
            if pkey not in profile_map and insurer:
                profile_map[pkey] = build_insurer_profile(
                    clean, insurer, ins_type, url, scraped_at, {}
                )

        # ── GENERIC chunking ──────────────────────────────────────────────
        for ci, chunk in enumerate(smart_chunk(clean)):
            all_chunks.append(build_chunk(
                chunk, ci, url, title, insurer, ins_type,
                content_type, category, "", scraped_at, word_count,
            ))
        stats["generic_chunks"] += 1

    # ── Deduplicate ───────────────────────────────────────────────────────
    log.info("Deduplicating …")
    all_chunks      = dedup(all_chunks)
    faq_records     = dedup(faq_records)
    claim_records   = dedup(claim_records)
    review_records  = dedup(review_records)
    compare_records = dedup(compare_records)
    profiles        = dedup(list(profile_map.values()))

    # ── Write outputs ─────────────────────────────────────────────────────
    def w(name: str, recs: list[dict]) -> None:
        path = OUTPUT_DIR / name
        with open(path, "w", encoding="utf-8") as fh:
            for r in recs:
                fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        log.info(f"  {len(recs):>7,} records → {name}")

    log.info("Writing outputs …")
    w("cleaned_rag_chunks.jsonl",       all_chunks)
    w("faq_dataset.jsonl",              faq_records)
    w("claims_process_dataset.jsonl",   claim_records)
    w("review_sentiment_dataset.jsonl", review_records)
    w("comparison_dataset.jsonl",       compare_records)
    w("insurer_profiles.jsonl",         profiles)

    # ── Pipeline report ───────────────────────────────────────────────────
    report = {
        "pipeline_version":  "2.0.0",
        "run_timestamp":     datetime.now(timezone.utc).isoformat(),
        "input_file":        str(INPUT_FILE),
        "output_dir":        str(OUTPUT_DIR),
        "input_records":     len(raw_records),
        "output_summary": {
            "cleaned_rag_chunks":     len(all_chunks),
            "faq_records":            len(faq_records),
            "claims_process_records": len(claim_records),
            "review_records":         len(review_records),
            "comparison_records":     len(compare_records),
            "insurer_profiles":       len(profiles),
            "total_output_records":   sum([
                len(all_chunks), len(faq_records), len(claim_records),
                len(review_records), len(compare_records), len(profiles),
            ]),
        },
        "processing_stats": dict(stats),
        "content_type_dist":    _count_field(all_chunks, "content_type"),
        "insurer_dist":         _count_field(all_chunks, "insurance_company"),
        "insurance_type_dist":  _count_field(all_chunks, "insurance_type"),
        "category_dist":        _count_field(all_chunks, "category"),
        "top_tags":             _tag_freq(all_chunks),
        "review_sentiment_dist":_count_field(review_records, lambda r: r["metadata"]["review_sentiment"]),
    }

    rp = OUTPUT_DIR / "pipeline_report.json"
    with open(rp, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
    log.info(f"  Pipeline report → {rp.name}")

    # ── Summary ───────────────────────────────────────────────────────────
    log.info("")
    log.info("=" * 64)
    log.info("PIPELINE COMPLETE")
    log.info("=" * 64)
    log.info(f"  Input records         : {len(raw_records):>8,}")
    log.info(f"  RAG chunks (main)     : {len(all_chunks):>8,}")
    log.info(f"  FAQ / Glossary        : {len(faq_records):>8,}")
    log.info(f"  Claims records        : {len(claim_records):>8,}")
    log.info(f"  Review records        : {len(review_records):>8,}")
    log.info(f"  Comparison records    : {len(compare_records):>8,}")
    log.info(f"  Insurer profiles      : {len(profiles):>8,}")
    log.info(f"  Total output          : {report['output_summary']['total_output_records']:>8,}")
    log.info("=" * 64)
    return report


def _count_field(records: list[dict], key) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for r in records:
        val = key(r) if callable(key) else (r.get(key) or "unknown")
        counts[val] += 1
    return dict(sorted(counts.items(), key=lambda x: -x[1])[:30])


def _tag_freq(records: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for r in records:
        for tag in r.get("tags", []):
            counts[tag] += 1
    return dict(sorted(counts.items(), key=lambda x: -x[1])[:50])


if __name__ == "__main__":
    run()
