# نقشه میدانی — فاز ۱

اپ اندروید مستقل (بدون سرور) با Capacitor. همه‌ی فایل‌های رابط داخل پوشه‌ی `www/` هستند و Leaflet و فونت وزیرمتن به‌صورت محلی بسته‌بندی شده‌اند، پس خود اپ به CDN وابسته نیست (فقط تایل‌های نقشه از اینترنت می‌آیند).

## ساخت APK

پیش‌نیازها: Node.js نسخه ۲۰ به بالا، Android Studio.

```bash
npm install
npx cap add android      # فقط بار اول
npx cap sync android
npx cap open android     # Android Studio باز می‌شود → Run ▶ یا Build > Build APK
```

### مجوزهای لازم (بار اول، بعد از `cap add android`)

در فایل `android/app/src/main/AndroidManifest.xml` داخل تگ `<manifest>` و بیرون از `<application>` اضافه کنید:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-feature android:name="android.hardware.location.gps" />
```

اینترنت (`INTERNET`) را Capacitor خودش اضافه می‌کند.

## قابلیت‌های فاز ۱

- نقشه با لایه‌های گوگل، OpenStreetMap، پایه‌ی شهرداری مشهد و نشان (کلید نشان را کاربر داخل اپ وارد می‌کند)
- موقعیت زنده با دایره‌ی دقت، دنبال‌کردن موقعیت، قطب‌نما با جبران کجی گوشی
- مختصات مرکز نقشه با علامت هدف (برای کپی)
- اندازه‌گیری فاصله و مساحت با علامت مرکز یا لمس نقشه

## فازهای بعدی

۲. ثبت نقطه با عکس و یادداشت، ردیابی مسیر حرکت، خروجی KML/GPX/DXF
۳. مسیریابی (نشان یا موتور داخلی) و هدایت لحظه‌ای
۴. اطلاعات پلاک مشهد

## نکات

- کش تایل‌ها فعلاً همان کش مرورگر WebView است. کش پایدار آفلاین در فاز ۲ اضافه می‌شود.
- استفاده‌ی مستقیم از تایل‌های گوگل و OSM برای اپ منتشرشده شرایط استفاده‌ی خودشان را دارد؛ برای استفاده‌ی شخصی/اداری مشکلی ندارد، برای انتشار عمومی باید بررسی شود.

## ساخت APK روی GitHub (بدون نصب SDK)

فایل `.github/workflows/build-apk.yml` پروژه را روی سرور GitHub می‌سازد.

1. یک مخزن (Repository) در GitHub بسازید (می‌تواند Private باشد).
2. همه‌ی فایل‌های این پروژه را در ریشه‌ی مخزن آپلود کنید (Add file > Upload files). اگر پوشه‌ی `.github` آپلود نشد، با Add file > Create new file یک فایل به نام `.github/workflows/build-apk.yml` بسازید و محتوای همین فایل را داخلش بچسبانید.
3. تب Actions > Build APK > Run workflow.
4. بعد از حدود ۵ تا ۱۰ دقیقه، داخل همان اجرا در بخش Artifacts فایل `fieldmap-debug-apk` را دانلود کنید، از حالت zip دربیاورید و `app-debug.apk` را روی گوشی نصب کنید.
