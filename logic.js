(function exposeAloArquivoLogic(root) {
  'use strict';

  function cleanListName(value) {
    return String(value || '').replace(/\*/g, '').trim().slice(0, 40) || 'Lista';
  }

  function extractNup(rawValue) {
    const match = String(rawValue || '').replace(/\D/g, '').match(/23074\d{12}/);
    return match ? match[0] : null;
  }

  function formatMatchesMode(formatName, scanMode) {
    const normalized = String(formatName || '').toUpperCase();
    if (!normalized) return true;
    const isQrCode = normalized.includes('QR');
    return scanMode === 'qr' ? isQrCode : !isQrCode;
  }

  function buildShareText(codes, settings) {
    const count = codes.length;
    const noun = settings.itemType === 'documentos'
      ? (count === 1 ? 'documento lido' : 'documentos lidos')
      : (count === 1 ? 'processo lido' : 'processos lidos');
    return `*${cleanListName(settings.listName)}*\n${codes.join('\n')}\n\nTotal: ${count} ${noun}.`;
  }

  const logic = Object.freeze({ cleanListName, extractNup, formatMatchesMode, buildShareText });
  root.AloArquivoLogic = logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
})(typeof window !== 'undefined' ? window : globalThis);
