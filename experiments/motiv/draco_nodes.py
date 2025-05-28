from typing import Final, Generic, Literal, Optional, TypeVar, Union
from blib2to3 import pygram
syms: Final = pygram.python_symbols
LOGIC_OPERATORS: Final = {"and", "or"}
COMPARATORS: Final = {
    token.LESS,
    token.GREATER,
    token.EQEQUAL,
    token.NOTEQUAL,
    token.LESSEQUAL,
    token.GREATEREQUAL,
}
MATH_OPERATORS: Final = {
    token.VBAR,
    token.CIRCUMFLEX,
    token.AMPER,
    token.LEFTSHIFT,
    token.RIGHTSHIFT,
    token.PLUS,
    token.MINUS,
    token.STAR,
    token.SLASH,
    token.DOUBLESLASH,
    token.PERCENT,
    token.AT,
    token.TILDE,
    token.DOUBLESTAR,
}
VARARGS_PARENTS: Final = {
    syms.arglist,
    syms.argument,  # double star in arglist
    syms.trailer,  # single argument to call
    syms.typedargslist,
    syms.varargslist,  # lambdas
}
UNPACKING_PARENTS: Final = {
    syms.atom,  # single element of a list or set literal
    syms.dictsetmaker,
    syms.listmaker,
    syms.testlist_gexp,
    syms.testlist_star_expr,
    syms.subject_expr,
    syms.pattern,
}
BRACKET: Final = {
    token.LPAR: token.RPAR,
    token.LSQB: token.RSQB,
    token.LBRACE: token.RBRACE,
}
OPENING_BRACKETS: Final = set(BRACKET.keys())
CLOSING_BRACKETS: Final = set(BRACKET.values())
def is_vararg(leaf: Leaf, within: set[NodeType]) -> bool:
    """Return True if `leaf` is a star or double star in a vararg or kwarg.

    If `within` includes VARARGS_PARENTS, this applies to function signatures.
    If `within` includes UNPACKING_PARENTS, it applies to right hand-side
    extended iterable unpacking (PEP 3132) and additional unpacking
    generalizations (PEP 448).
    """
    if leaf.type not in VARARGS_SPECIALS or not leaf.parent:
        return False

    p = leaf.parent
    if p.type == syms.star_expr:
        # Star expressions are also used as assignment targets in extended
        # iterable unpacking (PEP 3132).  See what its parent is instead.
        if not p.parent:
            return False

        p = p.parent

    return p.type in within