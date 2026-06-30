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

  function nupRetryTip(scanMode) {
    return scanMode === 'barcode'
      ? 'Se o erro persistir, tente ler o QR Code.'
      : 'Se o erro persistir, tente ler o código de barras.';
  }

  function keepRearCameras(devices) {
    const labelOf = camera => String(camera?.label || '').toLowerCase();
    const confirmedRear = devices.filter(camera => /back|rear|environment|traseir/.test(labelOf(camera)));
    if (confirmedRear.length) return confirmedRear;
    return devices.filter(camera => !/front|user|frontal|selfie|facetime/.test(labelOf(camera)));
  }

  function buildShareText(codes, settings) {
    const count = codes.length;
    const noun = settings.itemType === 'documentos'
      ? (count === 1 ? 'documento' : 'documentos')
      : (count === 1 ? 'processo' : 'processos');
    return `*${cleanListName(settings.listName)}*\n\n${codes.join('\n')}\n\nTotal: ${count} ${noun}`.trimStart();
  }

  function buildNativeShareText(codes, settings) {
    return `\u200B${buildShareText(codes, settings).trimStart()}`;
  }

  const logic = Object.freeze({ cleanListName, extractNup, formatMatchesMode, nupRetryTip, keepRearCameras, buildShareText, buildNativeShareText });
  root.AloArquivoLogic = logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
})(typeof window !== 'undefined' ? window : globalThis);
