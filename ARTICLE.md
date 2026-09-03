# Sahnede Tek Üçgen Var: SDF Raymarching ile Cam Heykel, 64 Adıma Karşı 128

*Poligon yok, vertex buffer yok, mesh yok. Heykelin silüeti de camın içindeki kırılma da yere düşen gölge de tek bir mesafe fonksiyonundan doğuyor. Şekilleri smin ile eritiyor, her pikselin kaç adımda yakınsadığını sayıp ekrana basıyor, iki adım bütçesini GPU'nun kendi saatiyle ölçüyoruz.*

*Tahmini okuma süresi: 19 dakika*

---

Heykelin silüetine yaklaşıp orada durdum. İçi mavi, dışı mavi, tam kenarı kıpkırmızıydı.

O kırmızı çizgi bir efekt değildi. Debug modunu açmış, her pikselin rengini "sen kaç adımda yakınsadın?" sorusunun cevabıyla boyamıştım. Mavi az adım, kırmızı çok adım demekti. Ekranın büyük kısmı dokuz on adımda bitiyordu; heykelin gövdesinde bu sayı altıya iniyordu. Silüetin kenarındaki ince şerit ise 128 adımın hepsini harcayıp yine de bir yüzey bulamadan pes ediyordu.

Aynı karede, aynı shader'da, komşu iki pikselin maliyeti arasında on katı aşan bir fark vardı.

"Raymarching pahalıdır" cümlesini yıllardır duyuyoruz. Bu yazının derdi o cümleyi bir sayıya çevirmek: neyin pahalı olduğunu, hangi pikselde pahalı olduğunu ve adım bütçesini ikiye katlayınca faturanın gerçekten ikiye katlanıp katlanmadığını ölçmek.

Sahnede tek bir üçgen var: üç köşesi kadrajın dışına taşan, ekranı baştan başa kaplayan bir üçgen. `three.js` de yok, glTF de, index buffer da. Geri kalan her şey o üçgenin fragment shader'ının içinde hesaplanıyor.

Yol haritası şöyle. Önce o üçgeni kurup kameradan ışın yönü türeteceğiz. Sonra SDF (signed distance field, işaretli mesafe alanı) primitiflerini ve birleştirme operatörlerini yazacağız; hepsi saf fonksiyon olduğu için tarayıcıya hiç girmeden vitest ile CPU'da doğrulanacaklar. Ardından `smin` ile şekilleri eritip bunun görünmeyen bedelini konuşacağız. Işını alanda yürütüp adımları sayacak, o sayıyı hem ekrana renk olarak basacak hem de `readPixels` ile geri okuyacağız. Normal geometriden değil gradyandan gelecek, cam `refract` ile iki kez kırılacak. Sonda da GPU zamanlayıcısıyla çıkarılmış 64'e karşı 128 tablosu var.

Sürüm notu: ham WebGL2 (GLSL ES 3.00), TypeScript, Vite, vitest. Kütüphane yok; her satırın matematiği elle yazılıyor.

Bir de peşinen kabul: rasterleştirme yanlış bir teknik değil. Üretimdeki işlerin çoğunda üçgen çizmek hâlâ doğru cevap, çünkü maliyeti geometriyle orantılı ve tahmin edilebilir. Raymarching'in kazandığı yer implicit (örtük) yüzeyler: birbirine eriyen, oyulan, kütüphanesiz tarif edilen şekiller. Bedeli de orada: fatura üçgen başına değil, piksel başına geliyor.

### Sisin İçinde Bir Mesafe Ölçer

Zihin modelini baştan kuralım, çünkü yazının tamamı tek bir görüntünün üzerine oturuyor.

Kalın bir sisin içindesiniz. Elinizde bir alet var ve tek bir şey söylüyor: "sana en yakın yüzey 3,2 metre uzakta." Hangi yönde olduğunu söylemiyor. Yön yok, sadece skaler bir sayı.

Bu bilgiyle ne yapabilirsiniz? Gözünüzü kapatıp tam 3,2 metre yürüyebilirsiniz. Hiçbir yönde 3,2 metreden yakın bir yüzey olmadığı için çarpmanız imkânsız. Vardığınız yerde alete tekrar sorarsınız, mesela "0,8 metre" der, 0,8 metre yürürsünüz. Sayı küçüldükçe adımlar kısalır, yüzeye yaklaşırsınız ve bir noktada "yeterince yakınım" deyip durursunuz.

İşte raymarching bu: ışını alanda adım adım yürütmek. Elinizdeki aletin adı **signed distance function**; her uzay noktası için en yakın yüzeye olan mesafeyi döndüren bir fonksiyon. İşaretli, çünkü şeklin içindeyseniz negatif değer verir. Her pikselden bir yürüyüşçü gönderiyoruz ve hepsi bu tek fonksiyona güvenerek yürüyor.

Bu yürüyüşçü yazının sonuna kadar peşimizde. Şekilleri eritince elindeki ölçer yalan söylemeye başlayacak, hep olduğundan yakın diyecek. Duvara paralel giden yürüyüşçü ise hiç çarpmadan bütçesini bitirecek. Ekranda gördüğüm o kırmızı çizgi, tam olarak ikincisinin izi.

### Sahnedeki Tek Üçgen

Ekranı kaplamak için iki üçgenli bir quad çizmeye alışkınız. Gerek yok. Üç köşesi ekranın dışına taşan tek bir üçgen de ekranı kaplar, üstelik köşegen dikişi olmadan.

Köşe verisini de göndermiyoruz. GLSL ES 3.00'te `gl_VertexID` var; köşe indeksinden konumu bit işlemleriyle üretmek üç satır tutuyor:

```glsl
// src/shaders/fullscreen.vert.glsl
#version 300 es

// Vertex buffer YOK. gl_VertexID'den üç köşe üretiyoruz:
// 0 -> (-1,-1)   1 -> (3,-1)   2 -> (-1,3)
// Bu üçgen NDC karesini tamamen örter, artan kısmı donanım kırpar.
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
```

Quad yerine üçgen seçmenin gerçek gerekçesi köşe sayısı değil. GPU fragmentleri 2×2'lik quad'lar hâlinde gölgelendirir; iki üçgenli bir quad'da köşegen üzerindeki fragmentler her iki üçgen için de bir kez uyandırılır. Tek üçgende o köşegen hiç yok. Bizim durumumuzda fark ölçülemeyecek kadar küçük, çünkü darboğaz köşegen değil, her pikseldeki `map` çağrıları. Yine de bedava bir sadeleşme.

Çizim tarafı buna uygun şekilde kısa. Attribute yok, ama WebGL2 çizim için bir VAO bağlı olmasını bekliyor, o yüzden boş bir tane kurup bırakıyoruz:

