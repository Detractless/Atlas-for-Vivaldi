import './contextMenu.css';

export const ContextMenu = {
  menu: null, disabled: false,
  init() {
    this.menu = document.createElement('div');
    this.menu.className = 'context-menu';
    document.body.appendChild(this.menu);
    document.addEventListener('click', () => this.close());
    document.addEventListener('contextmenu', (e) => {
      if (this.disabled) return;
      if (e.target.closest('.context-menu')) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) { this.close(); return; }
    });
    window.addEventListener('blur', () => this.close());
  },
  show(event, items) {
    event.preventDefault(); event.stopPropagation();
    this._renderItems(items);
    this.menu.classList.add('visible');
    this._position(event.clientX, event.clientY);
  },
  showRename(currentName, onConfirm) {
    this.menu.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'context-menu-inline';
    wrap.onclick = e => e.stopPropagation();

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'context-menu-input';
    input.value = currentName;

    const actions = document.createElement('div');
    actions.className = 'context-menu-actions';

    const cancel = document.createElement('button');
    cancel.className = 'context-menu-action-btn';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => this.close();

    const confirm = document.createElement('button');
    confirm.className = 'context-menu-action-btn primary';
    confirm.textContent = 'Rename';
    confirm.onclick = () => { const val = input.value.trim(); if (val) { onConfirm(val); this.close(); } };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const val = input.value.trim(); if (val) { onConfirm(val); this.close(); } }
      if (e.key === 'Escape') this.close();
    });

    actions.appendChild(cancel); actions.appendChild(confirm);
    wrap.appendChild(input); wrap.appendChild(actions);
    this.menu.appendChild(wrap);
    requestAnimationFrame(() => { input.focus(); input.select(); });
  },
  showInput(currentValue, buttonLabel, onConfirm) {
    this.menu.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'context-menu-inline';
    wrap.onclick = e => e.stopPropagation();

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'context-menu-input';
    input.value = currentValue;

    const actions = document.createElement('div');
    actions.className = 'context-menu-actions';

    const cancel = document.createElement('button');
    cancel.className = 'context-menu-action-btn';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => this.close();

    const confirm = document.createElement('button');
    confirm.className = 'context-menu-action-btn primary';
    confirm.textContent = buttonLabel;
    confirm.onclick = () => { const val = input.value.trim(); if (val) { onConfirm(val); this.close(); } };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const val = input.value.trim(); if (val) { onConfirm(val); this.close(); } }
      if (e.key === 'Escape') this.close();
    });

    actions.appendChild(cancel); actions.appendChild(confirm);
    wrap.appendChild(input); wrap.appendChild(actions);
    this.menu.appendChild(wrap);
    requestAnimationFrame(() => { input.focus(); input.select(); });
  },
  showSelect(options, onSelect) {
    this.menu.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'context-menu-list';
    ul.onclick = e => e.stopPropagation();
    options.forEach(opt => {
      const li = document.createElement('li'); li.className = 'context-menu-item';
      const btn = document.createElement('button'); btn.className = 'context-menu-btn';
      btn.textContent = opt.label;
      btn.onclick = () => { onSelect(opt.value); this.close(); };
      li.appendChild(btn); ul.appendChild(li);
    });
    this.menu.appendChild(ul);
  },
  showConfirm(label, onConfirm) {
    this.menu.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'context-menu-inline';
    wrap.onclick = e => e.stopPropagation();

    const msg = document.createElement('p');
    msg.className = 'context-menu-confirm-msg';
    msg.textContent = `Delete "${label}"?`;

    const actions = document.createElement('div');
    actions.className = 'context-menu-actions';

    const cancel = document.createElement('button');
    cancel.className = 'context-menu-action-btn';
    cancel.textContent = 'Cancel';
    cancel.onclick = () => this.close();

    let confirmed = false;
    const confirm = document.createElement('button');
    confirm.className = 'context-menu-action-btn delete';
    confirm.textContent = 'Delete';
    confirm.onclick = () => {
      if (!confirmed) {
        confirmed = true;
        msg.textContent = `Are you sure you want to delete "${label}"?`;
        confirm.textContent = 'Delete';
        return;
      }
      onConfirm(); this.close();
    };

    actions.appendChild(cancel); actions.appendChild(confirm);
    wrap.appendChild(msg); wrap.appendChild(actions);
    this.menu.appendChild(wrap);
  },
  _renderItems(items) {
    this.menu.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'context-menu-list';
    items.forEach(item => {
      const li = document.createElement('li'); li.className = 'context-menu-item'; if (item.divider) li.setAttribute('data-divider', item.divider);
      const btn = document.createElement('button'); btn.className = `context-menu-btn ${item.type || ''}`; btn.innerHTML = `${item.icon || ''} ${item.label}`;
      btn.onclick = (e) => { e.stopPropagation(); item.action(); };
      li.appendChild(btn); ul.appendChild(li);
    });
    this.menu.appendChild(ul);
  },
  _position(x, y) {
    const { innerWidth: w, innerHeight: h } = window;
    const { offsetWidth: mw, offsetHeight: mh } = this.menu;
    this.menu.style.left = `${x + mw > w ? x - mw : x}px`;
    this.menu.style.top  = `${y + mh > h ? y - mh : y}px`;
  },
  close() { if (this.menu) this.menu.classList.remove('visible'); }
};
