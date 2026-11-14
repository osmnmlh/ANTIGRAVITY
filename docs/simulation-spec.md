# Simülasyon Modları & Tarihsel Uzay Kazası Senaryoları — Web Entegrasyon Şartnamesi

> **Uyarı:** **Demo software, not a medical device.** — Bu simülasyonlar eğitim ve hackathon prototip gösterimi içindir; klinik tanı veya gerçek tıbbi karar destek sistemi değildir.

Bu doküman, Web Dashboard (`web/`) üzerinde **canlı telemetri akışı** ve **tarihî uzay kazaları simülasyonu** göstermek için `backend/server.mjs` üzerindeki gerçek simülasyon motoruna nasıl bağlanılacağını tanımlar.

> **Önemli Mimari Kuralı (İkinci Motor Yazma):** Canlı telemetri döngüsü (`live`) ve 3 tarihî kaza senaryosu (`apollo-13`, `mir-1997-fire`, `iss-eva-23-water`) **doğrudan `backend/server.mjs` içindedir** ve `shared/mock/historical-incidents.json` üzerinden servis edilir. Web tarafı tarayıcıda ayrı bir `useSimulation.ts` veya `incidents.ts` simülasyon motoru **oluşturmamalıdır**; yalnızca backend uç noktalarını çağırıp `/api/stream` SSE akışını dinlemelidir. Backend erişilemezse web sessizce yerel mock durumuna (`shared/mock/samples.json`) düşer ([ADR-0002](./adr/0002-web-data-source.md)).

---

## 1. Genel Bakış: Web Tarafındaki Görünüm ve Modlar

Web arayüzünün üst kontrol çubuğunda kullanıcı şu modlar arasında geçiş yapar:

1. **Normal / Başlangıç Durumu (`idle`):** Tüm astronotlar (`crew-1`, `crew-2`, `crew-3`) başlangıçta **yeşil (`green`)** başlar + kullanıcının formdan girdiği manuel ölçümler görünür.
2. **Canlı Simülasyon (`live`):** `POST /api/simulation/live/start` çağrılır. Backend her `intervalMs` (varsayılan `2000 ms`) adımda fizyolojik sınırlar içinde gerçekçi küçük dalgalanmalar üretir ve `GET /api/stream` üzerinden tüm istemcilere (Web + iPhone + Watch) yayınlar.
3. **Geçmiş Kaza Simülasyonu (`incident`):** Kullanıcı `GET /api/incidents` ile listelenen 3 tarihî uzay kazasından birini seçer ve Web `POST /api/simulation/incident/start` isteği atar. Backend kazayı faz faz oynatır; Web üst bilgi şeridini (HUD) ve SSE ile gelen değişen metrikleri gösterir. Son faz bittiğinde veya **"Simülasyonu Bitir"** butonuna basıldığında (`POST /api/simulation/stop`) **Sonuç Ekranı (`summary`)** gösterilir ve **"Ana Ekrana Dön"** ile `POST /api/demo/reset` (veya `{ "reset": true }`) çağrılarak başlangıç durumuna dönülür.

---

## 2. Backend Simülasyon Uç Noktaları ve SSE Akışı (`backend/server.mjs`)

| Yöntem | Uç Nokta | İstek / Yanıt Özeti |
| --- | --- | --- |
| `GET` | `/api/incidents` | 3 tarihî kaza verisini (`shared/mock/historical-incidents.json`) döner |
| `GET` | `/api/simulation` | Aktif simülasyon durumunu (`mode`, `running`, `phaseIndex`, `totalPhases`, `activePhase`, `highestSeverity`, `triggeredAlerts`, `flightSurgeonEscalated`) ve kaza listesini döner |
| `POST` | `/api/simulation/live/start` | Opsiyonel `{ "crewId": "crew-1", "intervalMs": 2000 }` (`crewId` verilmezse tüm ekibi canlı akıtır) |
| `POST` | `/api/simulation/incident/start` | `{ "incidentId": "apollo-13", "crewId": "crew-1", "stepIntervalMs": 2500 }` |
| `POST` | `/api/simulation/stop` | `{ "reset": true }` → simülasyonu durdurur, özet döner ve tüm paketi simülasyon öncesi duruma geri alır (`reset: false` verilirse son özeti ekranda bırakır) |
| `POST` | `/api/demo/reset` | Tam sıfırlama (`POST /api/simulation/reset` ile eşdeğer): simülasyonu durdurur, mock paketi ve AI uyarılarını sıfırlar, tüm ekibi yeşile döndürür |
| `GET` | `/api/stream` | SSE yayını: `hello` (`astronauts`, `simulation`), ardından her adımda `sample`, `packet` ve `simulation` olayları |

