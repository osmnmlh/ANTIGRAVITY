# Canlı Demo Senaryosu (3 Dakika — Türkçe Sunum Akışı)

> **Uyarı:** Bu uygulama NASA Space Apps Challenge 2026 için geliştirilmiş bir prototiptir (**Demo software, not a medical device.** — Bu yazılım bir demo uygulamasıdır, tıbbi cihaz değildir).

Bu doküman, **10 dakikalık** jüri sunumunun içindeki **yaklaşık 3 dakikalık (180 saniye)** canlı demo bölümünü adım adım tanımlar. Sunum dili Türkçedir (ADR-0005). iPhone ve Apple Watch adımı canlı gösterilecektir; bunun için iOS uygulamasının demodan önce `main`'e eksiksiz bağlanması gerekir. Sunumun geri kalan bölümleri ve konuşmacılar kısmen henüz belirlenmedi. Demo statik mock akış yerine **Vercel üzerinde canlıya alınmış Web Dashboard** ile Render'daki canlı backend SSE akışını kullanır; Web üzerinden tetiklenen senaryolar, tarihî kaza tekrarları ve AI bot veri girişleri yapay gecikme eklenmeden gerçek zamanlı olarak **iPhone** ve **Apple Watch** ekranlarına iletilir.

---

## Hazırlık Durumu (14 Kasım, `main` ile karşılaştırma)

> Bu senaryo hedef akışı anlatır. Aşağıdaki tablo her adımın bugün `main` üzerinde çalışıp çalışmadığını ve neye bağlı olduğunu gösterir. Sahnede yalnızca ✅ olan şeyleri "canlı" diye gösterin; ⏳ olanlar birleşmeden önce senaryodan çıkarılmalı veya yedek akışla anlatılmalıdır.

| Adım | Gerekli özellik | Durum | Bağlı olduğu iş / karar |
| --- | --- | --- | --- |
| 2 | Web durum kartları, 7 günlük grafik, 3B vücut haritası, eşik + trend renkleri | ✅ Web'de var (yerel mock, yalnızca `crew-1`) | Mürettebat seçici: #10 |
| 2 | Web'in `GET /api/packets` ile backend'den veri alması (`VITE_API_URL`) | ⏳ Yok, web yalnızca yerel mock kullanıyor | #9, Vercel'de `VITE_API_URL` |
| 2 | Tüm mürettebatın yeşil başlaması, anomali/trendin senaryo ile gösterilmesi | ✅ Tüm 3 mürettebat `shared/mock` içinde yeşil başlıyor | #34 |
| 3 | Web'deki "Senaryo çalıştır" butonları | ✅ Var ama yalnızca yerel: Güneş parçacık olayı ve Uyku yoksunluğu (telefona gitmez) | — |
| 3 | `POST /api/ai/demo/cabin-gas-leak` ve 11 AI senaryosu | ✅ Render'da canlı (`server.mjs` + `backend/ai/`) | — |
| 3 | Tarihî kaza tekrarı (`apollo-13`, `mir-1997-fire`, `iss-eva-23-water`) | ✅ Backend'de (`POST /api/simulation/incident/start`, #30); web'de tetikleme butonu yok | #9, #34 |
| 3 | Uyarının web + iPhone'a SSE ile aynı anda düşmesi (`/api/ai/stream`, `/api/stream`) | ⏳ Backend hazır; web'de `AlertCenter` henüz `App.tsx`'e eklenmedi, iPhone API bağlantısı yok | #13, #16 |
| 3 | Uyarının Apple Watch'a düşmesi | ⏳ watchOS hedefi ve WatchConnectivity henüz stub | #17 |
| 4 | Web'de NASA 5 tehlike gösterimi | ✅ Var (metinler `web/src/domain/guidance.ts` içinde; `nasa-hazards.json` backend AI tarafından kullanılıyor) | — |
| 4 | `POST /api/ai/guidance` ve AI sohbeti `POST /api/ai/chat` (Gemini + sessiz `fallback`) | ✅ Backend'de canlı; web sohbet paneli (`AiChat`) hazır ama `App.tsx`'e eklenmedi | #13 |
| 4 | iPhone'da **AI recommendation** kartı | ⏳ iPhone ekranları `main`'de (`mobile/ios/`), kart ve backend bağlantısı yok; Xcode derlemesi doğrulanmadı | #16 |
| — | Vercel üzerinde canlı web + Render'da HTTPS backend | ✅ Backend: `https://antigravity-backend-8lv8.onrender.com` · ⏳ Vercel'de `VITE_API_URL` ayarı bekliyor | ADR-0006, #9 |

