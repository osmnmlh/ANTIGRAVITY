<div align="center">

# 🚀 ANTIGRAVITY

### 2026 NASA Space Apps Challenge — Astronot Sağlık İzleme Yazılımı

[![Etkinlik](https://img.shields.io/badge/Etkinlik-2026_NASA_Space_Apps_Challenge-0B3D91?style=for-the-badge&logo=nasa&logoColor=white)](https://www.spaceappschallenge.org/2026/challenges/)
[![Zorluk](https://img.shields.io/badge/Zorluk-Orta_Seviye-F59E0B?style=for-the-badge)](./Hackathon-Subject-TR.pdf)
[![Odak](https://img.shields.io/badge/Odak_%C3%87al%C4%B1%C5%9Fmas%C4%B1-%C4%B0nsanl%C4%B1_Ke%C5%9Fif_%E2%80%A2_Yaz%C4%B1l%C4%B1m_%E2%80%A2_Uzay-6366F1?style=for-the-badge)](./docs/Hackathon-Subject.md)

</div>

---

## 🌌 Yarışma Konusu Hakkında

**ANTIGRAVITY**, **2026 NASA Space Apps Challenge** kapsamında belirlenen şu konu için geliştirilen proje deposudur:
> **"Uzay Görevlerindeki Astronotlar İçin Sağlık İzleme Yazılımı Oluşturma"** *(Create Health Monitoring Software for Astronauts on Space Missions)*

NASA’nın **Artemis** Ay görevleri ve gelecekteki **Mars** hedefleriyle birlikte insanlı uzay görevleri giderek uzamaktadır. Uzun süreli görevlerde astronotlar, fiziksel ve davranışsal sağlıklarındaki değişimleri fark etme, değerlendirme ve erken önlem alma konusunda doğrudan sorumluluk taşırlar.

Bu yarışmanın amacı; sağlık göstergelerini toplayan, tıbbi ölçümleri anlaşılır görsel değerlendirmelere dönüştüren ve astronotlara önleme, tedavi ve sağlık iyileştirme süreçlerinde rehberlik sunan **etkileşimli ve görsel bir sağlık izleme yazılımı** tasarlayıp geliştirmektir.

---

## ☄️ İnsanlı Uzay Uçuşunun Beş Temel Tehlikesi

NASA İnsan Araştırmaları Programı (HRP) tarafından tanımlanan beş temel uzay uçuşu tehlikesi ve bunların astronot sağlığı üzerindeki olası etkileri şunlardır:

| Tehlike | İlişkili Sağlık Riskleri |
| :--- | :--- |
| **Uzay Radyasyonu** | Bağışıklık sistemi değişiklikleri, hücresel ve uzun vadeli radyasyon hasarı |
| **İzolasyon ve Kapalı Ortam** | Davranışsal sağlık sorunları, uyku düzensizliği, ruh hâli değişimleri |
| **Dünya'dan Uzaklık** | Gecikmeli yer desteği, otonom öz değerlendirme ihtiyacı |
| **Değişen Yerçekimi Alanları** | Kemik yoğunluğu kaybı, kardiyovasküler kondisyon düşüşü, sıvı kaymaları |
| **Düşmanca Kapalı Ortamlar** | Yetersiz beslenme, çevresel ve fizyolojik stres faktörleri |

### Öne Çıkan Sağlık Göstergeleri

- 💓 **Kardiyovasküler:** Kalp atış hızı, kan basıncı
- 🩸 **Metabolik ve Fizyolojik:** Kan şekeri (`mg/dL`), vücut sıcaklığı
- 😴 **Davranışsal ve Toparlanma:** Günlük uyku saati, ruh hâli takibi
- 🩻 **Çoklu Girdi ve Görüntüleme:** Klavye/sayısal veriler, etkileşimli seçimler veya tıbbi görüntüler (örn. ultrason görüntüleri)

---

## 🎯 Temel Hedefler ve Tasarım Yaklaşımları

1. **Çok Modlu Sağlık Verisi Toplama** — Manuel ölçümler, yönlendirmeli seçimler veya kamera/ultrason görüntüleri gibi farklı girdi biçimlerini desteklemek.
2. **Etkileşimli ve Görsel Arayüz (UI/UX)** — Dinamik zaman serisi grafikleri, durumları tek bakışta gösteren renk kodlamaları, animasyonlar ve tıklanabilir insan vücudu haritası gibi görsel bileşenlerle verileri net biçimde sunmak.
3. **Eyleme Dönük Rehberlik ve Uyarı** — Bir ölçümün neden yapıldığını, hangi durumda mürettebat veya yerdeki uçuş cerrahlarının müdahalesinin gerektiğini ve kritik durumları önlemek için ne yapılabileceğini açıklamak.
4. **Görev Rutini ile Uyum** — Uzay aracı, uzay istasyonu, keşif aracı (rover) veya gezegen/Ay üssü gibi farklı ortamlara göre içgörüler üretmek; periyodik ölçüm hatırlatmaları ve isteğe bağlı oyunlaştırma (gamification) ile katılımı artırmak.
5. **Anlaşılır Tıbbi Açıklamalar** — Astronotların tüm tıbbi değerlendirmeleri önceden bildiğini varsaymadan; ölçümler, göstergeler ve riskler için sade ve erişilebilir talimatlar sunmak.

---

## 🏗️ Çözüm Mimarisi ve Dinamik Akış

**ANTIGRAVITY**, **Vercel** üzerinde canlıya alınan Web Dashboard, isteğe bağlı gerçek zamanlı Node.js SSE relay (`backend/`) ve **iPhone 16 Pro + Apple Watch** (`mobile/ios/`) istemcilerini **ortak JSON veri sözleşmesi** (`shared/`) üzerinde birleştirir:

- **Vercel Canlı Web Dashboard (`web/`):** Mürettebat durum kartları, 7 günlük zaman serisi grafikleri, etkileşimli insan vücudu haritası, çok günlük trend eskalasyonu, senaryo tetikleme ve AI bot veri girişi sunar (`VITE_API_URL` ile canlı backend'e bağlanır; backend olmadığında yerel mock sözleşmesiyle de çalışabilir).
- **Gerçek Zamanlı Backend Relay & AI Modülü (`backend/`):** Sıfır bağımlılıklı Node.js sunucusu (`backend/server.mjs`, `:8787`) ve tak-çalıştır AI modülü (`backend/ai/`); Web üzerinden tetiklenen senaryoları (`POST /api/ai/demo/:scenarioId`), manuel/AI bot ölçümlerini (`POST /api/samples`) ve proaktif uyarıları yapay gecikme olmadan **SSE** (`/api/stream`, `/api/ai/stream`) üzerinden anında tüm bağlı cihazlara yayınlar.
- **iPhone & Apple Watch (`mobile/ios/`, tek Xcode projesi):** Apple Watch üzerinden canlı nabız/telemetri ve hızlı duygu durum kontrolü `WatchConnectivity` ile iPhone'a aktarılır; iPhone aynı anda canlı backend SSE akışından gelen proaktif uyarıları ve **"AI recommendation"** kartlarını gösterir.
- **Deterministik Eşik & Trend Motoru:** **Yeşil / Amber / Kırmızı** sağlık durumlarını her zaman deterministik eşik ve çok günlük trend kuralları belirler — **yapay zekâ asla durum rengine karar vermez**; yalnızca düz dilde *neden önemli*, *ne yapmalı* ve *ne zaman uçuş cerrahına başvurmalı* rehberliği üretir (API yoksa `fallback` katmanı devreye girer).

> 🚧 **Güncel durum (`main`, 14 Kasım akşamı):**
> - ✅ Backend Render'da canlı: `https://antigravity-backend-8lv8.onrender.com` (`/api/health`). AI modülü `server.mjs`'e bağlı: proaktif uyarılar (`/api/ai/stream`), 11 demo senaryosu (`/api/ai/demo/:id`), sohbet (`POST /api/ai/chat`, model `gemini-flash-lite-latest`), canlı ve tarihî kaza simülasyonları (`/api/simulation/*`). Tüm mürettebat yeşil başlar.
> - ⏳ Web şu an yalnızca yerel mock veriyle çalışıyor: Vercel'de `VITE_API_URL` ayarı ve `useHealthData` bağlantısı (#9), mürettebat seçici (#10), `AlertCenter`/`AiChat` bileşenlerinin `App.tsx`'e eklenmesi (#13), Playwright testi (#11) bekliyor.
> - ⏳ iPhone ekranları `main`'de (#27) ama Xcode'da derlendiği henüz doğrulanmadı; backend adresi ve AI önerisi kartı (#16), watchOS hedefi ve WatchConnectivity (#17) bekliyor.
> - Kararlar: [ADR 0001–0007](./docs/adr/README.md), hepsi kabul edildi.

> ⚠️ **Tıbbi Uyarı (Disclaimer):** **Demo software, not a medical device.** — Bu yazılım yalnızca NASA Space Apps Challenge 2026 kapsamında hazırlanmış bir **demo uygulamasıdır; tıbbi cihaz değildir**, klinik tanı veya tedavi amacıyla kullanılamaz.

---

## 🚀 Kurulum ve Çalıştırma

### 1. Web Dashboard (`web/`) — Yerel ve Vercel

```bash
cd web
npm install
npm run dev          # Yerel geliştirme sunucusu
npm run build        # Üretim derlemesi
npx playwright test  # Uçtan uca (E2E) testler (#11 ile eklenecek)
```

> **Vercel Canlı Dağıtım Notu:** Vercel dağıtımında kök dizin `web/` olarak ayarlanır ve `VITE_API_URL=https://antigravity-backend-8lv8.onrender.com` ortam değişkeni tanımlanır (Vercel HTTPS olduğu için tarayıcı mixed-content engeline takılmaması adına backend HTTPS üzerinden sunulmalıdır).

### 2. Backend Relay ve AI Modülü (`backend/`, Node 22.6+)

```bash
cd backend
cp .env.example .env
npm start            # node --experimental-strip-types server.mjs (varsayılan :8787)
npm test             # AI modülü testleri
```

AI modülünü tek başına test etmek veya geliştirmek için:

```bash
node --experimental-strip-types backend/ai/dev-server.mjs   # Tek başına AI test sunucusu (:8788)
node --experimental-strip-types --test backend/ai/ai.test.mjs
```

### 3. Ortak Trend Motoru Doğrulaması (`shared/`)

```bash
node shared/tests/check-trends.mjs
```

### 4. iPhone & Apple Watch (`mobile/ios/`)

- `mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat.xcodeproj` projesini **Xcode 16+** ile açın (iOS ve watchOS hedefleri aynı projede).
- Hedef şemayı seçin (iOS şeması: iPhone 16 Pro / iOS 18, watchOS şeması: eşleştirilmiş Apple Watch) ve **Run** ile çalıştırın.

---

## 👥 Ekip

> Sunum/sahne ve teslim kalemi sorumlulukları henüz kesinleştirilmediği için görev dağılımı ayrıca `[Belirlenecek]` olarak takip edilmektedir.

- [@osmnmlh](https://github.com/osmnmlh)
- [@Mehmetson01](https://github.com/Mehmetson01)
- [@Ahmetzkn](https://github.com/Ahmetzkn)
- [@Omerozcan71](https://github.com/Omerozcan71)
- [@GoktugFerdi](https://github.com/GoktugFerdi)
- [@Skylowerr](https://github.com/Skylowerr)

---

## 📁 Depo Yapısı

```text
ANTIGRAVITY/
├── AGENTS.md                        # Tüm AI ajanları için tek kural dosyası (EN)
├── CLAUDE.md / GEMINI.md            # AGENTS.md'ye yönlendirir (Claude Code / Antigravity)
├── .agent/skills/                   # Agent skill dokümanları (Antigravity)
├── .claude/skills/                  # .agent/skills'e işaret eden kısa dosyalar (Claude Code)
├── web/                             # Web dashboard (Vite + React + TS, Playwright, Vercel)
├── backend/                         # Sıfır bağımlılıklı Node SSE relay + backend/ai/ modülü (Render)
├── render.yaml                      # Render Blueprint (backend dağıtımı)
├── watch/                           # Sadece yönlendirme README'si (watch kodu mobile/ios/ içinde)
├── mobile/ios/                      # Xcode projesi: iPhone 16 Pro + Apple Watch eşleşmesi
├── shared/                          # Ortak JSON veri sözleşmesi, NASA tehlike mock verisi ve trend testleri
├── docs/
│   ├── demo-script.md               # 3 dakikalık canlı demo akışı ve Sahne B Planı (TR)
│   ├── submission-checklist.md      # NASA Space Apps teslim kontrol listesi (TR)
│   ├── TODO.md                      # Takım görev takip listesi
│   ├── simulation-spec.md           # Canlı ve tarihî kaza simülasyonu şartnamesi (TR)
│   ├── adr/                         # Mimari karar kayıtları (ADR)
│   ├── ai/                          # AI yol haritası (ROADMAP.md)
│   ├── Hackathon-Subject.md         # Orijinal yarışma metni (EN)
│   └── Hackathon-Subject.pdf        # Orijinal yarışma metni PDF (EN)
├── Hackathon-Subject-TR.pdf         # Yarışma metninin Türkçe çevirisi
└── README.md
```

> 🤖 **Ajanlarla çalışırken:** Kurallar yalnızca [`AGENTS.md`](./AGENTS.md) içinde. Skill eklemek/değiştirmek için `.agent/skills/<isim>/SKILL.md` dosyasını düzenleyin; `.claude/skills/` altındaki dosyalar sadece yönlendirmedir.

- 🎬 **Canlı Demo Senaryosu (3 dk, TR):** [`docs/demo-script.md`](./docs/demo-script.md)
- ✅ **Teslim Kontrol Listesi (TR):** [`docs/submission-checklist.md`](./docs/submission-checklist.md)
- 📋 **Takım Görev Listesi:** [`docs/TODO.md`](./docs/TODO.md) ve [GitHub Issues](https://github.com/osmnmlh/ANTIGRAVITY/issues)
- 🧪 **Simülasyon şartnamesi:** [`docs/simulation-spec.md`](./docs/simulation-spec.md)
- 🤖 **AI yol haritası:** [`docs/ai/ROADMAP.md`](./docs/ai/ROADMAP.md)
- 🏛️ **Mimari Karar Kayıtları:** [`docs/adr/README.md`](./docs/adr/README.md)
- 🇹🇷 **Yarışma Konusu (Türkçe PDF):** [`Hackathon-Subject-TR.pdf`](./Hackathon-Subject-TR.pdf)
- 📄 **Yarışma Konusu (Orijinal Markdown - EN):** [`docs/Hackathon-Subject.md`](./docs/Hackathon-Subject.md)
- 📑 **Yarışma Konusu (Orijinal PDF - EN):** [`docs/Hackathon-Subject.pdf`](./docs/Hackathon-Subject.pdf)

---

## 🔗 Kullanılan NASA / CSA Veri ve Resmi Kaynakları

Projedeki beş temel uzay uçuşu tehlikesi açıklamaları, risk bağlantıları ve eğitim metinleri doğrudan NASA HRP verilerinden derlenerek [`shared/mock/nasa-hazards.json`](./shared/mock/nasa-hazards.json) içinde yapılandırılmıştır (backend AI modülü bu dosyayı kullanır; web şu an tehlike metinlerini `web/src/domain/guidance.ts` içinde tutar) ([`https://www.nasa.gov/hrp/hazards/`](https://www.nasa.gov/hrp/hazards/)).

- 🧬 **NASA HRP — İnsanlı Uzay Uçuşunun 5 Tehlikesi:** [nasa.gov/hrp/hazards](https://www.nasa.gov/hrp/hazards/) (`shared/mock/nasa-hazards.json`)
- ⚠️ **NASA HRP — İnsanlı Uzay Uçuşunun Riskleri:** [nasa.gov/hrp/risks](https://www.nasa.gov/hrp/risks/)
- 🔬 **NASA HRP — Uzayda Devam Eden Araştırmalar:** [nasa.gov/hrp/ongoing-hrp-research](https://www.nasa.gov/hrp/ongoing-hrp-research/)
- 🇨🇦 **CSA — Astronot Sağlığı İçin Radyasyonun İzlenmesi:** [asc-csa.gc.ca](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)
- 🛰️ **CSA — Uzayda Neden Bilimsel Deneyler Yapıyoruz?:** [asc-csa.gc.ca](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp)
- 🎥 **Yarışma Tanıtım Videosu:** [YouTube — 2026 NASA Space Apps Challenge](https://www.youtube.com/watch?v=RERG3gEmdC8)
- 🌐 **Yarışma Portalı:** [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/challenges/)
