<p align="center">
  <img src="build/icon.png" width="96" alt="Eqo Partitura simgesi" />
</p>

<h1 align="center">Eqo Partitura</h1>

<p align="center"><b>Eqo Partitura · Echo Studio</b> — Echo Masterworks</p>

<p align="center">
  MusicXML notanızı, çalan notaların seçtiğiniz renkte parladığı akıcı bir nota videosuna dönüştürür.<br/>
  Windows ve Linux masaüstü uygulaması · MP4 (H.264 + AAC) / WebM (VP9 + Opus) · 10 dil · açık kaynak (MIT)
</p>

<p align="center">
  <a href="README.md">English</a>
</p>

![Önizleme](docs/screenshots/03-preview.png)

## Özellikler

- **Notayı bırakın, videoyu alın.** `.musicxml`, `.xml` ve sıkıştırılmış `.mxl` dosyaları desteklenir.
- **Kare kare kesin render.** Video ekran kaydı değildir; WebCodecs ile kare kare kodlanır. Süre, zamanlama ve kare hızı birebir doğrudur.
- **Parlayan aktif notalar.** Çalan notanın başı, sapı, kirişi, ek çizgileri, süslemeleri (tril, mordent…), fermatası, nüansı, crescendo çatalı ve pedal işareti birlikte parlar. Hazır renklerden birini, her zaman açık seçiciden istediğiniz rengi ya da kayıtlı renklerinizi kullanın. Nota alanı için açık/koyu tema seçebilir, imleç çizgisini açıp kapatabilirsiniz.
- **İstediğiniz yerden başlatın.** Sarma çubuğunu kullanın, bir notaya tıklayın, şeridi sürükleyin ya da ←/→ tuşlarına basın.
- **Dur işaretleri (fermata) hesaba katılır.** Fermatalı notalar varsayılan olarak ×2.0 tutulur (MuseScore ile aynı); bu oranı ×1–×6 arasında değiştirebilirsiniz.
- **Notadaki tempo otomatik.** Dosyada yazan tempo (♩ = 90 vb.) otomatik uygulanır; tempo değişimleri *elmas* işaretçilere dönüşür. Elmasları şeridin istediğiniz yerine ekleyebilir, düzenleyebilir ve silebilirsiniz.
- **Arka plan stüdyosu.** Arka plana görsel ya da döngülü video koyabilirsiniz; ölçek, opaklık, konum ve siyah-beyaz ayarlarıyla.
- **İsteğe bağlı müzik parçası.** MP3 / WAV / OGG / M4A / FLAC ekleyin ve başlangıç kaydırmasıyla (milisaniye hassasiyetinde) notalarla hizalayın. Ses seviyesini ayarlayabilir, isterseniz videoyu müzik bitene kadar uzatabilirsiniz. Ses videoya gömülür, önizlemede de senkron çalar.
- **Her formata uygun.** En/boy oranları 16:9, 9:16, 1:1, 4:3, 4:5; çözünürlükler 720p, 1080p, 2K, 4K; 24/25/30/60/120 FPS.
- **Doğrudan diske yazar.** Uzun 4K render'lar belleği doldurmaz: video seçtiğiniz dosyaya parça parça yazılır.
- **HD nota şeridi** dışa aktarımı: PNG, JPEG, WebP veya SVG.
- **Projeler.** Nota, arka plan, müzik ve tüm ayarları kaydedip yeniden açabilirsiniz.
- **10 dil:** Türkçe, English, Deutsch, Français, Español, Italiano, Português, Русский, 日本語, 中文.
- **İnternet gerekmez.** Tüm yazı tipleri uygulamaya gömülüdür, çalışırken hiçbir şey indirilmez.

## İndirme

En güncel sürümü **[Releases](../../releases)** sayfasından indirin. İki dosya da tek parçadır, kurulum gerekmez.

| Sistem | Dosya | |
| --- | --- | --- |
| Windows 10 / 11 (x64) | **`Eqo-Partitura.exe`** | Çift tıklayın. |
| Linux (x86_64), her dağıtım | **`Eqo-Partitura-x86_64.AppImage`** | Çalıştırma izni verin, sonra çift tıklayın veya çalıştırın. |

> **Windows:** dosyalar henüz kod imzalı olmadığından SmartScreen *"Windows bilgisayarınızı korudu"* uyarısı gösterebilir. **Ek bilgi → Yine de çalıştır** ile açabilirsiniz.

**Linux:** dosya yöneticisinde *Özellikler → İzinler* bölümünden *Dosyanın program olarak çalıştırılmasına izin ver*'i işaretleyin ya da terminalde:

