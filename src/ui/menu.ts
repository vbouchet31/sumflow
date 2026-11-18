import { LINKS } from '../config/links';
import { LOCALES, type Locale, type MessageKey, t } from '../i18n';
import { AUTOSAVE_CHOICES, type AutosaveSeconds, type Settings } from '../save/settings';
import { el, releaseFocus, trapTab } from './dom';
import type { HelpTip } from './help';

export interface MenuActions {
  newGame: (seed: number | null) => void;
  save: () => void;
  exportGame: () => void;
  importGame: (file: File) => void;
  /** Current settings; `changeSettings` receives the full updated object. */
  settings: () => Settings;
  changeSettings: (next: Settings) => void;
  autoBuy: () => boolean;
  setAutoBuy: (on: boolean) => void;
  knownTips: () => HelpTip[];
  /** Show one tutorial card again (the menu closes first). */
  replayTip: (tip: HelpTip) => void;
  reshowHelp: () => void;
}

type View = 'main' | 'newGame' | 'options' | 'help' | 'about';

/** Rows of the read-only controls list (PLAN §9.4). */
const CONTROLS = [
  'pan',
  'panMouse',
  'zoom',
  'home',
  'build',
  'rotate',
  'priority',
  'demolish',
  'clear',
  'copy',
  'paste',
  'marker',
  'pick',
  'undo',
  'cancel',
  'pause',
  'panels',
  'perf',
] as const;

/** Rows of the touch controls list (PLAN-tactile §3.1). */
const TOUCH_CONTROLS = [
  'pan',
  'zoom',
  'build',
  'edge',
  'cancel',
  'actions',
  'paste',
  'inspect',
  'pick',
] as const;

/**
 * Game menu (PLAN §9.4, Escape): resume, new game, save, export, import, options, help,
 * about. A modal card whose content switches between views; Escape goes back, then closes.
 */
export class GameMenu {
  private readonly overlay: HTMLElement;
  private readonly card = el('section', 'menu-card');
  private readonly fileInput = el('input');
  private view: View = 'main';

