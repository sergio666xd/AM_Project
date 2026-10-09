"""Formatting helpers for user-visible dates and times."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

COLOMBIA = ZoneInfo("America/Bogota")


def format_colombia_datetime(value: datetime | None) -> str:
    """Format a stored UTC datetime for users in Colombia."""
    if value is None:
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(COLOMBIA).strftime("%d/%m/%Y %H:%M")
