/** Chave do localStorage do modo "esconder valores" ('on' | 'off'). */
export const PRIVACY_STORAGE_KEY = 'privacy-mode';

/**
 * Roda no <head>, antes da primeira pintura: aplica o modo salvo para os totais não
 * aparecerem por um instante ao abrir o app. Arquivo separado porque o layout (servidor)
 * não consegue ler constantes de um módulo 'use client'.
 */
export const PRIVACY_INIT_SCRIPT = `try{if(localStorage.getItem('${PRIVACY_STORAGE_KEY}')==='on')document.documentElement.dataset.privacy='on'}catch(e){}`;
