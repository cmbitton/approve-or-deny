export type SwipeDirection = 'left' | 'right';

interface SwipeOptions {
  card: HTMLElement;
  denyHint: HTMLElement;
  approveHint: HTMLElement;
  enabled: () => boolean;
  onSwipe: (dir: SwipeDirection) => void;
}

/** Drag the card left (deny) or right (approve). Snaps back if the drag is too small. */
export function attachSwipe({ card, denyHint, approveHint, enabled, onSwipe }: SwipeOptions) {
  let startX = 0;
  let startY = 0;
  let lastX = 0;
  let lastT = 0;
  let velocity = 0;
  let pointer: number | null = null;
  let dragged = false;

  const setDrag = (dx: number) => {
    card.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 22}deg)` : '';
    const strength = Math.min(1, Math.abs(dx) / threshold());
    denyHint.style.opacity = dx < 0 ? String(strength) : '0';
    approveHint.style.opacity = dx > 0 ? String(strength) : '0';
  };
  const threshold = () => Math.min(110, card.offsetWidth * 0.28);

  const release = (dx: number) => {
    pointer = null;
    card.classList.add('snap');
    setDrag(0);
    const fast = Math.abs(velocity) > 0.6 && Math.abs(dx) > 30;
    if (Math.abs(dx) >= threshold() || fast) onSwipe(dx > 0 ? 'right' : 'left');
  };

  card.addEventListener('pointerdown', (e) => {
    if (!enabled() || pointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pointer = e.pointerId;
    startX = lastX = e.clientX;
    startY = e.clientY;
    lastT = e.timeStamp;
    velocity = 0;
    dragged = false;
    card.classList.remove('snap');
    card.setPointerCapture(e.pointerId);
  });

  card.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pointer) return;
    const dt = Math.max(1, e.timeStamp - lastT);
    velocity = 0.8 * ((e.clientX - lastX) / dt) + 0.2 * velocity;
    lastX = e.clientX;
    lastT = e.timeStamp;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 8) dragged = true;
    // Mostly-vertical drags aren't swipes.
    if (Math.abs(e.clientY - startY) > Math.abs(dx) * 1.5 && Math.abs(dx) < 20) return;
    setDrag(dx);
  });

  // The click that follows a drag must not count as a tap on the reveal.
  card.addEventListener(
    'click',
    (e) => {
      if (!dragged) return;
      dragged = false;
      e.stopPropagation();
      e.preventDefault();
    },
    true,
  );

  card.addEventListener('pointerup', (e) => {
    if (e.pointerId === pointer) release(e.clientX - startX);
  });
  card.addEventListener('pointercancel', (e) => {
    if (e.pointerId === pointer) {
      velocity = 0;
      release(0);
    }
  });
}
