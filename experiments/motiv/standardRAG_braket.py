
if (
        leaf.type == token.DOT
        and leaf.parent
        and leaf.parent.type not in {syms.import_from, syms.dotted_name}
        and (previous is None or previous.type in CLOSING_BRACKETS)...

        The delimiter priorities returned here are from those delimiters that would
    cause a line break after themselves.

    Higher numbers are higher priority.
    """
    if leaf.type == token.COMMA:
 ...

 if leaf.value in LOGIC_OPERATORS and leaf.parent:
        return LOGIC_PRIORITY