> **Başlangıç durumu (karar, 14 Kasım):** Tüm astronotlar `shared/mock` verisinde **yeşil** başlar (web ile aynı). Kırmızıya geçiş sahnede senaryo veya kaza tekrarı ile yapılır (`POST /api/ai/demo/cabin-gas-leak` ve `POST /api/simulation/incident/start`). Provadan sonra `POST /api/demo/reset` her şeyi yeşile döndürür.

### Bugün çalışan yedek akış (hiçbir bekleyen işe bağlı değil)

1. `cd web && npm run dev` → durum kartları, grafik, vücut haritası, rehberlik paneli, "Güneş parçacık olayı" ve "Uyku yoksunluğu" senaryoları, "Sıfırla".
2. Ayrı terminalde canlı backend'e: `curl -N "https://antigravity-backend-8lv8.onrender.com/api/ai/stream?deviceId=demo&crewId=crew-1"` açıkken `curl -X POST https://antigravity-backend-8lv8.onrender.com/api/ai/demo/cabin-gas-leak` → proaktif uyarının deterministik metni ve öneri (`advice`) akışta görünür. Ardından `curl -X POST https://antigravity-backend-8lv8.onrender.com/api/simulation/incident/start -H "content-type: application/json" -d "{\"incidentId\":\"apollo-13\",\"crewId\":\"crew-1\",\"stepIntervalMs\":2500}"` ile `apollo-13` fazları akar. İnternet yoksa aynısı `cd backend && npm start` ile `localhost:8787` üzerinde çalışır.
3. Telefon/saat adımı, iOS/watchOS bağlantısı tamamlanana kadar ekran kaydı veya simülatör videosu ile anlatılır.

---

## Rol Dağılımı (Sahne Planı & Teknik Sahiplik)

> Sahne sunum konuşmacıları henüz kesinleştirilmediği için sahne rolleri `[Belirlenecek]` bırakılmıştır; GitHub issue'larına göre teknik alan sahipleri yan sütunda belirtilmiştir.

| Rol / Cihaz | Sahne Sunucusu | Teknik Alan Sorumlusu | Görev Özeti |
| --- | --- | --- | --- |
| Ana Sunucu (Hikâye & Zamanlama) | `[Belirlenecek]` | `[Belirlenecek]` | Problem tanımı, astronot sağlığı bağlamı ve geçiş anlatımı |
| Web Kokpiti Operatörü (Vercel) | `[Belirlenecek]` | `@Ahmetzkn` / `@Omerozcan71` / `@GoktugFerdi` | Mürettebat seçimi, senaryo & kaza tetikleme, AI sohbeti ve grafik/vücut haritası |
| Mobil & Saat Operatörü (iPhone + Apple Watch) | `[Belirlenecek]` | `@Skylowerr` | Anlık uyarı bildirimi, AI önerisi ve saat/telefon senkronizasyonu gösterimi |
| Backend, Veri & Prova Desteği | `[Belirlenecek]` | `@osmnmlh` (Backend/AI/Render) · `@Mehmetson01` (Veri/Prova) | Render uyandırma, `POST /api/demo/reset`, ekran paylaşımı ve B planı geçişi |

---

## Sahne Öncesi Teknik Hazırlık (Demo Başlamadan 10 Dakika Önce)

