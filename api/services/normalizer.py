"""
Brabble → OpportunityOS Normalizer
====================================
Transforms raw Brabble listing JSON into our internal `opp_opportunities` schema.
This module isolates Brabble's exact field names/shapes from our database model,
so if Brabble changes a field name, only this file needs updating.

Key gotchas handled (from 08-EXTERNAL-API-INTEGRATION.md):
  - `kind`: "competition" → deadline = applications close; "contest" → deadline = start time
  - `prize.label` is often "See listing" with `prize.inr = null`
  - `city` can be "", "Remote", or a real city name
  - `eligibility` is a JSON array of strings
  - Expired listings are excluded by Brabble, but we flag disappeared ones ourselves
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def normalize_listing(raw: dict) -> dict | None:
    """
    Transform a single Brabble listing dict into our opp_opportunities row dict.
    Returns None if the listing is invalid (missing required fields).
    Skips-and-logs on bad data — never crashes the whole sync.
    """
    try:
        # ── Required fields ──────────────────────────────────────────
        external_id = raw.get("id")
        title = raw.get("title")
        url = raw.get("url")

        if not external_id or not title or not url:
            logger.warning(
                "Skipping listing with missing required fields: id=%s, title=%s",
                external_id, bool(title),
            )
            return None

        # ── Category normalization ───────────────────────────────────
        raw_type = raw.get("type", "").upper().strip()
        category_map = {
            "HACKATHON": "HACKATHON",
            "CASE STUDY": "CASE_STUDY",
            "CONTEST": "CONTEST",
            "CODING": "CODING",
            "INNOVATION": "INNOVATION",
            "DESIGN": "DESIGN",
            "COMPETITION": "COMPETITION",
            "QUIZ": "QUIZ",
        }
        category = category_map.get(raw_type, raw_type or "OTHER")

        # ── Mode normalization ───────────────────────────────────────
        raw_mode = raw.get("mode", "").upper().strip()
        if raw_mode not in ("ONLINE", "OFFLINE", "HYBRID"):
            raw_mode = "ONLINE"  # Default for unspecified modes

        # ── City normalization ───────────────────────────────────────
        # Brabble sends "", "Remote", or a real city name
        city = raw.get("city", "")
        if city in ("", "Remote"):
            city = None  # Store as NULL for online/remote events

        # ── Prize normalization ──────────────────────────────────────
        prize_data = raw.get("prize", {}) or {}
        prize_label = prize_data.get("label")
        prize_inr = prize_data.get("inr")
        # prize.inr can be null even when label exists (e.g. "See listing")
        if prize_inr is not None:
            try:
                prize_inr = int(prize_inr)
            except (ValueError, TypeError):
                prize_inr = None

        # ── Deadline normalization ───────────────────────────────────
        deadline_utc = None
        raw_deadline = raw.get("deadline")
        if raw_deadline:
            try:
                deadline_utc = datetime.fromisoformat(
                    raw_deadline.replace("Z", "+00:00")
                ).astimezone(timezone.utc).isoformat()
            except (ValueError, TypeError):
                logger.warning(
                    "Invalid deadline format for listing %s: %s",
                    external_id, raw_deadline,
                )

        # ── Eligibility ──────────────────────────────────────────────
        eligibility = raw.get("eligibility", [])
        if not isinstance(eligibility, list):
            eligibility = []

        desc = (raw.get("description") or "").strip()
        if not desc:
            cat_display = category.replace("_", " ").title()
            mode_text = "online" if raw_mode == "ONLINE" else (f"in-person in {city}" if city else "in-person") if raw_mode == "OFFLINE" else "in hybrid mode"
            org_phrase = f" organized by {(raw.get('organiser') or '').strip()}" if raw.get("organiser") else ""
            prize_phrase = f" Features prize pool of {prize_label}." if prize_label and prize_label != "See listing" else ""
            desc = f"Verified {cat_display.lower()}{org_phrase}, conducted {mode_text}.{prize_phrase} Hosted on {raw.get('platform') or 'official portal'}."

        # ── Build normalized record ──────────────────────────────────
        return {
            "external_id": external_id,
            "source": "brabble",
            "title": title.strip(),
            "organiser": (raw.get("organiser") or "").strip() or None,
            "category": category,
            "kind": raw.get("kind"),
            "platform": raw.get("platform"),
            "official_url": url,
            "share_url": raw.get("shareUrl"),
            "deadline_utc": deadline_utc,
            "mode": raw_mode,
            "city": city,
            "prize_label": prize_label,
            "prize_inr": prize_inr,
            "team_size": raw.get("team"),
            "fee": raw.get("fee"),
            "eligibility": eligibility,
            "registered_count": raw.get("registered"),
            "description": desc,
            "is_expired": False,
            "status": "approved",  # Brabble listings auto-approved
        }

    except Exception as e:
        logger.error(
            "Unexpected error normalizing listing %s: %s",
            raw.get("id", "unknown"), str(e)[:200],
        )
        return None


def normalize_batch(raw_listings: list) -> tuple[list, int]:
    """
    Normalize a batch of raw Brabble listings.
    Returns (normalized_list, skipped_count).
    """
    normalized = []
    skipped = 0

    for raw in raw_listings:
        result = normalize_listing(raw)
        if result is not None:
            normalized.append(result)
        else:
            skipped += 1

    logger.info(
        "Normalized %d listings, skipped %d invalid entries.",
        len(normalized), skipped,
    )
    return normalized, skipped
