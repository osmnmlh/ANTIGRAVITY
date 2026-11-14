# Simülasyon Modları & Tarihsel Uzay Kazası Senaryoları — Web Geliştirici Teknik Şartnamesi

> **Uyarı:** **Demo software, not a medical device.** — Bu simülasyonlar eğitim ve hackathon prototip gösterimi içindir; klinik tanı veya gerçek tıbbi karar destek sistemi değildir.

Bu doküman, Web Dashboard (`web/`) üzerinde **gerçekçi canlı telemetri akışı** ve **geçmiş uzay kazaları simülasyon modu** geliştirmek için gerekli tüm mimari kuralları, durum makinesini (state machine), hazır veri setlerini ve kullanıcı arayüzü akışını içerir.

---

## 1. Genel Bakış: 3 Çalışma Modu

Web arayüzünün üst kontrol çubuğunda kullanıcı şu 3 mod arasında geçiş yapabilmelidir:

1. **Normal / Manuel Mod (`manual`):** Mevcut başlangıç paketi + kullanıcının formdan girdiği ölçümler görünür.
2. **Canlı Simülasyon Modu (`live`):** Uzay aracındaki gerçek zamanlı izleme gibi her **2 saniyede bir** fizyolojik mikro dalgalanmalar üretir (nabız, SpO2, tansiyon, sıcaklık, kan şekeri, kümülatif radyasyon vb.). Değerler canlı aktığı için grafikler ve durum kartları sürekli güncellenir.
3. **Geçmiş Kaza Simülasyonu (`incident`):** Kullanıcı 3 tarihi uzay kazasından birini seçer. Uygulama o kaza anında çalışıyormuş gibi aşamalı (faz bazlı) gerçekçi fizyolojik değerler ve çevresel bağlam oynatır. Simülasyon tamamlandığında veya **"Simülasyonu Bitir"** butonuna basıldığında **Simülasyon Sonuç / Özet Ekranı** gösterilir ve ardından **Ana Ekrana** temiz şekilde dönülür.

---

## 2. Veri İzolasyonu ve Ana Ekrana Dönüş Kuralı (Kritik)

Simülasyon sırasında değişen veriler, simülasyon bitince ana ekrandaki gerçek/başlangıç verisini kalıcı olarak bozmamalıdır:

