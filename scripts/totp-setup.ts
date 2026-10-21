import { generateTotpSecret, otpauthUrl } from '../src/server/auth/totp';

// Gera o segredo do 2FA. Rode, cadastre no app autenticador e copie a linha para o .env.local.
const secret = generateTotpSecret();
console.log('1. No app autenticador (Google Authenticator, Authy, 1Password...), escolha');
console.log('   "inserir chave de configuração" e digite:');
console.log(`   ${secret.match(/.{1,4}/g)?.join(' ')}`);
console.log('   Ou gere um QR code a partir deste link:');
console.log(`   ${otpauthUrl(secret)}`);
console.log('2. Adicione ao .env.local (e às variáveis da hospedagem):');
console.log(`APP_TOTP_SECRET=${secret}`);
console.log('3. Reinicie o app. Ligar o 2FA encerra as sessões abertas.');
