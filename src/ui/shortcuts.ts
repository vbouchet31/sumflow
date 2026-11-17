import type { ToolId } from '../build/tools';
import { type MessageKey, t } from '../i18n';
import { el } from './dom';

/** A key cap: a physical code (shown with the player's layout) or a fixed label. */
type Cap = { code: string } | { text: MessageKey | string };

interface Row {
  /** Alternatives, each a chord of caps ("Ctrl" + "Z"). */
  keys: Cap[][];
  label: MessageKey;
}

const code = (c: string): Cap => ({ code: c });
const txt = (s: MessageKey | string): Cap => ({ text: s });

const GROUPS: readonly { title: MessageKey; rows: Row[] }[] = [
  {
    title: 'sc.group.camera',
    rows: [
      {
        keys: [[code('KeyW'), code('KeyA'), code('KeyS'), code('KeyD')], [txt('↑ ← ↓ →')]],
        label: 'ctl.pan',
      },
      { keys: [[txt('sc.key.shift')]], label: 'sc.fast' },
      { keys: [[txt('sc.key.rightDrag')]], label: 'ctl.panMouse' },
      { keys: [[txt('sc.key.wheel')]], label: 'ctl.zoom' },
      { keys: [[code('KeyH')]], label: 'ctl.home' },
    ],
  },
  {
    title: 'sc.group.build',
    rows: [
      { keys: [[txt('1 … 9')]], label: 'ctl.build' },
      { keys: [[code('KeyR')], [txt('sc.key.shift'), code('KeyR')]], label: 'ctl.rotate' },
      { keys: [[code('KeyE')]], label: 'sc.pick' },
      { keys: [[code('KeyP')], [txt('Alt'), txt('sc.key.click')]], label: 'ctl.priority' },
      { keys: [[txt('Ctrl'), txt('sc.key.drag')]], label: 'sc.elbow' },
      { keys: [[txt('sc.key.esc')]], label: 'sc.cancel' },
    ],
  },
  {
    title: 'sc.group.edit',
    rows: [
      { keys: [[code('KeyX')]], label: 'ctl.demolish' },
      { keys: [[txt('sc.key.del')]], label: 'sc.quickDemolish' },
      { keys: [[code('KeyC')]], label: 'ctl.clear' },
      {
        keys: [
          [txt('Ctrl'), code('KeyC')],
          [txt('Ctrl'), code('KeyX')],
        ],
        label: 'sc.copyCut',
      },
      { keys: [[txt('Ctrl'), code('KeyV')]], label: 'sc.paste' },
      { keys: [[code('KeyF')]], label: 'sc.mirror' },
      { keys: [[txt('sc.key.shift'), txt('sc.key.wheel')]], label: 'sc.clipHistory' },
      {
        keys: [
          [txt('Ctrl'), code('KeyZ')],
          [txt('Ctrl'), code('KeyY')],
        ],
        label: 'ctl.undo',
      },
      { keys: [[code('KeyB')]], label: 'sc.marker' },
    ],
  },
  {
    title: 'sc.group.game',
    rows: [
      { keys: [[txt('sc.key.space')]], label: 'sc.pause' },
      { keys: [[code('KeyU')]], label: 'sc.upgrades' },
      { keys: [[code('KeyL')]], label: 'sc.levels' },
      { keys: [[code('KeyN')]], label: 'sc.delivered' },
      { keys: [[txt('F3')]], label: 'sc.perf' },
      { keys: [[txt('sc.key.esc')]], label: 'sc.menu' },
      { keys: [[txt('?')], [txt('F1')]], label: 'sc.help' },
    ],
  },
];

/** Shortcuts that matter with each tool, shown first while it is active. */
const FOR_TOOL: Partial<Record<ToolId, MessageKey[]>> = {
  belt: ['ctl.rotate', 'sc.elbow', 'ctl.priority', 'sc.pick', 'sc.cancel'],
  paste: ['ctl.rotate', 'sc.mirror', 'sc.clipHistory', 'sc.cancel'],
  demolish: ['sc.quickDemolish', 'sc.cancel'],
};

/** Physical key → label in the player's keyboard layout (AZERTY shows Z Q S D). */
type LayoutMap = { get(code: string): string | undefined };

/**
 * Keyboard shortcuts sheet (`?` or `F1`): every shortcut by theme, keys drawn as caps in the
 * player's own layout when the browser can tell it, and the ones useful with the active tool
 * highlighted. Not modal: a press anywhere, `?` or `Escape` closes it.
 */
export class ShortcutSheet {
  private readonly box = el('div', 'shortcuts');
  private readonly card = el('section', 'shortcuts-card');
  private layout: LayoutMap | null = null;

  constructor(
    root: HTMLElement,
    private readonly activeTool: () => ToolId,
  ) {
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-label', t('sc.title'));
    this.box.append(this.card);
    this.box.hidden = true;
    this.box.addEventListener('pointerdown', () => this.close());
    root.append(this.box);
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<LayoutMap> } })
      .keyboard;
    void kb
      ?.getLayoutMap?.()
      .then((m) => (this.layout = m))
      .catch(() => undefined);
  }

  get isOpen(): boolean {
    return !this.box.hidden;
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  close(): void {
    this.box.hidden = true;
  }

  open(): void {
    this.render();
    this.box.hidden = false;
  }

  private capLabel(c: Cap): string {
    if ('code' in c) {
      const fromLayout = this.layout?.get(c.code);
      return (fromLayout ?? c.code.replace(/^Key/, '')).toUpperCase();
    }
    return c.text.startsWith('sc.') ? t(c.text as MessageKey) : c.text;
  }

  private keys(alts: Cap[][]): HTMLElement {
    const box = el('span', 'sc-keys');
    alts.forEach((chord, i) => {
      if (i > 0) box.append(el('span', 'sc-or', t('sc.or')));
      chord.forEach((c, j) => {
        if (j > 0 && !('code' in c && 'code' in (chord[j - 1] as Cap))) box.append('+');
        box.append(el('kbd', 'sc-cap', this.capLabel(c)));
      });
    });
    return box;
  }

  private render(): void {
    const tool = this.activeTool();
    const useful = new Set(FOR_TOOL[tool] ?? []);
    const header = el('header', 'sc-header', el('h2', '', t('sc.title')));
    const close = el('button', 'secondary-btn', t('sc.close'));
    close.type = 'button';
    close.addEventListener('click', () => this.close());
    header.append(close);
    const cols = el('div', 'sc-cols');
    for (const g of GROUPS) {
      const list = el('dl', 'sc-list');
      for (const r of g.rows) {
        const row = el('div', 'sc-row', el('dt', '', this.keys(r.keys)), el('dd', '', t(r.label)));
        if (useful.has(r.label)) row.classList.add('is-useful');
        list.append(row);
      }
      cols.append(el('section', 'sc-group', el('h3', '', t(g.title)), list));
    }
    const note =
      useful.size > 0
        ? el('p', 'sc-note', t('sc.toolNote', { tool: t(`tool.${tool}` as MessageKey) }))
        : el('p', 'sc-note', t('sc.note'));
    this.card.replaceChildren(header, note, cols);
  }
}
