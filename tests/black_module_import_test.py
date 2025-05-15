import unittest
import sys
import io
import token
from black import _maybe_wrap_cms_in_parens
from typing import Collection, Optional
from blib2to3.pytree import Node, Leaf
from blib2to3.pgen2 import token as token_module
from blib2to3.pgen2.token import LPAR, RPAR, COLON
from blib2to3.pytree import Leaf, Node
from blib2to3.pgen2 import driver
from blib2to3.pygram import python_symbols as syms
from blib2to3.pgen2.parse import ParseError
from blib2to3.pytree import type_repr
from blib2to3.pytree import convert
from blib2to3.pytree import Base
from blib2to3.pytree import NL
from blib2to3.pytree import LeafPattern
from blib2to3.pytree import NodePattern
from blib2to3.pytree import WildcardPattern
from blib2to3.pytree import NegatedPattern
from blib2to3.pytree import AlternativePattern
from blib2to3.pytree import GroupPattern
from blib2to3.pytree import RepeatPattern
from blib2to3.pytree import GreedyRepeatPattern
from blib2to3.pytree import AnyPattern
from blib2to3.pytree import EndPattern
from blib2to3.pytree import Subpattern
from blib2to3.pytree import BranchPattern
from blib2to3.pytree import LiteralPattern
from blib2to3.pytree import TokenPattern
from blib2to3.pytree import SymbolPattern
from blib2to3.pytree import Alternative
from blib2to3.pytree import Group
from blib2to3.pytree import PositiveLookahead
from blib2to3.pytree import NegativeLookahead
from blib2to3.pytree import Optional
from blib2to3.pytree import ZeroOrMore
from blib2to3.pytree import OneOrMore
from blib2to3.pytree import Repeat
from blib2to3.pytree import GreedyRepeat
from blib2to3.pytree import Any
from blib2to3.pytree import End
from blib2to3.pytree import Subpattern
from blib2to3.pytree import Branch
from blib2to3.pytree import Literal
from blib2to3.pytree import Token
from blib2to3.pytree import Symbol
from blib2to3.pytree import Alternative
from blib2to3.pytree import Group
from blib2to3.pytree import PositiveLookahead
from blib2to3.pytree import NegativeLookahead
from blib2to3.pytree import Optional
from blib2to3.pytree import ZeroOrMore
from blib2to3.pytree import OneOrMore
from blib2to3.pytree import Repeat
from blib2to3.pytree import GreedyRepeat
from blib2to3.pytree import Any
from blib2to3.pytree import End
from blib2to3.pytree import Subpattern
from blib2to3.pytree import Branch
from blib2to3.pytree import Literal
from blib2to3.pytree import Token
from blib2to3.pytree import Symbol
from enum import Enum, auto

class Feature(Enum):
    PARENTHESIZED_CONTEXT_MANAGERS = auto()

class Mode:
    pass

class TestMaybeWrapCmsInParens(unittest.TestCase):
    def setUp(self):
        self.mode = Mode()
    
    def test_feature_not_present(self):
        node = Node(syms.with_stmt, [Leaf(token.NAME, 'with'), Leaf(token.NAME, 'a'), Leaf(token.COLON, ':')])
        features = set()
        _maybe_wrap_cms_in_parens(node, self.mode, features)
        self.assertEqual(len(node.children), 3)
    
    def test_node_children_less_than_2(self):
        node = Node(syms.with_stmt, [Leaf(token.NAME, 'with')])
        features = {Feature.PARENTHESIZED_CONTEXT_MANAGERS}
        _maybe_wrap_cms_in_parens(node, self.mode, features)
        self.assertEqual(len(node.children), 1)
    
    def test_already_atom(self):
        atom_node = Node(syms.atom, [Leaf(token.LPAR, '('), Leaf(token.NAME, 'a'), Leaf(token.RPAR, ')')])
        node = Node(syms.with_stmt, [Leaf(token.NAME, 'with'), atom_node, Leaf(token.COLON, ':')])
        features = {Feature.PARENTHESIZED_CONTEXT_MANAGERS}
        _maybe_wrap_cms_in_parens(node, self.mode, features)
        self.assertEqual(len(node.children), 3)
        self.assertEqual(node.children[1].type, syms.atom)
    
    def test_wrap_multiple_context_managers(self):
        cm1 = Leaf(token.NAME, 'a')
        cm2 = Leaf(token.NAME, 'b')
        node = Node(syms.with_stmt, [Leaf(token.NAME, 'with'), cm1, cm2, Leaf(token.COLON, ':')])
        features = {Feature.PARENTHESIZED_CONTEXT_MANAGERS}
        _maybe_wrap_cms_in_parens(node, self.mode, features)
        self.assertEqual(len(node.children), 3)
        self.assertEqual(node.children[1].type, syms.atom)
        atom_children = node.children[1].children
        self.assertEqual(atom_children[0].type, token.LPAR)
        self.assertEqual(atom_children[1].type, syms.testlist_gexp)
        self.assertEqual(atom_children[2].type, token.RPAR)
        testlist_children = atom_children[1].children
        self.assertEqual(len(testlist_children), 2)
        self.assertEqual(testlist_children[0], cm1)
        self.assertEqual(testlist_children[1], cm2)
    
    def test_no_colon_found(self):
        node = Node(syms.with_stmt, [Leaf(token.NAME, 'with'), Leaf(token.NAME, 'a')])
        features = {Feature.PARENTHESIZED_CONTEXT_MANAGERS}
        _maybe_wrap_cms_in_parens(node, self.mode, features)
        self.assertEqual(len(node.children), 2)

if __name__ == '__main__':
    unittest.main()