### Veri İzolasyonu ve Ana Ekrana Dönüş Akışı

1. Backend simülasyonu başlatırken (`live/start` veya `incident/start`) başlangıç durumunu kendi RAM'inde `preSimSnapshot` olarak saklar.
2. **"Simülasyonu Bitir"** butonuna basıldığında:
   - Web `POST /api/simulation/stop` çağırır (özet ekranını göstermek için `{ "reset": false }` gönderip özet modalını açabilir).
3. Son faz doğal olarak bittiğinde:
   - SSE `simulation` olayında `mode: "summary"` ve `completedAllPhases: true` gelir; Web otomatik olarak **Sonuç Ekranı** modalını açar.
4. Kullanıcı Sonuç Ekranında **"Ana Ekrana Dön"** butonuna bastığında:
   - Web `POST /api/demo/reset` çağırır, simülasyon modalını kapatır ve `/api/stream` üzerinden gelen temiz başlangıç paketleriyle ana ekrana döner.

---

## 3. UI Akışı & Durum Makinesi

```text
[idle (Ana Ekran — tüm mürettebat yeşil)]
   │
   ├── "Canlı Simülasyonu Başlat" ──► POST /api/simulation/live/start ──► [running (live)]
   │                                                                            │
   └── "Geçmiş Kaza Seç" ───────────► POST /api/simulation/incident/start ► [running (incident)]
                                                                                │
        ("Simülasyonu Bitir" -> POST /api/simulation/stop                      ◄┘
         VEYA SSE `simulation` event'i `mode === "summary"` geldi)
                                  │
                                  ▼
                       [summary (Sonuç Ekranı)]
                                  │
                     ("Ana Ekrana Dön" -> POST /api/demo/reset)
                                  │
                                  ▼
                         [idle (Ana Ekran)]
```

### Backend `simulation` SSE Payload Tipi (Frontend Referansı)

```ts
export type SimulationMode = 'idle' | 'live' | 'incident' | 'summary'
export type IncidentId = 'apollo-13' | 'mir-1997-fire' | 'iss-eva-23-water'

export interface IncidentPhase {
  phaseIndex: number
  missionTimeLabel: string
  title: string
  eventDescription: string
  durationMs: number
  cabinHint?: string
  metrics: Record<HealthType, number>
}

export interface SimulationEventPayload {
  mode: SimulationMode
  running: boolean
  crewId: string | null
  incidentId: IncidentId | null
  incidentTitle: string | null
  historicalOutcome: string | null
  phaseIndex: number
  totalPhases: number
  activePhase: IncidentPhase | null
  intervalMs: number
  startedAt: string | null
  endedAt: string | null
  highestSeverity: 'green' | 'amber' | 'red'
  triggeredAlerts: Array<{
    type: HealthType
    peakStatus: 'amber' | 'red'
    extremeValue: number
    unit: string
    phaseLabel: string
  }>
  flightSurgeonEscalated: boolean
  completedAllPhases?: boolean
  stoppedEarly?: boolean
}
```

---

## 4. Backend'deki 3 Tarihî Uzay Kazası (`shared/mock/historical-incidents.json`)

Aşağıdaki değerler [`web/src/domain/thresholds.ts`](../web/src/domain/thresholds.ts) içindeki `getStatus()` eşiklerine (`green / amber / red`) birebir göre kalibre edilmiştir ve backend `GET /api/incidents` üzerinden döner.

### Kaza 1: Apollo 13 — Oksijen Tankı Patlaması, CO₂ Birikimi & Soğuk Kabin Krizi
- **ID:** `apollo-13` · **Tarih:** `13–17 Nisan 1970` · **Mürettebat:** James Lovell, Fred Haise, Jack Swigert
- **Özet:** O2 tankı #2 patlaması sonrası *Aquarius* Ay Modülü'ne sığınma, ısıtma kesintisiyle soğuk kabin stresi, CO₂ yükselmesi (LiOH "mailbox" adaptörü yapılana kadar) ve ağır uyku yoksunluğu.

