export function scrollToElement(element: HTMLElement) {
  element.tabIndex = -1;
  element.focus({ preventScroll: true });
  element.scrollIntoView({ behavior: 'instant', block: 'start' });
}
