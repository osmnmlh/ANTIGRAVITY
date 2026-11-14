# NASA Space Apps 2026 — Teslim Kontrol Listesi (Submission Checklist)

> **Önemli Uyarı:** Bu depo bir hackathon prototipidir (**Demo software, not a medical device.** — Bu yazılım bir demo uygulamasıdır, tıbbi cihaz değildir).

Bu liste, proje tesliminden önce tamamlanması gereken tüm çıktıları takip etmek için hazırlanmıştır. Ekip içi sorumlu dağılımı henüz kesinleştirilmediğinden sorumlu sütunu `[Belirlenecek]` olarak bırakılmıştır.

---

## Teslim Öğeleri

| # | Teslim Öğesi | Sorumlu | Durum | Kontrol Kriteri / Konum |
| --- | --- | --- | --- | --- |
| 1 | **Canlı Demo Senaryosu** | `[Belirlenecek]` | `[x]` | [`docs/demo-script.md`](./demo-script.md) — 3 dakikalık zamanlı Türkçe akış, dinamik tetikleme ve Sahne B Planı |
| 2 | **Kök `README.md` Güncellemesi** | `[Belirlenecek]` | `[x]` | [`README.md`](../README.md) — Problem, mimari, kurulum komutları, ekip, NASA/CSA kaynakları ve tıbbi uyarı |
| 3 | **3 Dakikalık Demo Videosu** | `[Belirlenecek]` | `[ ]` | Vercel canlı web + backend SSE + iPhone & Apple Watch senkronizasyonunu gösteren 180 sn Türkçe kayıt |
| 4 | **Ekran Görüntüleri (`docs/screenshots/`)** | `[Belirlenecek]` | `[ ]` | Web kokpiti, grafik/vücut haritası, iPhone uyarı/AI önerisi ve Apple Watch ekran görüntüleri |
| 5 | **Canlı Bağlantı (Vercel) & Backend Relay Doğrulaması** | `[Belirlenecek]` | `[ ]` | Vercel linki aktif; `VITE_API_URL` canlı HTTPS backend'e bağlı ve `POST /api/ai/demo/:scenarioId` canlı yayında test edilmiş |
| 6 | **Taze Klon Üzerinden Kurulum Testi** | `[Belirlenecek]` | `[ ]` | Temiz klonda `web` (`npm install && npm run build`), `backend` (`npm start`) ve `node shared/tests/check-trends.mjs` hatasız çalışıyor |
| 7 | **Tıbbi Cihaz Değildir Uyarısı Kontrolü** | `[Belirlenecek]` | `[ ]` | Web (`App.tsx` alt bilgisi), `README.md` ve `docs/demo-script.md` içinde var; iPhone ve Apple Watch ekranlarında da kontrol edilecek. Hedef: tüm arayüzlerde `"Demo software, not a medical device."` / Türkçe eşdeğeri yer alıyor |
| 8 | **NASA & CSA Kaynak Referansları** | `[Belirlenecek]` | `[x]` | `https://www.nasa.gov/hrp/hazards/` ve `shared/mock/nasa-hazards.json` dosyası dokümante edildi |
| 9 | **Kullanılan AI Araçları Beyanı** | `[Belirlenecek]` | `[ ]` | `[Teslim öncesi ekipçe doldurulacak]` — *Teslim formundaki AI kullanım beyanı ekip tarafından karar verilip son aşamada eklenecektir.* |
| 10 | **NASA Space Apps Portal Teslimi** | `[Belirlenecek]` | `[ ]` | Video bağlantısı, canlı Vercel URL, GitHub repo linki, ekran görüntüleri ve proje özeti son teslimden önce doğrulandı |

---

## Kararlar

| Karar | Durum (14 Kasım) | Etkilediği yer |
| --- | --- | --- |
| Sunum ve arayüz dili ([ADR-0005](./adr/0005-ui-language.md)) | ✅ **Türkçe** (ADR-0005 kabul edildi) | Demo videosu, `demo-script.md`, web/iOS metinleri |
| Barındırma ve teslim linki ([ADR-0006](./adr/0006-demo-hosting.md)) | ✅ Web Vercel'de, backend Render'da (HTTPS); iki iPhone ve web aynı adrese bağlanır. B planı: tek laptop + hotspot | `demo-script.md` hazırlık adımları, madde 5 |
| Canlı demoda telefon/saat adımı | ✅ **Canlı**: iOS uygulamasının demodan önce `main`'e girmesi gerekiyor | `demo-script.md` adım 3–4 |
| Video süresi ve formatı | ✅ Sunum **10 dakika**; 3 dakikalık akış bunun canlı demo bölümü. Teslim videosunun süresi resmi kurallardan doğrulanacak | Madde 3 |
| Sahne rolleri ve sorumlular | ⏳ Sunum kişileri ve konu dağılımı henüz belli değil (şimdilik `[Belirlenecek]`) | Tüm `[Belirlenecek]` alanları |