| Faz | Görev Zamanı | Faz Başlığı | HR (`bpm`) | Tansiyon (`mmHg`) | SpO2 (`%`) | Vücut Isısı (`°C`) | Şeker (`mg/dL`) | Uyku (`h`) | Ruh Hali (`1-5`) | Radyasyon (`mSv`) | Beklenen Durum |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `T+55:40` | Nominal Seyir (Patlama Öncesi) | `72` | `118 / 76` | `98` | `36.6` | `95` | `7.4` | `4` | `12.0` | `green` |
| 1 | `T+55:55` | O2 Tankı #2 Patlaması & İlk Şok | `116` | `142 / 90` | `96` | `36.5` | `112` | `7.4` | `2` | `12.2` | `red` (Tansiyon, Ruh hali) |
| 2 | `T+68:00` | Aquarius'a Geçiş & Isıtma Kesintisi | `104` | `136 / 86` | `94` | `35.8` | `86` | `4.0` | `2` | `12.8` | `red` (Uyku, Ruh hali) + `amber` (Isı, SpO2) |
| 3 | `T+84:00` | CO₂ Birikimi & Soğuk Kabin Zirvesi | `118` | `138 / 88` | `91` | `35.3` | `78` | `2.8` | `2` | `13.5` | `red` (Uyku, Ruh hali) + Hiperkapni/Soğuk |
| 4 | `T+96:00` | LiOH "Mailbox" Adaptörü Devrede | `94` | `128 / 82` | `95` | `35.7` | `84` | `4.5` | `3` | `14.1` | `red -> amber` |
| 5 | `T+142:54` | Atmosfere Giriş & Güvenli Dönüş | `84` | `122 / 78` | `97` | `36.3` | `92` | `5.5` | `4` | `14.6` | `amber` (Uyku toparlanıyor) |

---

### Kaza 2: Mir Uzay İstasyonu — Oksijen Jeneratörü Yangını & Toksik Duman
- **ID:** `mir-1997-fire` · **Tarih:** `24 Şubat 1997` · **Mürettebat:** Jerry Linenger (NASA) & Mir-22/23
- **Özet:** *Kvant-1* modülünde katı yakıtlı *Vika* oksijen jeneratörü yangını (~14 dk alev ve yoğun toksik duman) ve solunum maskeleriyle müdahale.

| Faz | Görev Zamanı | Faz Başlığı | HR (`bpm`) | Tansiyon (`mmHg`) | SpO2 (`%`) | Vücut Isısı (`°C`) | Şeker (`mg/dL`) | Uyku (`h`) | Ruh Hali (`1-5`) | Radyasyon (`mSv`) | Beklenen Durum |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `T+00:00` | Normal İstasyon Operasyonu | `70` | `115 / 74` | `98` | `36.5` | `94` | `7.2` | `4` | `28.0` | `green` |
| 1 | `T+00:02` | Kvant-1 Alev Püskürmesi & Duman | `126` | `148 / 94` | `93` | `37.1` | `124` | `7.2` | `2` | `28.0` | `red` (HR > 120, Tansiyon) |
| 2 | `T+00:08` | Yoğun Duman & Müdahale Zirvesi | `138` | `154 / 98` | `87` | `37.9` | `136` | `7.2` | `1` | `28.1` | `red` (**SpO2 < 90**, HR, Tansiyon) |
| 3 | `T+00:18` | Yangın Söndürüldü · Maske Solunumu | `114` | `136 / 86` | `92` | `37.6` | `118` | `5.8` | `2` | `28.1` | `red/amber` |
| 4 | `T+02:30` | Filtreleme & Kısmi İyileşme | `92` | `124 / 79` | `96` | `37.0` | `102` | `6.0` | `3` | `28.2` | `amber` (Uyku & Ruh hali) |
| 5 | `T+06:00` | İstasyon Güvenli · Stabilizasyon | `76` | `118 / 76` | `98` | `36.6` | `96` | `7.0` | `4` | `28.3` | `green` |

---

### Kaza 3: ISS EVA-23 — Luca Parmitano Kask İçi Su Sızıntısı
- **ID:** `iss-eva-23-water` · **Tarih:** `16 Temmuz 2013` · **Mürettebat:** Luca Parmitano (ESA) & Chris Cassidy (NASA)
- **Özet:** Uzay yürüyüşünün 44. dakikasında PLSS tıkanıklığı nedeniyle ~1.5 L su kask içine doldu; sesli iletişim ve görüş kesildi, astronot güvenlik halatıyla hava kilidine ulaştı.

