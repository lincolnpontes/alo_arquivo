(() => {
  'use strict';

  const STORAGE_KEY = 'alo_arquivo_leituras_v1';
  const CAMERA_KEY = 'alo_arquivo_camera_v1';
  const FEEDBACK_COOLDOWN = 1700;

  const elements = {
    headerCount: document.getElementById('headerCount'),
    listCount: document.getElementById('listCount'),
    codeList: document.getElementById('codeList'),
    emptyState: document.getElementById('emptyState'),
    shareButton: document.getElementById('shareButton'),
    clearButton: document.getElementById('clearButton'),
    startButton: document.getElementById('startButton'),
    switchButton: document.getElementById('switchButton'),
    torchButton: document.getElementById('torchButton'),
    cameraStatus: document.getElementById('cameraStatus'),
    cameraStatusText: document.getElementById('cameraStatusText'),
    cameraStage: document.getElementById('cameraStage'),
    cameraPlaceholder: document.getElementById('cameraPlaceholder'),
    cameraHelp: document.getElementById('cameraHelp'),
    scanFeedback: document.getElementById('scanFeedback'),
    feedbackIcon: document.getElementById('feedbackIcon'),
    feedbackTitle: document.getElementById('feedbackTitle'),
    feedbackValue: document.getElementById('feedbackValue'),
    clearDialog: document.getElementById('clearDialog'),
    confirmClearButton: document.getElementById('confirmClearButton'),
    toast: document.getElementById('toast')
  };

  let codes = loadCodes();
  let codeSet = new Set(codes);
  let scanner = null;
  let cameras = [];
  let cameraIndex = 0;
  let isStarting = false;
  let torchEnabled = false;
  let lastFeedback = { value: '', time: 0 };
  let feedbackTimer = null;
  let toastTimer = null;
  let audioContext = null;

  const supportedFormats = () => {
    if (!window.Html5QrcodeSupportedFormats) return undefined;
    const formats = window.Html5QrcodeSupportedFormats;
    return [
      formats.QR_CODE,
      formats.AZTEC,
      formats.CODABAR,
      formats.CODE_39,
      formats.CODE_93,
      formats.CODE_128,
      formats.DATA_MATRIX,
      formats.MAXICODE,
      formats.ITF,
      formats.EAN_13,
      formats.EAN_8,
      formats.PDF_417,
      formats.RSS_14,
      formats.RSS_EXPANDED,
      formats.UPC_A,
      formats.UPC_E,
      formats.UPC_EAN_EXTENSION
    ].filter(value => value !== undefined);
  };

  function loadCodes() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(saved)) return [];
      return [...new Set(saved.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))];
    } catch {
      return [];
    }
  }

  function saveCodes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
  }

  function escapeText(value) {
    return String(value);
  }

  function renderList() {
    const count = codes.length;
    elements.headerCount.textContent = count;
    elements.listCount.textContent = count;
    elements.emptyState.classList.toggle('is-hidden', count > 0);
    elements.shareButton.disabled = count === 0;
    elements.clearButton.disabled = count === 0;

    const fragment = document.createDocumentFragment();
    codes.forEach((value, index) => {
      const item = document.createElement('li');
      item.className = 'code-item';

      const number = document.createElement('span');
      number.className = 'code-number';
      number.textContent = String(index + 1).padStart(2, '0');

      const code = document.createElement('span');
      code.className = 'code-value';
      code.textContent = escapeText(value);

      const removeButton = document.createElement('button');
      removeButton.className = 'remove-button';
      removeButton.type = 'button';
      removeButton.dataset.index = String(index);
      removeButton.setAttribute('aria-label', `Remover código ${value}`);
      removeButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8l1 2h4v2H3V5h4l1-2Zm-2 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"/></svg>';

      item.append(number, code, removeButton);
      fragment.appendChild(item);
    });

    elements.codeList.replaceChildren(fragment);
  }

  function registerReading(rawValue) {
    const value = String(rawValue ?? '').trim();
    if (!value) return false;

    const now = Date.now();
    const isDuplicate = codeSet.has(value);

    if (isDuplicate) {
      if (lastFeedback.value !== value || now - lastFeedback.time > FEEDBACK_COOLDOWN) {
        lastFeedback = { value, time: now };
        showScanFeedback('duplicate', value);
        playTone('duplicate');
        if (navigator.vibrate) navigator.vibrate([35, 45, 35]);
      }
      return false;
    }

    codes.push(value);
    codeSet.add(value);
    saveCodes();
    renderList();
    lastFeedback = { value, time: now };
    showScanFeedback('success', value);
    playTone('success');
    if (navigator.vibrate) navigator.vibrate(75);
    return true;
  }

  function showScanFeedback(type, value) {
    const duplicate = type === 'duplicate';
    elements.scanFeedback.classList.remove('is-visible', 'is-duplicate');
    void elements.scanFeedback.offsetWidth;
    elements.scanFeedback.classList.toggle('is-duplicate', duplicate);
    elements.feedbackIcon.textContent = duplicate ? '!' : '✓';
    elements.feedbackTitle.textContent = duplicate ? 'Código já estava na lista' : `Leitura ${codes.length} salva`;
    elements.feedbackValue.textContent = value;
    elements.scanFeedback.classList.add('is-visible');
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => elements.scanFeedback.classList.remove('is-visible'), 1150);
  }

  function playTone(type) {
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const start = audioContext.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(type === 'success' ? 880 : 330, start);
      if (type === 'success') oscillator.frequency.exponentialRampToValueAtTime(1180, start + .09);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(.13, start + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, start + .14);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + .15);
    } catch {
      // O aviso visual continua funcionando quando o aparelho bloqueia áudio.
    }
  }

  function setCameraStatus(status, text) {
    elements.cameraStatus.className = `status-pill status-${status}`;
    elements.cameraStatusText.textContent = text;
  }

  function cameraScore(camera) {
    const label = (camera.label || '').toLowerCase();
    let score = 0;
    if (/back|rear|environment|traseir/.test(label)) score += 10;
    if (/wide|grande angular|ultra/.test(label)) score -= 2;
    if (/front|user|frontal/.test(label)) score -= 10;
    return score;
  }

  function findPreferredCameraIndex() {
    const savedId = localStorage.getItem(CAMERA_KEY);
    const savedIndex = cameras.findIndex(camera => camera.id === savedId);
    if (savedIndex >= 0) return savedIndex;

    return cameras.reduce((bestIndex, camera, index) => (
      cameraScore(camera) > cameraScore(cameras[bestIndex] || {}) ? index : bestIndex
    ), 0);
  }

  function scannerConfig() {
    return {
      fps: 12,
      qrbox: (viewfinderWidth, viewfinderHeight) => ({
        width: Math.floor(Math.min(viewfinderWidth * .84, 440)),
        height: Math.floor(Math.min(viewfinderHeight * .52, 220))
      }),
      aspectRatio: 1.333334,
      disableFlip: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };
  }

  async function startCamera() {
    if (isStarting) return;
    if (!window.Html5Qrcode) {
      setCameraStatus('error', 'Sem leitor');
      elements.cameraHelp.textContent = 'Não foi possível carregar o leitor. Verifique a internet e tente novamente.';
      showToast('Leitor indisponível. Verifique a internet.');
      return;
    }

    isStarting = true;
    elements.startButton.disabled = true;
    setCameraStatus('loading', 'Iniciando');
    elements.cameraHelp.textContent = 'Autorize o uso da câmera quando o aparelho solicitar.';

    try {
      if (!scanner) {
        scanner = new Html5Qrcode('reader', {
          formatsToSupport: supportedFormats(),
          verbose: false
        });
      }

      cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) throw new Error('Nenhuma câmera encontrada');
      cameraIndex = findPreferredCameraIndex();
      await beginScanning(cameras[cameraIndex].id);
      localStorage.setItem(CAMERA_KEY, cameras[cameraIndex].id);
      elements.switchButton.classList.toggle('is-hidden', cameras.length < 2);
      await refreshTorchAvailability();
      setCameraLive(true);
    } catch (error) {
      console.error('Falha ao iniciar câmera:', error);
      setCameraLive(false);
      setCameraStatus('error', 'Não abriu');
      elements.cameraHelp.textContent = cameraErrorMessage(error);
      showToast(cameraErrorMessage(error));
      if (scanner?.isScanning) await safeStopScanner();
    } finally {
      isStarting = false;
      elements.startButton.disabled = false;
    }
  }

  async function toggleCamera() {
    if (isStarting) return;
    if (scanner?.isScanning) {
      elements.startButton.disabled = true;
      await safeStopScanner();
      setCameraLive(false);
      elements.switchButton.classList.add('is-hidden');
      elements.torchButton.classList.add('is-hidden');
      elements.startButton.disabled = false;
      return;
    }
    await startCamera();
  }

  async function beginScanning(cameraId) {
    if (scanner?.isScanning) await scanner.stop();
    await scanner.start(cameraId, scannerConfig(), registerReading, () => {});
  }

  function cameraErrorMessage(error) {
    const message = String(error?.message || error || '').toLowerCase();
    if (/permission|denied|notallowed/.test(message)) return 'Permissão da câmera negada. Libere nas configurações do navegador.';
    if (/secure|https/.test(message)) return 'A câmera precisa de uma conexão segura (HTTPS).';
    if (/notfound|nenhuma|devicesnotfound/.test(message)) return 'Nenhuma câmera foi encontrada neste aparelho.';
    if (/notreadable|trackstart|could not start/.test(message)) return 'A câmera está sendo usada por outro aplicativo.';
    return 'Não foi possível abrir a câmera. Toque para tentar novamente.';
  }

  function setCameraLive(live) {
    elements.cameraStage.classList.toggle('is-live', live);
    elements.cameraPlaceholder.classList.toggle('is-hidden', live);
    setCameraStatus(live ? 'live' : 'idle', live ? 'Lendo' : 'Desligada');
    elements.startButton.querySelector('span').textContent = live ? 'Parar câmera' : 'Iniciar câmera';
    elements.startButton.disabled = false;
    elements.cameraHelp.textContent = live
      ? 'Leitura contínua ativa. Mostre um código depois do outro, sem fechar a câmera.'
      : 'A câmera permanece aberta. Basta mostrar um código depois do outro.';
  }

  async function switchCamera() {
    if (isStarting || cameras.length < 2) return;
    isStarting = true;
    elements.switchButton.disabled = true;
    elements.torchButton.classList.add('is-hidden');
    torchEnabled = false;
    setCameraStatus('loading', 'Trocando');

    try {
      cameraIndex = (cameraIndex + 1) % cameras.length;
      await beginScanning(cameras[cameraIndex].id);
      localStorage.setItem(CAMERA_KEY, cameras[cameraIndex].id);
      await refreshTorchAvailability();
      setCameraLive(true);
    } catch (error) {
      setCameraStatus('error', 'Falhou');
      showToast('Não foi possível trocar a câmera.');
    } finally {
      isStarting = false;
      elements.switchButton.disabled = false;
    }
  }

  async function refreshTorchAvailability() {
    let supportsTorch = false;
    try {
      const capabilities = scanner.getRunningTrackCapabilities?.();
      supportsTorch = Boolean(capabilities?.torch);
    } catch {
      supportsTorch = false;
    }
    elements.torchButton.classList.toggle('is-hidden', !supportsTorch);
    elements.torchButton.setAttribute('aria-pressed', 'false');
    torchEnabled = false;
  }

  async function toggleTorch() {
    if (!scanner?.isScanning) return;
    try {
      torchEnabled = !torchEnabled;
      await scanner.applyVideoConstraints({ advanced: [{ torch: torchEnabled }] });
      elements.torchButton.setAttribute('aria-pressed', String(torchEnabled));
      elements.torchButton.classList.toggle('torch-on', torchEnabled);
      elements.torchButton.querySelector('span').textContent = torchEnabled ? 'Ligada' : 'Lanterna';
    } catch {
      torchEnabled = false;
      showToast('A lanterna não está disponível nesta câmera.');
    }
  }

  async function safeStopScanner() {
    try {
      if (scanner?.isScanning) await scanner.stop();
    } catch {
      // Encerramento silencioso ao sair da página.
    }
  }

  function removeCode(index) {
    if (!Number.isInteger(index) || index < 0 || index >= codes.length) return;
    const [removed] = codes.splice(index, 1);
    codeSet.delete(removed);
    saveCodes();
    renderList();
    showToast('Leitura removida.');
  }

  function clearCodes() {
    codes = [];
    codeSet = new Set();
    saveCodes();
    renderList();
    showToast('Lista limpa.');
  }

  function buildShareText() {
    const noun = codes.length === 1 ? 'número lido' : 'números lidos';
    return `${codes.join('\n')}\n\nTotal: ${codes.length} ${noun}.`;
  }

  async function shareCodes() {
    if (!codes.length) return;
    const text = buildShareText();

    if (navigator.share) {
      try {
        await navigator.share({ title: 'Alô Arquivo', text });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      showToast('Lista copiada para você colar onde quiser.');
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
      showToast('Lista copiada para você colar onde quiser.');
    }
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove('is-visible'), 2600);
  }

  elements.startButton.addEventListener('click', toggleCamera);
  elements.switchButton.addEventListener('click', switchCamera);
  elements.torchButton.addEventListener('click', toggleTorch);
  elements.shareButton.addEventListener('click', shareCodes);
  elements.clearButton.addEventListener('click', () => elements.clearDialog.showModal());
  elements.confirmClearButton.addEventListener('click', clearCodes);
  elements.codeList.addEventListener('click', event => {
    const button = event.target.closest('.remove-button');
    if (button) removeCode(Number(button.dataset.index));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && scanner?.isScanning) {
      safeStopScanner().then(() => setCameraLive(false));
    }
  });

  renderList();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }

  window.__aloArquivo = Object.freeze({
    registerReading,
    buildShareText,
    getCodes: () => [...codes],
    clearCodes
  });
})();
