import {loadSetting, saveSetting} from './storage.ts';

const WIDTH_KEY = 'mkserve:sidebar-width';
const COLLAPSED_KEY = 'mkserve:sidebar-collapsed';
const MIN_WIDTH = 160;
const MAX_WIDTH = 560;
const NARROW_QUERY = '(max-width: 767px)';

/**
 * Wires the sidebar toggle (drawer on narrow screens, collapse on wide ones)
 * and the drag handle that resizes it.
 */
export function initSidebar(): void {
  const body = document.body;
  const sidebar = document.getElementById('sidebar');
  const resizer = document.getElementById('resizer');
  const toggle = document.getElementById('sidebar-toggle');
  if (!sidebar || !resizer || !toggle) {
    return;
  }

  const width = loadSetting<number>(WIDTH_KEY);
  if (width !== undefined) {
    setWidth(width);
  }
  if (loadSetting<boolean>(COLLAPSED_KEY)) {
    body.dataset.sidebar = 'collapsed';
  }

  toggle.addEventListener('click', () => {
    if (window.matchMedia(NARROW_QUERY).matches) {
      body.dataset.sidebar = body.dataset.sidebar === 'open' ? '' : 'open';
    } else {
      const collapsed = body.dataset.sidebar !== 'collapsed';
      body.dataset.sidebar = collapsed ? 'collapsed' : '';
      saveSetting(COLLAPSED_KEY, collapsed);
    }
  });

  // Close the drawer after picking a file on narrow screens.
  sidebar.addEventListener('click', event => {
    if (
      body.dataset.sidebar === 'open' &&
      (event.target as Element).closest('a')
    ) {
      body.dataset.sidebar = '';
    }
  });

  resizer.addEventListener('pointerdown', event => {
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent) => {
      setWidth(move.clientX - sidebar.getBoundingClientRect().left);
    };
    const onUp = () => {
      resizer.removeEventListener('pointermove', onMove);
      resizer.removeEventListener('pointerup', onUp);
      saveSetting(WIDTH_KEY, sidebar.getBoundingClientRect().width);
    };
    resizer.addEventListener('pointermove', onMove);
    resizer.addEventListener('pointerup', onUp);
  });
}

function setWidth(px: number): void {
  const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, px));
  document.documentElement.style.setProperty('--sidebar-width', `${clamped}px`);
}
