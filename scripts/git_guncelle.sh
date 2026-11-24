#!/bin/bash
# GitHub'daki son veriyi yerel kopyaya alır (git pull --ff-only).
# Zamanlanmış görevler aynı anda çalışabildiği için (ör. Mac uyandığında kaçırılan görevler
# birlikte başlar) çekme işlemi bir kilitle sıraya sokulur; iki pull aynı anda çalışırsa ikincisi
# yarım kalan çalışma ağacı yüzünden başarısız olur.
set -euo pipefail
KOK="$(cd "$(dirname "$0")/.." && pwd)"
KILIT="${TMPDIR:-/tmp}/webtufe-git.kilit"
for _ in $(seq 1 60); do
  if mkdir "$KILIT" 2>/dev/null; then
    trap 'rmdir "$KILIT"' EXIT
    cd "$KOK"
    git pull --ff-only
    exit 0
  fi
  # 10 dakikadan eski kilit, yarıda kalmış bir çalışmadan kalmıştır
  if [ -n "$(find "$KILIT" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then rmdir "$KILIT" 2>/dev/null || true; fi
  sleep 5
done
echo "Kilit 5 dakikada alınamadı: $KILIT" >&2
exit 1
