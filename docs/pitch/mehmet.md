# Pitch Summary — Shared Data, Simulations & Historical Incident Replays (Mehmet)

**Role:** Veri Mimarisi, Tarihî Uzay Kazası Simülasyonları ve Trend Kuralları | **Presenter Suggestion:** Mehmet (~60 sn veri & kriz doğrulama anlatımı + ~15 sn canlı Apollo 13 kaza tekrarı, 3:00–6:00 demo bloğu)

## What I Built
- **Ortak Veri Sözleşmesi ve Birleştirilmiş Veri Havuzu (`shared/mock/`):** Apple Watch, iPhone ve Web kokpitinin aynı anda kullandığı tekil veri şeması (`astronaut-packets.json`, `samples.json` ve 490+ kayıtlık birleştirilmiş `all-data.json`).
- **Tarihî Uzay Kazası Simülasyonları (`historical-incidents.json` & `backend/server.mjs`):** Gerçek uzay görevlerinden modellenen 6 aşamalı (T+0'dan T+5'e) canlı SSE kaza tekrarları ve NASA HRP 5 temel uzay tehlikesi (`nasa-hazards.json`) eşleştirmesi.
- **Çok Günlü Trend ve Erken Uyarı Motoru (`Thresholds` & `check-trends.mjs`):** Tekil ölçüm normal görünse bile günler içinde sinsi ilerleyen klinik bozulmaları yakalayan deterministik trend kuralı ve Türkçe demo/prova dokümantasyonu (`docs/demo-script.md`, `docs/rehearsal.md`).

## Historical Space Incidents & Research (4 Referans Olay)
- **1. Apollo 13 (Nisan 1970) — Oksijen Tankı Patlaması, Hipotermi ve CO₂ Zehirlenmesi:** 2 numaralı oksijen tankı patlaması sonrası mürettebat 3,8 °C'ye düşen Ay Modülü'nde susuzluk ve LiOH filtre uyumsuzluğu kaynaklı CO₂ birikimi yaşadı. *Sistemdeki Karşılığı:* Komutan Kaya'da uyku `6,5 sa → 2,8 sa`, vücut ısısı `35,3 °C` (hipotermi), SpO₂ `%91` ve stres tansiyonu `142/90 mmHg` ile kademeli KIRMIZI alarm ve acil LiOH/termal protokol önerisi.
- **2. Mir Uzay İstasyonu Yangını (Şubat 1997) — "Vika" Katı Yakıtlı Oksijen Jeneratörü Kazası:** Lityum perklorat kanisterinin alev almasıyla kabin duman, toksik gaz ve yüksek ısıyla (`37,9 °C`) doldu; mürettebat saatlerce solunum maskeleriyle mücadele etti. *Sistemdeki Karşılığı:* Nabzın `68 → 130 bpm` fırlaması, SpO₂'nin `%97 → %89`'a çökmesi ve tansiyonun `148/92 mmHg`'ye çıkmasıyla anında KIRMIZI "Kabin Duman/Hipoksi" uyarısı.
- **3. ISS EVA-23 Luca Parmitano (Temmuz 2013) — Kask İçi Su Sızıntısı:** Soğutma sistemi arızasıyla mikroçekimde kask içinde biriken 1,5 litre su astronotun göz, kulak ve burun yollarını kapattı; iletişim kesildi ve boğulma tehlikesi yaşandı. *Sistemdeki Karşılığı:* EVA eforuyla nabzın `138 bpm`'e, tansiyonun `146/92 mmHg`'ye çıkması ve SpO₂'nin `%91`'e düşmesiyle "EVA'yı derhal sonlandır ve hava kilidine dön" komutu.
- **4. Ağustos 1972 Dev Güneş Fırtınası (Solar Particle Event) — Radyasyon Sıçraması:** Apollo 16 ile 17 görevleri arasında gerçekleşen tarihin en şiddetli güneş parçacık fırtınası (astronotlar Ay yüzeyinde olsaydı akut radyasyon hastalığı riski doğacaktı). *Sistemdeki Karşılığı:* Günlük radyasyon dozunun `0,38 mSv`'den `1,30 mSv/gün` seviyesine sıçramasıyla KIRMIZI alarm ve "fırtına sığınağına (storm shelter) geç" uyarısı.

## Selling Points for the Jury
1. **Gerçek tarihten ilham:** Sistemimiz rastgele sayılarla değil; Apollo 13, Mir 1997 yangını, ISS EVA-23 ve 1972 Güneş Fırtınası gibi gerçek uzay krizleriyle sınanıyor.
2. **NASA'nın 5 tehlikesine doğrudan bağlı:** Takip edilen 9 sağlık göstergesinin tamamı NASA İnsan Araştırmaları Programı'nın (HRP) 5 temel uzay tehlikesiyle birebir eşleştirildi.
3. **Çok günlük trend kuralı:** Yalnızca anlık kritik eşikler değil, günler içinde sinsi ilerleyen bozulmalar da (uyku erimesi, tansiyon kayması, radyasyon birikimi) erken uyarı üretiyor.
4. **Tek ortak veri sözleşmesi:** Apple Watch, iPhone ve Web kokpiti aynı JSON şemasını konuşarak tüm cihazlarda sıfır gecikmeyle senkronize çalışıyor.

## Demo Moment (On Stage)
- **Canlı Apollo 13 Kaza Tekrarı (~15 saniye):** Sahnede "Apollo 13" senaryosu tetiklendiğinde, 6 aşamalı (T+0 → T+5) zaman akışında kabin soğurken ve CO₂ yükselirken Komutan Kaya'nın uykusu `2,8 sa`, vücut ısısı `35,3 °C`, SpO₂ `%91` ve tansiyonu `142/90 mmHg` olarak adım adım **Yeşil → Sarı → Kırmızı** alarma döner; uçuş cerrahı eskalasyonu ve Türkçe eylem adımları ekranda canlı belirir.

## Facts & Numbers
- **4** tarihî uzay krizi senaryosu (Apollo 13, Mir 1997, ISS EVA-23, 1972 Güneş Fırtınası) & **6'şar** zaman aşaması (T+0..T+5).
- **5** NASA HRP uzay tehlikesi, **3** astronot profili (hepsi başlangıçta **Yeşil/Stabil**) ve **9** biyometrik/çevresel sağlık göstergesi.
- **490+** birleştirilmiş veri kaydı (`all-data.json`), **243** zaman serisi ölçümü (`samples.json`), **7/7** geçen otomatik trend testi (`check-trends.mjs`) ve **16+** backend birim testi.

## Challenges Solved & Next Steps
- **Çözülen Zorluklar:** NASA açık arşivlerindeki (LSDA/OSDR) gizlilik kısıtlı ham veriler yerine literatürdeki gerçek kaza telemetrilerini deterministik eşik motoruna dönüştürdük; AI yanıt gecikmelerine karşı kural tabanlı yedek (fallback) rehberlik ekleyerek yaşamsal durum kararını (Yeşil/Sarı/Kırmızı) %100 deterministik tuttuk.
- **Sonraki Adımlar (Faz 2):** NASA OSDR gerçek zamanlı veri akışı entegrasyonu, çoklu mürettebat çapraz korelasyon analizi ve kask içi sesli uyarı asistanı.

---
*Demo software, not a medical device. — Bu yazılım bir demo uygulamasıdır, tıbbi cihaz değildir.*