```ts
// src/renderer.ts (parça) — kurulum bir kez
const vao = gl.createVertexArray();
gl.bindVertexArray(vao); // attribute yok, sadece "bir VAO bağlı olsun" diye

gl.disable(gl.DEPTH_TEST); // derinlik yok, tek üçgen var
gl.disable(gl.DITHER); // adım sayısını bayt olarak geri okuyacağız, dithering bozar

// ...ve her karede tek çizim çağrısı
gl.drawArrays(gl.TRIANGLES, 0, 3);
```

`gl.disable(gl.DITHER)` satırı şimdilik gereksiz görünüyor. Ölçüm bölümünde adım sayısını renk kanalına yazıp geri okuyacağız; dithering açıkken sürücü o baytı bir tık oynatma hakkını saklı tutuyor. Bu satırı ilk seferinde koymamıştım ve okuduğum adım sayıları bir yerlerde 1 kayıyordu.

Şimdi her pikselin kendi ışın yönünü bulması lazım. Kamera konumu, hedefi ve dikey görüş açısından ortonormal bir baz kurup piksel koordinatını o baza projeliyoruz:

```glsl
// src/shaders/scene.frag.glsl (parça)
vec3 rayDirection(vec2 fragCoord, vec2 res, vec3 ro, vec3 ta, float fovY) {
  // Ekran merkezine göre, YÜKSEKLİĞE bölünmüş koordinat.
  // res.y'ye bölmek dikey görüş açısını en-boy oranından bağımsız kılar.
  vec2 uv = (fragCoord - 0.5 * res) / res.y;

  vec3 forward = normalize(ta - ro);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, forward);

  float focal = 1.0 / tan(0.5 * fovY);
  return normalize(uv.x * right + uv.y * up + focal * forward);
}
```

`res.y`'ye bölmek küçük ama önemli bir tercih. Genişliğe bölseydiniz pencereyi yatayda büyüttüğünüzde sahne yakınlaşırdı; yüksekliğe bölünce yatay genişleme sadece kadraja daha çok alan ekler. Sinema hangi tarafı kırpıyorsa o taraf serbest kalsın.

Bir sınır durumu: kamera tam tepeden aşağı bakarsa `forward` ile dünya yukarısı çakışır ve `cross` sıfır vektör döndürür. Bizim yörünge kameramız oraya hiç gitmiyor, o yüzden koda ek dal koymadım. Kameranıza tam tepe açısı verecekseniz bu satır ilk kırılacak yer.

### Birleştirebildiğiniz Mesafe Fonksiyonları

Bir SDF, uzaydaki bir noktayı alıp en yakın yüzeye olan mesafeyi döndüren fonksiyondur. Kürede tanım tek satır: merkeze uzaklıktan yarıçapı çıkarın.

```glsl
float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b; // simetriyi kullan: sadece pozitif sekizlik yeter
  // Dışarıdaysak taşan eksenlerin uzunluğu, içerideysek en yakın yüzeye mesafe
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdTorus(vec3 p, float major, float minor) {
  vec2 q = vec2(length(p.xz) - major, p.y); // önce halkaya, sonra kesite
  return length(q) - minor;
}
```

Kutunun iki terimi ayrı işler yapıyor. `length(max(q, 0.0))` dışarıdayken doğru cevabı verir: hangi eksenlerde kutunun dışına taştıysanız sadece onların katkısı sayılır, köşede üçü birden devreye girer ve Öklid mesafesini kurar. İçerideyken bu terim sıfırdır; o zaman ikinci terim en yakın yüzeye olan negatif mesafeyi döndürür.

Şekilleri birleştirmek beklediğinizden ucuz:

```glsl
float opUnion(float a, float b) { return min(a, b); }
float opSubtract(float a, float b) { return max(-a, b); } // a'yı b'den oy
float opIntersect(float a, float b) { return max(a, b); }
```

Birleşim `min`. İki şeklin en yakınına olan mesafe, ikisine olan mesafenin küçüğüdür. Basit ve doğru. Ama burada dikkat edilmesi gereken bir nokta var: bu operatörlerden çıkan değer artık kesin mesafe değil, mesafenin bir alt sınırı. `max` ile oyduğunuz bir şeklin çukur kenarına yakın bir noktada, alan size gerçek mesafeden küçük bir sayı verir.

Yürüyüşçü için bu bir felaket değil. Alt sınır demek "en fazla bu kadar güvenle yürü" demek; çarpma riski yok. Sadece daha çok adım atıyor.

Bu cümleyi aklınızda tutun. Yazının sonundaki tablo tam olarak bunun faturası.

Bütün bu fonksiyonlar saf: girdi ver, çıktı al, hiçbir yere dokunma. Bu yüzden aynılarını TypeScript'te de yazıp tarayıcısız test edebiliyoruz:

```ts
// src/sdf.ts (parça — clamp/mix/smin dosyanın devamında)
export type Vec3 = readonly [number, number, number];

export function length3(p: Vec3): number {
  return Math.hypot(p[0], p[1], p[2]);
}

export function sdSphere(p: Vec3, r: number): number {
  return length3(p) - r;
}

export function sdBox(p: Vec3, b: Vec3): number {
  const qx = Math.abs(p[0]) - b[0];
  const qy = Math.abs(p[1]) - b[1];
  const qz = Math.abs(p[2]) - b[2];
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside;
}

export function sdTorus(p: Vec3, major: number, minor: number): number {
  const q = Math.hypot(p[0], p[2]) - major;
  return Math.hypot(q, p[1]) - minor;
}

export function opUnion(a: number, b: number): number {
  return Math.min(a, b);
}

export function opSubtract(a: number, b: number): number {
  return Math.max(-a, b);
}

export function opIntersect(a: number, b: number): number {
  return Math.max(a, b);
}
```

Aynı matematiği iki dilde tutmanın bir bedeli var: sürüklenme riski. GLSL tarafını değiştirip TypeScript tarafını unutursanız testleriniz artık yanlış şeyi doğruluyor demektir. Bunu tamamen çözen bir yöntem bulamadım; yaptığım şey iki dosyayı yan yana tutmak ve testlerde sayısal değerleri çivilemek. Kusursuz değil, ama sessizce yanlış kalmaktan iyi.

### Şekilleri Eritmek: Smooth Min

`min` ile birleştirilen iki küre keskin bir dikişle buluşur. İki sabun köpüğü öyle buluşmaz; aralarında sürekli bir boyun oluşur. O boynu yapan fonksiyonun adı polinom **smooth min**:

```glsl
// k: karışım yarıçapı (dünya birimi). k=0 iken düz min'e döner.
float smin(float a, float b, float k) {
  float kk = max(k, 1e-4);
  float h = clamp(0.5 + 0.5 * (b - a) / kk, 0.0, 1.0);
  return mix(b, a, h) - kk * h * (1.0 - h);
}
```

