# Canlı Demo Senaryosu (3 Dakika — Türkçe Sunum Akışı)

> **Uyarı:** Bu uygulama NASA Space Apps Challenge 2026 için geliştirilmiş bir prototiptir (**Demo software, not a medical device.** — Bu yazılım bir demo uygulamasıdır, tıbbi cihaz değildir).

Bu doküman, jüri önünde gerçekleştirilecek **yaklaşık 3 dakikalık (180 saniye)** canlı demoyu adım adım tanımlar. Demo statik mock akış yerine **Vercel üzerinde canlıya alınmış Web Dashboard** ile canlı backend SSE akışını kullanır; Web üzerinden tetiklenen senaryolar ve AI bot veri girişleri yapay gecikme eklenmeden gerçek zamanlı olarak **iPhone** ve **Apple Watch** ekranlarına iletilir.

---

## Hazırlık Durumu (14 Kasım, `main` ile karşılaştırma)

> Bu senaryo hedef akışı anlatır. Aşağıdaki tablo her adımın bugün `main` üzerinde çalışıp çalışmadığını ve neye bağlı olduğunu gösterir. Sahnede yalnızca ✅ olan şeyleri "canlı" diye gösterin; ⏳ olanlar birleşmeden önce senaryodan çıkarılmalı veya "yol haritası" diye anlatılmalı.

