# Yüzbir — 101 Okey Kuralları

Bu belge oyunun kural kaynağıdır. Oyun motoru bu belgeye göre yazılır. Bir kural değişirse önce bu belge güncellenir.

---

## 1. Masa ve ayarlar

Masayı kuran kişi şunları seçer:

| Ayar | Seçenekler |
|---|---|
| El sayısı | 5 / 7 / 9 / 11 |
| Oyun tipi | Tekli / Eşli (2'ye 2) |
| Açma modu | Katlamalı / Katlamasız |
| Eşe katlama (sadece eşli + katlamalı) | Evet / Hayır |
| Hamle süresi | 30 / 45 / 60 saniye |

- Masada her zaman **4 oyuncu** olur.
- **Tekli modda** boş koltuklar **bot** ile doldurulabilir.
- **Eşli modda bot eklenemez.**
- Eşli modda eşler **karşılıklı** oturur. Bu yüzden insan eşinin attığı taşı hiçbir zaman alamaz.

---

## 2. Taşlar

- Toplam **106 taş** vardır: 4 renk (sarı, kırmızı, siyah, mavi) × 1–13 × 2'şer adet = 104, artı 2 **sahte okey**.
- **Gösterge** açılır. Göstergenin aynı renkte bir üstü **okey** olur. Gösterge 13 ise okey 1'dir.
- Gösterge sahte okey çıkarsa yeni bir gösterge çekilir.
- **Okey** her taşın yerine kullanılabilen jokerdir.
- **Sahte okey** okeyin kendi değerini taşır. Örneğin okey mavi 10 ise sahte okey mavi 10 sayılır.

---

## 3. Dağıtım ve sıra

- Başlayan oyuncu **22**, diğerleri **21** taş alır. Başlayan oyuncu çekmeden önce bir taş atar.
- Her yeni elde başlama sırası bir sonraki oyuncuya geçer.
- Sıra **saat yönünün tersine** döner.
- Sırası gelen oyuncu ya **desteden** bir taş çeker ya da **solundaki oyuncunun** attığı son taşı alır. Sonra bir taşı **sağına** atar.

---

## 4. Perler

- **Seri, aynı sayı:** Aynı sayıda, farklı renklerde 3 ya da 4 taş. Örneğin kırmızı 8, mavi 8, siyah 8.
- **Seri, ardışık:** Aynı renkte en az 3 ardışık taş. Örneğin sarı 4-5-6.
  - **12-13-1 geçersizdir.** 1 sadece dizinin başında kullanılabilir.
- **Çift:** Aynı renk ve aynı sayıdan 2 taş.
- Okey ve sahte okey açılışta yerine geçtiği taşın değerini alır.

---

## 5. El açma

### 5.1 Açma eşikleri

| | Seriyle açma | Çiftle açma |
|---|---|---|
| Katlamasız | En az **101** | En az **5 çift** |
| Katlamalı | Masadaki en yüksek seri açılıştan **en az 1 fazla** (ilk açılış 101) | Masadaki en yüksek çift açılıştan **en az 1 çift fazla** (ilk açılış 5) |

- Seri ve çift eşikleri **birbirinden bağımsızdır.** Seri açılışlar çift eşiğini, çift açılışlar seri eşiğini etkilemez.
- Katlamalı örnek: Biri 115 ile açtıysa sonraki seri açılış en az 116 olmalıdır.

### 5.2 Eşli modda katlama

- **Eşe katlama: Hayır.** Eşiğin sadece **rakip takımın** en yüksek açılışına göre belirlenir.
  - Eşin 120 ile açtıysa ve rakip takımdan açan yoksa: sen **101** ile, rakipler **121** ile açabilir.
  - Ardından rakiplerden biri 121 ile açarsa sen en az **122** ile açmalısın.
  - Rakip 121 ile açmadan önce sen 140 ile açarsan rakipler en az **141** ile açmalıdır.
- **Eşe katlama: Evet.** Eşinin açılışı da eşiğini yükseltir. Eşin 120 ile açtıysa sen en az **121** ile açmalısın.

### 5.3 Baraj

- **150 ve üstü seriyle** (tam 150 dahil) ya da **7 ve üstü çiftle** açan oyuncu **baraj** açmış olur ve **-101** yazar.
- Baraj iki modda da (katlamalı ve katlamasız) geçerlidir.
- Baraj açan her oyuncu bu ödülü alır. Örneğin katlamalı modda biri 7 çiftle, sonra başka biri 8 çiftle açarsa ikisi de -101 yazar.
- Baraj ödülü bitirme puanına **eklenir** ve bitiş katlarından **etkilenmez.**

### 5.4 Gösterge çifti

- Göstergenin aynısı elinde olan oyuncu, **ilk taş atılmadan önce** bunu bildirebilir. Bildirirse bu taş **1 çift** sayılır ve çiftle açarken kullanılabilir. Göstergeyi bildirmek puan kazandırmaz.
- Gösterge çifti tek başına konabileceği gibi, oyuncu **yanına istediği herhangi bir taşı** da koyabilir; ikisi birlikte 1 çift sayılır ve birlikte masaya iner. Istakada gösterge ile o taşı yan yana, diğer gruplardan boşlukla ayrı dizmek yeterlidir.
- Gösterge tek başına açıldıysa, sahibi sonraki turlarında masadaki göstergenin **yanına istediği bir taşı işleyebilir** (taşı seçip göstergenin yanındaki + işaretine basarak). Bu yer başka oyuncular için işlek sayılmaz.
- Eli bot başlatıyorsa botun ilk hamlesi 6 saniye gecikir; böylece diğer oyuncuların göstergeyi bildirmeye vakti kalır.
- Gösterge taşı sonradan (desteden ya da soldan) gelirse sadece normal bir taştır.

### 5.5 Hatalı açma

- Oyun hatalı açmaya **izin verir** ve hatayı **kendisi tespit eder.**
- Hatalı açan oyuncunun açtığı bütün taşlar ıstakasına geri döner ve **101 ceza** yazılır.

---

## 6. Soldan taş alma

- Sadece **solundaki oyuncunun attığı son taş** alınabilir.
- **Elini açmamış** oyuncu bu taşı ancak **aynı tur, o taşı kullanarak elini açacaksa** alabilir.
- Bu durumda ceza **taşı atana** yazılır:
  - Ceza **taşın değeri × 10** olur. Örneğin 7 için 70.
  - Taşı alan **çiftle** açtıysa ceza 2 katına çıkar. Örneğin 7 için 140.
  - Alınan taş **okey** ise, okeyin açılışta yerine geçtiği taşın değeri esas alınır. Okey mavi 12 yerine kullanıldıysa ceza 120, çiftse 240 olur.
- **Elini açmış** oyuncu soldan taş alırsa kimseye ceza yazılmaz.

---

## 7. Açtıktan sonra

- Oyuncu elini açtığı turda **işleme yapabilir.**
- Sonraki turlarda masaya **yeni per indirebilir.**
- Seriyle açan oyuncu çift de işleyebilir. Çiftle açan oyuncu seri perlere işleyebilir.
- **İşleme sınırı (herkes için):** Bir perin **her ucuna bir turda en fazla 2 taş** işlenebilir. Sonraki turda aynı uca yine 2 taş işlenebilir.
  - Örneğin masada sarı 6-7-8 varsa bir turda sola 4-5, sağa 9-10 işlenebilir.
- **Okeyi değiştirme:** Elini açmış bir oyuncu, masadaki bir perde okeyin yerine geçtiği gerçek taşı koyup okeyi alabilir.
  - **Aynı sayılı 3 taşlı grupta okey alınamaz**, çünkü okeyin hangi rengin yerine geçtiği belli değildir. Örneğin `mavi 10 - kırmızı 10 - okey` grubunda siyah 10 da sarı 10 da okeyi alamaz. Eksik renklerden biri gruba **işlenebilir**; grup 4 taş olunca okeyin kalan rengi temsil ettiği kesinleşir ve o rengin sahibi okeyi alabilir.
  - Okeyi o pere koyan oyuncu **101 ceza** yer.
  - Okeyi alan kişi o oyuncunun **eşiyse** ceza yazılmaz.

---

## 8. Cezalar

| Durum | Ceza | Kime |
|---|---|---|
| **İşlek** atmak (masadaki bir pere işlenebilecek taşı atmak; açmamış oyuncular dahil) | 101 | Atan |
| **Okey** atmak | 101 | Atan |
| Hatalı açma | 101 | Açan |
| Atılan taş sonraki oyuncuya açtırırsa | Taş × 10 (çiftse × 20) | Atan |
| Masadaki okeyin alınması | 101 | Okeyi koyan (eşi aldıysa ceza yok) |

- Cezalar **birbirine eklenir.** Örneğin atılan taş hem işlekse hem de sonraki oyuncu onu alıp açarsa, atan oyuncu 101 ve × 10 cezalarının **ikisini birden** yer.

---

## 9. El sonu ve puanlama

Puanı **düşük** olan iyidir.

### 9.1 Bitiş türleri

- **Okeyle bitirme:** Son atılan taş okeydir.
- **Çiftle bitirme:** Çiftle açmış oyuncunun bitirmesidir.
- **Kimse açmadan bitirme (elden):** Biten oyuncu dışında masada kimse elini açmamıştır.

### 9.2 Bitiş katı (k)

| Bitiş | k |
|---|---|
| Normal ya da okeyle | 1 |
| Çiftle (okeyli ya da okeysiz) **veya** kimse açmadan | 2 |
| Kimse açmadan + çiftle (okeyli ya da okeysiz) | 4 |

Okeyle bitirmek tek başına katı değiştirmez.

### 9.3 Puanlar

| Oyuncu | Puan |
|---|---|
| Biten | **-101 × k** (+ baraj açtıysa ayrıca -101) |
| Elini açmamış | **202 × k** |
| Seriyle açmış kaybeden | **k × elinde kalan** |
| Çiftle açmış kaybeden | **2k × elinde kalan** |

**Elinde kalanın** hesabı:
- Taşların sayı değerleri toplanır.
- Elde kalan **okey 101** sayılır. Çiftle açmış oyuncu için bu, 2 kat kuralıyla 202 olur.
- Elde kalan **sahte okey**, okeyin sayı değeri kadar sayılır. Örneğin okey mavi 10 ise 10.

Tam tablo:

| Bitiş | Biten | Açmamış | Seriyle açmış kaybeden | Çiftle açmış kaybeden |
|---|---|---|---|---|
| Normal | -101 | 202 | 1 × kalan | 2 × kalan |
| Okeyle | -101 | 202 | 1 × kalan | 2 × kalan |
| Çiftle | -202 | 404 | 2 × kalan | 4 × kalan |
| Okey + çiftle | -202 | 404 | 2 × kalan | 4 × kalan |
| Kimse açmadan, normal | -202 | 404 | — | — |
| Kimse açmadan, okeyle | -202 | 404 | — | — |
| Kimse açmadan, çiftle | -404 | 808 | — | — |
| Kimse açmadan, okey + çiftle | -404 | 808 | — | — |

"Kimse açmadan" bitişlerde diğer herkes tanımı gereği açmamış olduğu için açmış kaybeden sütunları kullanılmaz.

### 9.4 Destenin bitmesi

- Destenin **son taşını çeken oyuncu** o tur hâlâ açabilir ve işleyebilir.
- Bu oyuncu **sağına taş attığında** el biter. Sıradaki oyuncu artık oynamaz, atılan taşı soldan da alamaz.
- Biten oyuncu yoksa herkesin elinde kalan hesaplanıp tabloya yazılır.

### 9.5 Oyun sonu

- Seçilen el sayısı tamamlanınca toplam puanı **en düşük** olan kazanır.
- **Eşli modda** cezalar oyuncu bazında tutulur, oyun sonunda takım toplamı alınır.
- Toplamlar eşitse oyun **berabere** biter.

---

## 10. Dijital oyun kuralları

- **Platform:** Web, online çok oyunculu.
- **Hesap zorunlu:** Oynamak için kullanıcı adı ve şifreyle hesap açılır (e-posta doğrulaması yok).
  - Kullanıcı adı 3-20 karakter (harf, rakam, nokta, alt çizgi), büyük-küçük harf farkı gözetmeden tekildir. Şifre en az 6 karakterdir.
  - Şifreler veritabanında scrypt ile, kullanıcıya özel rastgele salt kullanılarak hash'lenmiş olarak tutulur; düz şifre hiçbir yerde saklanmaz.
  - Oturum 30 gün geçerlidir ve `httpOnly` bir çerezde durur. Veritabanında oturum anahtarının yalnızca SHA-256 özeti tutulur.
- **Profil:** Her oyuncu profil fotoğrafı ve masada görünen adını değiştirebilir (lobide sağ üstteki adına tıklayarak ya da masaya katılma ekranında). Fotoğraf 192×192 JPEG'e küçültülerek saklanır.
- **Davet linki:** Linki açan kişi giriş yapmamışsa önce giriş/kayıt ekranına gider. Giriş yaptıktan sonra **masaya katılma ekranı** açılır: masadakileri ve kuralları görür, profilini düzenler, sonra "Masaya otur" der. Lobiden "Katıl" da aynı ekrana götürür.
- **Oyuncu kartları:** Elini açan oyuncunun kartında neyle açtığı ve elinde kaç taş kaldığı görünür. Rakiplerin kalan puanı gösterilmez (gizli bilgi). Kendi kartın ıstakanın solundadır: süre, açma durumu, seri/çift toplamın (açtıktan sonra indirilebilir perlerin) ve elindeki taşların sayısı ile puan değeri.
- **Tema:** Ekranın üst ortasındaki düğmeyle açık (gündüz) ve koyu (gece) tema arasında geçilir. Seçim tarayıcıda saklanır; ilk açılışta cihazın tercihi kullanılır. Taşların zemini ve rakam renkleri iki temada da aynıdır.
- **Taş animasyonları:** Desteden çekilen taş desteden çeken oyuncuya uçar (kendi çektiğin taş yüzü açık olarak ıstakadaki yerine gider, rakibinki kapalı gider). Atılan taş oyuncudan atma yerine, soldan alınan taş da alan oyuncuya uçar.
- **Süre dolarsa:** Oyun oyuncu adına desteden taş çeker ve **işlek olmayan en düşük taşı** atar.
- **Masa düzeni:** Seri perler masanın solunda, çiftler sağında; oyuncuya göre ayrılmadan açılış sırasıyla alt alta eklenir, 7 sıradan sonra sağdaki sütuna geçer. Alan dolarsa perler kaydırma gerekmeden orantılı olarak küçülür.
- **Masadaki okey:** Masaya açılmış perlerdeki ve atılan taşlar arasındaki okeyler her zaman beyaz, üzerinde "OKEY" yazılı görünür.
- **Okeyi işaretleme:** Istakadaki okey taşı normal taş gibi görünür. Oyuncu okeye **çift tıklarsa** taş beyaza döner ve üzerinde "OKEY" yazar. Tekrar çift tıklarsa eski haline döner. Diğer taşlarda çift tıklamanın etkisi yoktur.
- **Botlar** (sadece tekli mod):
  - Tek bir zorluk seviyesi vardır.
  - Botlar **elini açmaz** ve soldan taş almaz. Sadece desteden çekip taş atar.
  - Attıkları taş **küçük ve işlek olmayan** bir taştır.
  - Bot puanları da tabloya yazılır. Botlar el açmadığı için her elde **202 × k** ceza alırlar.

---

## 11. Varsayımlar (onay bekliyor)

Bu maddeler konuşmada kesinleşmedi. Koda bu varsayımlarla geçilecek:

1. **Süre dolunca atılacak taş:** Okey hiçbir zaman otomatik atılmaz. Bütün taşlar işlekse en düşük taş atılır ve işlek cezası yazılır.
2. **Bağlantı kopması:** Kopan oyuncunun hamleleri "süre dolarsa" kuralıyla otomatik oynanır. Oyuncu geri bağlanınca yerine döner.
3. **Destenin bitmesinde** bitiş katı k = 1 sayılır.
4. **Kimse açmadan çiftle bitişte** biten oyuncu -404 yazar (kaynak tabloda "-202 ya da -404" geçiyordu).

---

## 12. Geliştirme

Gereken: Node.js 20.12 veya üstü.

```bash
npm install
cp .env.example .env      # MONGODB_URI değerini doldur
npm run dev               # sunucu :3001, arayüz http://localhost:5173
```

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Sunucuyu ve arayüzü birlikte, değişiklikleri izleyerek çalıştırır |
| `npm test` | Kural motoru testlerini çalıştırır |
| `npm run typecheck` | TypeScript kontrolü |
| `npm run build` | Arayüzü `dist/client` klasörüne derler |
| `npm start` | Sunucuyu başlatır; derlenmiş arayüzü de aynı adresten sunar |
| `node scripts/smoke.mjs` | Çalışan sunucuda 3 botlu masa kurup 2 el oynatır |

Windows'ta testler `c:\` yerine büyük harfli `C:\` yolundan çalıştırılmalıdır, aksi halde Vitest "Cannot read properties of undefined (reading 'config')" hatası verir.

**Klasörler**
- `src/shared`: kural motoru (taşlar, per doğrulama, oyun akışı, puanlama) ve testleri
- `src/server`: Express + Socket.IO sunucusu, masalar, süre sayacı, botlar, MongoDB kaydı
- `src/client`: React arayüzü (lobi, masa kurma, bekleme salonu, oyun ekranı)

**MongoDB:** Hesaplar (`users`), oturumlar (`sessions`, süresi dolan kendiliğinden silinir) ve biten oyunların sonuçları (`games`) kaydedilir.
- `MONGODB_URI` hiç tanımlı değilse hesaplar geçici bellekte tutulur (sadece yerel deneme için; sunucu kapanınca silinir). Yerelde böyle başlatmak için: `MONGODB_URI= npm start`.
- `MONGODB_URI` tanımlı ama bağlanılamıyorsa giriş ve kayıt "Veritabanına bağlanılamadı" hatası verir. Atlas kullanılıyorsa sunucunun IP adresi Atlas'ta **Network Access** listesine eklenmelidir.

## 13. Canlıya alma

Tek bir Node servisi yeterlidir:
- Kurulum: `npm install && npm run build`
- Başlatma: `npm start`
- Ortam değişkenleri: `MONGODB_URI`, `MONGODB_DB` (varsayılan `yuzbir`), `PORT` (platform verir)
- WebSocket desteği olan bir platform gerekir (ör. Render, Railway, Fly.io).