Fonksiyonun iki parçası var. `mix(b, a, h)` iki mesafeyi yumuşak bir geçişle harmanlıyor; `h` değeri aradaki farkı `k` ile ölçekleyip 0 ile 1 arasına kırpıyor. İkinci terim, `kk * h * (1 - h)`, karışımın tam ortasında en büyük değerini alan bir cezalandırma. Alanı aşağı çekiyor, dolayısıyla yüzeyi dışarı doğru şişiriyor. Boyun oradan çıkıyor.

Üç davranışı ezberlemeye değer:

- İki mesafe arasındaki fark `k`'dan büyükse `h` doyuma ulaşır, ceza terimi sıfırlanır ve sonuç birebir `min` olur. Karışım sadece yakın komşulukta çalışır.
- İki mesafe eşitse `h = 0,5` olur ve sonuç tam olarak `a - k/4`'tür. Karışımın merkezindeki maksimum şişme `k`'nın dörtte biri.
- Fonksiyon simetriktir: `smin(a, b, k)` ile `smin(b, a, k)` aynı sayıyı verir.

Üçü de birer test cümlesi, birazdan yazacağız.

`k` bir uniform olduğu için demoda slider'a bağlı. Sıfıra çekince üç ayrı cisim ayrı ayrı durur, 0,4'e çekince aynı sıvıdan dökülmüş gibi tek gövdeye dönüşürler. Sahnenin tamamı şu:

```glsl
// src/shaders/scene.frag.glsl (parça)
mat2 rot(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

float map(vec3 p) {
  vec3 q = p;
  q.xz = rot(uTime * 0.25) * q.xz; // heykeli değil, uzayı döndürüyoruz

  float sphere = sdSphere(q - vec3(0.0, 0.34, 0.0), 0.62);

  vec3 bp = q - vec3(0.0, -0.36, 0.0);
  bp.xz = rot(0.6) * bp.xz;
  float box = sdBox(bp, vec3(0.46, 0.26, 0.46));

  vec3 tp = q;
  tp.yz = rot(1.15) * tp.yz;
  float torus = sdTorus(tp, 0.80, 0.15);

  float d = smin(sphere, box, uK);
  d = smin(d, torus, uK * 0.75);

  // İç boşluk: camın kalınlığı buradan doğuyor, kırılma bunu görecek
  float cavity = sdSphere(q - vec3(0.0, 0.20, 0.0), 0.34);
  return opSubtract(cavity, d);
}
```

Dönme işleminde nesneyi değil uzayı döndürdüğümüze dikkat edin. Raymarching'de dönüşümler ters uygulanır: noktayı şeklin yerel uzayına taşırsınız, mesafeyi orada hesaplarsınız. Ölçekleme yaparsanız sonucu ölçekle çarpıp geri düzeltmeniz gerekir, yoksa alan artık mesafe olmaz.

Şimdi asıl mesele. `smin` alanı aşağı çekiyor, yani her noktada gerçek mesafeden küçük bir sayı döndürüyor. Yürüyüşçü hâlâ güvende, ama artık gereğinden kısa adımlar atıyor. `k`'yı büyütmek görsel olarak şekilleri eritir; ölçüm olarak adım sayacını yukarı iter. İkisi arasındaki bağ ölçülebilir, sonda tabloda da var: `k = 0` ile piksel başına ortalama adım 9,939, `k = 0,35` ile 10,232. Sayı hangi yöne çıkarsa çıksın, mekanizma bu.

### Alanda Yürümek ve Adımları Saymak

Yürüyüş döngüsü on satır. Sadeliği aldatıcı, çünkü bütün maliyet burada:

```glsl
// src/shaders/scene.frag.glsl (parça)
struct Hit {
  float t;
  int steps;
  bool hit;
};

const float EPS = 0.0012;
const float MIN_DIST = 0.02;
const float MAX_DIST = 24.0;

Hit marchScene(vec3 ro, vec3 rd) {
  float t = MIN_DIST;
  int steps = 0;
  bool hit = false;

  for (int i = 0; i < MAX_STEPS; i++) {
    float d = map(ro + rd * t);
    steps = i + 1;
    if (d < EPS * t) { hit = true; break; } // yakınsadık
    t += d;                                 // güvenli adım = mesafenin kendisi
    if (t > MAX_DIST) break;                // kaçtı
  }
  return Hit(t, steps, hit);
}
```

Yakınsama eşiğinin mutlak değil göreli olmasına dikkat edin: `EPS * t`. Kameradan uzaktaki bir yüzey ekranda daha küçük göründüğü için oradaki hassasiyet ihtiyacı da düşük. Eşiği mesafeyle büyütmek uzak nesnelerde onlarca adım kazandırıyor. Bedeli de var: ışın yüzeyi 0,001 birimle ıskalasa bile eşiğin içine düşerse "çarptım" der. Silüet kenarındaki gürültünün bir kısmı bundan.

`MAX_STEPS` bir uniform değil, bir `#define`. Bunun sebebi ölçüm bölümünde netleşecek ama şimdiden söyleyeyim: derleyici sabit sınırlı döngüyü açabilir, uniform sınırlıyı açamaz. İki adım bütçesini adilce karşılaştırmak istiyorsak ikisi de "üretimde nasıl derlenecekse" öyle derlenmeli. Yani aynı kaynaktan iki ayrı program.

Define'ları kaynağa enjekte eden fonksiyon ilk bakışta üç satır, ama içinde bir tuzak saklı:

```ts
// src/program.ts
export interface SceneDefines {
  maxSteps: number;
  shadowSteps: number;
  innerSteps: number;
}

// GLSL ES 3.00'te "#version" MUTLAKA ilk satır olmak zorundadır.
// Define bloğunu başa eklerseniz shader derlenmez; hata mesajı da
// "#version directive must occur before anything else" gibi kibar ama ketumdur.
export function buildFragmentSource(
  source: string,
  defines: SceneDefines,
): string {
  const lines = source.split("\n");
  if (!lines[0].trim().startsWith("#version")) {
    throw new Error("#version 300 es kaynağın ilk satırı olmalı");
  }
  const block = [
    `#define MAX_STEPS ${defines.maxSteps}`,
    `#define SHADOW_STEPS ${defines.shadowSteps}`,
    `#define INNER_STEPS ${defines.innerSteps}`,
  ];
  return [lines[0], ...block, ...lines.slice(1)].join("\n");
}
```

Bu kuralı bilmiyordum ve ilk denememde define bloğunu dosyanın en başına koydum. Ekran siyahtı, konsol tek satırlık bir uyarı veriyordu, ben de yarım saat boyunca kamera matrisinde hata aradım. Shader kaynağını satır numaralarıyla yazdıran küçük bir yardımcı ekledikten sonra sorun on saniyede göründü:

```ts
// src/program.ts (devamı)
export function annotateSource(source: string): string {
  return source
    .split("\n")
    .map((line, i) => `${String(i + 1).padStart(4, " ")}| ${line}`)
    .join("\n");
}

