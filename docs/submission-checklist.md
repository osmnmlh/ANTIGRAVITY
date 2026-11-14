# NASA Space Apps 2026 — Teslim Kontrol Listesi (Submission Checklist)

> **Önemli Uyarı:** Bu depo bir hackathon prototipidir (**Demo software, not a medical device.** — Bu yazılım bir demo uygulamasıdır, tıbbi cihaz değildir).

Bu liste, proje tesliminden önce tamamlanması gereken tüm çıktıları takip etmek için hazırlanmıştır. Atanmış issue sahiplerine göre netleşen sorumlular yazılmış, ekip içinde henüz kesinleşmeyen sahne/teslim rolleri ise `[Belirlenecek]` olarak bırakılmıştır.

---

## Teslim Öğeleri

| # | Teslim Öğesi | Sorumlu | Durum | Kontrol Kriteri / Konum |
| --- | --- | --- | --- | --- |
| 1 | **Canlı Demo Senaryosu** | `@Mehmetson01` | `[x]` | [`docs/demo-script.md`](./demo-script.md) — 3 dakikalık zamanlı Türkçe akış, dinamik tetikleme (`cabin-gas-leak` + `apollo-13`) ve Sahne B Planı |
| 2 | **Kök `README.md` Güncellemesi** | `@Mehmetson01` | `[x]` | [`README.md`](../README.md) — Problem, mimari, kurulum komutları, ekip, NASA/CSA kaynakları ve tıbbi uyarı |
| 3 | **3 Dakikalık Demo Videosu** | `[Belirlenecek]` | `[ ]` | Vercel canlı web + Render SSE + iPhone & Apple Watch senkronizasyonunu gösteren 180 sn Türkçe kayıt |
| 4 | **Ekran Görüntüleri (`docs/screenshots/`)** | `@Omerozcan71` *(Issue #11)* | `[ ]` | Web kokpiti, grafik/vücut haritası, iPhone uyarı/AI önerisi ve Apple Watch ekran görüntüleri |
| 5 | **Canlı Bağlantı (Vercel) & Backend Relay Doğrulaması** | `@Ahmetzkn` *(Vercel, #9)* · `@osmnmlh` *(Render, #37)* | `[x]` | Canlı web: [`https://antigravity-teal-eight.vercel.app/`](https://antigravity-teal-eight.vercel.app/) · `VITE_API_URL=https://antigravity-backend-8lv8.onrender.com` canlı bundle'da aktif, Render `/api/health` & `/api/ai/health` (`gemini: true`) doğrulandı |
| 6 | **Taze Klon Üzerinden Kurulum Testi** | `@Mehmetson01` *(Issue #35)* | `[x]` | 14 Kasım doğrulandı: `web` (`npm ci && npm run build` ✅), `backend` (`npm test` 16/16 ✅), `node shared/tests/check-trends.mjs` (7/7 + 3 mürettebat ✅) — kayıt [`docs/rehearsal.md`](./rehearsal.md) |
| 7 | **Tıbbi Cihaz Değildir Uyarısı Kontrolü** | `@Mehmetson01` *(Denetim)* · `@Skylowerr` *(iOS/Watch, #16/#17)* | `[ ]` | Web ([`App.tsx`](../web/src/App.tsx#L575)), [`README.md`](../README.md) ve [`demo-script.md`](./demo-script.md) içinde ✅; iPhone ve Apple Watch Swift görünümlerinde eksik ❌ (`#16` ve `#17`'ye yorum bırakıldı) |
| 8 | **NASA & CSA Kaynak Referansları** | `@Mehmetson01` | `[x]` | `https://www.nasa.gov/hrp/hazards/` ve [`shared/mock/nasa-hazards.json`](../shared/mock/nasa-hazards.json) dosyası dokümante edildi |
| 9 | **Kullanılan AI Araçları Beyanı** | `[Belirlenecek]` | `[ ]` | `[Teslim öncesi ekipçe doldurulacak]` — *Teslim formundaki AI kullanım beyanı ekip tarafından karar verilip son aşamada eklenecektir.* |
| 10 | **NASA Space Apps Portal Teslimi** | `[Belirlenecek]` | `[ ]` | Video bağlantısı, canlı Vercel URL, GitHub repo linki, ekran görüntüleri ve proje özeti son teslimden önce doğrulandı |

---

## Kararlar

| Karar | Durum (14 Kasım) | Etkilediği yer |
| --- | --- | --- |
| Sunum ve arayüz dili ([ADR-0005](./adr/0005-ui-language.md)) | ✅ **Türkçe** (ADR-0005 kabul edildi) | Demo videosu, `demo-script.md`, web/iOS metinleri |
| Barındırma ve teslim linki ([ADR-0006](./adr/0006-demo-hosting.md)) | ✅ Web Vercel'de, backend Render'da (HTTPS); iki iPhone ve web aynı adrese bağlanır. B planı: tek laptop + hotspot | `demo-script.md` hazırlık adımları, `rehearsal.md`, madde 5 |
| Canlı demoda telefon/saat adımı | ✅ **Canlı**: iOS uygulamasının demodan önce `main`'e eksiksiz bağlanması gerekiyor | `demo-script.md` adım 3–4 |
| Simülasyon mimarisi (#34 kararı) | ✅ Tek motor `backend/server.mjs` içinde (`/api/simulation/*` + `/api/stream`); Web ikinci motor yazmaz | `simulation-spec.md`, `demo-script.md` |
| Video süresi ve formatı | ✅ Sunum **10 dakika**; 3 dakikalık akış bunun canlı demo bölümü. Teslim videosunun süresi resmi kurallardan doğrulanacak | Madde 3 |
| Sahne rolleri ve kalan teslim sorumluları | ⏳ Sunum konuşmacıları, video çekimi, AI beyanı ve portal teslimi henüz kesinleşmedi (şimdilik `[Belirlenecek]`) | `demo-script.md` sahne rolleri & yukarıdaki `[Belirlenecek]` satırları |
