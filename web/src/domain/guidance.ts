import type { HealthType } from './types'

export interface Guidance {
  hazard: string
  what: string
  why: string
  doNow: string[]
  escalate: string
}

export const guidanceByType: Record<HealthType, Guidance> = {
  heartRate: {
    hazard: 'Değişen yerçekimi alanları',
    what: 'Dinlenirken bir dakikadaki kalp atışı sayısıdır.',
    why: 'Sıvıların vücutta yer değiştirmesi, dolaşım ve egzersiz yanıtını etkileyebilir.',
    doNow: ['Dinlenirken tekrar ölç.', 'Ölçümden önce egzersiz yaptıysan bunu not et.'],
    escalate: 'Kırmızı durumda veya kendini kötü hissediyorsan mürettebat sağlık sorumlusuna haber ver ve uçuş cerrahıyla iletişim kur.',
  },
  bloodPressureSys: {
    hazard: 'Değişen yerçekimi alanları',
    what: 'Kalp kasıldığında damarlarda ölçülen büyük tansiyon değeridir.',
    why: 'Mikro yerçekimindeki sıvı kayması dolaşım ölçümlerini etkileyebilir.',
    doNow: ['Beş dakika sakin oturduktan sonra tekrar ölç.', 'Ölçüm kolunun kalp hizasında olduğundan emin ol.'],
    escalate: 'Kırmızı durumda ölçümü mürettebat sağlık sorumlusuyla paylaş ve uçuş cerrahına haber ver.',
  },
  bloodPressureDia: {
    hazard: 'Değişen yerçekimi alanları',
    what: 'Kalp atımları arasında damarlarda ölçülen küçük tansiyon değeridir.',
    why: 'Dolaşımdaki değişimleri izlemeye yardımcı olur.',
    doNow: ['Beş dakika sakin oturduktan sonra tekrar ölç.', 'Ölçüm kolunu destekleyip sonucu kaydet.'],
    escalate: 'Kırmızı durumda ölçümü mürettebat sağlık sorumlusuyla paylaş ve uçuş cerrahına haber ver.',
  },
  spo2: {
    hazard: 'Düşmanca kapalı ortamlar',
    what: 'Kandaki oksijen doygunluğunun tahmini yüzdesidir.',
    why: 'Kapalı kabin havası ve solunumla ilgili değişimleri fark etmeye yardımcı olur.',
    doNow: ['Oturup sakinleş, sensörün doğru takıldığını kontrol et.', 'Beş dakika içinde tekrar ölç.'],
    escalate: 'Kırmızı durumda veya nefes almakta zorlanıyorsan hemen mürettebat sağlık sorumlusuna ve uçuş cerrahına haber ver.',
  },
  bodyTemp: {
    hazard: 'Düşmanca kapalı ortamlar',
    what: 'Vücudun ölçüm anındaki sıcaklığıdır.',
    why: 'Kapalı bir yaşam alanında enfeksiyon veya çevresel stres belirtilerini izlemeye katkı sağlar.',
    doNow: ['Ölçüm cihazını kontrol ederek tekrar ölç.', 'Dinlen ve eşlik eden belirtileri kaydet.'],
    escalate: 'Kırmızı durumda mürettebat sağlık sorumlusuna haber ver ve uçuş cerrahıyla iletişim kur.',
  },
  bloodGlucose: {
    hazard: 'Kapalı ortam ve beslenme',
    what: 'Kandaki glukoz miktarının ölçümüdür.',
    why: 'Beslenme düzeni ve enerji durumundaki değişimleri izlemeye yardımcı olur.',
    doNow: ['Ölçümün açlık ölçümü olup olmadığını kaydet.', 'Ölçüm cihazının talimatlarına göre tekrar kontrol et.'],
    escalate: 'Kırmızı durumda veya kendini kötü hissediyorsan mürettebat sağlık sorumlusuna haber ver ve uçuş cerrahıyla iletişim kur.',
  },
  sleepHours: {
    hazard: 'İzolasyon ve kapalı ortam',
    what: 'Son 24 saatte uyuduğun toplam süredir.',
    why: 'Uyku ve sirkadiyen düzen, dikkat ve günlük görevleri etkileyebilir.',
    doNow: ['Dinlenme dönemini planla.', 'Görev programı uygunsa uyku öncesi ışığı azalt.'],
    escalate: 'Kırmızı durumda ya da uyku sorunu sürüyorsa mürettebat sağlık sorumlusuna bildir; uçuş cerrahından destek iste.',
  },
  mood: {
    hazard: 'İzolasyon ve kapalı ortam',
    what: 'Kendi bildirdiğin ruh hâli puanıdır; 1 düşük, 5 iyidir.',
    why: 'Uzun süreli izolasyon ve stres, ruh hâlini ve ekip içi işleyişi etkileyebilir.',
    doNow: ['Kısa bir mola ver ve puanı daha sonra tekrar değerlendir.', 'İstersen güvendiğin bir ekip arkadaşıyla konuş.'],
    escalate: 'Kırmızı durumda veya desteğe ihtiyaç duyduğunda mürettebat sağlık sorumlusuna ve uçuş cerrahına ulaş.',
  },
  radiationDose: {
    hazard: 'Uzay radyasyonu',
    what: 'Demo görev bütçesine göre kaydedilen kümülatif radyasyon dozudur.',
    why: 'Uzay radyasyonu, uzun görevlerde takip edilmesi gereken çevresel bir tehlikedir.',
    doNow: ['Bu değer simülasyondur; görev doz kaydıyla karşılaştır.', 'Fırtına senaryosunda korunaklı bölge protokolünü izle.'],
    escalate: 'Kırmızı durumda görev sorumlusuna hemen bildir ve uçuş cerrahından yönlendirme al.',
  },
}