export function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("createShader başarısız");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "(log yok)";
    gl.deleteShader(shader);
    throw new Error(`Shader derlenmedi:\n${log}\n${annotateSource(source)}`);
  }
  return shader;
}
```

Peki adımları nasıl görünür hale getiriyoruz? En ucuz yol, rengi hesaplamadan önce sayacı doğrudan ekrana basmak:

```glsl
// src/shaders/scene.frag.glsl (parça)
vec3 heat(float f) {
  f = clamp(f, 0.0, 1.0);
  vec3 cold = vec3(0.05, 0.10, 0.30);
  vec3 mid  = vec3(0.15, 0.75, 0.55);
  vec3 hot  = vec3(1.00, 0.25, 0.15);
  return f < 0.5 ? mix(cold, mid, f * 2.0) : mix(mid, hot, (f - 0.5) * 2.0);
}

void main() {
  vec3 ro = uCamPos;
  vec3 rd = rayDirection(gl_FragCoord.xy, uResolution, ro, uCamTarget, 1.05);
  Hit h = marchScene(ro, rd);

  if (uMode == MODE_STEPS_RAW) {
    // Adım sayısını ham bayt olarak yaz: 128 <= 255 olduğu için kayıpsız
    outColor = vec4(float(h.steps) / 255.0, 0.0, 0.0, 1.0);
    return;
  }
  if (uMode == MODE_HEAT) {
    outColor = vec4(heat(float(h.steps) / float(MAX_STEPS)), 1.0);
    return;
  }

  vec3 col = h.hit ? shadeGlass(ro, rd, h.t) : background(ro, rd, true);
  outColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.4545)), 1.0);
}
```

`MODE_HEAT` gözle bakmak için. `MODE_STEPS_RAW` ise ölçüm için: adım sayısını 255'e bölüp kırmızı kanala yazıyoruz, RGBA8 hedefe yuvarlandığında tam olarak aynı tamsayı geri geliyor. Bütçemiz 128 olduğu sürece kayıp yok.

Geri okuma tarafı küçük bir offscreen hedefe düşüyor. Ekranın tamamını `readPixels` ile çekmek pahalı ve gereksiz; 256×144'lük bir örnek istatistik için fazlasıyla yeterli:

```ts
// src/probe.ts
export interface StepProbe {
  readonly width: number;
  readonly height: number;
  bind(): void;
  read(): Uint8Array;
  dispose(): void;
}

export function createStepProbe(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): StepProbe {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const pixels = new Uint8Array(width * height * 4);

  return {
    width,
    height,
    bind() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
    },
    read() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return pixels;
    },
    dispose() {
      gl.deleteFramebuffer(framebuffer);
      gl.deleteTexture(texture);
    },
  };
}
```

İstatistiği çıkaran fonksiyon saf, dolayısıyla test edilebilir:

```ts
// src/steps.ts
export interface StepStats {
  samples: number;
  mean: number;
  max: number;
  ceilingPct: number; // adım tavanına dayanan piksellerin yüzdesi
}

export function stepStats(pixels: Uint8Array, maxSteps: number): StepStats {
  const samples = Math.floor(pixels.length / 4);
  if (samples === 0) return { samples: 0, mean: 0, max: 0, ceilingPct: 0 };

  let sum = 0;
  let max = 0;
  let ceiling = 0;

  for (let i = 0; i < samples; i++) {
    const steps = pixels[i * 4]; // kırmızı kanal
    sum += steps;
    if (steps > max) max = steps;
    if (steps >= maxSteps) ceiling++;
  }

  return {
    samples,
    mean: sum / samples,
    max,
    ceilingPct: (ceiling / samples) * 100,
  };
}
```

"Raymarching pahalı" cümlesi burada somutlaşıyor: pahalı olan render değil, tavana dayanan piksellerin yüzdesi. 128 adım bütçesinde, ölçüm pozunda o oran tam olarak %0. Ama sebebi "her ışın yakınsıyor" değil: en zorlanan piksel 107 adım yürüyor ve bir yüzey bulduğu için değil, `t` `MAX_DIST`'i geçtiği için çıkıyor. 64 adımı aşan 20 pikselin yalnızca beşi gerçekten bir yüzeye oturuyor. Tavan boş kalıyorsa, ışınlar 128'e varmadan ya yakınsadığı ya da sahneyi terk ettiği içindir. Kamerayı gezdirince tavan yeniden ulaşılabilir hâle geliyor: taradığım 144 pozun sekizinde 128 adımını da harcayan piksel çıktı — girişteki kırmızı şerit tam olarak o. Asıl iz heat map'te başka yerde: silüet çizgisi, tavana dayanmasa da ortalamadan on kat uzaklaşan pikselleri kırmızıya boyuyor.

### Geometri Olmadan Normal

Elimizde mesh yok, dolayısıyla vertex normali de yok. Ama elimizde skaler bir alan var ve bir skaler alanın gradyanı, o alanın en hızlı arttığı yönü verir. Mesafe alanında en hızlı artış yönü, yüzeyden dışarı doğrudur.

Gradyanı merkezi farkla alıyoruz: her eksende ileri ve geri iki örnek, aradaki fark.

```glsl
// src/shaders/scene.frag.glsl (parça)
vec3 calcNormal(vec3 p) {
  vec2 h = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + h.xyy) - map(p - h.xyy),
    map(p + h.yxy) - map(p - h.yxy),
    map(p + h.yyx) - map(p - h.yyx)
  ));
}
```

Altı `map` çağrısı. Yürüyüşün tamamı bazı piksellerde iki üç çağrıda bittiğine göre, normal hesabı o piksellerde yürüyüşün kendisinden pahalı. Bunu ilk fark ettiğimde biraz sarsıldım: sahnenin en görünmez satırı, en çok iş yapan satırlardan biri.

Epsilon seçimi iki taraflı bir takas. Çok küçük seçerseniz iki `map` çıktısının farkı float hassasiyetinin gürültüsüne gömülür ve yüzeyde bantlaşma görürsünüz. Çok büyük seçerseniz normal ortalamaya kaçar, keskin kenarlar yuvarlanır. 0,0015 bu sahne ölçeğinde iyi çalışıyor; sahneyi on kat büyütürseniz bu sayıyı da büyütmeniz gerekir.

Dört çağrıyla aynı işi yapan tetrahedron varyantı da var (`e.xyy`, `e.yyx`, `e.yxy`, `e.xxx` desenli olan). Altıdan dörde inmek `map` maliyetinin üçte birini siliyor. Kodda okunabilir olanı bıraktım, çünkü bu yazının ölçtüğü şey adım bütçesi; normal hesabını da değiştirseydim tabloda hangi değişikliğin ne kadar katkı yaptığını ayıramazdık.

Gölge de aynı alandan geliyor. Yere düşen gölgeyi çizmek için ışık yönünde ikinci bir yürüyüş başlatıyoruz; ama bu sefer "çarptım mı" diye değil, "ne kadar yaklaştım" diye soruyoruz:

```glsl
float softShadow(vec3 ro, vec3 rd, float tmin, float tmax, float k) {
  float res = 1.0;
  float t = tmin;
  for (int i = 0; i < SHADOW_STEPS; i++) {
    float h = map(ro + rd * t);
    res = min(res, k * h / t); // yüzeye teğet geçiş = yumuşak yarı gölge
    t += clamp(h, 0.03, 0.4);
    if (res < 0.004 || t > tmax) break;
  }
  return clamp(res, 0.0, 1.0);
}
```

Işın engele ne kadar sürtünürse `k * h / t` o kadar küçülür, gölge o kadar koyulaşır. Rasterleştirmede yumuşak gölge için shadow map çözünürlüğü, bias ayarı ve birkaç örnekleme filtresi gerekirdi. Burada altı satır ve zaten var olan `map`.

`SHADOW_STEPS` ayrı bir define ve 64/128 karşılaştırması boyunca sabit kalıyor. Ölçtüğümüz şeyin sadece birincil yürüyüş olması için.

### Işığı Camın İçinden Geçirmek

Cam iki şey yapar: bir kısmını yansıtır, bir kısmını kırar. Hangisinin ne kadar olduğunu görüş açısı belirler; tam karşıdan bakınca çoğunlukla saydam, sıyırarak bakınca neredeyse ayna. Bunun ucuz yaklaşığı Schlick formülü.

Kırılma tarafında GLSL'in `refract` fonksiyonu işi yapıyor, ama tek başına yetmiyor. Işın camın içine girer, içeride yol alır, arka yüzeyden çıkarken ikinci kez kırılır. İkinci kırılma olmadan cam cam gibi durmaz, renkli jöle gibi durur.

İçerideki yolculuk yine bir yürüyüş, tek farkı işaretin ters çevrilmesi. Şeklin içindeyken `map` negatif döndürür; `-map` bize "en yakın duvara kaç birim var" der:

```glsl
// src/shaders/scene.frag.glsl (parça)
vec3 marchInside(vec3 p, vec3 rd, out vec3 exitNormal) {
  float t = 0.02;
  for (int i = 0; i < INNER_STEPS; i++) {
    float d = -map(p + rd * t); // içeride mesafe negatif, işareti çevir
    if (d < 0.0008) break;
    t += max(d, 0.006); // sıfır adımda kilitlenmeyi engelle
    if (t > 6.0) break;
  }
  vec3 q = p + rd * t;
  exitNormal = -calcNormal(q); // çıkışta normal içeri bakmalı
  return q;
}

