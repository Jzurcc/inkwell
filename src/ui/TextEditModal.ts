import { CanvasElement } from '../types.ts';

export class TextEditModal {
  private static instance: TextEditModal | null = null;
  private overlay: HTMLElement | null = null;

  public static show(
    element: CanvasElement,
    onSave: (newText: string) => void
  ): void {
    if (!TextEditModal.instance) {
      TextEditModal.instance = new TextEditModal();
    }
    TextEditModal.instance.open(element, onSave);
  }

  private open(
    element: CanvasElement,
    onSave: (newText: string) => void
  ): void {
    this.close(); // Close any existing instance

    const isSticky = element.type === 'sticky_note';
    const title = isSticky ? 'Edit Sticky Note' : 'Edit Text Label';
    const currentText = element.text || '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop text-modal-backdrop';
    overlay.innerHTML = `
      <div class="modal-dialog text-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <div class="modal-title-group">
            <span class="modal-icon ${isSticky ? 'icon-amber' : 'icon-blue'}">
              ${
                isSticky
                  ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>`
                  : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>`
              }
            </span>
            <div>
              <h3 id="modal-title">${title}</h3>
              <p class="modal-subtitle">${isSticky ? 'Write brainstorm notes and ideas' : 'Customize typography label content'}</p>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-modal-close" aria-label="Close dialog" title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="modal-body">
          <textarea 
            id="modal-textarea" 
            class="modal-textarea" 
            placeholder="Type your text or note here..."
            rows="5"
            spellcheck="false"
          >${escapeHtml(currentText)}</textarea>
        </div>

        <div class="modal-footer">
          <div class="modal-hints">
            <span><kbd>Ctrl</kbd> + <kbd>↵</kbd> Save</span>
            <span><kbd>Esc</kbd> Cancel</span>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" id="btn-modal-cancel">Cancel</button>
            <button class="btn btn-primary-cta" id="btn-modal-save">Save Changes</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;

    // Trigger opening transition
    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    const textarea = overlay.querySelector('#modal-textarea') as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      textarea.select();
    }

    const saveAndClose = () => {
      if (textarea) {
        onSave(textarea.value);
      }
      this.close();
    };

    // Events
    overlay.querySelector('#btn-modal-save')?.addEventListener('click', saveAndClose);
    overlay.querySelector('#btn-modal-cancel')?.addEventListener('click', () => this.close());
    overlay.querySelector('#btn-modal-close')?.addEventListener('click', () => this.close());

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.close();
      }
    });

    textarea?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveAndClose();
      }
    });
  }

  public close(): void {
    if (this.overlay) {
      const el = this.overlay;
      el.classList.remove('visible');
      setTimeout(() => el.remove(), 200);
      this.overlay = null;
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
