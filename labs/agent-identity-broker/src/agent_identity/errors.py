"""Failure types, split by who is allowed to learn what.

Both carry a specific reason for the audit log. Neither reason reaches the client:
telling a caller which of five checks failed turns the endpoint into an oracle for
probing what a stolen token is missing. `app.py` maps both to bare 401/403.
"""


class TokenRejected(Exception):
    """A presented token failed validation at the resource server."""


class ExchangeDenied(Exception):
    """The authorization server refused to mint the requested token."""