vec3 shadeGlass(vec3 ro, vec3 rd, float t) {
  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  vec3 l = normalize(LIGHT_DIR);

  float f0 = pow((1.0 - uIOR) / (1.0 + uIOR), 2.0);
  float fresnel = f0 + (1.0 - f0) * pow(1.0 - max(dot(n, -rd), 0.0), 5.0);

  vec3 reflDir = reflect(rd, n);
  vec3 reflCol = background(p, reflDir, false);

  vec3 refrCol = reflCol;
  if (uRefract == 1) {
    vec3 dirIn = refract(rd, n, 1.0 / uIOR); // hava -> cam
    vec3 exitN;
    vec3 exitP = marchInside(p, dirIn, exitN);

    vec3 dirOut = refract(dirIn, exitN, uIOR); // cam -> hava
    if (dot(dirOut, dirOut) < 0.5) {
      dirOut = reflect(dirIn, exitN); // tam iç yansıma: refract sıfır döndürür
    }
    refrCol = background(exitP, dirOut, false);

    // Beer-Lambert: kalın yerler daha çok renk yutar
    float thickness = distance(p, exitP);
    refrCol *= exp(-thickness * vec3(0.35, 0.18, 0.10));
  }

  vec3 col = mix(refrCol, reflCol, fresnel);
  col += vec3(1.0, 0.95, 0.85) * pow(max(dot(reflDir, l), 0.0), 48.0) * 0.6;
  return col;
}
```

`refract`'ın eta parametresi çok kolay ters yazılıyor. Havadan cama girerken oran `1 / IOR`, camdan havaya çıkarken `IOR`. Ben ilkinde `uIOR` yazmıştım ve ekranda simsiyah bir kütle belirmişti; heykel duruyordu, ışık gelmiyordu. Sebep basit: yanlış oran ışını yüzeye neredeyse teğet kırıyor, iç yürüyüş anında duvara toslayıp arka planın yanlış yerini örnekliyordu.

Tam iç yansıma kontrolü de atlanmayacak bir ayrıntı. Işın camdan çıkarken kritik açıyı aşarsa `refract` sıfır vektör döndürür; kontrol etmezseniz `normalize(vec3(0))` NaN üretir ve ekranda gezinen siyah lekeler görürsünüz. Sıfır uzunluk kontrolü o lekeleri yansımaya çeviriyor, ki fizikte de olan tam olarak bu.

Bir de kabul: burada iki kırılmada duruyoruz. İç boşluğun duvarına çarpan ışın orada arka planı örnekliyor, oysa fiziksel olarak boşluğa girip tekrar çıkması gerekirdi. Üçüncü ve dördüncü sıçramanın bedeli her piksele bir iç yürüyüş daha eklemek. Değmiyor.

Arka plan tarafı hiç yürümüyor. Zemin analitik bir düzlem, gökyüzü de ışın yönünden hesaplanan bir gradyan:

```glsl
vec3 background(vec3 ro, vec3 rd, bool withShadow) {
  if (rd.y < -0.0001) {
    float t = (PLANE_Y - ro.y) / rd.y; // ışın-düzlem kesişimi, döngü yok
    if (t > 0.0 && t < MAX_DIST) {
      vec3 p = ro + rd * t;
      float c = mod(floor(p.x * 0.8) + floor(p.z * 0.8), 2.0);
      vec3 col = mix(vec3(0.16), vec3(0.26), c);
      if (withShadow) {
        col *= 0.35 + 0.65 * softShadow(p, normalize(LIGHT_DIR), 0.06, 6.0, 12.0);
      }
      return mix(col, sky(rd), 1.0 - exp(-0.035 * t));
    }
  }
  return sky(rd);
}
```

Kırılma ve yansıma ışınları arka planı `withShadow = false` ile örnekliyor. Camın içinden görünen zeminde gölge hesaplamıyoruz; kimse fark etmiyor, her yansıma ışını için bir gölge yürüyüşünden kurtuluyoruz.

### Makineyi Isıtmamak

Tam ekran bir raymarching shader'ı GPU'yu %100'e kilitleyebilir. Bu seride demo açan kimsenin dizüstü bilgisayarı uğuldamasın diye üç korkuluk zorunlu.

Birincisi devicePixelRatio kelepçesi. Retina bir ekranda `dpr = 3` demek piksel sayısının dokuza katlanması demek; fragment shader ağırlıklı bir sahnede bu doğrudan dokuz kat maliyet. İkincisi çözünürlük ölçekleyici: kullanıcı 0,35 ile 1,0 arasında seçiyor, varsayılan 0,5. Üçüncüsü toplam piksel bütçesi; büyük bir monitörde tam ekran açıldığında ilk iki korkuluk yetmeyebiliyor.

```ts
// src/viewport.ts
export const MAX_DPR = 2;
export const MAX_PIXELS = 1_800_000;

