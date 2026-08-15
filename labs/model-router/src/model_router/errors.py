"""Routing failures, kept distinct so a caller can tell "no model" from "too expensive"."""


class NoCapableModel(Exception):
    """No registered model declares support for this task class."""


class BudgetExceeded(Exception):
    """A capable model exists, but routing it would breach the budget."""
