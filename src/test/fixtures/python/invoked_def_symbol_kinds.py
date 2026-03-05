"""Fixture that references many symbol-like constructs for invoked-definition extraction."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
import math as math_module
from typing import Callable, Generic, Optional, Protocol, TypeVar


# SymbolKind.Constant
GLOBAL_LIMIT: int = 10

# SymbolKind.String / Number / Boolean / Array / Object / Null (represented via Python values)
STRING_LITERAL = "fixture-text"
NUMBER_LITERAL = 42
BOOLEAN_LITERAL = True
ARRAY_LITERAL = [1, 2, 3]
OBJECT_LITERAL = {"kind": "object", "ok": True}
NULL_LITERAL = None


# SymbolKind.TypeParameter
TItem = TypeVar("TItem")


# SymbolKind.Interface (best-effort in Python via Protocol)
class Reader(Protocol):
    def read(self) -> str:
        ...


# SymbolKind.Enum + SymbolKind.EnumMember
class RunMode(Enum):
    DEBUG = "debug"
    SAFE = "safe"


# SymbolKind.Struct (best-effort in Python via dataclass)
@dataclass
class Payload:
    id: int
    name: str


# SymbolKind.Class / Field / Constructor / Property / Method / Operator
class GenericBox(Generic[TItem]):
    class_tag: str = "box"

    def __init__(self, value: TItem) -> None:
        self.value = value
        self._version = 1

    @property
    def version(self) -> int:
        return self._version

    def set_value(self, value: TItem) -> None:
        self.value = value
        self._version += 1

    def __add__(self, other: "GenericBox[TItem]") -> "GenericBox[list[TItem]]":
        return GenericBox([self.value, other.value])


# SymbolKind.Function
def build_payload(seed: int) -> Payload:
    return Payload(id=seed, name=f"payload-{seed}")


# SymbolKind.Event (best-effort in Python via callback registration pattern)
class EventHub:
    def __init__(self) -> None:
        self._listener: Optional[Callable[[str], None]] = None

    def register(self, listener: Callable[[str], None]) -> None:
        self._listener = listener

    def emit(self, message: str) -> None:
        if self._listener:
            self._listener(message)


def _consume_reader(reader: Reader) -> str:
    return reader.read()


def use_symbol_kinds(seed: int) -> str:
    # SymbolKind.Module
    ceil_seed = math_module.ceil(seed + 0.1)

    # SymbolKind.Variable
    payload = build_payload(ceil_seed)
    primary = GenericBox(payload.id)
    secondary = GenericBox(payload.id + 1)
    merged = primary + secondary
    primary.set_value(seed)
    mode = RunMode.DEBUG
    limit = GLOBAL_LIMIT

    # SymbolKind.Key via dict keys
    summary = {
        "mode": mode.value,
        "payload_name": payload.name,
        "version": primary.version,
        "merged": merged.value,
        "limit": limit,
        "text": STRING_LITERAL,
        "number": NUMBER_LITERAL,
        "flag": BOOLEAN_LITERAL,
        "array": ARRAY_LITERAL,
        "obj": OBJECT_LITERAL,
        "none": NULL_LITERAL,
    }

    hub = EventHub()
    hub.register(lambda _msg: None)
    hub.emit("tick")

    return str(summary)