```bash
chmod +x Eqo-Partitura-x86_64.AppImage
./Eqo-Partitura-x86_64.AppImage
```

AppImage statik AppImage çalışma zamanını kullanır, `libfuse2` gerektirmez. Güncel x86_64 dağıtımlar için hazırlanmıştır (Ubuntu, Debian, Fedora, Arch, openSUSE, Mint …). Alpine gibi musl tabanlı sistemlerde çalışmaz. Linux'ta Chromium'da AAC kodlayıcı olmadığından MP4 videoların sesi Opus olur (tarayıcılarda, VLC'de, YouTube'da ve çoğu oynatıcıda çalışır). Ayrıcalıksız kullanıcı ad alanlarını engelleyen sistemlerde (ör. Ubuntu 24.04 ve sonrası) başlatıcı, uygulamayı Chromium'un işletim sistemi düzeyindeki korumalı alanı olmadan açar; *Güvenlik* bölümündeki arayüz yalıtımı yerinde kalır. Menüde görünmesini isterseniz [Gear Lever](https://flathub.org/apps/it.mijorus.gearlever) veya AppImageLauncher gibi bir araç kullanabilirsiniz.

## Kullanım

1. **Ayarlar:** MusicXML dosyasını, FPS'i, en/boy oranını, çözünürlüğü ve vurgu rengini seçin.
2. **Arka plan:** İsterseniz görsel/video arka planı ve müzik parçasını ekleyin.
3. **Önizleme:** Oynatın (<kbd>Boşluk</kbd>); BPM'i, tempo elmaslarını, nota boyutunu ve müzik kaydırmasını ayarlayın.
4. **Çıktı:** MP4 veya WebM'i seçin, kayıt yerini belirleyin ve **Render işlemini başlat**'a tıklayın.

Kısayollar: <kbd>Boşluk</kbd> oynat/duraklat · <kbd>←</kbd>/<kbd>→</kbd> önceki/sonraki nota · <kbd>Shift</kbd>+<kbd>←</kbd>/<kbd>→</kbd> ±5 sn · <kbd>Home</kbd>/<kbd>End</kbd> başa/sona · <kbd>Ctrl</kbd>+<kbd>S</kbd> projeyi kaydet · <kbd>Esc</kbd> pencereyi kapat.

Projeler Windows'ta `%USERPROFILE%\.eqo-partitura\projects`, Linux'ta `~/.eqo-partitura/projects` klasöründe saklanır.

## Kaynaktan derleme

Gereksinimler: [Node.js](https://nodejs.org/) 20 veya üzeri. `.exe` Windows'ta, AppImage Linux'ta derlenir.

```bash
npm install
npm run dev          # Vite + Electron, anlık yenileme ile (eş anlamlısı: npm run electron:dev)
npm run dist:win     # Windows -> proje klasörüne "Eqo-Partitura.exe" (ara dosyalar silinir)
npm run dist:linux   # Linux   -> release/Eqo-Partitura-x86_64.AppImage
```

Diğer betikler:

- `npm run build`: yalnızca arayüz paketini derler.
- `npm run web`: arayüzü normal tarayıcıda açar (bu modda proje kaydetme kapalıdır).

`v1.0.0` gibi bir etiket (tag) gönderildiğinde GitHub Actions `Eqo-Partitura.exe` ve `Eqo-Partitura-x86_64.AppImage` dosyalarını derler, AppImage'ı bir kez açarak dener ve ikisini bir GitHub Release'e ekler (`.github/workflows/release.yml`).

## Katkı

Hata bildirimleri ve pull request'ler [Issues](../../issues) üzerinden memnuniyetle karşılanır. Lütfen güvenlik modelini koruyun: her yeni IPC çağrısı, mevcutlar gibi göndereni ve tüm argümanları denetlemelidir.

## Lisans

Kaynak kodu [MIT](LICENSE) lisansıyla yayınlanmıştır © 2026 Echo Masterworks.

**Eqo Partitura**, **Echo Studio** ve **Echo Masterworks** adları ile logoları, simgeleri ve açılış sesi (`brand/`, `src/assets/brand/`, `build/icon.*`) resmî uygulamayı tanıtır ve MIT lisansının kapsamında değildir. Bu projeyi derlemek ve çalıştırmak için değiştirmeden kullanabilirsiniz. Değiştirilmiş bir sürüm yayınlarsanız lütfen kendi adınızı ve simgenizi kullanın.

Klasör yapısı, güvenlik modeli ve üçüncü taraf yazılımlar için [README.md](README.md) dosyasına bakın.
