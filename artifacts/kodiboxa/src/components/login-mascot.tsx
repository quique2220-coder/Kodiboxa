import { useEffect, useRef, useState, type ReactNode } from 'react';
import privateImage from '@/assets/kode-studio-private.webp';
import KodeGills from './kode-gills';
import './login-mascot.css';

function isPasswordField(element: Element | null): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) return false;
  return element.type === 'password' ||
    /password/i.test(`${element.name} ${element.id} ${element.autocomplete} ${element.className}`);
}

/**
 * Decorative companion for Clerk's own form. Observe focus and visibility
 * metadata only: never read, store, log, or transmit any input value.
 */
export function LoginMascot({ children }: { children: ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const [lookingAway, setLookingAway] = useState(false);
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    let active = true;
    const update = () => {
      if (!active) return;
      const focusedPassword = isPasswordField(document.activeElement);
      // Keep looking away if "Show password" is selected, even after blur.
      const revealedPassword = [...document.querySelectorAll('input')].some(
        input => isPasswordField(input) && input.type === 'text',
      );
      setLookingAway(focusedPassword || revealedPassword);
    };
    // The auth SDK can replace steps or autofocus fields after it has loaded.
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['type'] });
    const updateAfterEvent = () => queueMicrotask(update);
    // Capture also covers auth steps rendered through a portal and mobile focus.
    document.addEventListener('focusin', update, true);
    document.addEventListener('focusout', updateAfterEvent, true);
    document.addEventListener('click', updateAfterEvent, true);
    update();
    return () => {
      active = false;
      observer.disconnect();
      document.removeEventListener('focusin', update, true);
      document.removeEventListener('focusout', updateAfterEvent, true);
      document.removeEventListener('click', updateAfterEvent, true);
    };
  }, []);

  return (
    <div ref={container} className="login-mascot-layout" data-testid="login-mascot-container">
      <figure className="login-mascot-figure">
        <div className="login-mascot-portrait" data-private={lookingAway}>
          <div
            role="img"
            aria-label={lookingAway ? 'KODELOTH covers its eyes to protect your privacy' : 'KODELOTH, your animated axolotl companion, welcomes you'}
            className="login-mascot-image"
            data-testid="login-mascot"
            data-state={lookingAway ? 'private' : 'ready'}
          >
            {lookingAway ? (
              <img src={privateImage} alt="" width={640} height={640} loading="eager" draggable={false} className="login-mascot-private" />
            ) : (
              <KodeGills className="login-mascot-gills" />
            )}
          </div>
        </div>
        <figcaption className="login-mascot-caption" aria-live="polite" role="status">
          <span className="login-caption-dot" aria-hidden="true" />
          {lookingAway ? "Your password is private. I’ll look away." : 'Hi, I’m KODELOTH. I’m here to help.'}
        </figcaption>
        <span className="login-mascot-reduced">Reduced motion is enabled on your device.</span>
      </figure>
      <div className="login-mascot-form">
        <div className="kodiboxa-login-form">{children}</div>
      </div>
    </div>
  );
}