export function backingSize(
  cssWidth: number,
  cssHeight: number,
  dpr: number,
  scale: number,
) {
  const clampedDpr = Math.min(Math.max(dpr, 1), MAX_DPR);
  const clampedScale = Math.min(Math.max(scale, 0.25), 1);
  const width = Math.max(1, Math.round(cssWidth * clampedDpr * clampedScale));
  const height = Math.max(1, Math.round(cssHeight * clampedDpr * clampedScale));
  return fitPixelBudget(width, height);
}

// En-boy oranını koruyarak toplam piksel sayısını bütçenin altına indirir.
export function fitPixelBudget(
  width: number,
  height: number,
  budget = MAX_PIXELS,
) {
  const total = width * height;
  if (total <= budget) return { width, height };
  const factor = Math.sqrt(budget / total);
  return {
    width: Math.max(1, Math.floor(width * factor)),
    height: Math.max(1, Math.floor(height * factor)),
  };
}
```

Dördüncü korkuluk döngünün kendisinde: bir "Dur/Devam" düğmesi ve sekme arka plana geçtiğinde otomatik duraklatma. Tarayıcılar gizli sekmede `requestAnimationFrame`'i zaten kısar, ama kısmak durdurmak değil; ölçüm alırken de gizli bir sekmenin sayıları kirletmesini istemiyoruz.

```ts
// src/main.ts (parça)
let running = true;
let frameId = 0;

function loop(now: number) {
  frameId = requestAnimationFrame(loop);
  renderer.render(now * 0.001);
  hud.update(renderer.stats());
}

function setRunning(next: boolean): void {
  if (next === running) return;
  running = next;
  toggleButton.textContent = running ? "Dur" : "Devam";
  if (running) {
    hud.setTimerSource(renderer.timer.available ? "gpu" : "raf");
    frameId = requestAnimationFrame(loop);
  } else {
    hud.setNote("Döngü duraklatıldı — sayaçlar donduruldu.");
    cancelAnimationFrame(frameId);
  }
}

toggleButton.addEventListener("click", () => setRunning(!running));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setRunning(false);
});
```

Varsayılan sahne de mütevazı: canvas tam ekran değil, 960 piksel genişliğinde 16:9 bir kutu. Tam ekranı isteyen büyütür, ama ilk açılışta kimse fırının içine düşmez.

### 64'e Karşı 128: Sayı

Şimdi asıl soru. Adım bütçesini ikiye katlamak GPU zamanını ikiye mi katlıyor?

Sezgi "hayır" diyor, çünkü piksellerin çoğu bütçesini zaten harcamıyor; tipik piksel dokuz adım civarında işini bitirip `break` ile çıkıyor, 64'ün yanına bile yaklaşmıyor. Onlar için `MAX_STEPS`'in 64 mü 128 mi olduğu fark etmez. Fatura sadece tavana dayanan piksellerden geliyor. Ama sezgi bir ölçüm değil.

GPU zamanını CPU'dan ölçemezsiniz. `performance.now()` ile `drawArrays` çağrısını sarmak size sürücüye komut yazma süresini verir, GPU'nun o komutu ne zaman çalıştırdığını değil. Doğru saat GPU'nun içinde: WebGL2'de `EXT_disjoint_timer_query_webgl2` uzantısı.

```ts
// src/timer.ts
interface TimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

export class GpuTimer {
  readonly available: boolean;
  readonly samplesMs: number[] = [];

