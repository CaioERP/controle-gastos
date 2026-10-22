import webpush from 'web-push';

// Gera o par de chaves VAPID para Web Push.
// Copie as linhas geradas para o .env.local (e às variáveis da hospedagem).
const vapidKeys = webpush.generateVAPIDKeys();

console.log('Chaves VAPID geradas com sucesso!');
console.log('Adicione ao .env.local (e às variáveis da hospedagem):');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log('VAPID_SUBJECT=mailto:seu-email@dominio.com');
