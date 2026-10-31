/* کلیدها و ثابت‌های داخلی — کاربر نهایی چیزی وارد نمی‌کند */
(function (root) {
'use strict';
root.FM_CONFIG = {
  neshanKey: 'service.ac46b6f61ccc43509b60027e369b5690',
  googleKey: '',
  mashhadToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0b2tlbl90eXBlIjoiYWNjZXNzIiwiZXhwIjoyMjc4ODE1MDA2LCJqdGkiOiIxNjhhMDE0NzE0OWU0ZjUxYTY1YzdjZmZjM2I2NDQwMyIsInVzZXJfaWQiOjIyLCJkZXYiOiJhcGkiLCJ1c2VybmFtZSI6InNhbWFucG9ydGFsIn0.kuxOgmKAFDTd5QX5eyH3uZL7RbwR7c0g8Ne_DXOR2BM',
  mashhadPage: 'https://eservice.mashhad.ir/fa/page/100670-%D8%A7%D8%B7%D9%84%D8%A7%D8%B9%D8%A7%D8%AA-%D9%85%D9%84%DA%A9.html',
  mashhadClauses: {
    fshParvaneh: { where: 'M1U2Ywlw4QvyqkvEnUYboRL3kjrDwbnvmv2QrhMQqhg=077', sub: 'XQbw1fC+BJlvISASIJiMyApYKWigXA6AyzrIq5F9OHs=030', order: 'C974lLbvhO4VkvDS16wU4SiKlUHGIPEB5aHD9RwuIEU=008' },
    fshPayankar: { where: 'M1U2Ywlw4QvyqkvEnUYboRL3kjrDwbnvmv2QrhMQqhg=007', sub: 'XQbw1fC+BJlvISASIJiMyApYKWigXA6AyzrIq5F9OHs=093', order: 'C974lLbvhO4VkvDS16wU4SiKlUHGIPEB5aHD9RwuIEU=072' },
    fshArseh:    { where: 'M1U2Ywlw4QvyqkvEnUYboRL3kjrDwbnvmv2QrhMQqhg=062', sub: 'XQbw1fC+BJlvISASIJiMyApYKWigXA6AyzrIq5F9OHs=034', order: 'C974lLbvhO4VkvDS16wU4SiKlUHGIPEB5aHD9RwuIEU=094' }
  }
};
/* کلید مؤثر: اگر کاربر در تنظیمات چیزی وارد کرده باشد اولویت دارد، وگرنه مقدار داخلی */
root.FM = root.FM || {};
root.FM.cfg = function (name) {
  const user = (root.FM.store && root.FM.store.get(name, '')) || '';
  return user || root.FM_CONFIG[name] || '';
};
})(window);
