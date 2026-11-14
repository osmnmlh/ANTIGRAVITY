# Canlı Demo Senaryosu (3 Dakika — Türkçe Sunum Akışı)

> **Uyarı:** Bu uygulama NASA Space Apps Challenge 2026 için geliştirilmiş bir prototiptir (**Demo software, not a medical device.** — Bu yazılım bir demo uygulamasıdır, tıbbi cihaz değildir).

Bu doküman, **10 dakikalık** jüri sunumunun içindeki **yaklaşık 3 dakikalık (180 saniye)** canlı demo bölümünü adım adım tanımlar. Sunum dili Türkçedir (ADR-0005). iPhone ve Apple Watch adımı canlı gösterilecektir; bunun için iOS uygulamasının demodan önce `main`'e girmesi gerekir. Sunumun geri kalan bölümleri ve konuşmacılar henüz belirlenmedi. Demo statik mock akış yerine **Vercel üzerinde canlıya alınmış Web Dashboard** ile canlı backend SSE akışını kullanır; Web üzerinden tetiklenen senaryolar ve AI bot veri girişleri yapay gecikme eklenmeden gerçek zamanlı olarak **iPhone** ve **Apple Watch** ekranlarına iletilir.

---

## Hazırlık Durumu (14 Kasım akşamı, `main` ile karşılaştırma)

> Bu senaryo hedef akışı anlatır. Aşağıdaki tablo her adımın bugün `main` üzerinde çalışıp çalışmadığını ve neye bağlı olduğunu gösterir. Sahnede yalnızca ✅ olan şeyleri "canlı" diye gösterin; ⏳ olanlar birleşmeden önce senaryodan çıkarılmalı veya "yol haritası" diye anlatılmalı.

