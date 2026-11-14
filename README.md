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

## 📁 Depo Yapısı

```text
ANTIGRAVITY/
├── docs/
│   ├── Hackathon-Subject.md    # Orijinal yarışma metninin yapılandırılmış Markdown sürümü (EN)
│   └── Hackathon-Subject.pdf   # Orijinal yarışma metni PDF dosyası (EN)
├── Hackathon-Subject-TR.pdf    # Yarışma metninin Türkçe çeviri PDF dosyası (TR)
└── README.md                   # Proje özeti ve Türkçe dokümantasyon
```

- 🇹🇷 **Yarışma Konusu (Türkçe PDF):** [`Hackathon-Subject-TR.pdf`](./Hackathon-Subject-TR.pdf)
- 📄 **Yarışma Konusu (Orijinal Markdown - EN):** [`docs/Hackathon-Subject.md`](./docs/Hackathon-Subject.md)
- 📑 **Yarışma Konusu (Orijinal PDF - EN):** [`docs/Hackathon-Subject.pdf`](./docs/Hackathon-Subject.pdf)

---

## 🔗 Resmi Kaynaklar

- 🎥 **Yarışma Tanıtım Videosu:** [YouTube — 2026 NASA Space Apps Challenge](https://www.youtube.com/watch?v=RERG3gEmdC8)
- 🌐 **Yarışma Portalı:** [NASA Space Apps Challenge 2026](https://www.spaceappschallenge.org/2026/challenges/)
- 🧬 **NASA HRP — İnsanlı Uzay Uçuşunun 5 Tehlikesi:** [nasa.gov/hrp/hazards](https://www.nasa.gov/hrp/hazards/)
- ⚠️ **NASA HRP — İnsanlı Uzay Uçuşunun Riskleri:** [nasa.gov/hrp/risks](https://www.nasa.gov/hrp/risks/)
- 🔬 **NASA HRP — Uzayda Devam Eden Araştırmalar:** [nasa.gov/hrp/ongoing-hrp-research](https://www.nasa.gov/hrp/ongoing-hrp-research/)
- 🇨🇦 **CSA — Astronot Sağlığı İçin Radyasyonun İzlenmesi:** [asc-csa.gc.ca](https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp)
- 🛰️ **CSA — Uzayda Neden Bilimsel Deneyler Yapıyoruz?:** [asc-csa.gc.ca](https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp)
