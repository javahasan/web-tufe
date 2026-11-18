"""Türkçe metin normalleştirme (eşleme kuralları için)."""

from __future__ import annotations

import re
import unicodedata

_KATLAMA = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u", "â": "a", "î": "i", "û": "u"})


def tr_kucuk(s: str) -> str:
    """Türkçe kurallarıyla küçük harf (I -> ı, İ -> i)."""
    return s.replace("I", "ı").replace("İ", "i").lower()


def katla(s: str | None) -> str:
    """Küçük harfe çevirir, Türkçe karakterleri ASCII'ye katlar, boşlukları sadeleştirir.

    Eşleme kuralları da aynı fonksiyondan geçer; böylece "Çilek", "CİLEK" ve
    "cilek" aynı biçimde karşılaştırılır.
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFC", s)
    s = tr_kucuk(s).translate(_KATLAMA)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s).strip()
