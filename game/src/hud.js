// The DOM HUD: crosshair, hit marker, health, ammo, money, round timer, score,
// team counts, kill feed, bomb status, plant progress, the buy menu and the
// overlays. It never touches the simulation; main.js pushes numbers in and reads
// the play and buy callbacks out.
const COPY = {
  start: {
    title: 'Ferro Yard',
    copy: 'A tactical round-based FPS. Vanguard attacks, Rustjackals defend. Plant the charge at site A or B — or eliminate the other team. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Ferro Yard',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const ammo = $('ammo');
  const weaponName = $('weapon-name');
  const healthFill = $('health-fill');
  const healthNum = $('health-num');
  const moneyValue = $('money-value');
  const timerValue = $('timer-value');
  const scoreV = $('score-v');
  const scoreR = $('score-r');
  const aliveV = $('alive-v');
  const aliveR = $('alive-r');
  const grenadesValue = $('grenades-value');
  const hitmarker = $('hitmarker');
  const killfeed = $('killfeed');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const bombStatus = $('bomb-status');
  const bombText = $('bomb-text');
  const plantWrap = $('plant-wrap');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const buyMenu = $('buy-menu');
  const buyList = $('buy-list');
  const damageFlash = $('damage-flash');
  let hitTimer = 0;
  let bannerTimer = 0;
  let last = {};

  function setText(node, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    node.textContent = value;
  }

  return {
    setHealth(value) {
      const v = Math.max(0, Math.round(value));
      setText(healthNum, 'health', String(v));
      healthFill.style.width = `${v}%`;
      healthFill.classList.toggle('low', v <= 30);
    },
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'reserve', `/ ${reserve}`);
      ammo.classList.toggle('empty', mag === 0);
    },
    setWeapon(name) {
      setText(weaponName, 'weapon', name);
    },
    setMoney(value) {
      setText(moneyValue, 'money', `$${value}`);
    },
    setGrenades(count) {
      setText(grenadesValue, 'grenades', String(count));
    },
    setTimer(seconds, planted) {
      const s = Math.max(0, Math.ceil(seconds));
      const mm = Math.floor(s / 60);
      const ss = String(s % 60).padStart(2, '0');
      setText(timerValue, 'timer', `${mm}:${ss}`);
      timerValue.classList.toggle('danger', planted || s <= 10);
    },
    setScore(v, r) {
      setText(scoreV, 'scoreV', String(v));
      setText(scoreR, 'scoreR', String(r));
    },
    setAlive(v, r) {
      setText(aliveV, 'aliveV', `●`.repeat(v) + `○`.repeat(Math.max(0, 4 - v)));
      setText(aliveR, 'aliveR', `●`.repeat(r) + `○`.repeat(Math.max(0, 4 - r)));
    },
    setBomb(text) {
      bombStatus.hidden = !text;
      if (text) setText(bombText, 'bomb', text);
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed
        ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)'
        : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damage() {
      damageFlash.classList.add('on');
      setTimeout(() => damageFlash.classList.remove('on'), 140);
    },
    killfeed(killer, victim, headshot) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.textContent = `${killer}  ✕  ${victim}${headshot ? '  (headshot)' : ''}`;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    showBanner(titleText, subText, ms = 2600) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { banner.hidden = true; }, ms);
    },
    hideBanner() {
      banner.hidden = true;
    },
    plantProgress(label, fraction) {
      plantWrap.hidden = fraction <= 0;
      if (fraction > 0) {
        plantLabel.textContent = label;
        plantFill.style.width = `${Math.min(100, fraction * 100)}%`;
      }
    },
    showOverlay(mode, detail) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = detail ?? text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
    // Buy menu: items is [{ id, name, price, owned, afford }]; onBuy(id) fires on click.
    showBuy(items, money, onBuy) {
      buyList.innerHTML = '';
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.disabled = item.owned || !item.afford;
        button.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-price">${item.owned ? 'OWNED' : '$' + item.price}</span>`;
        button.addEventListener('click', () => onBuy(item.id));
        buyList.appendChild(button);
      }
      $('buy-money').textContent = `Money: $${money} — press B to close`;
      buyMenu.hidden = false;
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    buyVisible() {
      return !buyMenu.hidden;
    },
  };
}