| Adım | Gerekli özellik | Durum | Bağlı olduğu iş / karar |
| --- | --- | --- | --- |
| 2 | Web durum kartları, 7 günlük grafik, 3B vücut haritası, eşik + trend renkleri | ✅ Web'de var (yerel mock) | — |
| 2 | Web'in `GET /api/packets` ile backend'den veri alması (`VITE_API_URL`) | ⏳ Yok, web yalnızca yerel mock kullanıyor | ADR-0002, web ↔ backend bağlantısı |
| 3 | Web'deki "Senaryo çalıştır" butonları | ✅ Var ama yalnızca yerel: Güneş parçacık olayı ve Uyku yoksunluğu (telefona gitmez) | — |
| 3 | `POST /api/ai/demo/:scenarioId` ile 11 AI senaryosu (`cabin-gas-leak` vb.) | ⚠️ Sadece `backend/ai/dev-server.mjs` (`:8788`) üzerinde; `server.mjs` (`:8787`) içinde yok | AI modülünün `server.mjs`'e bağlanması (PR #21 notu) |
| 3 | Uyarının web + iPhone'a SSE ile aynı anda düşmesi (`/api/ai/stream`) | ⏳ Backend tarafı hazır (dev-server), web ve iPhone istemcisi yok | ADR-0007, web `src/ai/`, iOS `NetworkManager` |
| 3 | Uyarının Apple Watch'a düşmesi | ⏳ AI dağıtımı telefonları hedefliyor; saate iletim iPhone uygulamasına bağlı | ADR-0004 |
| 4 | Web'de NASA 5 tehlike gösterimi | ✅ Var (metinler `web/src/domain/guidance.ts` içinde; `nasa-hazards.json` backend AI tarafından kullanılıyor) | — |
| 4 | `POST /api/ai/guidance` (Gemini + `fallback`) | ✅ `server.mjs` içinde var | Gemini anahtarı yoksa `fallback` |
| 4 | AI Bot sohbeti `POST /api/ai/chat` | ⏳ Hiçbir yerde yok | ADR-0003 |
| 4 | iPhone'da **AI recommendation** kartı | ⏳ iOS uygulaması `main`'de değil (`features/ios_viewmodel` branch'inde) | iOS PR'ı |
| — | Vercel üzerinde canlı web + HTTPS backend | ⏳ Kurulum yok | ADR-0006 (öneri: web statik + mock, backend demo Mac'inde) |

> **Dikkat:** `shared/mock/astronaut-packets.json` içinde crew-1 (Dr. Elena Vance) SpO2 89% ile başlıyor; backend `reset` sonrası da kırmızı (`individual-hypoxia`) görünür. Web ise kendi başlangıç değerleriyle (SpO2 97) yeşil açılır. Sahnede iki ekran yan yana gösterilecekse başlangıç değerleri hizalanmalı.

### Bugün çalışan yedek akış (hiçbir bekleyen işe bağlı değil)

1. `cd web && npm run dev` → durum kartları, grafik, vücut haritası, rehberlik paneli, "Güneş parçacık olayı" ve "Uyku yoksunluğu" senaryoları, "Sıfırla".
2. Ayrı terminalde `node --experimental-strip-types backend/ai/dev-server.mjs` → `curl -X POST localhost:8788/api/ai/demo/cabin-gas-leak` ile proaktif uyarının deterministik metni ve öneri (`advice`) terminalde/`/api/ai/stream` akışında gösterilebilir.
3. Telefon/saat adımı, iOS PR'ı birleşene kadar ekran kaydı veya simülatör videosu ile anlatılır.

---

## Rol Dağılımı (Sahne Planı)

> Ekip içi sahne görev dağılımı henüz kesinleştirilmediği için roller `[Belirlenecek]` olarak bırakılmıştır.

| Rol / Cihaz | Sorumlu | Görev Özeti |
| --- | --- | --- |
| Ana Sunucu (Hikâye & Zamanlama) | `[Belirlenecek]` | Problem tanımı, astronot sağlığı bağlamı ve geçiş anlatımı |
| Web Kokpiti Operatörü (Vercel) | `[Belirlenecek]` | Mürettebat seçimi, senaryo tetikleme, AI bot girişi ve grafik/vücut haritası gösterimi |
| Mobil & Saat Operatörü (iPhone + Apple Watch) | `[Belirlenecek]` | Anlık uyarı bildirimi, AI önerisi ve saat/telefon senkronizasyonu gösterimi |
| Teknik Destek / Yedek Plan | `[Belirlenecek]` | Backend relay, HTTPS tüneli, ekran paylaşımı ve B planı geçişi |

---

## Sahne Öncesi Teknik Hazırlık (Demo Başlamadan 10 Dakika Önce)

1. **Canlı Web (Vercel):** `web/` uygulamasının Vercel dağıtımında `VITE_API_URL` ortam değişkeninin canlı HTTPS backend adresine işaret ettiğini doğrulayın.
2. **Backend Relay + AI Modülü:** `backend/server.mjs` (varsayılan port `8787`, Node `22.6+`) çalışır durumda ve dış dünyaya **HTTPS** üzerinden erişilebilir olmalıdır (Vercel HTTPS olduğu için browser mixed-content engelini aşmak amacıyla HTTPS cloud host veya Cloudflare Tunnel / ngrok tüneli açık olmalıdır).
3. **Veri Sıfırlama (Temiz Başlangıç):** Demo öncesi canlı akışı temiz başlangıç durumuna döndürmek için `POST /api/ai/demo/reset` isteğini çalıştırın ve başlangıç sağlık paketlerinin (`GET /api/packets`) yüklendiğini doğrulayın.
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
2. **Canlı Backend SSE / HTTPS Tüneli Kesilirse:**
   - Vercel Web Dashboard ve iPhone istemcisi yerleşik yerel mock veri sözleşmesi (`shared/mock/astronaut-packets.json` ve `shared/mock/samples.json`) ile çalışmaya devam edecek şekilde tasarlanmıştır. Sunum kesilmeden yerel bilgisayarda `cd backend && npm start` çalıştırılarak `localhost` üzerinden demo tamamlanır veya önceden kaydedilmiş yedek ekran videosu oynatılır.
3. **AI Servisi / Gemini API Yanıt Vermezse:**
   - Sistem deterministik kural tabanlı **`fallback`** rehberlik katmanına otomatik geçer (`source: "fallback"`). Eşik motoru Yeşil/Amber/Kırmızı durumlarını ve *"Ne yapmalıyım / Uçuş cerrahı eskalasyonu"* metinlerini internet/API kesintisinde dahi eksiksiz üretmeyi sürdürür.
