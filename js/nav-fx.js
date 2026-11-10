// ------------------------------------------------------------------
// NavFX — liquid sliding highlight for tab bars.
// The glass pill slides from the previous tab to the new one: its leading
// edge shoots ahead, the trailing edge catches up (stretch + squish), then a
// light sweep runs across it when it lands. A softer "ghost" pill follows the
// mouse on hover. Positions persist across re-renders, so it also animates
// when the whole page (and nav) is rebuilt on navigation.
// ------------------------------------------------------------------
const NavFX = {
  prev: {},
  reduce: window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches,

  attach(container, key) {
    if (!container) return;
    container.classList.add('fx');
    const hov = document.createElement('span'); hov.className = 'nav-hover no-anim';
    const ind = document.createElement('span'); ind.className = 'nav-ind no-anim';
    container.prepend(hov, ind);

    const links = [...container.querySelectorAll('[data-fx]')];
    const active = links.find(l => l.classList.contains('active'));

    const pos = el => {
      const c = container.getBoundingClientRect(), e = el.getBoundingClientRect();
      const bl = container.clientLeft, br = container.offsetWidth - container.clientWidth - bl;
      return { l: e.left - c.left - bl, r: c.right - e.right - br };
    };
    const set = (node, p) => { node.style.left = p.l + 'px'; node.style.right = p.r + 'px'; };

    const place = (animate) => {
      if (!active || !active.offsetParent) { ind.style.opacity = 0; return; }
      ind.style.opacity = 1;
      const to = pos(active);
      const from = this.prev[key];
      if (animate && from && Math.abs(from.l - to.l) > 2 && !this.reduce) {
        set(ind, from);
        void ind.offsetWidth;                       // commit start position
        ind.classList.remove('no-anim');
        ind.classList.add(to.l > from.l ? 'go-right' : 'go-left', 'moving');
        active.classList.add('arriving');
        requestAnimationFrame(() => set(ind, to));
        clearTimeout(ind._t);
        ind._t = setTimeout(() => {
          ind.classList.remove('go-right', 'go-left', 'moving');
          ind.classList.add('arrived');
          active.classList.remove('arriving');
          setTimeout(() => ind.classList.remove('arrived'), 800);
        }, 520);
      } else {
        set(ind, to);
        requestAnimationFrame(() => ind.classList.remove('no-anim'));
      }
      this.prev[key] = to;
    };

    // fonts can shift widths after first paint
    requestAnimationFrame(() => place(true));
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (container.isConnected && !ind.classList.contains('moving')) { ind.classList.add('no-anim'); place(false); } });

    // ghost pill on hover
    links.forEach(l => {
      l.addEventListener('mouseenter', () => {
        const p = pos(l);
        if (hov.style.opacity !== '1') { hov.classList.add('no-anim'); set(hov, p); void hov.offsetWidth; hov.classList.remove('no-anim'); }
        set(hov, p); hov.style.opacity = l === active ? '0' : '1';
      });
      // remember where the pill is right before navigating, so it slides from here
      l.addEventListener('click', () => { if (active) this.prev[key] = pos(active); });
    });
    container.addEventListener('mouseleave', () => { hov.style.opacity = '0'; });

    // keep aligned on resize
    const onResize = () => { if (!container.isConnected) return window.removeEventListener('resize', onResize); ind.classList.add('no-anim'); place(false); };
    window.addEventListener('resize', onResize);
  }
};