  private readonly ext: TimerExtension | null;
  private readonly pending: WebGLQuery[] = [];
  private readonly free: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension(
      "EXT_disjoint_timer_query_webgl2",
    ) as TimerExtension | null;
    this.available = this.ext !== null;
  }

  begin(): void {
    if (!this.ext || this.active) return;
    const query = this.free.pop() ?? this.gl.createQuery();
    if (!query) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  // Her karede çağrılır. Sonuçlar birkaç kare gecikmeyle gelir; beklemek YASAK.
  poll(): void {
    if (!this.ext) return;
    const { gl } = this;

    if (gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
      // GPU saati kesildi (güç durumu değişimi, bağlam anahtarlama):
      // eldeki bütün ölçümler çöp.
      for (const query of this.pending) this.free.push(query);
      this.pending.length = 0;
      return;
    }

    while (this.pending.length > 0) {
      const query = this.pending[0];
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
      this.samplesMs.push(ns / 1e6);
      this.free.push(query);
      this.pending.shift();
    }
  }
}
```

Üç ayrıntı bu sınıfı çalışır kılıyor. Aynı anda tek bir sorgu açık olabilir, o yüzden `active` kontrolü var. Sonuç birkaç kare sonra hazır olur, o yüzden bekleyen sorgular bir kuyrukta duruyor ve asla `gl.finish()` çağırmıyoruz. Ve `GPU_DISJOINT_EXT` bayrağı: GPU güç durumu değiştirdiğinde ya da başka bir bağlam araya girdiğinde saat kayar, o penceredeki bütün örnekler geçersizdir. Kontrol etmezseniz tablonuza gerçek olmayan sayılar sızar.

Uzantı her yerde yok. Bazı tarayıcılar gizlilik gerekçesiyle kapatabiliyor, mobilde çoğunlukla bulunmuyor. Bu durumda ölçümü sessizce duvar saatine düşürmek yerine açıkça etiketliyoruz: `timerExt: false` çıktısı, tablodaki GPU ms sütununun yerine kare süresi medyanı geldiği anlamına geliyor. Ölçtüğünüz şeyin adını yanlış yazmak, ölçmemekten kötü.

Medyan ve yüzdelik hesabı da saf katmanda:

```ts
// src/stats.ts
export function median(values: readonly number[]): number {
  return percentile(values, 50);
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (Math.min(Math.max(p, 0), 100) / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return sorted[low];
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}
```

Ortalama değil medyan kullanıyoruz, çünkü tek bir GC duraklaması veya sekme değişimi ortalamayı çekiştirir. p95'i de raporluyoruz; kötü kareler ortalamada saklanır, yüzdelikte saklanamaz.

Son parça: ölçümün deterministik olması. Demo animasyonlu, fare hareketi kamerayı oynatıyor, çözünürlük pencereye bağlı. Bunların hiçbiri ölçüm sırasında olmamalı. Bu yüzden `?measure=1` ile açıldığında demo bambaşka bir moda giriyor: sabit 960×540 arka tampon, sabit zaman değeri, sabit kamera, sabit `k` ve IOR. Isınma kareleri atılıyor, sonra her yapılandırma için sayılı kare ölçülüp konsola tek satır basılıyor.

```ts
// src/measure.ts (parça)
export interface RunResult {
  gpuMsMedian: number;
  gpuMsP95: number;
  wallMsMedian: number;
}

export async function runConfig(
  renderer: Renderer,
  config: { maxSteps: 64 | 128; refract: boolean },
  frames: number,
  warmup: number,
): Promise<RunResult> {
  renderer.useStepBudget(config.maxSteps);
  renderer.setRefract(config.refract);
  renderer.setTime(MEASURE_TIME); // sabit poz: her koşu aynı kareyi çiziyor

  for (let i = 0; i < warmup; i++) await renderer.drawOnce(false);

  const wall: number[] = [];
  renderer.timer.samplesMs.length = 0;
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    await renderer.drawOnce(true); // timer.begin() -> draw -> timer.end() -> poll()
    wall.push(performance.now() - t0);
  }

  return {
    gpuMsMedian: median(renderer.timer.samplesMs),
    gpuMsP95: percentile(renderer.timer.samplesMs, 95),
    wallMsMedian: median(wall),
  };
}
```

Konsola düşen satır şu biçimde: `MEASURE {"gpu":"...","timerExt":true,"steps64":{...},"steps128":{...}}`. Tek satır, tek JSON. Ekran görüntüsünden sayı okumak yerine kopyalayıp yapıştırıyorsunuz.

Tablo:

| Adım bütçesi | Medyan GPU ms | p95 GPU ms | Ortalama adım/piksel | Tavana dayanan piksel |
|---|---|---|---|---|
| 64 | 1,702 | 1,77 | 10,225 | %0,054 |
| 128 | 1,704 | 1,78 | 10,232 | %0 |

960×540 arka tamponda, Apple M2 Pro (ANGLE Metal) üzerinde, ısınma kareleri atıldıktan sonra 240 kare. Bütçeyi ikiye katlamanın GPU zamanına oranı 1,00 çıkıyor; yani bu sahnede iki kat değil, hiç fark yok.

İki yan ölçüm daha var. Kırılmayı kapatınca 64 adımlık koşu 1,31 ms'ye iniyor; aradaki fark iç yürüyüşün ve ikinci `refract`'ın faturası. Ve `k` parametresi: `k = 0` ile piksel başına ortalama adım 9,939 iken `k = 0,35` ile 10,232 oluyor. Şekilleri eritmenin bedeli bu iki sayının farkı.

Görsel tarafta 64 ile 128 arasındaki fark tek yerde toplanıyor: silüetin kenarı ve camın içinden bakınca arka yüzeyin oturduğu bölge. Gövdenin ortası iki bütçede piksel piksel aynı, çünkü orası zaten beş altı adımda bitiyor.

### Saf Katman: Tarayıcısız Doğrulanan Kısım

Bu projede GPU'ya dokunmayan her şey test edilebilir. Gecemi yiyen hataların çoğu da tam olarak orada yaşıyordu.

`smin`'in üç davranışını doğrudan çiviliyoruz:

```ts
// test/sdf.test.ts (parça)
import { describe, expect, it } from "vitest";
import {
  opSubtract,
  sdBox,
  sdSphere,
  sdTorus,
  smin,
  type Vec3,
} from "../src/sdf";

describe("smin", () => {
  it("fark k'dan büyükse düz min'e döner", () => {
    expect(smin(0.2, 1.9, 0.5)).toBeCloseTo(0.2, 6);
    expect(smin(1.9, 0.2, 0.5)).toBeCloseTo(0.2, 6);
  });

  it("iki mesafe eşitken tam k/4 kadar aşağı çeker", () => {
    expect(smin(1, 1, 0.4)).toBeCloseTo(1 - 0.1, 6);
  });

  it("her zaman min'den küçük ya da eşittir (alan alt sınırdır)", () => {
    for (const [a, b] of [
      [0.3, 0.31],
      [0.9, 0.4],
      [-0.2, 0.05],
      [2, 2.4],
    ]) {
      expect(smin(a, b, 0.5)).toBeLessThanOrEqual(Math.min(a, b) + 1e-9);
    }
  });

  it("simetriktir", () => {
    expect(smin(0.4, 0.55, 0.3)).toBeCloseTo(smin(0.55, 0.4, 0.3), 12);
  });
});

describe("sdBox", () => {
  it("yüzeyde sıfır, içeride negatif, köşe dışında Öklid mesafesi", () => {
    const b: Vec3 = [1, 1, 1];
    expect(sdBox([1, 0, 0], b)).toBeCloseTo(0, 12);
    expect(sdBox([0, 0, 0], b)).toBeCloseTo(-1, 12);
    expect(sdBox([2, 2, 2], b)).toBeCloseTo(Math.sqrt(3), 12);
  });
});
```

Üçüncü test, yazının tezinin cebirsel hâli: `smin` alanı alt sınıra çeviriyor. Adım sayısının neden arttığını açıklayan tek satır bu.

Asıl güzeli yürüyüşçü testleri. CPU marcher'ı `map` fonksiyonunu parametre olarak alıyor, böylece sahneden bağımsız, analitik olarak doğrulanabilir alanlar kurabiliyoruz:

```ts
// test/march.test.ts (parça)
import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_DIST, march } from "../src/march";
import { sdSphere, smin } from "../src/sdf";
import type { Vec3 } from "../src/sdf";

const unitSphere = (p: Vec3) => sdSphere(p, 1);

