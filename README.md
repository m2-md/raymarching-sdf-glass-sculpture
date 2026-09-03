# SDF Raymarching — Cam Heykel · 64'e Karşı 128

"Sahnede Tek Üçgen Var: SDF Raymarching ile Cam Heykel, 64 Adıma Karşı 128"
makalesinin çalışan kodu. Ham WebGL2 (GLSL ES 3.00), TypeScript, Vite, vitest.
`three.js` yok, shader kütüphanesi yok; her satırın matematiği elle yazılı.

Sahnede tek bir üçgen var: `gl_VertexID`'den üretilen, ekranı baştan başa
kaplayan bir üçgen. Silüet, camın içindeki çift kırılma ve zemine düşen yumuşak
gölge — hepsi tek bir `map()` mesafe fonksiyonundan doğuyor.

## Ne içerir

- **Tek üçgen, sıfır attribute** (`src/shaders/fullscreen.vert.glsl`) — vertex
  buffer yok; üç köşe `gl_VertexID` bit hilesiyle üretiliyor. WebGL2 yine de
  bağlı bir VAO istediği için boş bir VAO kuruluyor.
- **Tek fragment shader** (`src/shaders/scene.frag.glsl`) — SDF primitifleri
  (`sdSphere`/`sdBox`/`sdTorus`), operatörler (`min`/`max`/`smin`), yürüyüş
  döngüsü, gradyandan normal, `softShadow`, çift kırılma + Beer-Lambert, ısı
  haritası ve ham adım sayacı.
- **Aynı kaynaktan iki program** (`src/program.ts`) — `MAX_STEPS` uniform değil
  `#define`; `buildFragmentSource()` define bloğunu `#version` satırından hemen
  SONRA enjekte ediyor (öncesine koyarsanız shader derlenmez). 64 ve 128
  bütçeleri iki ayrı derlenmiş program.
- **Adım sayacı geri okuma** (`src/probe.ts`, `src/steps.ts`) — adım sayısı
  `float(steps)/255.0` ile RGBA8 hedefe yazılıyor, 256×144'lük bir FBO'dan
  `readPixels` ile geri okunuyor. `gl.disable(gl.DITHER)` olmadan bayt kayıyor.
- **GPU saati** (`src/timer.ts`) — `EXT_disjoint_timer_query_webgl2`; sorgu
  kuyruğu, `GPU_DISJOINT_EXT` kontrolü, `gl.finish()` YOK. Uzantı yoksa HUD ve
  ölçüm çıktısı bunu açıkça söyler ve rAF delta medyanına düşer.
- **Saf mantık katmanı** (`src/sdf.ts`, `src/march.ts`, `src/camera.ts`,
  `src/stats.ts`, `src/viewport.ts`) — GLSL'in TypeScript aynası; tarayıcısız,
  vitest ile test ediliyor.

## Kurulum

```bash
npm install
```

## Test (tarayıcısız, deterministik)

```bash
npm test
```

**57 test yeşil** (7 dosya): SDF primitifleri + `smin` cebiri (12), kamera ışın
üretimi (7), CPU marcher'ı ve `smin`'in topolojiyi değiştirmesi (6), shader
kaynağı + `#define` enjeksiyonu (10), viewport kelepçeleri (9), medyan/yüzdelik
(8), adım istatistiği (5). Hiçbir test dosyası `document`, `window`,
`WebGL2RenderingContext` ya da `performance` referansı içermez.

## Tip kontrolü ve build

```bash
npx tsc --noEmit   # 0 hata
npm run build      # tsc && vite build -> dist/
```

GLSL derlenmez; shader'ın gerçekten derlendiğini yalnızca tarayıcı gösterir.

## Demo (`file://` DEĞİL)

```bash
npm run dev
# http://localhost:5173/
```

Varsayılan ayarlar makineyi ısıtmayacak boyutta: canvas tam ekran değil (960 px
genişliğinde 16:9 kutu), çözünürlük ölçeği 0.5, adım bütçesi 64.

| Kontrol                    | Değerler                | Varsayılan |
| -------------------------- | ----------------------- | ---------- |
| Karışım `k`                | 0 – 0.8                 | 0.35       |
| IOR                        | 1.0 – 2.0               | 1.45       |
| Çözünürlük ölçeği          | 0.35 / 0.5 / 0.75 / 1.0 | 0.5        |
| Adım bütçesi (`MAX_STEPS`) | 64 / 128                | 64         |
| Mod                        | Gölgeli / Isı haritası  | Gölgeli    |
| Kırılma                    | açık / kapalı           | açık       |
| Dur/Devam                  | —                       | çalışıyor  |

Kamerayı canvas üzerinde sürükleyerek döndürebilirsiniz.

Ne göreceksiniz:

- **Gölgeli mod:** dönen cam heykel; içinden bakınca zemin damaları bükülmüş,
  zeminde yumuşak gölge, kenarlarda Fresnel yansıması.
- **`k` = 0:** üç ayrı cisim (küre, döndürülmüş kutu, torus) keskin dikişlerle
  ayrı ayrı durur. **`k` = 0.8:** aynı sıvıdan dökülmüş tek gövde.
- **Kırılma kapalı:** sadece yansıma kalır, cisim aynaya döner.
- **Isı haritası:** gövdenin ortası lacivert (2-3 adım), silüetin kenarı
  kırmızı (adım tavanı). Bütçeyi 128'e çekince o kırmızı şerit inceliyor ve
  yeşile düşüyor — aynı piksellerin artık bütçeye sığdığı anlamına geliyor.

