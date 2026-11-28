// Yüzbir mail betiği: script.google.com'da yeni projeye yapıştır.
// Sunucu doğrulama ve şifre sıfırlama maillerini bu betik üzerinden SENİN Gmail adresinden gönderir.
// Kurulum: README.MD → "E-posta (Gmail)" bölümü.

// Render'daki GMAIL_SCRIPT_SECRET ile AYNI olmalı (uzun, rastgele bir metin).
const SECRET = 'BURAYA_GIZLI_ANAHTARI_YAPISTIR';

function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'bozuk istek' });
  }
  if (!SECRET || SECRET === 'BURAYA_GIZLI_ANAHTARI_YAPISTIR' || d.secret !== SECRET) {
    return reply({ ok: false, error: 'yetkisiz' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(d.to || ''))) {
    return reply({ ok: false, error: 'geçersiz alıcı' });
  }
  MailApp.sendEmail({
    to: d.to,
    subject: String(d.subject || 'Yüzbir'),
    htmlBody: String(d.html || ''),
    body: String(d.text || ''),
    name: String(d.name || 'Yüzbir'),
  });
  return reply({ ok: true, remaining: MailApp.getRemainingDailyQuota() });
}

// Tarayıcıdan açınca betiğin çalıştığını gösterir (mail göndermez).
function doGet() {
  return reply({ ok: true, service: 'yuzbir-mail' });
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