| Faz | Görev Zamanı | Faz Başlığı | HR (`bpm`) | Tansiyon (`mmHg`) | SpO2 (`%`) | Vücut Isısı (`°C`) | Şeker (`mg/dL`) | Uyku (`h`) | Ruh Hali (`1-5`) | Radyasyon (`mSv`) | Beklenen Durum |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | `EVA +00:30` | Normal Uzay Yürüyüşü (EVA Eforu) | `88` | `122 / 78` | `98` | `36.6` | `98` | `7.5` | `5` | `18.0` | `green` |
| 1 | `EVA +00:44` | Kask Arkasında Su Sızıntısı | `108` | `134 / 84` | `96` | `36.7` | `104` | `7.5` | `3` | `18.1` | `amber` |
| 2 | `EVA +00:52` | Su Göz & Kulakları Kapladı · İletişim Kesik | `129` | `146 / 92` | `91` | `36.8` | `128` | `7.5` | `2` | `18.2` | `red` |
| 3 | `EVA +01:02` | Hava Kilidine Kör Dönüş Zirvesi | `135` | `150 / 95` | `88` | `36.4` | `134` | `7.5` | `1` | `18.3` | `red` (**SpO2 < 90**, HR > 120) |
| 4 | `EVA +01:12` | Hava Kilidi Basınçlama & Kask Çıkarıldı | `106` | `132 / 84` | `94` | `36.5` | `110` | `7.5` | `3` | `18.3` | `amber` |
| 5 | `EVA +01:35` | İstasyon İçinde Güvenli Toparlanma | `78` | `118 / 76` | `98` | `36.6` | `96` | `7.5` | `4` | `18.3` | `green` |

---

## 5. Görsel HUD ve Sonuç Ekranı (`summary`) Davranışı

1. **Simülasyon Sırasında Üst Banner (HUD):**
   - Backend'den `simulation.running === true` geldiğinde ekranın en üstünde simülasyon şeridi açılır:
     - Aktif mod / Kaza adı (`"CANLI SİMÜLASYON"` veya `incidentTitle`)
     - Kaza modunda ilerleme (`Faz ${phaseIndex + 1} / ${totalPhases}` + `activePhase.missionTimeLabel`)
     - O anki faz açıklaması (`activePhase.eventDescription` + varsa `activePhase.cabinHint`)
     - Kırmızı **`Simülasyonu Bitir`** butonu (`POST /api/simulation/stop` `{ "reset": false }` çağırır)
2. **Sonuç Ekranı (Summary Modal):**
   - `simulation.mode === 'summary'` olduğunda modal açılır ve şunları gösterir:
     - Ulaşılan en yüksek risk seviyesi (`highestSeverity`), tetiklenen metrik uyarıları (`triggeredAlerts`), `flightSurgeonEscalated` notu ve kaza modunda `historicalOutcome`.
     - **"Ana Ekrana Dön"** butonu: `POST /api/demo/reset` çağırır ve modalı kapatır.
3. **3D Vücut Haritası (`ThreeBodyMap.tsx`) & Rehberlik:**
   - Gelen `sample` / `packet` SSE verileri `thresholds.ts` -> `getStatus()` ile otomatik renklenir; ayrı bir eşik mantığı yazılmaz.

---

## 6. Web Geliştirici İçin Uygulama Adımları (Önerilen Dosya Planı)

> Web tarafı **yalnızca backend uç noktalarına bağlanır**; tarayıcıda ayrı bir ticker/faz zamanlayıcı yazılmaz (`useSimulation.ts` veya `incidents.ts` gerekmez).

1. **`web/src/data/useHealthData.ts` (Issue #9 ile uyumlu):**
   - `VITE_API_URL` tanımlıysa açılışta `GET /api/packets`, `GET /api/samples` ve `GET /api/simulation` çek; `new EventSource(\`\${VITE_API_URL}/api/stream\`)` ile `hello`, `sample`, `packet`, `simulation` olaylarını dinle.
   - `VITE_API_URL` yoksa veya backend yanıt vermiyorsa **sessizce** (`badge` veya hata banner'ı göstermeden, ADR-0002) yerel mock/`localStorage` ile çalışmaya devam et.
   - Simülasyon kontrol yardımcıları dışa aktar: `startLiveSimulation()`, `startIncidentSimulation(incidentId, crewId, stepIntervalMs)`, `stopSimulation()`, `resetDemo()`.
2. **`web/src/components/SimulationControls.tsx` & `SimulationSummaryModal.tsx`:**
   - Üst kontrol çubuğunda `Canlı Simülasyonu Başlat` + `Geçmiş Kaza Seç (Apollo 13 / Mir 1997 / ISS EVA-23)` menüsü (backend canlı değilse/offline modda pasif veya gizli), çalışırken HUD şeridi + **Simülasyonu Bitir**, bitince özet modalı + **Ana Ekrana Dön**.
3. **Doğrulama:**
   - `cd web && npm run build` hatasız geçmeli.
   - Backend açıkken `Apollo 13` veya `Mir 1997` başlatıldığında hem kartların `red` alarmı ürettiği hem **"Simülasyonu Bitir"** -> **Sonuç Ekranı** -> **"Ana Ekrana Dön"** (`POST /api/demo/reset`) sonrası tüm mürettebatın tekrar `green` olduğu doğrulanmalı.
