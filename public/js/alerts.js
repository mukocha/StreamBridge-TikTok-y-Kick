const socket = io();
const alertWrapper = document.getElementById('alert-wrapper');
const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let settings = {
  alertDuration: 5000,
  alertVolume: 0.8,
  soundEnabled: true
};

const queue = [];
let isPlaying = false;

socket.on('init', ({ state }) => {
  if (state.settings) {
    settings = { ...settings, ...state.settings };
  }
});

socket.on('settings:update', (newSettings) => {
  settings = { ...settings, ...newSettings };
});

socket.on('alert:event', (alert) => {
  queue.push(alert);
  if (!isPlaying) {
    processQueue();
  }
});

function processQueue() {
  if (queue.length === 0) {
    isPlaying = false;
    return;
  }

  isPlaying = true;
  const current = queue.shift();
  showAlert(current);
}

// Built-in Sound Synthesizer using Web Audio API
function playAlertSound() {
  if (!settings.soundEnabled) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctxAudio = new AudioCtx();

    const now = ctxAudio.currentTime;
    const osc = ctxAudio.createOscillator();
    const gain = ctxAudio.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.24); // G5
    osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.36); // C6

    gain.gain.setValueAtTime(settings.alertVolume * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    osc.connect(gain);
    gain.connect(ctxAudio.destination);

    osc.start(now);
    osc.stop(now + 0.9);
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

function showAlert(alert) {
  playAlertSound();
  launchConfetti(alert.platform === 'kick' ? '#53fc18' : '#fe2c55');

  const card = document.createElement('div');
  card.className = `alert-card ${alert.platform}-alert`;

  let iconSvg = '';
  if (alert.type === 'gift' || alert.type === 'gift_sub') {
    iconSvg = '🎁';
  } else if (alert.type === 'subscription') {
    iconSvg = '⭐';
  } else if (alert.type === 'follow') {
    iconSvg = '❤️';
  } else {
    iconSvg = '🎉';
  }

  let title = escapeHtml(alert.user);
  let subtitle = escapeHtml(alert.details || '');

  card.innerHTML = `
    <span class="alert-badge ${alert.platform}">${alert.platform.toUpperCase()}</span>
    <div class="alert-icon-container">
      ${alert.giftIcon ? `<img class="alert-icon" src="${escapeHtml(alert.giftIcon)}" />` : `<span style="font-size: 38px;">${iconSvg}</span>`}
    </div>
    <div class="alert-title">
      <span class="alert-username">${title}</span>
    </div>
    <div class="alert-subtitle">${subtitle}</div>
  `;

  alertWrapper.innerHTML = '';
  alertWrapper.appendChild(card);

  setTimeout(() => {
    card.classList.add('exit');
    setTimeout(() => {
      card.remove();
      processQueue();
    }, 500);
  }, settings.alertDuration || 5000);
}

// Particle confetti engine
let particles = [];
function launchConfetti(primaryColor) {
  const colors = [primaryColor, '#ffffff', '#ffd700', '#00f2fe', '#ff007f'];
  particles = [];
  for (let i = 0; i < 70; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.7) * 16,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 8
    });
  }
  requestAnimationFrame(updateParticles);
}

function updateParticles() {
  if (particles.length === 0) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  particles.forEach(p => {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.3; // Gravity
    p.alpha -= 0.015;
    p.rotation += p.rotationSpeed;

    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.fillStyle = p.color;
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  });

  particles = particles.filter(p => p.alpha > 0);
  if (particles.length > 0) {
    requestAnimationFrame(updateParticles);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