  constructor(
    root: HTMLElement,
    private readonly actions: MenuActions,
  ) {
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json,application/json,text/plain';
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) {
        this.close();
        actions.importGame(file);
      }
    });
    this.overlay = el('div', 'overlay menu-overlay', this.card, this.fileInput);
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-label', t('menu.title'));
    this.overlay.hidden = true;
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    this.overlay.addEventListener('keydown', (e) => {
      trapTab(this.card, e);
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (this.view === 'main') this.close();
      else this.show('main');
    });
    root.append(this.overlay);
  }

  get isOpen(): boolean {
    return !this.overlay.hidden;
  }

  open(view: View = 'main'): void {
    this.overlay.hidden = false;
    this.show(view);
  }

  close(): void {
    releaseFocus(this.overlay);
    this.overlay.hidden = true;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private button(label: MessageKey, onClick: () => void, cls = 'menu-btn'): HTMLButtonElement {
    const b = el('button', cls, t(label));
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  private header(title: MessageKey, back: boolean): HTMLElement {
    const h = el('h2', undefined, t(title));
    if (!back) return el('header', 'menu-header', h);
    const b = this.button('menu.back', () => this.show('main'), 'secondary-btn');
    return el('header', 'menu-header', h, b);
  }

  private show(view: View): void {
    this.view = view;
    const content =
      view === 'main'
        ? this.mainView()
        : view === 'newGame'
          ? this.newGameView()
          : view === 'options'
            ? this.optionsView()
            : view === 'help'
              ? this.helpView()
              : this.aboutView();
    this.card.dataset['view'] = view;
    this.card.replaceChildren(...content);
    const focus = this.card.querySelector<HTMLElement>('input, select, button.menu-btn, button');
    focus?.focus();
  }

  private mainView(): HTMLElement[] {
    const a = this.actions;
    return [
      this.header('menu.title', false),
      el(
        'div',
        'menu-list',
        this.button('menu.resume', () => this.close()),
        this.button('menu.newGame', () => this.show('newGame')),
        this.button('menu.save', () => {
          this.close();
          a.save();
        }),
        this.button('menu.export', () => {
          this.close();
          a.exportGame();
        }),
        this.button('menu.import', () => this.fileInput.click()),
        this.button('menu.options', () => this.show('options')),
        this.button('menu.help', () => this.show('help')),
        this.button('menu.about', () => this.show('about')),
      ),
    ];
  }

  private newGameView(): HTMLElement[] {
    const input = el('input', 'marker-input');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.id = 'new-seed';
    input.maxLength = 10;
    const label = el('label', 'menu-label', t('new.seedLabel'));
    label.htmlFor = input.id;
    const form = el(
      'form',
      'menu-form',
      label,
      input,
      el('p', 'menu-note', t('new.warning')),
      this.button('new.start', () => undefined, 'primary-btn'),
    );
    const start = form.querySelector('button');
    if (start) start.type = 'submit';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      const n = Number(text);
      this.actions.newGame(text !== '' && Number.isInteger(n) ? n : null);
    });
    return [this.header('menu.newGame', true), form];
  }

  private optionsView(): HTMLElement[] {
    const a = this.actions;
    const s = a.settings();
    const change = (patch: Partial<Settings>): void =>
      a.changeSettings({ ...a.settings(), ...patch });
    const row = (label: MessageKey, control: HTMLElement, id: string): HTMLElement => {
      control.id = id;
      const l = el('label', undefined, t(label));
      l.htmlFor = id;
      return el('div', 'opt-row', l, control);
    };
    const select = <T extends string | number>(
      values: readonly T[],
      current: T,
      label: (v: T) => string,
      onChange: (v: T) => void,
    ): HTMLSelectElement => {
      const sel = el('select', 'opt-select');
      for (const v of values) {
        const o = el('option', undefined, label(v));
        o.value = String(v);
        o.selected = v === current;
        sel.append(o);
      }
      sel.addEventListener('change', () => {
        const v = values.find((x) => String(x) === sel.value);
        if (v !== undefined) onChange(v);
      });
      return sel;
    };
    const check = (on: boolean, onChange: (v: boolean) => void): HTMLInputElement => {
      const c = el('input');
      c.type = 'checkbox';
      c.checked = on;
      c.addEventListener('change', () => onChange(c.checked));
      return c;
    };
    // Full screen, where the browser offers it and the game is not already installed.
    const fullscreen = this.button('opt.fullscreen.on', () => undefined, 'secondary-btn');
    const syncFullscreen = (): void => {
      fullscreen.textContent = t(
        document.fullscreenElement ? 'opt.fullscreen.off' : 'opt.fullscreen.on',
      );
    };
    fullscreen.addEventListener('click', () => {
      const change = document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen();
      void change.then(syncFullscreen, syncFullscreen);
    });
    syncFullscreen();
    const canFullscreen =
      document.fullscreenEnabled &&
      !window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
    const volume = el('input', 'opt-range');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.step = '5';
    volume.value = String(s.volume);
    volume.addEventListener('input', () => change({ volume: Number(volume.value) }));

    const table = (rows: [MessageKey, MessageKey][]): HTMLElement => {
      const out = el('table', 'levels-table controls-table');
      for (const [action, how] of rows) {
        out.append(
          el('tr', undefined, el('td', undefined, t(action)), el('td', 'ctl-keys', t(how))),
        );
      }
      return out;
    };
    const keys = [
      el('h3', undefined, t('opt.keyControls')),
      table(CONTROLS.map((c) => [`ctl.${c}`, `ctlKey.${c}`])),
    ];
    const touch = [
      el('h3', undefined, t('opt.touchControls')),
      table(TOUCH_CONTROLS.map((c) => [`touch.${c}`, `touchKey.${c}`])),
    ];
    // The list that matches the main pointer of the device comes first.
    const touchFirst = window.matchMedia('(pointer: coarse)').matches;
    return [
      this.header('menu.options', true),
      el(
        'div',
        'opt-list',
        row(
          'opt.language',
          select<Locale>(
            LOCALES,
            s.locale,
            (v) => t(`lang.${v}`),
            (locale) => change({ locale }),
          ),
          'opt-lang',
        ),
        el('p', 'menu-note', t('opt.languageNote')),
        ...(canFullscreen ? [row('opt.fullscreen', fullscreen, 'opt-fullscreen')] : []),
        row('opt.volume', volume, 'opt-volume'),
        row(
          'opt.grid',
          check(s.showGrid, (showGrid) => change({ showGrid })),
          'opt-grid',
        ),
        row(
          'opt.itemValues',
          select(
            ['always', 'zoom'] as const,
            s.itemValues,
            (v) => t(`opt.itemValues.${v}`),
            (itemValues) => change({ itemValues }),
          ),
          'opt-values',
        ),
        row(
          'opt.autosave',
          select<AutosaveSeconds>(
            AUTOSAVE_CHOICES,
            s.autosave,
            (v) => t(`opt.autosave.${v}`),
            (autosave) => change({ autosave }),
          ),
          'opt-autosave',
        ),
        row(
          'upg.autoBuy',
          check(a.autoBuy(), (on) => a.setAutoBuy(on)),
          'opt-autobuy',
        ),
        row(
          'opt.reduceMotion',
          check(s.reduceMotion, (reduceMotion) => change({ reduceMotion })),
          'opt-motion',
        ),
      ),
      el('h2', 'menu-section', t('opt.controls')),
      ...(touchFirst ? [...touch, ...keys] : [...keys, ...touch]),
    ];
  }

  private helpView(): HTMLElement[] {
    const list = el('div', 'menu-list help-list');
    for (const tip of this.actions.knownTips()) {
      const icon = el('span', 'help-icon', tip.icon);
      icon.setAttribute('aria-hidden', 'true');
      const b = el('button', 'menu-btn help-tip', icon, el('span', undefined, t(tip.title)));
      b.type = 'button';
      b.dataset['tip'] = tip.id;
      b.addEventListener('click', () => {
        this.close();
        this.actions.replayTip(tip);
      });
      list.append(b);
    }
    return [
      this.header('menu.help', true),
      el('p', 'menu-note', t('help.intro')),
      list,
      this.button(
        'help.reshow',
        () => {
          this.actions.reshowHelp();
          this.close();
        },
        'secondary-btn help-reshow',
      ),
    ];
  }

  private aboutView(): HTMLElement[] {
    const link = (href: string, label: MessageKey): HTMLElement => {
      const a = el('a', undefined, t(label));
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      return el('li', undefined, a);
    };
    return [
      this.header('menu.about', true),
      el('p', undefined, t('about.body')),
      el(
        'ul',
        'about-links',
        link(LINKS.original, 'about.original'),
        link(LINKS.repo, 'about.repo'),
      ),
      el('p', 'menu-note', t('about.license')),
    ];
  }
}
