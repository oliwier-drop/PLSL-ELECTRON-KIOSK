/**
 * KioskKeyboard – on-screen keyboard widget
 *
 * Features:
 *  - Windows 11 dark style
 *  - Letters layout with number hints on q–p keys
 *  - Symbols layout (?123) with digits + common symbols
 *  - PL mode: letter keys swap to Polish diacritics (ą ć ę ł ń ó ś ź ż)
 *  - CapsLock: persistent uppercase until toggled off
 *  - Shift: momentary modifier (one key press), cooperates with CapsLock via XOR
 *  - Backspace, Space, Enter, Tab, Escape, cursor left/right arrows
 *  - Hidden by default; call show() / hide() to control visibility
 */
(function (global) {
  'use strict';

  var PL_MAP = {
    a: 'ą', c: 'ć', e: 'ę', l: 'ł', n: 'ń',
    o: 'ó', s: 'ś', z: 'ź', x: 'ż'
  };

  var LAYOUTS = {
    letters: [
      [
        { label: 'Esc', action: 'escape', cls: 'key-esc' },
        'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p',
        { label: '⌫', action: 'backspace', cls: 'key-backspace' }
      ],
      [
        { label: 'Caps', action: 'capslock', cls: 'key-capslock' },
        'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l',
        { label: '↵', action: 'enter', cls: 'key-enter' }
      ],
      [
        { label: '⇧', action: 'shift', cls: 'key-shift' },
        'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', ':', '?',
        { label: '⇧', action: 'shift', cls: 'key-shift' }
      ],
      [
        { label: '&123', action: 'symbols', cls: 'key-symbols' },
        { label: 'Alt', action: 'noop', cls: 'key-alt' },
        { label: 'PL', action: 'pl', cls: 'key-pl' },
        { label: 'SPACE', action: 'space', cls: 'key-space' },
        { label: '‹', action: 'cursorleft', cls: 'key-arrow' },
        { label: '›', action: 'cursorright', cls: 'key-arrow' },
      ]
    ],
    symbols: [
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
      ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
      ['-', '_', '=', '+', '[', ']', '{', '}', ';', ':'],
      [
        { label: 'ABC', action: 'letters', cls: 'key-abc' },
        { label: 'Spacja', action: 'space', cls: 'key-space' },
        { label: '↵', action: 'enter', cls: 'key-enter' }
      ]
    ]
  };

  function KioskKeyboard(options) {
    this._options = Object.assign({ onInput: null }, options || {});
    this._state = {
      layout: 'letters',
      shift: false,
      capslock: false,
      pl: false
    };
    this._visible = false;
    this._container = null;
    this._target = null;
    this._el = null;
  }

  KioskKeyboard.prototype.mount = function (containerEl, targetEl) {
    this._container = typeof containerEl === 'string'
      ? document.querySelector(containerEl)
      : containerEl;
    this._target = typeof targetEl === 'string'
      ? document.querySelector(targetEl)
      : (targetEl || null);
    this._render();
    return this;
  };

  KioskKeyboard.prototype.setTarget = function (targetEl) {
    this._target = typeof targetEl === 'string'
      ? document.querySelector(targetEl)
      : (targetEl || null);
    return this;
  };

  KioskKeyboard.prototype.show = function () {
    this._visible = true;
    if (this._el) {
      this._el.classList.add('is-visible');
    }
    var self = this;
    if (this._target) {
      setTimeout(function () {
        self._target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
    return this;
  };

  KioskKeyboard.prototype.hide = function () {
    this._visible = false;
    if (this._el) {
      this._el.classList.remove('is-visible');
    }
    return this;
  };

  KioskKeyboard.prototype._displayChar = function (baseLetter) {
    var ch = (this._state.pl && this._state.layout === 'letters')
      ? (PL_MAP[baseLetter] || baseLetter)
      : baseLetter;

    var upper = this._state.capslock !== this._state.shift;
    return upper ? ch.toUpperCase() : ch;
  };

  KioskKeyboard.prototype._render = function () {
    if (!this._container) return;

    var self = this;
    var state = this._state;
    var layout = LAYOUTS[state.layout];

    var el = document.createElement('div');
    el.className = 'kiosk-keyboard kiosk-keyboard--' + state.layout;

    if (this._visible) el.classList.add('is-visible');

    el.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'kiosk-keyboard__close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function () { self.hide(); });
    el.appendChild(closeBtn);

    layout.forEach(function (row) {
      var rowEl = document.createElement('div');
      rowEl.className = 'kiosk-keyboard__row';

      row.forEach(function (key) {
        var btn = document.createElement('button');
        btn.type = 'button';

        if (typeof key === 'string' || (typeof key === 'object' && key.char !== undefined)) {
          var baseLetter = typeof key === 'string' ? key : key.char;
          var hint = typeof key === 'object' ? key.hint : undefined;
          var ch = self._displayChar(baseLetter);

          btn.className = 'kiosk-keyboard__key';
          btn.textContent = ch;
          btn.setAttribute('data-char', ch);
          if (hint) btn.setAttribute('data-hint', hint);

          (function (char) {
            btn.addEventListener('click', function () {
              self._insertChar(char);
            });
          }(ch));
        } else {
          btn.className = 'kiosk-keyboard__key kiosk-keyboard__key--action ' + (key.cls || '');

          if (key.action === 'pl') {
            btn.textContent = 'PL';
          } else {
            btn.textContent = key.label;
          }

          if (key.action === 'shift' && state.shift) btn.classList.add('is-active');
          if (key.action === 'capslock' && state.capslock) btn.classList.add('is-active');
          if (key.action === 'pl' && state.pl) btn.classList.add('is-active');

          (function (action) {
            btn.addEventListener('click', function () {
              self._handleAction(action);
            });
          }(key.action));
        }

        rowEl.appendChild(btn);
      });

      el.appendChild(rowEl);
    });

    if (this._el && this._el.parentNode === this._container) {
      this._container.replaceChild(el, this._el);
    } else {
      this._container.appendChild(el);
    }
    this._el = el;
  };

  KioskKeyboard.prototype._insertChar = function (char) {
    if (!this._target) return;

    var el = this._target;
    var start = el.selectionStart != null ? el.selectionStart : (el.value || '').length;
    var end = el.selectionEnd != null ? el.selectionEnd : start;
    var val = el.value || '';

    el.value = val.substring(0, start) + char + val.substring(end);
    el.selectionStart = el.selectionEnd = start + char.length;
    el.dispatchEvent(new Event('input', { bubbles: true }));

    if (this._options.onInput) {
      this._options.onInput(el.value);
    }

    if (this._state.shift) {
      this._state.shift = false;
      this._render();
    }
  };

  KioskKeyboard.prototype._doBackspace = function () {
    if (!this._target) return;

    var el = this._target;
    var start = el.selectionStart != null ? el.selectionStart : (el.value || '').length;
    var end = el.selectionEnd != null ? el.selectionEnd : start;
    var val = el.value || '';

    if (start !== end) {
      el.value = val.substring(0, start) + val.substring(end);
      el.selectionStart = el.selectionEnd = start;
    } else if (start > 0) {
      el.value = val.substring(0, start - 1) + val.substring(start);
      el.selectionStart = el.selectionEnd = start - 1;
    }

    el.dispatchEvent(new Event('input', { bubbles: true }));

    if (this._options.onInput) {
      this._options.onInput(el.value);
    }
  };

  KioskKeyboard.prototype._moveCursor = function (direction) {
    if (!this._target) return;
    var el = this._target;
    var pos = el.selectionStart != null ? el.selectionStart : 0;
    var newPos = Math.max(0, Math.min((el.value || '').length, pos + direction));
    el.selectionStart = el.selectionEnd = newPos;
  };

  KioskKeyboard.prototype._handleAction = function (action) {
    switch (action) {
      case 'escape':
        this.hide();
        break;
      case 'shift':
        this._state.shift = !this._state.shift;
        this._render();
        break;
      case 'capslock':
        this._state.capslock = !this._state.capslock;
        this._state.shift = false;
        this._render();
        break;
      case 'pl':
        this._state.pl = !this._state.pl;
        this._render();
        break;
      case 'symbols':
        this._state.layout = 'symbols';
        this._render();
        break;
      case 'letters':
        this._state.layout = 'letters';
        this._render();
        break;
      case 'space':
        this._insertChar(' ');
        break;
      case 'enter':
        this._insertChar('\n');
        break;
      case 'tab':
        this._insertChar('\t');
        break;
      case 'backspace':
        this._doBackspace();
        break;
      case 'cursorleft':
        this._moveCursor(-1);
        break;
      case 'cursorright':
        this._moveCursor(1);
        break;
      case 'noop':
        break;
      default:
        break;
    }
  };

  KioskKeyboard.prototype.setLayout = function (layout) {
    if (LAYOUTS[layout]) {
      this._state.layout = layout;
      this._render();
    }
    return this;
  };

  KioskKeyboard.prototype.getState = function () {
    return Object.assign({}, this._state);
  };

  KioskKeyboard.prototype.destroy = function () {
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = KioskKeyboard;
  } else {
    global.KioskKeyboard = KioskKeyboard;
  }

}(typeof window !== 'undefined' ? window : this));