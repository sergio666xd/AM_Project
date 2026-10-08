"""Canonical visibility values for content attached to a case."""

INTERNAL = "INTERNA"
CLIENT_VISIBLE = "CLIENTE"


def is_client_visible(value: str | None) -> bool:
    return value == CLIENT_VISIBLE
