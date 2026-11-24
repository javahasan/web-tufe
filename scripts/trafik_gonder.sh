#!/bin/bash
# Bu bilgisayarda toplanan İstanbul trafik indeksini (data/ham/ibb_trafik) ve hareketlilik
# çıktılarını (data/cikti/mobilite) GitHub'a gönderir. api.ibb.gov.tr GitHub sunucularından
# erişilemediği için bu veri GitHub Actions'ta değil, günlük yükleme görevinde toplanır.
#
# - Yalnızca bu iki klasörü commit'ler; çalışma ağacındaki diğer değişikliklere dokunmaz.
# - Yerelde bu klasörler dışında dosya değiştiren gönderilmemiş bir commit varsa hiçbir şey yapmaz.
# - Gönderim başarısız olursa kendi commit'ini geri alır (dosyalar değişmiş olarak kalır), böylece
#   scripts/git_guncelle.sh'deki `git pull --ff-only` bir sonraki çalışmada takılmaz.
# - git_guncelle.sh ile aynı kilidi kullanır.
set -euo pipefail
KOK="$(cd "$(dirname "$0")/.." && pwd)"
KILIT="${TMPDIR:-/tmp}/webtufe-git.kilit"
YOLLAR=(data/ham/ibb_trafik data/cikti/mobilite)

kilit_al() {
  for _ in $(seq 1 60); do
    if mkdir "$KILIT" 2>/dev/null; then
      trap 'rmdir "$KILIT"' EXIT
      return 0
    fi
    # 10 dakikadan eski kilit, yarıda kalmış bir çalışmadan kalmıştır
    if [ -n "$(find "$KILIT" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then rmdir "$KILIT" 2>/dev/null || true; fi
    sleep 5
  done
  echo "Kilit 5 dakikada alınamadı: $KILIT" >&2
  exit 1
}

kilit_al
cd "$KOK"

dal="$(git symbolic-ref --short HEAD)"
if [ "$dal" != "main" ]; then
  echo "Yerel kopya main dalında değil ($dal); trafik verisi gönderilmedi." >&2
  exit 1
fi
if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -f .git/MERGE_HEAD ]; then
  echo "Yarım kalmış bir rebase/merge var; trafik verisi gönderilmedi." >&2
  exit 1
fi

git fetch --quiet origin main
# Yerelde gönderilmemiş commit'ler yalnızca trafik klasörlerine dokunuyorsa (ör. önceki bir
# gönderim yarıda kaldıysa) onlar da gönderilir; başka dosyaya dokunan varsa dur.
yabanci="$(git log --format= --name-only origin/main..HEAD | grep -v -e '^$' -e '^data/ham/ibb_trafik/' -e '^data/cikti/mobilite/' || true)"
if [ -n "$yabanci" ]; then
  echo "Yerelde trafik dışı dosyalara dokunan gönderilmemiş commit var; trafik verisi gönderilmedi:" >&2
  echo "$yabanci" | sort -u >&2
  exit 1
fi

git add -- "${YOLLAR[@]}"
if git diff --cached --quiet -- "${YOLLAR[@]}"; then
  if [ -z "$(git rev-list origin/main..HEAD)" ]; then
    echo "Gönderilecek trafik değişikliği yok."
    exit 0
  fi
else
  son_saat="$(tail -n 1 data/ham/ibb_trafik/saatlik.csv | cut -d, -f1)"
  git commit --quiet --only \
    -m "Trafik verisi: ${son_saat}" \
    -m "İstanbul trafik indeksi (İBB) ve hareketlilik çıktıları; günlük yükleme görevinde toplandı." \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" \
    -- "${YOLLAR[@]}"
fi

for deneme in 1 2 3; do
  if git push --quiet origin HEAD:main; then
    echo "Gönderildi: $(git log -1 --format='%h %s')"
    exit 0
  fi
  echo "Gönderim reddedildi (deneme $deneme); GitHub'daki yeni commit'lerin üzerine alınıyor." >&2
  if ! git pull --quiet --rebase --autostash origin main; then
    git rebase --abort 2>/dev/null || true
    break
  fi
done

# Gönderilemedi: yerel trafik commit'lerini geri al, dosyalar değişmiş olarak kalsın
geri="$(git merge-base HEAD origin/main)"
git reset --quiet "$geri"
echo "Trafik verisi gönderilemedi; commit geri alındı, bir sonraki çalışmada yeniden denenecek." >&2
exit 1
