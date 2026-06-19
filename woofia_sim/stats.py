"""Character ATK/HP stat scaling for XXL WOOFIA.

The displayed in-game stats are a deterministic function of five investment
inputs.  The exact formula was recovered from sectionhunk.moe's client bundle
(``/_app/immutable/nodes/2.*.js``) and verified against the site's rendered
values (e.g. Famido Lv60 -> ATK 9891 / HP 39937).

Formula (per stat, applied identically to ATK and HP)::

    stat = floor( (base + sigil_flat) * 1.05^(level-1) * (1 + V) * (1 + Ue) )

    sigil_flat = min(sigil_lvl, sigil_cap(evo, rarity, level))
    V          = 0.02 * min(pevo_lvl, pevo_cap(evo)) + 0.10 * triangular(evo)
    Ue         = compat_lvl * rune_coef(rarity)

where ``triangular(n) = n*(n+1)/2``.

Inputs (mirroring the site's sliders)
    level   : Char_Lvl   1..60   (character level)
    evo     : Evo_Lvl    0..5    (별 / star / evolution)
    pevo    : PEvo_Lvl   >=0     (post-evolution, capped by evo)
    sigil   : Sigil_Lvl  >=0     (시길 / sigil flat bonus, capped)
    compat  : Compat_Lvl >=0     (도장 / rune compatibility, user-specific)
"""
from __future__ import annotations

from dataclasses import dataclass

# Per-rarity rune-compatibility coefficient (site `ye(rarity)`).
_RUNE_COEF: dict[int, float] = {1: 0.0, 2: 0.0, 3: 0.03, 4: 0.04}

# Sigil flat-bonus by level threshold (site `ve` table). Highest threshold the
# level clears wins; only applies for evo >= 3 and rarity in {3, 4}.
_SIGIL_TABLE: tuple[tuple[int, int], ...] = (
    (60, 1000), (55, 900), (50, 800), (45, 700), (40, 600),
    (35, 500), (30, 400), (25, 300), (20, 200), (15, 100),
)

LEVEL_GROWTH_BASE = 1.05
MAX_LEVEL = 60
MAX_EVO = 5


def rune_coef(rarity: int) -> float:
    """Per-rarity rune coefficient; 0.0 for rarities without a rune system."""
    return _RUNE_COEF.get(rarity, 0.0)


def sigil_cap(evo: int, rarity: int, level: int) -> int:
    """Max sigil flat bonus available at this evo/rarity/level (site `ve`)."""
    if evo < 3 or rarity not in (3, 4):
        return 0
    for threshold, bonus in _SIGIL_TABLE:
        if level > threshold - 1:
            return bonus
    return 0


def pevo_cap(evo: int) -> int:
    """Max post-evolution level allowed for a given star/evo (site `Ee`)."""
    if evo >= MAX_EVO:
        return 0
    return (evo + 1) * 5 - 1


def _triangular(n: int) -> int:
    return n * (n + 1) // 2


@dataclass(frozen=True)
class Investment:
    """A character's investment state — the five stat-determining inputs."""

    level: int = MAX_LEVEL
    evo: int = 0
    pevo: int = 0
    sigil: int = 0
    compat: int = 0

    def normalized(self) -> "Investment":
        """Clamp inputs to valid ranges (mirrors the site's caps)."""
        level = max(1, min(self.level, MAX_LEVEL))
        evo = max(0, min(self.evo, MAX_EVO))
        pevo = max(0, min(self.pevo, pevo_cap(evo)))
        sigil = max(0, self.sigil)
        compat = max(0, self.compat)
        return Investment(level=level, evo=evo, pevo=pevo, sigil=sigil, compat=compat)


def scale_stat(base: int, rarity: int, inv: Investment) -> int:
    """Compute a final stat (ATK or HP) from its base value and investment.

    The same multiplier applies to ATK and HP, so callers pass each base
    separately. Returns the floored integer the game displays.
    """
    inv = inv.normalized()
    sigil_flat = min(inv.sigil, sigil_cap(inv.evo, rarity, inv.level))
    v = 0.02 * inv.pevo + 0.10 * _triangular(inv.evo)
    ue = inv.compat * rune_coef(rarity)
    level_mult = LEVEL_GROWTH_BASE ** max(0, inv.level - 1)
    return int((base + sigil_flat) * level_mult * (1 + v) * (1 + ue))


def scale_atk_hp(
    base_atk: int, base_hp: int, rarity: int, inv: Investment
) -> tuple[int, int]:
    """Return (atk, hp) for a character at the given investment."""
    return (
        scale_stat(base_atk, rarity, inv),
        scale_stat(base_hp, rarity, inv),
    )