### Isıtma korkulukları

`devicePixelRatio` 2'ye kelepçeli (`src/viewport.ts`), çözünürlük ölçeği
kullanıcıda, toplam arka tampon 1.8 Mpx ile sınırlı. Sekme arka plana geçince
döngü kendiliğinden duruyor; `Dur` düğmesi `requestAnimationFrame`'i gerçekten
iptal ediyor (kısmak değil, durdurmak).

## Deterministik ölçüm modu

```
http://localhost:5173/?measure=1
```

Bu modda demo interaktif olmaktan çıkar: arka tampon 960×540'a kilitlenir,
`uTime = 3.0` sabitlenir (her koşu aynı pozu çizer), kamera/`k`/IOR sabittir.
Her yapılandırma için 60 ısınma karesi atılır, sonra 240 kare ölçülür. Bitince
konsola **tek satır** düşer:

```
MEASURE {"gpu":"…","timerExt":true,"width":960,"height":540,…}
```

Koşu listesi:

| Koşu | maxSteps | refract | k    | Ölçülen                             |
| ---- | -------- | ------- | ---- | ----------------------------------- |
| A    | 64       | açık    | 0.35 | GPU ms medyan/p95, kare ms medyan   |
| B    | 128      | açık    | 0.35 | GPU ms medyan/p95, kare ms medyan   |
| C    | 64       | kapalı  | 0.35 | GPU ms medyan                       |
| D    | 64       | açık    | 0.35 | ortalama/maks adım, tavan % (probe) |
| E    | 128      | açık    | 0.35 | ortalama/maks adım, tavan % (probe) |
| F    | 128      | açık    | 0    | ortalama adım                       |
| G    | 128      | açık    | 0.35 | ortalama adım                       |

Çıktı şeması:

```json
{
  "gpu": "<UNMASKED_RENDERER_WEBGL veya 'bilinmiyor'>",
  "timerExt": true,
  "width": 960,
  "height": 540,
  "frames": 240,
  "warmup": 60,
  "probe": { "width": 256, "height": 144 },
  "k": 0.35,
  "ior": 1.45,
  "steps64": { "gpuMsMedian": 0, "gpuMsP95": 0, "wallMsMedian": 0 },
  "steps128": { "gpuMsMedian": 0, "gpuMsP95": 0, "wallMsMedian": 0 },
  "noRefract64": { "gpuMsMedian": 0, "wallMsMedian": 0 },
  "ratio128over64": 0,
  "ratioSource": "gpu",
  "stepStats": {
    "budget64": { "mean": 0, "max": 0, "ceilingPct": 0 },
    "budget128": { "mean": 0, "max": 0, "ceilingPct": 0 },
    "budget128_k0": { "mean": 0, "max": 0, "ceilingPct": 0 },
    "budget128_k035": { "mean": 0, "max": 0, "ceilingPct": 0 }
  }
}
```

Ölçüm bitince HUD da aynı değerleri gösterir; alt satırda hangi saatin
kullanıldığı yazar (`GPU sorgusu` / `rAF deltası`).

**`timerExt: false` gelirse** bütün `gpuMs*` alanları `0` kalır — uydurulmaz.
Onların yerine `wallMsMedian` (rAF delta medyanı) okunur, `ratio128over64` da
ondan hesaplanır ve `ratioSource: "wall"` bunu açıkça söyler. HUD da sütun
adını "kare ms" olarak değiştirir. Sayının adını yanlış yazmak, ölçmemekten
kötüdür.

Dikkat: vsync'e kilitli bir döngüde `wallMsMedian` kare _periyodudur_ (60 Hz'de
~16,7 ms), kare _maliyeti_ değil. GPU zamanlayıcısı olmayan bir tarayıcıda
ölçtüğünüz şey budur.

Sayılar makineye özeldir. Yazıdaki tablo tek bir makinenin hikâyesi; sizinki
başka bir sayı verecek ve asıl okunmaya değer olan o.

## Dosya düzeni

```
index.html                     960 px / 16:9 sahne + HUD + kontroller
src/
  main.ts                      bootstrap, döngü, Dur/Devam, ?measure=1 dalı
  renderer.ts                  WebGL2 kurulumu, iki program, probe, çizim
  program.ts                   #define enjeksiyonu, derleme/link + satır no'lu log
  measure.ts                   deterministik koşu listesi, MEASURE {json}
  hud.ts                       ÖLÇÜM / YAPISAL ayrımlı gösterge
  timer.ts                     EXT_disjoint_timer_query_webgl2 sarmalayıcı
  probe.ts                     256x144 RGBA8 FBO + readPixels
  steps.ts                     adım istatistiği (mean / max / tavan %)
  stats.ts                     medyan + yüzdelik
  viewport.ts                  dpr kelepçesi, ölçek, piksel bütçesi
  sdf.ts                       GLSL SDF'lerinin TypeScript aynası
  march.ts                     CPU raymarcher (map parametre)
  camera.ts                    ışın üretimi + yörünge kamerası
  modes.ts                     MODE_SHADED / MODE_HEAT / MODE_STEPS_RAW
  shaders/
    fullscreen.vert.glsl       gl_VertexID'den tek üçgen
    scene.frag.glsl            sahnenin tamamı
test/                          7 dosya, 57 test (tarayıcısız)
```

## Lisans

MIT — bkz. `LICENSE`.