| Adım | Gerekli özellik | Durum | Bağlı olduğu iş / karar |
| --- | --- | --- | --- |
| 2 | Web durum kartları, 7 günlük grafik, 3B vücut haritası, eşik + trend renkleri | ✅ Web'de var (yerel mock, yalnızca `crew-1`) | Mürettebat seçici: #10 |
| 2 | Web'in `GET /api/packets` ile backend'den veri alması (`VITE_API_URL`) | ⏳ Yok, web yalnızca yerel mock kullanıyor | #9, Vercel'de `VITE_API_URL` |
| 2 | Çok günlük trend eskalasyonunun ekranda görünmesi | ⏳ Tüm mürettebat yeşil başladığı için mock geçmişte trend amber'ı yok; bir senaryo/kaza ile gösterilmeli | #34 |
| 3 | Web'deki "Senaryo çalıştır" butonları | ✅ Var ama yalnızca yerel: Güneş parçacık olayı ve Uyku yoksunluğu (telefona gitmez) | — |
| 3 | `POST /api/ai/demo/:scenarioId` ile 11 AI senaryosu (`cabin-gas-leak` vb.) | ✅ Render'da canlı (`server.mjs` + `backend/ai/`) | — |
| 3 | Tarihî kaza tekrarı (`apollo-13`, `mir-1997-fire`, `iss-eva-23-water`) | ✅ Backend'de (`POST /api/simulation/incident/start`, #30); web'de tetikleme butonu yok | #9, #34 |
| 3 | Uyarının web + iPhone'a SSE ile aynı anda düşmesi (`/api/ai/stream`) | ⏳ Backend hazır; web'de `AlertCenter` henüz `App.tsx`'e eklenmedi, iPhone istemcisi yok | #13, #16 |
| 3 | Uyarının Apple Watch'a düşmesi | ⏳ watchOS hedefi ve WatchConnectivity yok | #17 |
| 4 | Web'de NASA 5 tehlike gösterimi | ✅ Var (metinler `web/src/domain/guidance.ts` içinde; `nasa-hazards.json` backend AI tarafından kullanılıyor) | — |
| 4 | `POST /api/ai/guidance` ve AI sohbeti `POST /api/ai/chat` (Gemini + sessiz `fallback`) | ✅ Backend'de canlı; web sohbet paneli (`AiChat`) hazır ama `App.tsx`'e eklenmedi | #13 |
| 4 | iPhone'da **AI recommendation** kartı | ⏳ iPhone ekranları `main`'de (#27), kart ve backend bağlantısı yok; Xcode derlemesi doğrulanmadı | #16 |
| — | Vercel üzerinde canlı web + Render'da HTTPS backend | ✅ Backend: `https://antigravity-backend-8lv8.onrender.com` · ⏳ Vercel'de `VITE_API_URL` ayarı bekliyor | ADR-0006, #9 |

> **Başlangıç durumu (karar, 14 Kasım):** Tüm astronotlar `shared/mock` verisinde **yeşil** başlar (web ile aynı). Kırmızıya geçiş sahnede senaryo ile yapılır (`POST /api/ai/demo/individual-hypoxia` vb.). Provadan sonra `POST /api/demo/reset` her şeyi yeşile döndürür.

### Bugün çalışan yedek akış (hiçbir bekleyen işe bağlı değil)

1. `cd web && npm run dev` → durum kartları, grafik, vücut haritası, rehberlik paneli, "Güneş parçacık olayı" ve "Uyku yoksunluğu" senaryoları, "Sıfırla".
2. Ayrı terminalde canlı backend'e: `curl -N "https://antigravity-backend-8lv8.onrender.com/api/ai/stream?deviceId=demo&crewId=crew-1"` açıkken `curl -X POST https://antigravity-backend-8lv8.onrender.com/api/ai/demo/cabin-gas-leak` → proaktif uyarının deterministik metni ve öneri (`advice`) akışta görünür. İnternet yoksa aynısı `cd backend && npm start` ile `localhost:8787` üzerinde.
3. Telefon/saat adımı, iOS işi birleşene kadar ekran kaydı veya simülatör videosu ile anlatılır.

---

## Rol Dağılımı (Sahne Planı)

> Ekip içi sahne görev dağılımı henüz kesinleştirilmediği için roller `[Belirlenecek]` olarak bırakılmıştır.

| Rol / Cihaz | Sorumlu | Görev Özeti |
| --- | --- | --- |
| Ana Sunucu (Hikâye & Zamanlama) | `[Belirlenecek]` | Problem tanımı, astronot sağlığı bağlamı ve geçiş anlatımı |
| Web Kokpiti Operatörü (Vercel) | `[Belirlenecek]` | Mürettebat seçimi, senaryo tetikleme, AI bot girişi ve grafik/vücut haritası gösterimi |
| Mobil & Saat Operatörü (iPhone + Apple Watch) | `[Belirlenecek]` | Anlık uyarı bildirimi, AI önerisi ve saat/telefon senkronizasyonu gösterimi |
| Teknik Destek / Yedek Plan | `[Belirlenecek]` | Backend relay (Render), ekran paylaşımı ve B planı geçişi |

---

## Sahne Öncesi Teknik Hazırlık (Demo Başlamadan 10 Dakika Önce)

1. **Canlı Web (Vercel):** `web/` uygulamasının Vercel dağıtımında `VITE_API_URL` ortam değişkeninin canlı HTTPS backend adresine işaret ettiğini doğrulayın.
2. **Backend Relay + AI Modülü:** `backend/server.mjs` (varsayılan port `8787`, Node `22.6+`) çalışır durumda Render üzerinde **HTTPS** ile çalışır (ADR-0006). Ücretsiz Render 15 dk boşta kalınca uyur: demodan birkaç dakika önce `https://antigravity-backend-8lv8.onrender.com/api/health` açılarak uyandırılır, ardından `POST /api/demo/reset` ile her şey yeşile döner.
3. **Veri Sıfırlama (Temiz Başlangıç):** Demo öncesi canlı akışı temiz başlangıç durumuna döndürmek için `POST /api/demo/reset` isteğini çalıştırın (simülasyonu durdurur, mock veriyi yeniden yükler ve AI uyarılarını sıfırlar; `POST /api/ai/demo/reset` yalnızca AI uyarılarını sıfırlar) ve başlangıç sağlık paketlerinin (`GET /api/packets`) yüklendiğini doğrulayın.
4. **Cihaz Bağlantısı:** iPhone 16 Pro uygulamasının aynı canlı backend URL'sine (`/api/stream` ve `/api/ai/stream` SSE uç noktalarına) bağlı olduğunu ve Apple Watch ile `WatchConnectivity` eşleşmesinin aktif olduğunu test edin.
5. **Tarayıcı & Ses/Ekran:** Vercel dashboard sekmesi tam ekran hazır, iPhone ekran yansıtması (AirPlay / QuickTime) test edilmiş olmalıdır.

---

## Zamanlı 3 Dakikalık Demo Akışı (Toplam 180 Saniye)

| Zaman | Sahne Adımı | Kim / Hangi Cihaz | Sahne Eylemi & Ekranda Görülen | Söylenecek Kısa Mesaj (Özet) |
| --- | --- | --- | --- | --- |
| **0:00 – 0:25** | **1. Problem ve Uzay Bağlamı** | `[Belirlenecek]` / Slayt veya Web Açılış | Jüriye Mars / Derin Uzay görevinde iletişim gecikmesi ve astronotun Dünya'daki uçuş cerrahına anında ulaşamama sorunu gösterilir. | *"Derin uzayda astronotlar günlük sağlık trendlerini ve kabin anomalilerini kendi başlarına yorumlamak zorunda. Biz bu ihtiyacı tek bir canlı sağlık izleme ekosistemine dönüştürdük."* |
| **0:25 – 0:55** | **2. Canlı Web Kokpiti & Çok Günlük Trend** | `[Belirlenecek]` / Vercel Web Dashboard | Canlı Vercel ekranında mürettebat listesi (`GET /api/packets`) ve astronot kartı açılır. Deterministik eşik motorunun ürettiği **Yeşil / Amber / Kırmızı** durumlar ve **çok günlük trend eskalasyonu** (örn. uyku düşüşü / dinlenik nabız artışı) gösterilir. | *"Durum renklerini yapay zekâ değil, deterministik tıbbi eşik ve trend kurallarımız belirliyor; AI yalnızca anlaşılır rehberlik ve bağlam sunuyor."* |
| **0:55 – 1:40** | **3. Web'den Dinamik Senaryo Tetikleme → iPhone & Apple Watch** | `[Belirlenecek]` / Vercel Web + iPhone + Apple Watch | Web arayüzünden canlı senaryo tetiklenir (`POST /api/ai/demo/:scenarioId`, örn. `cabin-gas-leak` veya manuel/`POST /api/samples` üzerinden kritik veri & AI bot veri girişi). Elle eklenmiş hiçbir yapay bekleme olmadan, Backend SSE (`/api/stream`, `/api/ai/stream`) üzerinden uyarının **aynı anda Web, iPhone ve Apple Watch** ekranlarına düştüğü gösterilir. | *"Şimdi web kokpitinden canlı bir anomali senaryosu ve veri girişi tetikliyoruz. Gördüğünüz gibi araya elle gecikme koymadan sinyal backend SSE üzerinden anlık olarak iPhone'a ve Apple Watch'a düşüyor."* |
| **1:40 – 2:25** | **4. Rehberlik, NASA 5 Tehlike & Uçuş Cerrahı Eskalasyonu** | `[Belirlenecek]` / Vercel Web + iPhone | Web'de vücut haritası / grafikler ve `shared/mock/nasa-hazards.json` kaynaklı NASA 5 İnsanlı Uzay Uçuşu Tehlikesi açıklamaları gösterilir. Ardından AI Bot sohbeti (`POST /api/ai/chat`) veya `POST /api/ai/guidance` üzerinden düz dilde *"Neden önemli? / Ne yapmalıyım? / Ne zaman uçuş cerrahına başvurmalıyım?"* yanıtı ve iPhone'da **AI recommendation** kartı gösterilir. | *"Astronot hem bileğinde hem telefonunda ölçümün neden kritik olduğunu, hangi NASA uzay tehlikesiyle ilişkili olduğunu ve tam olarak ne zaman uçuş cerrahıyla iletişime geçmesi gerektiğini görür."* |
| **2:25 – 3:00** | **5. Kapanış, Özet ve Tıbbi Uyarı** | `[Belirlenecek]` / Tüm Ekip | Özet ekranına dönülür. Verilerin tek ortak sözleşmeden beslendiği ve tüm istemcilerin senkronize çalıştığı vurgulanır. Tıbbi cihaz uyarısı net biçimde ifade edilir. | *"Özetle: Apple Watch, iPhone ve Vercel üzerindeki canlı Web Dashboard tek bir veri sözleşmesiyle gerçek zamanlı konuşuyor. Not: Bu yazılım bir demo uygulamasıdır, tıbbi cihaz değildir. Teşekkürler!"* |

---

## Sahne B Planı (Canlı Bağlantı / Cihaz Arızası Durumu)

Sahne koşullarında ağ veya donanım sorunu yaşanırsa sunumun kesilmemesi için şu yedek adımlar izlenir:

1. **Apple Watch / WatchConnectivity Bağlantısı Koparsa:**
   - Apple Watch adımı atlanmadan **iPhone 16 Pro** üzerindeki yerel test / simülasyon akışı ve `GET /api/ai/stream` üzerinden gelen canlı proaktif uyarılar ekrana yansıtılır; saatten gelecek telemetri yerine iPhone'dan manuel veya Web üzerinden tetiklenen örnek akışı devam ettirilir.
2. **Render Backend'i Kesilirse:**
   - Vercel Web Dashboard ve iPhone istemcisi yerleşik yerel mock veri sözleşmesi (`shared/mock/astronaut-packets.json` ve `shared/mock/samples.json`) ile çalışmaya devam edecek şekilde tasarlanmıştır. Sunum kesilmeden yerel bilgisayarda `cd backend && npm start` çalıştırılarak `localhost` üzerinden demo tamamlanır veya önceden kaydedilmiş yedek ekran videosu oynatılır.
3. **AI Servisi / Gemini API Yanıt Vermezse:**
   - Sistem deterministik kural tabanlı **`fallback`** rehberlik katmanına otomatik geçer (`source: "fallback"`). Eşik motoru Yeşil/Amber/Kırmızı durumlarını ve *"Ne yapmalıyım / Uçuş cerrahı eskalasyonu"* metinlerini internet/API kesintisinde dahi eksiksiz üretmeyi sürdürür.
