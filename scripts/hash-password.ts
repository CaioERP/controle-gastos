import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/server/auth/password';

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Uso: npx tsx scripts/hash-password.ts "<senha>"');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('Use pelo menos 12 caracteres (de preferência uma frase com 4 ou mais palavras).');
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const sessionSecret = randomBytes(32).toString('hex');

  console.log('Adicione ao seu .env.local:');
  console.log(`APP_PASSWORD_HASH=${hash}`);
  console.log(`SESSION_SECRET=${sessionSecret}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
