(() => {
  'use strict';

  const STORAGE_KEY = 'alo_arquivo_leituras_v1';
  const SETTINGS_KEY = 'alo_arquivo_config_v1';
  const FEEDBACK_COOLDOWN = 1700;
  const DEFAULT_SETTINGS = Object.freeze({
    theme: 'default',
    nupValidation: true,
    itemType: 'processos',
    listName: 'Lista',
    scanMode: 'qr'
  });
  const logic = window.AloArquivoLogic;
  const QR_MODE_ICON = 'M3 3h7v7H3V3Zm2 2v3h3V5H5Zm9-2h7v7h-7V3Zm2 2v3h3V5h-3ZM3 14h7v7H3v-7Zm2 2v3h3v-3H5Zm9-2h3v3h-3v-3Zm4 0h3v7h-3v-7Zm-4 4h3v3h-3v-3Z';
  const BARCODE_MODE_ICON = 'M3 4h2v16H3V4Zm4 0h1v16H7V4Zm3 0h3v16h-3V4Zm5 0h1v16h-1V4Zm3 0h3v16h-3V4Z';

  const elements = {
    themeColor: document.getElementById('themeColor'),
    listCount: document.getElementById('listCount'),
    listTitle: document.getElementById('listTitle'),
    itemType: document.getElementById('itemType'),
    codeList: document.getElementById('codeList'),
    emptyState: document.getElementById('emptyState'),
    shareButton: document.getElementById('shareButton'),
    clearButton: document.getElementById('clearButton'),
    startButton: document.getElementById('startButton'),
    torchButton: document.getElementById('torchButton'),
    torchState: document.getElementById('torchState'),
    scanModeButton: document.getElementById('scanModeButton'),
    scanModeText: document.getElementById('scanModeText'),
    scanModeIconPath: document.getElementById('scanModeIconPath'),
    cameraStatus: document.getElementById('cameraStatus'),
    cameraStatusText: document.getElementById('cameraStatusText'),
    cameraStage: document.getElementById('cameraStage'),
    scanGuide: document.querySelector('.scan-guide'),
    cameraPlaceholder: document.getElementById('cameraPlaceholder'),
    cameraHelp: document.getElementById('cameraHelp'),
    scanFeedback: document.getElementById('scanFeedback'),
    feedbackIcon: document.getElementById('feedbackIcon'),
    feedbackTitle: document.getElementById('feedbackTitle'),
    feedbackValue: document.getElementById('feedbackValue'),
    clearDialog: document.getElementById('clearDialog'),
    confirmClearButton: document.getElementById('confirmClearButton'),
    editTitleButton: document.getElementById('editTitleButton'),
    titleDialog: document.getElementById('titleDialog'),
    listNameInput: document.getElementById('listNameInput'),
    saveTitleButton: document.getElementById('saveTitleButton'),
    installButton: document.getElementById('installButton'),
    installHelpDialog: document.getElementById('installHelpDialog'),
    settingsButton: document.getElementById('settingsButton'),
    settingsDialog: document.getElementById('settingsDialog'),
    nupValidationToggle: document.getElementById('nupValidationToggle'),
    nupErrorDialog: document.getElementById('nupErrorDialog'),
    nupErrorOkButton: document.getElementById('nupErrorOkButton'),
    toast: document.getElementById('toast')
  };

  let settings = loadSettings();
  settings.scanMode = 'qr';
  let codes = loadCodes();
  let codeSet = new Set(codes);
  let scanner = null;
  let preferredRearCameraId = null;
  let isStarting = false;
  let torchEnabled = false;
  let lastFeedback = { value: '', time: 0 };
  let feedbackTimer = null;
  let toastTimer = null;
  let audioContext = null;
  let lastInvalidDismissedAt = 0;
  let pendingInstallPrompt = null;
  let orientationRestartTimer = null;
  let orientationSensorActive = false;

  const supportedFormats = () => {
    if (!window.Html5QrcodeSupportedFormats) return undefined;
    const formats = window.Html5QrcodeSupportedFormats;
    if (settings.scanMode === 'qr') return [formats.QR_CODE];
    if (settings.nupValidation) {
      return [formats.CODE_128, formats.ITF].filter(value => value !== undefined);
    }
    return [
      formats.CODABAR,
      formats.CODE_39,
      formats.CODE_93,
      formats.CODE_128,
      formats.ITF,
      formats.EAN_13,
      formats.EAN_8,
      formats.PDF_417,
      formats.UPC_A,
      formats.UPC_E
    ].filter(value => value !== undefined);
  };

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      const theme = ['default', 'pink', 'blue', 'purple', 'sunset', 'glass'].includes(saved.theme) ? saved.theme : DEFAULT_SETTINGS.theme;
      return {
        theme,
        nupValidation: typeof saved.nupValidation === 'boolean' ? saved.nupValidation : DEFAULT_SETTINGS.nupValidation,
        itemType: ['processos', 'documentos'].includes(saved.itemType) ? saved.itemType : DEFAULT_SETTINGS.itemType,
        listName: logic.cleanListName(saved.listName || DEFAULT_SETTINGS.listName),
        scanMode: ['qr', 'barcode'].includes(saved.scanMode) ? saved.scanMode : DEFAULT_SETTINGS.scanMode
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function applySettings() {
    const themeColors = {
      default: '#102a43', pink: '#702d4f', blue: '#123c78',
      purple: '#4c287a', sunset: '#713b28', glass: '#132238'
    };
    document.documentElement.dataset.theme = settings.theme;
    elements.themeColor.content = themeColors[settings.theme];
    elements.listTitle.textContent = settings.listName;
    elements.itemType.value = settings.itemType;
    elements.nupValidationToggle.checked = settings.nupValidation;
    const selectedTheme = elements.settingsDialog.querySelector(`input[name="theme"][value="${settings.theme}"]`);
    if (selectedTheme) selectedTheme.checked = true;
    updateScanModeUI();
  }

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

  function registerReading(rawValue, decodedResult) {
    if (decodedResult && !formatMatchesMode(decodedResult)) return false;

    const rawText = String(rawValue ?? '').trim();
    if (!rawText) return false;

    let value = rawText;
    if (settings.nupValidation) {
      const nup = logic.extractNup(rawText);
      if (!nup) {
        const now = Date.now();
        if (!elements.nupErrorDialog.open && now - lastInvalidDismissedAt > FEEDBACK_COOLDOWN) {
          lastFeedback = { value: `invalid:${rawText}`, time: now };
          elements.nupErrorDialog.showModal();
          playTone('error');
          if (navigator.vibrate) navigator.vibrate([80, 55, 80]);
        }
        return false;
      }
      value = nup;
    }

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

  function formatMatchesMode(decodedResult) {
    const formatName = String(
      decodedResult?.result?.format?.formatName ||
      decodedResult?.result?.format?.format ||
      decodedResult?.format?.formatName || ''
    ).toUpperCase();
    return logic.formatMatchesMode(formatName, settings.scanMode);
  }

  function showScanFeedback(type, value) {
    const duplicate = type === 'duplicate';
    const invalid = type === 'error';
    elements.scanFeedback.classList.remove('is-visible', 'is-duplicate', 'is-error');
    void elements.scanFeedback.offsetWidth;
    elements.scanFeedback.classList.toggle('is-duplicate', duplicate);
    elements.scanFeedback.classList.toggle('is-error', invalid);
    elements.feedbackIcon.textContent = duplicate ? '!' : invalid ? '×' : '✓';
    elements.feedbackTitle.textContent = duplicate
      ? 'Código já estava na lista'
      : invalid ? 'NUP Padrão UFPB não encontrado' : `Leitura ${codes.length} salva`;
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

  function scannerConfig() {
    const barcodeMode = settings.scanMode === 'barcode';
    return {
      fps: 18,
      qrbox: (viewfinderWidth, viewfinderHeight) => ({
        width: Math.floor(barcodeMode
          ? Math.min(viewfinderWidth * .94, 640)
          : Math.min(viewfinderWidth * .72, viewfinderHeight * .72, 320)),
        height: Math.floor(barcodeMode
          ? Math.min(viewfinderHeight * .48, 180)
          : Math.min(viewfinderWidth * .72, viewfinderHeight * .72, 320))
      }),
      aspectRatio: barcodeMode ? 1.777778 : 1.333334,
      disableFlip: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true }
    };
  }

  function rearCameraScore(camera) {
    const label = String(camera?.label || '').toLowerCase();
    let score = /back|rear|environment|traseir/.test(label) ? 20 : 0;
    if (/main|principal|camera 0|câmera 0/.test(label)) score += 4;
    if (/ultra|wide|grande angular|tele|macro/.test(label)) score -= 5;
    return score;
  }

  async function selectBestRearCamera() {
    const devices = await Html5Qrcode.getCameras();
    const confirmedRear = devices
      .filter(camera => /back|rear|environment|traseir/.test(String(camera.label || '').toLowerCase()))
      .filter(camera => !/front|user|frontal|selfie|facetime/.test(String(camera.label || '').toLowerCase()))
      .sort((a, b) => rearCameraScore(b) - rearCameraScore(a));
    return confirmedRear[0]?.id || null;
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
    allowDeviceRotation();
    if (settings.scanMode === 'barcode') await enableInternalRotationSensor();
    elements.startButton.disabled = true;
    setCameraStatus('loading', 'Iniciando');
    elements.cameraHelp.textContent = 'Autorize o uso da câmera quando o aparelho solicitar.';

    try {
      if (!scanner) createScanner();
      preferredRearCameraId = await selectBestRearCamera();
      await beginScanning();
      await ensureRearCamera();
      await improveCameraQuality();
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
      elements.torchButton.classList.add('is-hidden');
      elements.startButton.disabled = false;
      return;
    }
    await startCamera();
  }

  function createScanner() {
    scanner = new Html5Qrcode('reader', {
      formatsToSupport: supportedFormats(),
      verbose: false
    });
  }

  async function resetScannerForMode() {
    await safeStopScanner();
    try { scanner?.clear(); } catch { /* O leitor será recriado abaixo. */ }
    scanner = null;
    createScanner();
  }

  async function beginScanning() {
    if (scanner?.isScanning) await scanner.stop();
    await scanner.start(
      preferredRearCameraId
        ? { deviceId: { exact: preferredRearCameraId } }
        : { facingMode: { exact: 'environment' } },
      scannerConfig(),
      registerReading,
      () => {}
    );
  }

  async function ensureRearCamera() {
    const video = document.querySelector('#reader video');
    const track = video?.srcObject?.getVideoTracks?.()[0];
    const facingMode = track?.getSettings?.().facingMode;
    if (facingMode === 'user') {
      await safeStopScanner();
      throw new Error('Câmera frontal bloqueada');
    }
  }

  function cameraErrorMessage(error) {
    const message = String(error?.message || error || '').toLowerCase();
    if (/permission|denied|notallowed/.test(message)) return 'Permissão da câmera negada. Libere nas configurações do navegador.';
    if (/secure|https/.test(message)) return 'A câmera precisa de uma conexão segura (HTTPS).';
    if (/front|frontal|notfound|nenhuma|devicesnotfound/.test(message)) return 'A câmera frontal está desativada. Nenhuma câmera traseira foi encontrada.';
    if (/notreadable|trackstart|could not start/.test(message)) return 'A câmera está sendo usada por outro aplicativo.';
    return 'Não foi possível abrir a câmera. Toque para tentar novamente.';
  }

  function setCameraLive(live) {
    if (!live) allowDeviceRotation();
    document.body.classList.toggle('camera-running', live);
    elements.cameraStage.classList.toggle('is-live', live);
    elements.cameraPlaceholder.classList.toggle('is-hidden', live);
    setCameraStatus(live ? 'live' : 'idle', live ? 'Lendo' : 'Desligada');
    elements.startButton.querySelector('span').textContent = live ? 'Parar câmera' : 'Iniciar câmera';
    elements.startButton.disabled = false;
    const mode = settings.scanMode === 'qr' ? 'QR Code' : 'código de barras';
    elements.cameraHelp.textContent = live
      ? `Leitura contínua de ${mode} ativa. Mostre um código depois do outro.`
      : `Modo ${mode}. A câmera permanece aberta entre as leituras.`;
  }

  async function toggleScanMode() {
    settings.scanMode = settings.scanMode === 'qr' ? 'barcode' : 'qr';
    saveSettings();
    updateScanModeUI();
    if (settings.scanMode === 'barcode') await enableInternalRotationSensor();
    await applyModeOrientation();
    showToast(settings.scanMode === 'qr' ? 'Leitura de QR Code ativada.' : 'Leitura de código de barras ativada.');

    const wasScanning = Boolean(scanner?.isScanning);
    if (scanner) {
      isStarting = true;
      elements.startButton.disabled = true;
      elements.scanModeButton.disabled = true;
      if (wasScanning) setCameraStatus('loading', 'Ajustando');
      try {
        await resetScannerForMode();
        if (wasScanning) {
          await beginScanning();
          await ensureRearCamera();
          await improveCameraQuality();
          await refreshTorchAvailability();
          setCameraLive(true);
        }
      } catch {
        setCameraLive(false);
        setCameraStatus('error', 'Falhou');
        showToast('Não foi possível mudar o modo da câmera.');
      } finally {
        isStarting = false;
        elements.startButton.disabled = false;
        elements.scanModeButton.disabled = false;
      }
    }
  }

  function updateScanModeUI() {
    const isQr = settings.scanMode === 'qr';
    elements.scanModeText.textContent = isQr ? 'QR Code' : 'Barras';
    elements.scanModeIconPath.setAttribute('d', isQr ? QR_MODE_ICON : BARCODE_MODE_ICON);
    elements.cameraStage.classList.toggle('mode-barcode', !isQr);
    document.body.classList.toggle('barcode-mode', !isQr);
    elements.scanGuide.style.width = isQr ? 'min(60%, 280px)' : 'min(94%, 640px)';
    elements.scanGuide.style.height = isQr ? 'auto' : 'min(48%, 180px)';
    elements.scanGuide.style.aspectRatio = isQr ? '1 / 1' : 'auto';
    elements.scanModeButton.setAttribute('aria-label', isQr
      ? 'Leitura de QR Code. Toque para mudar para código de barras.'
      : 'Leitura de código de barras. Toque para mudar para QR Code.');
    if (!scanner?.isScanning) {
      elements.cameraHelp.textContent = `Modo ${isQr ? 'QR Code' : 'código de barras'}. A câmera permanece aberta entre as leituras.`;
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
    elements.torchButton.setAttribute('aria-label', 'Ligar lanterna');
    elements.torchButton.classList.remove('torch-on');
    elements.torchState.textContent = 'OFF';
    torchEnabled = false;
  }

  async function improveCameraQuality() {
    try {
      const capabilities = scanner.getRunningTrackCapabilities?.();
      if (!capabilities) return;

      const constraints = {};
      if (capabilities.width?.max) {
        constraints.width = { ideal: Math.min(1920, capabilities.width.max) };
      }
      if (capabilities.height?.max) {
        constraints.height = { ideal: Math.min(1080, capabilities.height.max) };
      }
      if (capabilities.frameRate?.max) {
        constraints.frameRate = { ideal: Math.min(30, capabilities.frameRate.max) };
      }

      const advanced = {};
      if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
        advanced.focusMode = 'continuous';
      }
      if (Array.isArray(capabilities.exposureMode) && capabilities.exposureMode.includes('continuous')) {
        advanced.exposureMode = 'continuous';
      }
      if (Array.isArray(capabilities.whiteBalanceMode) && capabilities.whiteBalanceMode.includes('continuous')) {
        advanced.whiteBalanceMode = 'continuous';
      }
      if (Object.keys(advanced).length) {
        constraints.advanced = [advanced];
      }

      if (Object.keys(constraints).length) {
        await scanner.applyVideoConstraints(constraints);
      }
    } catch {
      // Mantém a leitura ativa se o navegador não aceitar ajustes avançados.
    }
  }

  async function toggleTorch() {
    if (!scanner?.isScanning) return;
    try {
      torchEnabled = !torchEnabled;
      await scanner.applyVideoConstraints({ advanced: [{ torch: torchEnabled }] });
      elements.torchButton.setAttribute('aria-pressed', String(torchEnabled));
      elements.torchButton.setAttribute('aria-label', torchEnabled ? 'Desligar lanterna' : 'Ligar lanterna');
      elements.torchButton.classList.toggle('torch-on', torchEnabled);
      elements.torchState.textContent = torchEnabled ? 'ON' : 'OFF';
    } catch {
      torchEnabled = false;
      elements.torchButton.classList.remove('torch-on');
      elements.torchState.textContent = 'OFF';
      showToast('A lanterna não está disponível nesta câmera.');
    }
  }

  function allowDeviceRotation() {
    try { screen.orientation?.unlock(); } catch { /* Alguns navegadores não expõem o desbloqueio. */ }
  }

  function handlePhysicalOrientation(event) {
    if (settings.scanMode !== 'barcode') return;
    const gamma = Number(event.gamma);
    if (!Number.isFinite(gamma) || Math.abs(gamma) < 35) return;
    document.documentElement.style.setProperty('--scanner-rotation', gamma >= 0 ? '90deg' : '-90deg');
  }

  async function enableInternalRotationSensor() {
    if (orientationSensorActive) return;
    if (typeof DeviceOrientationEvent === 'undefined') return;

    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') return;
      } catch {
        return;
      }
    }

    window.addEventListener('deviceorientation', handlePhysicalOrientation, { passive: true });
    orientationSensorActive = true;
  }

  async function applyModeOrientation() {
    if (settings.scanMode !== 'barcode' || !screen.orientation?.lock) {
      allowDeviceRotation();
      return;
    }
    try {
      await screen.orientation.lock('landscape');
    } catch {
      // Fora do modo instalado, o navegador pode negar o bloqueio; a rotação física continua liberada.
      allowDeviceRotation();
    }
  }

  function scheduleOrientationRestart() {
    clearTimeout(orientationRestartTimer);
    orientationRestartTimer = setTimeout(async () => {
      if (!scanner?.isScanning || isStarting) return;
      isStarting = true;
      elements.startButton.disabled = true;
      elements.scanModeButton.disabled = true;
      setCameraStatus('loading', 'Girando');
      try {
        await beginScanning();
        await ensureRearCamera();
        await improveCameraQuality();
        await refreshTorchAvailability();
        setCameraLive(true);
      } catch {
        setCameraLive(false);
        setCameraStatus('error', 'Falhou');
        showToast('Não foi possível ajustar a câmera após girar o celular.');
      } finally {
        isStarting = false;
        elements.startButton.disabled = false;
        elements.scanModeButton.disabled = false;
      }
    }, 350);
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
    return logic.buildShareText(codes, settings);
  }

  async function shareCodes() {
    if (!codes.length) return;
    const text = buildShareText();
    const whatsappSafeText = logic.buildNativeShareText(codes, settings);

    if (navigator.share) {
      try {
        await navigator.share({ text: whatsappSafeText });
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

  function openTitleDialog() {
    elements.listNameInput.value = settings.listName;
    elements.titleDialog.showModal();
    requestAnimationFrame(() => elements.listNameInput.select());
  }

  function saveListName() {
    settings.listName = logic.cleanListName(elements.listNameInput.value);
    saveSettings();
    elements.listTitle.textContent = settings.listName;
    showToast('Nome da lista atualizado.');
  }

  function openSettings() {
    applySettings();
    elements.settingsDialog.showModal();
  }

  function isStandaloneApp() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isAppleMobile() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  async function installApp() {
    if (pendingInstallPrompt) {
      pendingInstallPrompt.prompt();
      await pendingInstallPrompt.userChoice;
      pendingInstallPrompt = null;
      elements.installButton.hidden = true;
      return;
    }

    if (isAppleMobile()) {
      elements.installHelpDialog.showModal();
      return;
    }

    showToast('A instalação será oferecida pelo navegador quando disponível.');
  }

  elements.startButton.addEventListener('click', toggleCamera);
  elements.scanModeButton.addEventListener('click', toggleScanMode);
  elements.torchButton.addEventListener('click', toggleTorch);
  elements.shareButton.addEventListener('click', shareCodes);
  elements.clearButton.addEventListener('click', () => elements.clearDialog.showModal());
  elements.confirmClearButton.addEventListener('click', clearCodes);
  elements.nupErrorDialog.addEventListener('close', () => {
    lastInvalidDismissedAt = Date.now();
  });
  elements.editTitleButton.addEventListener('click', openTitleDialog);
  elements.saveTitleButton.addEventListener('click', saveListName);
  elements.installButton.addEventListener('click', installApp);
  elements.settingsButton.addEventListener('click', openSettings);
  elements.itemType.addEventListener('change', () => {
    settings.itemType = elements.itemType.value;
    saveSettings();
  });
  elements.nupValidationToggle.addEventListener('change', () => {
    settings.nupValidation = elements.nupValidationToggle.checked;
    saveSettings();
    showToast(settings.nupValidation ? 'Validação NUP UFPB ativada.' : 'Validação NUP UFPB desativada.');
  });
  elements.settingsDialog.addEventListener('change', event => {
    if (event.target.matches('input[name="theme"]')) {
      settings.theme = event.target.value;
      saveSettings();
      applySettings();
    }
  });
  elements.codeList.addEventListener('click', event => {
    const button = event.target.closest('.remove-button');
    if (button) removeCode(Number(button.dataset.index));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && scanner?.isScanning) {
      safeStopScanner().then(() => setCameraLive(false));
    }
  });
  if (screen.orientation?.addEventListener) {
    screen.orientation.addEventListener('change', scheduleOrientationRestart);
  } else {
    window.addEventListener('orientationchange', scheduleOrientationRestart);
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingInstallPrompt = event;
    if (!isStandaloneApp()) elements.installButton.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    pendingInstallPrompt = null;
    elements.installButton.hidden = true;
    showToast('Alô Arquivo instalado.');
  });

  allowDeviceRotation();
  applySettings();
  renderList();
  if (isAppleMobile() && !isStandaloneApp()) elements.installButton.hidden = false;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js?v=20260629.8')
        .then(registration => registration.update())
        .catch(() => {});
    });
  }

  window.__aloArquivo = Object.freeze({
    registerReading,
    buildShareText,
    getCodes: () => [...codes],
    getSettings: () => ({ ...settings }),
    clearCodes
  });
})();
