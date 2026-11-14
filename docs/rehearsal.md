# NASA Space Apps 2026 — Demo Prova Rehberi (`docs/rehearsal.md`)

> **Uyarı:** **Demo software, not a medical device.** — Bu uygulama NASA Space Apps Challenge 2026 için geliştirilmiş bir prototiptir; tıbbi cihaz değildir.

Bu rehber, **özellik dondurma (feature freeze) öncesi tek bir kişinin ~10 dakikada** uygulayıp *"demo `main` ve Render üzerinde çalışıyor"* veya *"şu parça bozuk, sahibi şu kişi"* diyebilmesi için hazırlanmıştır (bkz. Issue [#35](https://github.com/osmnmlh/ANTIGRAVITY/issues/35)).

> Otomatik terminal provası için [`scripts/smoke.sh`](../scripts/smoke.sh) betiğini çalıştırabilirsiniz (`curl` gerektirir, ek bağımlılık yoktur).

---

## Bölüm A — Canlı Backend Provada İzlenecek Adımlar (~5 dk)

Hedef adres (ADR-0006): `BASE_URL="https://antigravity-backend-8lv8.onrender.com"` *(Yerel test için: `http://localhost:8787`)*

| Adım | İşlem / Komut | Beklenen Sonuç |
| --- | --- | --- |
| **1. Render'ı Uyandır** | `curl -sS "$BASE_URL/api/health"` | HTTP `200` · `"ok": true`, `"gemini": true` *(Ücretsiz Render 15 dk sonra uyur; ilk istek ~50 sn sürebilir)* |
| **2. Tam Sıfırlama** | `curl -sS -X POST "$BASE_URL/api/demo/reset"` ardından `curl -sS "$BASE_URL/api/packets"` | HTTP `200` · 3 astronot (`crew-1`, `crew-2`, `crew-3`) de `"overallStatus": "green"` |
| **3. AI SSE Akışını Aç** | Ayrı terminal: `curl -N "$BASE_URL/api/ai/stream?deviceId=rehearsal&crewId=crew-1"` | `hello` / `cabin` ve başlangıç durumu olayı düşer |
| **4. Kabin Senaryosu Tetikle** | `curl -sS -X POST "$BASE_URL/api/ai/demo/cabin-gas-leak"` | HTTP `200` · `alert` olayı SSE akışında kırmızı kabin uyarısı olarak görünür |
| **5. Tarihî Kaza Başlat & Durdur** | `curl -sS -X POST "$BASE_URL/api/simulation/incident/start" -H "content-type: application/json" -d '{"incidentId":"apollo-13","crewId":"crew-1","stepIntervalMs":1500}'` → 3 sn sonra `curl -sS -X POST "$BASE_URL/api/simulation/stop" -H "content-type: application/json" -d '{"reset":true}'` | Başlatınca `mode: "incident"`; durdurunca özet döner ve `reset: true` ile `crew-1` tekrar `green` olur |
| **6. AI Sohbet Testi** | `curl -sS -X POST "$BASE_URL/api/ai/chat" -H "content-type: application/json" -d '{"crewId":"crew-1","message":"Su an durumum nedir?"}'` | HTTP `200` · Türkçe yanıt (`reply`), `disclaimer` ve `source` (`"gemini"` veya `"fallback"`) döner |
| **7. Vercel & iPhone Kontrolü** | Vercel canlı sayfasını açın; iPhone uygulamasında `GET /api/packets` / `/api/ai/stream` akışını test edin | Web senaryosu / kaza tetiklenince Web + iPhone aynı anda güncellenir *(Açık blokaj: Vercel `VITE_API_URL` [#9], `App.tsx` AI montajı [#13], iOS/Watch bağlantısı [#16]/[#17])* |

---

## Bölüm B — Temiz Klon (Fresh-Clone) Yerel Doğrulama Kaydı (14 Kasım 2026)

Bu üç komut `main` üzerinde temiz kurulum (`npm ci`) ile çalıştırılmıştır:

| Kontrol | Komut | Sonuç | Tarih & Not |
| --- | --- | --- | --- |
| **Web Derleme** | `cd web && npm ci && npm run build` | ✅ Geçti | `tsc -b && vite build` (27 modül, `450 ms` üretim derlemesi) |
| **Backend + AI Testleri** | `cd backend && npm test` | ✅ Geçti | `16 / 16` test geçti (`node --experimental-strip-types --test ai/ai.test.mjs`) |
| **Ortak Trend Motoru** | `node shared/tests/check-trends.mjs` | ✅ Geçti | `7 / 7` sentetik vaka + 3 mürettebat (`crew-1`, `crew-2`, `crew-3` her biri 81 örnek, başlangıç `green`) geçti |
| **Render Canlı Erişim Notu** | `curl.exe -sS https://antigravity-backend-8lv8.onrender.com/api/health` | ⚠️ Yerel ağ sertifikası | Test edilen Windows ortamında yerel TLS kök sertifika zinciri hatası (`SEC_E_UNTRUSTED_ROOT` / `SELF_SIGNED_CERT_IN_CHAIN`) alındı; açık tarayıcı/farklı ağdan doğrulama gerekir |

---

## Bölüm C — Tıbbi Cihaz Değildir (Disclaimer) Denetimi (Teslim Madde 7)

| Platform / Dosya | Durum | Gözlemlenen Konum & Metin | Sahibi / Aksiyon |
| --- | --- | --- | --- |
| **Web Dashboard Alt Bilgisi** | ✅ Mevcut | [`web/src/App.tsx`](../web/src/App.tsx#L575) (`Demo yazılımıdır, tıbbi cihaz değildir. Değerler örnek/simüle edilmiştir; tıbbi karar yerine geçmez.`) | Tamam |
| **Kök `README.md`** | ✅ Mevcut | [`README.md`](../README.md#L72) (`Demo software, not a medical device. — Bu yazılım yalnızca ... demo uygulamasıdır; tıbbi cihaz değildir...`) | Tamam |
| **Demo Senaryosu** | ✅ Mevcut | [`docs/demo-script.md`](./demo-script.md#L3) (Üst not ve kapanış konuşması) | Tamam |
| **iPhone Uygulaması (`Antigravity_iOS`)** | ❌ Eksik | `mobile/ios/Antigravity_mobil_saat/.../Antigravity_iOS/**/*.swift` içinde tıbbi uyarı metni bulunamadı | Issue `#16` (`@Skylowerr`) altına yorum bırakıldı |
| **Apple Watch Uygulaması (`Antigravity_watchOS`)** | ❌ Eksik | `AntigravityWatchApp.swift` henüz 8 satırlık taslak; tıbbi uyarı metni bulunamadı | Issue `#17` (`@Skylowerr`) altına yorum bırakıldı |