describe("march", () => {
  it("dik gelen ışın iki map çağrısında yakınsar", () => {
    const res = march(unitSphere, [0, 0, -4], [0, 0, 1], { maxSteps: 64 });
    expect(res.hit).toBe(true);
    expect(res.steps).toBe(2); // 4-1=3 ilerle, sonra tam yüzeydesin
    expect(res.t).toBeCloseTo(3, 3);
  });

  it("teğet geçen ışın bütçenin tamamını harcar ve çarpmaz", () => {
    // Küreyi 0.02 birimle ıskalayan ışın: alan hep küçük ama hiç sıfır değil
    const res = march(unitSphere, [0, 1.02, -4], [0, 0, 1], { maxSteps: 24 });
    expect(res.hit).toBe(false);
    expect(res.steps).toBe(24); // tavan
  });
});
```

İki test, yazının tamamının özeti. Aynı sahne, aynı fonksiyon, aynı bütçe; birinci ışın 2 adım, ikinci ışın 24 adım harcıyor ve hiçbir şey bulamıyor. Heat map'te gördüğüm o kırmızı çizgi, ikinci testin ekrandaki hâli.

Bir de `smin`'in topolojiyi değiştirdiğini gösteren test var:

```ts
// test/march.test.ts (devamı)
const twoSpheres = (k: number) => (p: Vec3) => {
  const a = sdSphere([p[0] - 0.7, p[1], p[2]], 0.6);
  const b = sdSphere([p[0] + 0.7, p[1], p[2]], 0.6);
  return k === 0 ? Math.min(a, b) : smin(a, b, k);
};

describe("smin topolojiyi değiştirir", () => {
  it("k=0'da aradaki delikten geçen ışın, k=0.5'te köprüye çarpar", () => {
    const ray = { ro: [0, 0, -4] as Vec3, rd: [0, 0, 1] as Vec3 };
    const sharp = march(twoSpheres(0), ray.ro, ray.rd, { maxSteps: 128 });
    const blended = march(twoSpheres(0.5), ray.ro, ray.rd, { maxSteps: 128 });

    expect(sharp.hit).toBe(false); // iki küre arasında 0.2 birimlik açıklık var
    expect(blended.hit).toBe(true); // karışım o açıklığı kapattı
    // Köprü kürelerin merkez düzleminden ÖNCE başlıyor: 0 < t < 4
    expect(blended.t).toBeGreaterThan(3.5);
    expect(blended.t).toBeLessThan(4);
  });
});
```

Geri kalanlar daha sıkıcı ama en az onlar kadar gerekli: `#version` satırının yerinde durduğunu doğrulayan shader kaynağı testleri (gerçek `.glsl` dosyasını `?raw` ile içeri alıp kontrol ediyor), `backingSize` kelepçe testleri, `percentile` kenar durumları, `stepStats` sayımları. Hiçbir test dosyası `document`, `WebGL2RenderingContext` ya da `performance` referansı içermiyor.

Bu testlerin hiçbiri camın cam gibi göründüğünü kanıtlamaz. Onun için tarayıcıda açıp bakmak, heat map'i açıp kenarların kızardığını görmek, `?measure=1` ile konsoldaki tek satırı okumak gerekiyor.

### Özetle:

1. Sahnede tek üçgen yeter. `gl_VertexID`'den üç köşe üretilir, vertex buffer ve attribute hiç kurulmaz; WebGL2 yine de bağlı bir VAO ister.
2. Işın yönünü piksel koordinatından üretirken `res.y`'ye bölün. Dikey görüş açısı en-boy oranından bağımsız kalır, pencere genişleyince sahne yakınlaşmaz.
3. SDF, noktadan en yakın yüzeye mesafeyi döndüren saf bir fonksiyondur. Küre `length(p) - r`, kutu `length(max(q,0)) + min(max(q.x,q.y,q.z),0)`, torus iki aşamalı `length`.
4. `min`, `max` ve `smin` operatörlerinden sonra elinizdeki değer kesin mesafe değil, mesafenin alt sınırıdır. Yürüyüş güvenliğini bozmaz, adım sayısını artırır.
5. `smin(a, b, k)`: fark `k`'yı aşınca düz `min`, eşitlikte tam `a - k/4`, her koşulda simetrik. Üçü de tek satırlık test.
6. Dönüşümler ters uygulanır; nesneyi değil uzayı döndürürsünüz. Ölçekleme yaparsanız sonucu ölçekle çarpıp alanı geri onarın.
7. Yakınsama eşiğini `EPS * t` ile göreli tutun. Uzak yüzeylerde onlarca adım kazandırır, karşılığında silüette birkaç piksellik sahte çarpma verir.
8. `MAX_STEPS`'i uniform değil `#define` yapın ve aynı kaynaktan iki program derleyin. Sabit sınırlı döngü açılabilir, uniform sınırlı açılamaz.
9. `#version 300 es` kaynağın ilk satırı olmak zorundadır. Define bloğunuz o satırdan SONRA girer; aksi hâlde shader kibar ve anlamsız bir hatayla reddedilir.
10. Normal geometriden değil gradyandan gelir: merkezi fark altı `map` çağrısı, tetrahedron varyantı dört. Epsilon küçükse bantlaşma, büyükse yuvarlanmış kenarlar.
11. Cam iki kırılma ister. Giriş `1/IOR`, çıkış `IOR`; çıkışta `refract` sıfır vektör döndürebilir (tam iç yansıma) ve kontrol edilmezse NaN olarak ekrana düşer.
12. Adım sayısını `float(steps)/255.0` ile RGBA8 hedefe yazıp `readPixels` ile geri okuyun; `gl.disable(gl.DITHER)` olmadan bayt bir tık kayabilir.
13. GPU zamanı yalnızca `EXT_disjoint_timer_query_webgl2` ile ölçülür; sorgu sonucu birkaç kare geç gelir ve `GPU_DISJOINT_EXT` bayrağı yandığında eldeki bütün örnekler atılır. Uzantı yoksa sütunun adını değiştirin.
14. Ölçüm modu deterministik olmalı: sabit arka tampon, sabit zaman, sabit kamera, ısınma karelerinin atılması, medyan artı p95. Ortalama tek bir kötü kareyi saklar.
15. Tam ekran fragment shader'ı için üç korkuluk zorunlu: dpr kelepçesi, çözünürlük ölçekleyici ve toplam piksel bütçesi. Dördüncüsü sekme gizlenince duran döngü.

Depo hazır. `npm test` saf katmanı tarayıcısız doğruluyor; demoyu `npm run dev` ile açıp adrese `?measure=1` eklerseniz konsola tek satırlık JSON düşüyor. Yukarıdaki tablo benim makinemin hikâyesi; sizinki başka bir sayı verecek ve asıl okunmaya değer olan o.

Heat map'i ilk açtığım kareyi hâlâ hatırlıyorum. FPS sayacı 60 diyordu, kare süresi grafiği dümdüzdü. Ekranın kendisi ise silüetin kenarında kıpkırmızı yanıyordu. Aynı kare, iki gösterge, iki ayrı hikâye.

Ortalamanın en pratik tarafıyla en tehlikeli tarafı aynı: pahalı bir azınlığı kalabalığın içinde saklıyor. O günden beri biri "yavaş" dediğinde ilk sorum ne kadar değil, nerede. 🔦