1. Simülasyon başlamadan önce mevcut `samples` (ve seçili astronot durumu) bellekte `preSimulationSnapshot` olarak saklanır (veya `simulationSamples` ayrı bir state'te tutulur).
2. Simülasyon çalışırken (`phase === 'running'`) ekrandaki tüm bileşenler (`StatusCard`, `TrendChart`, `ThreeBodyMap`, `GuidancePanel`, `thresholds.ts`) aktif simülasyon örneklerini okur.
3. `VITE_API_URL` (canlı backend) tanımlıysa her simülasyon adımında üretilen `HealthSample[]` dizisi `POST /api/samples` ile backend'e gönderilir; böylece **iPhone ve Apple Watch** da aynı anda kaza/canlı simülasyon anını yaşar.
4. **"Simülasyonu Bitir"** butonuna basıldığında veya son faz tamamlandığında:
   - Timer (`setInterval`) durdurulur.
   - Simülasyon sırasında kaydedilen metrik istatistikleri (en yüksek/en düşük değerler, ilk `amber` ve ilk `red` anları, tetiklenen uyarılar) **Sonuç Ekranı** (`phase === 'summary'`) için dondurulur.
5. Sonuç ekranındaki **"Ana Ekrana Dön"** butonuna basıldığında (veya doğrudan bitirip çıkmayı seçtiğinde):
   - Aktif simülasyon state'i temizlenir (`phase = 'idle'`, `mode = 'manual'`).
   - `preSimulationSnapshot` geri yüklenir (canlı backend bağlıysa temiz başlangıç için `POST /api/ai/demo/reset` çağrısı da tetiklenebilir).
   - Kullanıcı ana dashboard görünümüne geri döner.

---

## 3. UI Akışı & Durum Makinesi (State Machine)

```text
[idle (Ana Ekran)]
   │
   ├── "Canlı Simülasyonu Başlat" ──────────────────► [running (live)]
   │                                                       │
   └── "Geçmiş Kaza Seç (Apollo 13 / Mir / EVA-23)" ─────► [running (incident)]
                                                           │
                  ("Simülasyonu Bitir" veya son faz biter) ◄┘
                                  │
                                  ▼
                       [summary (Sonuç Ekranı)]
                                  │
                     ("Ana Ekrana Dön" butonu)
                                  │
                                  ▼
                         [idle (Ana Ekran)]
```

### Önerilen TypeScript Tipleri (`web/src/domain/simulation.ts`)

```ts
export type SimulationMode = 'manual' | 'live' | 'incident'
export type SimulationLifecycle = 'idle' | 'running' | 'summary'
export type IncidentId = 'apollo-13' | 'mir-1997-fire' | 'iss-eva-23-water'

export interface IncidentPhase {
  phaseIndex: number
  missionTimeLabel: string        // Örn: "T+55:55 · O2 Tankı Patlaması"
  title: string                   // Kısa faz başlığı
  eventDescription: string        // O anda uzay aracında / astronotta ne oluyor?
  durationMs: number              // Bu fazın ekranda kalma süresi (örn. 3500 ms)
  metrics: Record<HealthType, number>
  cabinHint?: string              // Örn: "CO2: 7.8 mmHg (Yüksek) · Kabin Sıcaklığı: 4 °C"
}

export interface HistoricalIncident {
  id: IncidentId
  title: string
  dateLabel: string               // Örn: "13–17 Nisan 1970"
  missionName: string
  crewReference: string
  nasaHazardIds: string[]         // shared/mock/nasa-hazards.json id'leri
  historicalOutcome: string       // Gerçek kazada nasıl kurtulundu?
  phases: IncidentPhase[]
}

export interface SimulationSummary {
  mode: 'live' | 'incident'
  incident?: HistoricalIncident
  startedAt: string
  endedAt: string
  elapsedSeconds: number
  completedAllPhases: boolean
  highestSeverity: 'green' | 'amber' | 'red'
  triggeredAlerts: Array<{
    type: HealthType
    peakStatus: 'amber' | 'red'
    extremeValue: number
    unit: string
    phaseLabel: string
  }>
  flightSurgeonEscalated: boolean
}
```

---

## 4. Mod 1: Canlı Simülasyon Motoru (`live`)

Canlı simülasyon açıkken her **2.000 ms** (`2 sn`) adımda bir yeni `HealthSample[]` paketi üretilir. Sayılar tamamen rastgele sıçramamalı, bir önceki değere **kontrollü adım (random walk + sınır koruması)** ile yaklaşmalıdır:

| Metrik (`HealthType`) | Her Tikte Değişim Aralığı | Normal Tutunma Aralığı | Not |
| --- | --- | --- | --- |
| `heartRate` | `-2` ile `+2` bpm | `64 – 88` bpm (egzersiz/stres dalgası varsa `95 – 108`) | İnsani nabız dalgalanması |
| `bloodPressureSys` | `-2` ile `+2` mmHg | `112 – 126` mmHg | Tam sayıya yuvarla |
| `bloodPressureDia` | `-1` ile `+1` mmHg | `70 – 82` mmHg | Tam sayıya yuvarla |
| `spo2` | `-1` ile `+1` % | `96 – 99` % | `<= 100` sınırla |
| `bodyTemp` | `-0.1` ile `+0.1` °C | `36.3 – 36.9` °C | 1 ondalık basamak (`toFixed(1)`) |
| `bloodGlucose` | `-2` ile `+2` mg/dL | `86 – 112` mg/dL | Tam sayıya yuvarla |
| `sleepHours` | Sabit veya çok yavaş güncelleme | `7.0 – 7.8` saat | Saatlik/günlük metrik, sık sıçramasın |
| `mood` | Nadir değişim (%10 olasılıkla ±1) | `3 – 5` | `1 – 5` arası tam sayı |
| `radiationDose` | `+0.02` mSv (hep artan kümülatif) | `21.0+` mSv | Kümülatif doz düşmez, yavaş artar |

> **İpucu:** Kullanıcı isterse Canlı Simülasyon içinde **"Hız: 1x (2 sn) / 2x (1 sn)"** ve **"Hafif Egzersiz Enjekte Et"** gibi hızlı butonlarla değerlerin gerçek zamanlı olarak tepki vermesini gösterebilir.

---

## 5. Mod 2: 3 Tarihi Uzay Kazası Simülasyonu (`incident`)

Aşağıdaki değerlerin tamamı [`web/src/domain/thresholds.ts`](../web/src/domain/thresholds.ts) içindeki `getStatus()` eşik kurallarına (`green / amber / red`) birebir uyumlu olacak şekilde kalibre edilmiştir.

### Kaza 1: Apollo 13 — Oksijen Tankı Patlaması, CO₂ Birikimi & Soğuk Kabin Krizi
- **ID:** `apollo-13`
- **Tarih & Görev:** `13–17 Nisan 1970` · *Apollo 13 (Odyssey & Aquarius Ay Modülü)*
- **Mürettebat Referansı:** James Lovell, Fred Haise, Jack Swigert
- **Olay Özeti:** Servis modülündeki 2 numaralı oksijen tankının patlaması sonrası ekip Ay Modülü *Aquarius*'a sığındı. Elektrik tasarrufu için kabin ısıtması kapatıldı (kabin sıcaklığı donma sınırına yaklaştı), 2 kişilik kabinde 3 kişi olduğu için CO₂ tehlikeli biçimde yükseldi ("mailbox" LiOH filtre adaptörü yapılana kadar) ve su/uyku kısıtlaması ağır yorgunluğa yol açtı.
- **İlişkili NASA Tehlikeleri (`nasa-hazards.json`):** `hostileClosedEnvironments`, `distanceFromEarth`, `isolationConfinement`
- **Gerçek Sonuç:** Yer ekibinin ürettiği kare-yuvarlak LiOH filtre adaptörüyle CO₂ kontrol altına alındı ve 3 astronot sağ salim Dünya'ya döndü.

| Faz | Görev Zamanı | Faz Başlığı | HR (`bpm`) | Tansiyon (`mmHg`) | SpO2 (`%`) | Vücut Isısı (`°C`) | Şeker (`mg/dL`) | Uyku (`h`) | Ruh Hali (`1-5`) | Radyasyon (`mSv`) | Beklenen Durum |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `T+55:40` | Nominal Seyir (Patlama Öncesi) | `72` | `118 / 76` | `98` | `36.6` | `95` | `7.4` | `4` | `12.0` | `green` |
| 1 | `T+55:55` | O2 Tankı #2 Patlaması & İlk Şok | `116` | `142 / 90` | `96` | `36.5` | `112` | `7.4` | `2` | `12.2` | `red` (Tansiyon, Ruh hali) |
| 2 | `T+68:00` | Aquarius'a Geçiş & Güç/Isıtma Kesintisi | `104` | `136 / 86` | `94` | `35.8` | `86` | `4.0` | `2` | `12.8` | `red` (Uyku, Ruh hali) + `amber` (Isı, SpO2) |
| 3 | `T+84:00` | CO₂ Birikimi & Soğuk Kabin Zirvesi | `118` | `138 / 88` | `91` | `35.3` | `78` | `2.8` | `2` | `13.5` | `red` (Uyku, Ruh hali) + Hiperkapni/Soğuk uyarısı |
| 4 | `T+96:00` | LiOH "Mailbox" Adaptörü Devrede | `94` | `128 / 82` | `95` | `35.7` | `84` | `4.5` | `3` | `14.1` | `red -> amber` (Toparlanma başlangıcı) |
| 5 | `T+142:54` | Atmosfere Giriş & Güvenli Dönüş | `84` | `122 / 78` | `97` | `36.3` | `92` | `5.5` | `4` | `14.6` | `amber` (Uyku toparlanıyor) |

---

### Kaza 2: Mir Uzay İstasyonu — Oksijen Jeneratörü Yangını & Toksik Duman
- **ID:** `mir-1997-fire`
- **Tarih & Görev:** `24 Şubat 1997` · *Mir Uzay İstasyonu (Kvant-1 Modülü)*
- **Mürettebat Referansı:** Jerry Linenger (NASA) & Mir-22/23 Kozmonotları
- **Olay Özeti:** Ek oksijen üretmek için ateşlenen *Vika* katı yakıtlı oksijen jeneratörü ("oksijen mumu") arızalanarak yaklaşık 14 dakika boyunca kaynak makinesi gibi alev ve yoğun toksik duman püskürttü. Kaçış kapsüllerinden birine giden yol kesildi; ekip solunum maskeleriyle yangını söndürdü.
- **İlişkili NASA Tehlikeleri (`nasa-hazards.json`):** `hostileClosedEnvironments`, `isolationConfinement`
- **Gerçek Sonuç:** Yangın söndürücü ve koruyucu maskelerle alevler durduruldu; istasyon yaşam destek sistemleri birkaç saat içinde havayı filtreledi, kalıcı yaralanma olmadan görev sürdü.

| Faz | Görev Zamanı | Faz Başlığı | HR (`bpm`) | Tansiyon (`mmHg`) | SpO2 (`%`) | Vücut Isısı (`°C`) | Şeker (`mg/dL`) | Uyku (`h`) | Ruh Hali (`1-5`) | Radyasyon (`mSv`) | Beklenen Durum |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `T+00:00` | Normal İstasyon Operasyonu | `70` | `115 / 74` | `98` | `36.5` | `94` | `7.2` | `4` | `28.0` | `green` |
| 1 | `T+00:02` | Kvant-1 Alev Püskürmesi & Duman | `126` | `148 / 94` | `93` | `37.1` | `124` | `7.2` | `2` | `28.0` | `red` (HR > 120, Tansiyon) |
| 2 | `T+00:08` | Yoğun Duman & Yangına Müdahale Zirvesi | `138` | `154 / 98` | `87` | `37.9` | `136` | `7.2` | `1` | `28.1` | `red` (**SpO2 < 90**, HR, Tansiyon, Ruh hali) |
| 3 | `T+00:18` | Yangın Söndürüldü · Maske Solunumu | `114` | `136 / 86` | `92` | `37.6` | `118` | `5.8` | `2` | `28.1` | `red/amber` |
| 4 | `T+02:30` | Filtreleme & Hava Kalitesi Düzelmesi | `92` | `124 / 79` | `96` | `37.0` | `102` | `6.0` | `3` | `28.2` | `amber` (Uyku & Ruh hali) |
| 5 | `T+06:00` | İstasyon Güvenli · Stabilizasyon | `76` | `118 / 76` | `98` | `36.6` | `96` | `7.0` | `4` | `28.3` | `green` |

---

### Kaza 3: ISS EVA-23 — Luca Parmitano Kask İçi Su Sızıntısı
- **ID:** `iss-eva-23-water`
- **Tarih & Görev:** `16 Temmuz 2013` · *Uluslararası Uzay İstasyonu (ISS · EVA-23)*
- **Mürettebat Referansı:** Luca Parmitano (ESA) & Chris Cassidy (NASA)
- **Olay Özeti:** Uzay yürüyüşünün 44. dakikasında elbisenin taşınabilir yaşam destek sistemindeki (PLSS) tıkanıklık soğutma suyunu kaskın havalandırma kanalına bastı (~1.5 litre). Mikro yerçekiminde su astronotun gözlerini, kulaklarını ve burnunu kaplayarak iletişimi ve görüşü kesti; astronot güvenlik halatıyla hava kilidine ulaştı.
- **İlişkili NASA Tehlikeleri (`nasa-hazards.json`):** `hostileClosedEnvironments`, `gravityFields`, `isolationConfinement`
- **Gerçek Sonuç:** EVA derhal sonlandırıldı; Parmitano sakin kalarak oksijen tüketimini korudu ve hava kilidine güvenle dönüp kaskı çıkardı.

| Faz | Görev Zamanı | Faz Başlığı | HR (`bpm`) | Tansiyon (`mmHg`) | SpO2 (`%`) | Vücut Isısı (`°C`) | Şeker (`mg/dL`) | Uyku (`h`) | Ruh Hali (`1-5`) | Radyasyon (`mSv`) | Beklenen Durum |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `EVA +00:30` | Normal Uzay Yürüyüşü (EVA Eforu) | `88` | `122 / 78` | `98` | `36.6` | `98` | `7.5` | `5` | `18.0` | `green` |
| 1 | `EVA +00:44` | Kask Arkasında Su Hissedildi | `108` | `134 / 84` | `96` | `36.7` | `104` | `7.5` | `3` | `18.1` | `amber` (HR, Tansiyon, Ruh hali) |
| 2 | `EVA +00:52` | Su Göz & Kulakları Kapladı · İletişim Kesik | `129` | `146 / 92` | `91` | `36.8` | `128` | `7.5` | `2` | `18.2` | `red` (HR, Tansiyon, Ruh hali) |
| 3 | `EVA +01:02` | Hava Kilidine Kör Dönüş & Boğulma Riski Zirvesi | `135` | `150 / 95` | `88` | `36.4` | `134` | `7.5` | `1` | `18.3` | `red` (**SpO2 < 90**, HR > 120, Tansiyon) |
| 4 | `EVA +01:12` | Hava Kilidi Basınçlama & Kask Çıkarıldı | `106` | `132 / 84` | `94` | `36.5` | `110` | `7.5` | `3` | `18.3` | `amber` |
| 5 | `EVA +01:35` | İstasyon İçinde Güvenli Toparlanma | `78` | `118 / 76` | `98` | `36.6` | `96` | `7.5` | `4` | `18.3` | `green` |

---

## 6. Fazlar Arası Akıcı Geçiş & Görsel Davranış Kuralları

1. **Tek Seferde Sıçrama Yerine Ara Değer (İnterpolasyon) Önerisi:**
   - Her faz `durationMs: 4000` (4 sn) sürerken, UI `1000 ms`'de bir hedef faza doğru ara adım üretebilir. Böylece `HR 70 -> 126` doğrudan atlamak yerine `70 -> 92 -> 110 -> 126` şeklinde akarak grafiklerde gerçek bir monitör hissi yaratır.
   - Bu adım süresi içinde küçük gerçekçi gürültü (`±1` bpm gibi) eklenebilir.
2. **Simülasyon Sırasında Üst Banner (HUD):**
   - Kaza veya Canlı simülasyon açıkken ekranın en üstünde dikkat çekici bir simülasyon barı gösterilmelidir:
     - Aktif mod / Kaza adı (`"CANLI SİMÜLASYON"` veya `"TARİHİ KAZA: Mir 1997 Yangını · Faz 3/6"`)
     - İlerleme çubuğu (`Faz 3 / 6` + görev zamanı `T+00:08`)
     - O anki fazın 1–2 cümlelik açıklaması (`eventDescription` + varsa `cabinHint`)
     - Kontroller: **`Duraklat / Devam Et`**, **`Sonraki Faz`** ve belirgin kırmızı/amber **`Simülasyonu Bitir`** butonu.
3. **3D Vücut Haritası (`ThreeBodyMap.tsx`) & Rehberlik (`GuidancePanel`):**
   - Parametreler faz boyunca değiştikçe, mevcut `thresholds.ts` -> `getStatus()` otomatik olarak kart renklerini (`green -> amber -> red`), vücut haritası organ vurgularını (örn. SpO2 düşünce akciğerler, HR yükselince kalp kırmızıya döner) ve uçuş cerrahı yönlendirme metinlerini güncellemeli; ayrı bir kopya eşik kuralı yazılmamalıdır.

---

## 7. "Simülasyonu Bitir" ve Sonuç Ekranı (`summary`) Davranışı

Kullanıcı **"Simülasyonu Bitir"** butonuna bastığında **veya** kaza simülasyonunun 6. fazı doğal olarak bittiğinde:

1. Simülasyon döngüsü (`setInterval` / `setTimeout`) durur.
2. Ekranda tam odaklı bir **Simülasyon Sonuç Raporu (Summary Modal / View)** açılır ve şunları gösterir:
   - **Simülasyon Türü & Süresi:** Örn. *"Mir Uzay İstasyonu Yangını (24 Şubat 1997) · 24 saniye"*
   - **Ulaşılan En Yüksek Risk Seviyesi:** `RED / KRİTİK` (veya `AMBER / GREEN`) rozeti
   - **Eşik Aşan Metrik Özeti:** Hangi metrikler `amber`/`red` oldu ve görülen en uç değerler (örn. `SpO2 min %87`, `Nabız maks 138 bpm`, `Tansiyon maks 154/98 mmHg`)
   - **Sistem Tepkisi & Uçuş Cerrahı Eskalasyonu:** *"Sistem kritik eşikte kırmızı alarm üretti ve uçuş cerrahı eskalasyonu önerdi."*
   - **Gerçek Tarihsel Sonuç Notu (Kaza modunda):** `historicalOutcome` kutusu
   - **Ana Aksiyon Butonu:** **"Ana Ekrana Dön"** (tıklandığında `preSimulationSnapshot` geri yüklenir ve `idle` moduna geçilir; istenirse yanına *"Tekrar Oynat"* ikonu da eklenebilir).

---

## 8. Web Geliştirici İçin Uygulama Adımları (Önerilen Dosya Planı)

1. `web/src/domain/incidents.ts` — Bölüm 3 ve Bölüm 5'teki tipleri ve 3 kaza verisini (`HISTORICAL_INCIDENTS`) oluştur.
2. `web/src/data/useSimulation.ts` — `live` (random-walk ticker) ve `incident` (faz zamanlayıcı + ara değer interpolasyonu + `summary` istatistik toplayıcı + `finishSimulation` / `returnToDashboard`) hook'unu yaz.
3. `web/src/data/useHealthData.ts` — `VITE_API_URL` varsa backend (`POST /api/samples`, `GET /api/stream`, `POST /api/ai/demo/reset`) ile senkronize çalışacak şekilde bağla; yoksa yerel state/`localStorage` ile devam et.
4. `web/src/components/SimulationControls.tsx` & `SimulationSummaryModal.tsx` — Üst kontrol barı (Mod seçici + Aktif simülasyon HUD + **Simülasyonu Bitir**) ve Sonuç ekranı (**Ana Ekrana Dön**) bileşenlerini ekle.
5. **Doğrulama:**
   - `cd web && npm run build` hatasız geçmeli.
   - Her 3 kaza simülasyonunda en az 1 kez beklenen `red` alarmının ve `GuidancePanel` yönlendirmesinin tetiklendiği kontrol edilmeli.
   - **"Simülasyonu Bitir"** -> **Sonuç Ekranı** -> **"Ana Ekrana Dön"** akışının sonrasında dashboard'un simülasyon öncesi değerlere eksiksiz döndüğü doğrulanmalı.
