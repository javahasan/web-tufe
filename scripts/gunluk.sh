#!/bin/zsh
# Web fiyat endeksi: günlük toplama + endeks hesabı.
# launchd her gün çalıştırır (~/Library/LaunchAgents/local.webtufe.gunluk.plist).
# Elle çalıştırmak için:  ~/web-tufe/scripts/gunluk.sh

set -u
KOK="$(cd "$(dirname "$0")/.." && pwd)"
CLI="$KOK/.venv/bin/webtufe"
TARIH=$(TZ=Europe/Istanbul date +%Y-%m-%d)
YIL=$(TZ=Europe/Istanbul date +%Y)
LOG="$KOK/logs/gunluk_$TARIH.log"
KILIT="$KOK/logs/.gunluk.kilit"

mkdir -p "$KOK/logs"
cd "$KOK" || exit 1

bildir() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Web fiyat endeksi\"" >/dev/null 2>&1 || true
}

# Aynı anda iki çalışma olmasın
if ! mkdir "$KILIT" 2>/dev/null; then
  echo "$(date '+%F %T') Başka bir çalışma sürüyor, çıkılıyor." >> "$LOG"
  exit 0
fi
trap 'rmdir "$KILIT" 2>/dev/null' EXIT

{
  echo "=== $(date '+%F %T') başladı ==="

  # Yeni yılın sepeti henüz yoksa TÜİK'ten almayı dene (TÜİK Ocak/Şubat'ta yayımlar)
  if [[ ! -f "$KOK/data/referans/sepet_$YIL.csv" ]]; then
    "$CLI" sepet --yil "$YIL" || echo "$YIL sepeti henüz yayımlanmamış; önceki yılın sepeti kullanılacak."
  fi

  # Toplama sürerken Mac uykuya geçmesin
  if ! /usr/bin/caffeinate -i "$CLI" topla; then
    echo "!!! Toplama hata verdi."
    bildir "Fiyat toplama hata verdi. Ayrıntı: logs/gunluk_$TARIH.log"
  fi

  if ! "$CLI" hesapla; then
    echo "!!! Endeks hesabı hata verdi."
    bildir "Endeks hesabı hata verdi. Ayrıntı: logs/gunluk_$TARIH.log"
    exit 1
  fi

  # Gerçek fiyatlardan günün manşetleri (data/cikti/mansetler_gercek.csv)
  "$CLI" mansetler || echo "!!! Manşetler üretilemedi."

  echo "=== $(date '+%F %T') bitti ==="
} >> "$LOG" 2>&1