1. **Canlı Web (Vercel):** `web/` uygulamasının Vercel dağıtımında `VITE_API_URL=https://antigravity-backend-8lv8.onrender.com` ortam değişkeninin ayarlı olduğunu doğrulayın.
2. **Backend Relay + AI Modülü:** `backend/server.mjs` Render üzerinde **HTTPS** ile çalışır (ADR-0006). Ücretsiz Render 15 dk boşta kalınca uyur: demodan birkaç dakika önce `https://antigravity-backend-8lv8.onrender.com/api/health` açılarak uyandırılır (`ok: true`, `gemini: true` doğrulanır).
3. **Veri Sıfırlama (Temiz Başlangıç):** Demo öncesi canlı akışı temiz başlangıç durumuna döndürmek için `POST /api/demo/reset` isteğini çalıştırın (`GET /api/packets` içinde 3 astronotun da `overallStatus: "green"` olduğunu doğrulayın).
4. **Cihaz Bağlantısı:** iPhone 16 Pro uygulamasının aynı canlı backend URL'sine (`/api/stream` ve `/api/ai/stream` SSE uç noktalarına) bağlı olduğunu ve Apple Watch ile `WatchConnectivity` eşleşmesinin aktif olduğunu test edin.
5. **Tarayıcı & Ses/Ekran:** Vercel dashboard sekmesi tam ekran hazır, iPhone ekran yansıtması (AirPlay / QuickTime) test edilmiş olmalıdır.

---

## Zamanlı 3 Dakikalık Demo Akışı (Toplam 180 Saniye)

| Zaman | Sahne Adımı | Kim / Hangi Cihaz | Sahne Eylemi & Ekranda Görülen | Söylenecek Kısa Mesaj (Özet) |
| --- | --- | --- | --- | --- |
| **0:00 – 0:25** | **1. Problem ve Uzay Bağlamı** | `[Belirlenecek]` / Slayt veya Web Açılış | Jüriye Mars / Derin Uzay görevinde iletişim gecikmesi ve astronotun Dünya'daki uçuş cerrahına anında ulaşamama sorunu gösterilir. | *"Derin uzayda astronotlar günlük sağlık trendlerini ve kabin anomalilerini kendi başlarına yorumlamak zorunda. Biz bu ihtiyacı tek bir canlı sağlık izleme ekosistemine dönüştürdük."* |
| **0:25 – 0:50** | **2. Canlı Web Kokpiti (Tüm Mürettebat Yeşil Başlangıç)** | `[Belirlenecek]` / Vercel Web Dashboard | Canlı Vercel ekranında 3 astronot kartı (`GET /api/packets`, hepsi **yeşil `green`** başlar), 3B vücut haritası ve 7 günlük geçmiş gösterilir. Deterministik eşik ve çok günlük trend motorunun yalnızca anomali oluştuğunda rengi amber/kırmızıya çevirdiği vurgulanır. | *"Şu an tüm mürettebat nominal ve yeşil durumda. Durum renklerini yapay zekâ değil, deterministik tıbbi eşik ve trend kurallarımız belirliyor; AI yalnızca anomali anında anlaşılır rehberlik sunuyor."* |
| **0:50 – 1:45** | **3. Kabin Senaryosu + Apollo 13 Tarihî Kaza Simülasyonu → iPhone & Apple Watch** | `[Belirlenecek]` / Vercel Web + iPhone + Apple Watch | **1) Proaktif Kabin Uyarısı:** Web üzerinden `cabin-gas-leak` (`POST /api/ai/demo/cabin-gas-leak`) tetiklenir; `/api/ai/stream` ile uyarı anında Web ve iPhone'a düşer.<br>**2) Tarihî Kaza Tekrarı:** Hemen ardından **`apollo-13`** seçilir (`POST /api/simulation/incident/start`, `{"incidentId":"apollo-13","crewId":"crew-1","stepIntervalMs":2500}`, ~15 sn). Faz 0 → Faz 3 ilerlerken uyku (`2.8h`), vücut ısısı (`35.3 °C`) ve tansiyon (`142/90`) değişip kırmızı alarma döner; sonrasında `POST /api/simulation/stop` (`{"reset":true}`) ile ana ekrana dönülür. | *"Önce kabin gaz sızıntısı senaryosunu tetikliyoruz; uyarı backend SSE üzerinden anında iPhone'a düşüyor. Şimdi ise sistemimizi gerçek bir krizde test ediyoruz: Apollo 13! Oksijen tankı patlaması, soğuk kabin ve uyku yoksunluğu ilerledikçe tüm göstergeler gerçek zamanlı kırmızıya geçiyor."* |
| **1:45 – 2:25** | **4. Rehberlik, NASA 5 Tehlike & AI Sohbet / Uçuş Cerrahı Eskalasyonu** | `[Belirlenecek]` / Vercel Web + iPhone | Web'de seçili gösterge rehberi ve `shared/mock/nasa-hazards.json` kaynaklı NASA 5 Tehlike bağlamı gösterilir. AI Sohbet paneline (`POST /api/ai/chat`) *"Şu an durumum nedir, uçuş cerrahına ne zaman başvurmalıyım?"* yazılır; düz dilde yanıt ve iPhone'daki **AI recommendation** kartı gösterilir. | *"Astronot hem bileğinde hem telefonunda ölçümün neden kritik olduğunu, hangi NASA uzay tehlikesiyle ilişkili olduğunu ve tam olarak ne zaman uçuş cerrahıyla iletişime geçmesi gerektiğini görür."* |
| **2:25 – 3:00** | **5. Kapanış, Özet ve Tıbbi Uyarı** | `[Belirlenecek]` / Tüm Ekip | `POST /api/demo/reset` sonrası temiz yeşil ekrana dönülür. Verilerin tek ortak sözleşmeden beslendiği vurgulanır ve tıbbi cihaz uyarısı net biçimde ifade edilir. | *"Özetle: Apple Watch, iPhone ve Vercel üzerindeki canlı Web Dashboard tek bir veri sözleşmesiyle gerçek zamanlı konuşuyor. Not: Bu yazılım bir demo uygulamasıdır, tıbbi cihaz değildir. Teşekkürler!"* |

