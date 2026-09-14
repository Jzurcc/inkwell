import { StateEngine } from '../engine/StateEngine.ts';

export class ShareModal {
  private static instance: ShareModal | null = null;
  private overlay: HTMLElement | null = null;
  private engine: StateEngine;

  constructor(engine: StateEngine) {
    this.engine = engine;
  }

  public static show(engine: StateEngine): void {
    if (!ShareModal.instance) {
      ShareModal.instance = new ShareModal(engine);
    }
    ShareModal.instance.open();
  }

  public open(): void {
    this.close();

    const currentUrl = window.location.href;
    const currentRoom = this.engine.roomId;
    const peers = Array.from(this.engine.presences.values()).filter(
      (p) => p.clientId !== this.engine.clientId
    );

    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.innerHTML = `
      <div class="modal-dialog share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div class="modal-header">
          <div class="modal-title-group">
            <div class="modal-icon icon-indigo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </div>
            <div>
              <h3 id="share-title">Share Inkwell Canvas</h3>
              <p class="share-subtitle">Collaborate in real time with anyone on your team</p>
            </div>
          </div>
          <button class="modal-close-btn" id="btn-share-close" aria-label="Close share dialog">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="modal-body share-modal-body">
          <!-- Link Copy Field -->
          <div class="share-field-group">
            <label class="share-field-label">Collaboration Link</label>
            <div class="share-input-row">
              <input type="text" id="share-link-input" class="share-link-input" readonly value="${currentUrl}" />
              <button id="btn-copy-share-link" class="btn btn-primary-cta btn-copy-link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                <span>Copy Link</span>
              </button>
            </div>
          </div>

          <!-- Room Selector & Permissions -->
          <div class="share-meta-box">
            <div class="share-meta-row">
              <div class="share-meta-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </div>
              <div class="share-meta-text">
                <strong>General Access</strong>
                <p>Anyone with this link can view & edit live</p>
              </div>
              <span class="access-pill">Full Edit</span>
            </div>

            <div class="share-meta-row">
              <div class="share-meta-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              </div>
              <div class="share-meta-text">
                <strong>Current Room</strong>
                <p>#${currentRoom} (${peers.length + 1} active member${peers.length === 0 ? '' : 's'})</p>
              </div>
            </div>
          </div>

          <!-- Active Participants Preview -->
          <div class="share-collaborators-list">
            <span class="share-section-title">Active in this session</span>
            <div class="collaborator-row">
              <div class="collaborator-avatar" style="background-color: ${this.engine.clientColor};">
                ${this.engine.clientName.substring(0, 2).toUpperCase()}
              </div>
              <div class="collaborator-info">
                <span class="collaborator-name">${this.engine.clientName} (You)</span>
                <span class="collaborator-role">Host & Editor</span>
              </div>
            </div>
            ${peers
              .map(
                (p) => `
              <div class="collaborator-row">
                <div class="collaborator-avatar" style="background-color: ${p.clientColor};">
                  ${p.clientName.substring(0, 2).toUpperCase()}
                </div>
                <div class="collaborator-info">
                  <span class="collaborator-name">${p.clientName}</span>
                  <span class="collaborator-role">Active Collaborator</span>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>

        <div class="modal-footer">
          <span class="share-footer-hint">✨ Tip: Share this URL with your teammates to draw simultaneously.</span>
          <button class="btn btn-secondary" id="btn-share-done">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;

    requestAnimationFrame(() => overlay.classList.add('visible'));

    const input = overlay.querySelector('#share-link-input') as HTMLInputElement;
    const copyBtn = overlay.querySelector('#btn-copy-share-link') as HTMLButtonElement;

    copyBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(input.value);
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Copied!</span>
        `;
        copyBtn.style.backgroundColor = '#10B981';
        setTimeout(() => {
          copyBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Copy Link</span>
          `;
          copyBtn.style.backgroundColor = '';
        }, 2000);
      } catch (err) {
        console.warn('Clipboard write failed:', err);
      }
    });

    overlay.querySelector('#btn-share-close')?.addEventListener('click', () => this.close());
    overlay.querySelector('#btn-share-done')?.addEventListener('click', () => this.close());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
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