---

## Sahne B Planı (Canlı Bağlantı / Cihaz Arızası Durumu)

Sahne koşullarında ağ veya donanım sorunu yaşanırsa sunumun kesilmemesi için şu yedek adımlar izlenir:

1. **Apple Watch / WatchConnectivity Bağlantısı Koparsa:**
   - Apple Watch adımı atlanmadan **iPhone 16 Pro** üzerindeki yerel test / simülasyon akışı ve `GET /api/ai/stream` üzerinden gelen canlı proaktif uyarılar ekrana yansıtılır; saatten gelecek telemetri yerine Web'den tetiklenen senaryo akışı devam ettirilir.
2. **Render Backend'i Kesilirse:**
   - Vercel Web Dashboard ve iPhone istemcisi yerleşik yerel mock veri sözleşmesi (`shared/mock/astronaut-packets.json` ve `shared/mock/samples.json`) ile çalışmaya devam edecek şekilde tasarlanmıştır. Sunum kesilmeden tek laptop + telefon hotspot üzerinden `cd backend && npm start` çalıştırılarak `localhost:8787` (ADR-0006 B planı) veya önceden kaydedilmiş yedek ekran videosu oynatılır.
3. **AI Servisi / Gemini API Yanıt Vermezse:**
   - Sistem deterministik kural tabanlı **`fallback`** rehberlik katmanına sessizce geçer (`source: "fallback"`, ADR-0002). Eşik motoru Yeşil/Amber/Kırmızı durumlarını ve *"Ne yapmalıyım / Uçuş cerrahı eskalasyonu"* metinlerini internet/API kesintisinde dahi eksiksiz üretmeyi sürdürür.
