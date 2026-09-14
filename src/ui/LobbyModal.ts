import { StateEngine } from '../engine/StateEngine.ts';
import { CanvasEngine } from '../canvas/CanvasEngine.ts';

type LobbyView = 'main' | 'create' | 'join';

export class LobbyModal {
  private static instance: LobbyModal | null = null;
  private overlay: HTMLElement | null = null;
  private engine: StateEngine;
  private canvasEngine?: CanvasEngine;
  private onEnterCallback?: (roomId: string, name: string, color: string) => void;

  private currentView: LobbyView = 'main';
  private selectedColor: string;
  private currentName: string;
  private createRoomSlug: string;

  private static readonly ARTIST_NAMES = [
    'Sunny Otter',
    'Velvet Fox',
    'Golden Finch',
    'Creative Robin',
    'Artful Finch',
    'Ink Maestro',
    'Playful Panda',
    'Gentle Badger',
    'Bright Sparrow',
    'Doodle Beaver',
    'Kind Dolphin',
    'Cosmic Owl',
    'Swift Falcon',
    'Amber Lynx'
  ];

  private static readonly ROOM_PREFIXES = [
    // Art & Creation
    'studio', 'atelier', 'canvas', 'sketch', 'doodle', 'ink', 'pixel', 'palette', 'gallery', 'craft',
    // Nature
    'neon', 'aurora', 'nebula', 'solar', 'lunar', 'crest', 'ember', 'frost', 'storm', 'river',
    // Tone
    'velvet', 'cobalt', 'crimson', 'amber', 'vivid', 'pastel', 'prism', 'chrome', 'onyx', 'ivory',
    // Energy
    'zenith', 'apex', 'nova', 'vortex', 'flux', 'pulse', 'echo', 'surge', 'cipher', 'rogue'
  ];

  private static readonly ROOM_SUFFIXES = [
    // Space & Place
    'haven', 'lounge', 'nest', 'cove', 'den', 'loft', 'vault', 'grove', 'isle', 'bay',
    // Motion
    'drift', 'flow', 'spark', 'burst', 'wave', 'leap', 'glide', 'rush', 'trail', 'shift',
    // Vibe
    'echo', 'vivid', 'party', 'open', 'bliss', 'hype', 'glow', 'zen', 'peak', 'calm',
    // Texture
    'haze', 'mist', 'flare', 'shade', 'bloom', 'dust', 'void', 'ink', 'arc', 'prism'
  ];

  private static readonly PALETTE = [
    { value: '#EA580C', label: 'Pencil Rust' },
    { value: '#4F46E5', label: 'Indigo Royal' },
    { value: '#10B981', label: 'Emerald Mint' },
    { value: '#F43F5E', label: 'Rose Vibrant' },
    { value: '#F59E0B', label: 'Amber Warm' },
    { value: '#0284C7', label: 'Sky Blue' },
    { value: '#8B5CF6', label: 'Purple Velvet' },
    { value: '#06B6D4', label: 'Cyan Tide' },
    { value: '#D946EF', label: 'Fuchsia Bloom' },
    { value: '#16A34A', label: 'Forest Deep' },
    { value: '#DC2626', label: 'Crimson Bold' },
    { value: '#7C3AED', label: 'Violet Storm' },
    { value: '#DB2777', label: 'Flamingo' },
    { value: '#0891B2', label: 'Teal Drift' },
    { value: '#CA8A04', label: 'Golden Hour' },
    { value: '#64748B', label: 'Slate Cool' },
    { value: '#15803D', label: 'Jade Peak' },
    { value: '#C2410C', label: 'Terracotta' },
    { value: '#1D4ED8', label: 'Cobalt Deep' },
    { value: '#9D174D', label: 'Bordeaux' }
  ];

  constructor(
    engine: StateEngine,
    canvasEngine?: CanvasEngine,
    onEnter?: (roomId: string, name: string, color: string) => void
  ) {
    this.engine = engine;
    this.canvasEngine = canvasEngine;
    this.onEnterCallback = onEnter;

    this.currentName = this.engine.clientName || LobbyModal.getRandomItem(LobbyModal.ARTIST_NAMES);
    this.selectedColor = this.engine.clientColor || LobbyModal.PALETTE[0].value;
    this.createRoomSlug = this.generateRoomSlug();

    // If visiting with an invite link (hash in URL), default to Join View
    const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '').trim() : '';
    if (hash) {
      this.currentView = 'join';
    }

    // Listen for server authentication rejections
    this.engine.onAuthError((evt) => {
      if (!this.overlay) {
        this.open();
      }
      this.setView('join');
      const joinInput = this.overlay?.querySelector('#lobby-join-input') as HTMLInputElement;
      if (joinInput) joinInput.value = evt.roomId;
      const errorEl = this.overlay?.querySelector('#lobby-join-error') as HTMLElement;
      if (errorEl) {
        errorEl.textContent = evt.message || 'This room is password protected. Please enter the password.';
        errorEl.style.display = 'block';
      }
      const pwdInput = this.overlay?.querySelector('#lobby-join-password') as HTMLInputElement;
      if (pwdInput) {
        pwdInput.classList.add('error');
        pwdInput.focus();
      }
    });
  }

  public static show(
    engine: StateEngine,
    canvasEngine?: CanvasEngine,
    onEnter?: (roomId: string, name: string, color: string) => void
  ): LobbyModal {
    if (LobbyModal.instance) {
      LobbyModal.instance.close();
    }
    const modal = new LobbyModal(engine, canvasEngine, onEnter);
    LobbyModal.instance = modal;
    modal.open();
    return modal;
  }

  private static getRandomItem<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private generateRoomSlug(): string {
    const p = LobbyModal.getRandomItem(LobbyModal.ROOM_PREFIXES);
    const s = LobbyModal.getRandomItem(LobbyModal.ROOM_SUFFIXES);
    const num = Math.floor(10 + Math.random() * 90);
    return `${p}-${s}-${num}`;
  }

  public open(): void {
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'lobby-modal-backdrop';
    overlay.id = 'inkwell-lobby-modal';

    overlay.innerHTML = `
      <div class="lobby-ambient-glow" aria-hidden="true"></div>

      <!-- Double-Bezel Landscape Card Architecture -->
      <div class="lobby-landscape-shell" role="dialog" aria-modal="true" aria-labelledby="lobby-title">
        <div class="lobby-landscape-core">

          <!-- Left Column: Progressive Onboarding & Room Actions -->
          <div class="lobby-left-panel">
            <!-- Header & Branding -->
            <div class="lobby-brand-strip">
              <div class="lobby-brand-badge">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 19l7-7 3 3-7 7-3-3z"/>
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                  <path d="M2 2l7.586 7.586"/>
                  <circle cx="11" cy="11" r="2"/>
                </svg>
              </div>
              <span class="lobby-brand-name">Inkwell</span>
            </div>

            <div class="lobby-intro-block">
              <h1 class="lobby-title" id="lobby-title">Welcome to Inkwell</h1>
              <p class="lobby-subtitle">Collaborative real-time drawing & vector studio</p>
            </div>

            <!-- Two Distinct Profile Boxes: Artist Name & Avatar Color -->
            <div class="lobby-profile-container">
              <!-- Box 1: Artist Name -->
              <div class="lobby-profile-card">
                <label class="lobby-box-title" for="lobby-player-name">Your Artist Name</label>
                <div class="lobby-input-wrap">
                  <input 
                    type="text" 
                    id="lobby-player-name" 
                    class="lobby-text-input" 
                    value="${this.currentName}" 
                    maxlength="28" 
                    placeholder="Enter artist moniker" 
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button 
                    type="button" 
                    id="lobby-btn-dice" 
                    class="lobby-icon-btn" 
                    title="Randomize artist name"
                    aria-label="Randomize artist name"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="16 3 21 3 21 8"/>
                      <line x1="4" y1="20" x2="21" y2="3"/>
                      <polyline points="21 16 21 21 16 21"/>
                      <line x1="15" y1="15" x2="21" y2="21"/>
                      <line x1="4" y1="4" x2="9" y2="9"/>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Box 2: Avatar Color -->
              <div class="lobby-profile-card">
                <label class="lobby-box-title">Avatar Color</label>
                <div class="lobby-color-swatches" role="radiogroup" aria-label="Select avatar color">
                  ${LobbyModal.PALETTE.map(
                    (c) => `
                    <button 
                      type="button" 
                      class="lobby-swatch-btn ${this.selectedColor === c.value ? 'active' : ''}" 
                      data-color="${c.value}" 
                      style="background-color: ${c.value};"
                      title="${c.label}"
                      aria-label="${c.label}"
                      aria-checked="${this.selectedColor === c.value}"
                      role="radio"
                    >
                      <span class="lobby-swatch-check">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </span>
                    </button>
                  `
                  ).join('')}
                </div>
              </div>
            </div>

            <!-- Dynamic View Container (Progressive Disclosure) -->
            <div class="lobby-dynamic-views">

              <!-- VIEW 1: Main View with Two Big Action Buttons -->
              <div class="lobby-step-view ${this.currentView === 'main' ? 'active' : ''}" id="view-main">
                <div class="lobby-big-buttons-grid">
                  <!-- Big Button 1: Create Room -->
                  <button type="button" class="lobby-big-action-card primary" id="btn-goto-create">
                    <div class="action-card-left">
                      <div class="action-card-icon-wrap plus-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </div>
                      <div class="action-card-text">
                        <span class="action-card-title">Create Room</span>
                        <span class="action-card-desc">Start a fresh canvas & invite collaborators</span>
                      </div>
                    </div>
                    <div class="action-card-arrow">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                        <polyline points="12 5 19 12 12 19"/>
                      </svg>
                    </div>
                  </button>

                  <!-- Big Button 2: Join Room -->
                  <button type="button" class="lobby-big-action-card secondary" id="btn-goto-join">
                    <div class="action-card-left">
                      <div class="action-card-icon-wrap join-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                          <polyline points="10 17 15 12 10 7"/>
                          <line x1="15" y1="12" x2="3" y2="12"/>
                        </svg>
                      </div>
                      <div class="action-card-text">
                        <span class="action-card-title">Join Room</span>
                        <span class="action-card-desc">Enter with a code, link, or shared room ID</span>
                      </div>
                    </div>
                    <div class="action-card-arrow">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12"/>
                        <polyline points="12 5 19 12 12 19"/>
                      </svg>
                    </div>
                  </button>
                </div>

                <div class="lobby-solo-row">
                  <button type="button" id="lobby-btn-solo" class="lobby-solo-link">
                    <span>Draw Solo (Offline Mode)</span>
                  </button>
                </div>
              </div>

              <!-- VIEW 2: Create Room Form (Revealed when Create clicked) -->
              <div class="lobby-step-view ${this.currentView === 'create' ? 'active' : ''}" id="view-create">
                <div class="lobby-view-header">
                  <button type="button" class="lobby-back-btn" id="btn-back-from-create" title="Back to main selection" aria-label="Back">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="19" y1="12" x2="5" y2="12"/>
                      <polyline points="12 19 5 12 12 5"/>
                    </svg>
                  </button>
                  <span class="lobby-view-title">Create a New Room</span>
                </div>

                <div class="lobby-field-row" style="margin-top: 10px;">
                  <div class="lobby-label-group">
                    <label class="lobby-label" for="lobby-create-input">Room Code or Name</label>
                    <span class="lobby-hint">Shareable room slug</span>
                  </div>
                  <div class="lobby-input-wrap">
                    <span class="lobby-input-prefix">#</span>
                    <input 
                      type="text" 
                      id="lobby-create-input" 
                      class="lobby-text-input with-prefix" 
                      value="${this.createRoomSlug}" 
                      maxlength="40" 
                      placeholder="e.g. cozy-doodles" 
                      spellcheck="false"
                    />
                    <button 
                      type="button" 
                      id="lobby-btn-shuffle-room" 
                      class="lobby-icon-btn" 
                      title="Generate another room name"
                      aria-label="Shuffle room name"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Optional Password on Create -->
                <div class="lobby-field-row" style="margin-top: 8px;">
                  <div class="lobby-label-group">
                    <label class="lobby-label" for="lobby-create-password">Room Password (Optional)</label>
                    <span class="lobby-hint">Leave blank for public room</span>
                  </div>
                  <div class="lobby-input-wrap">
                    <input 
                      type="password" 
                      id="lobby-create-password" 
                      class="lobby-text-input" 
                      placeholder="Optional room password" 
                      autocomplete="new-password"
                    />
                  </div>
                </div>

                <button type="button" id="lobby-btn-submit-create" class="lobby-launch-cta">
                  <span>Create & Enter Room</span>
                  <span class="cta-trailing-circle">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </span>
                </button>
              </div>

              <!-- VIEW 3: Join Room Form (Revealed when Join clicked) -->
              <div class="lobby-step-view ${this.currentView === 'join' ? 'active' : ''}" id="view-join">
                <div class="lobby-view-header">
                  <button type="button" class="lobby-back-btn" id="btn-back-from-join" title="Back to main selection" aria-label="Back">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="19" y1="12" x2="5" y2="12"/>
                      <polyline points="12 19 5 12 12 5"/>
                    </svg>
                  </button>
                  <span class="lobby-view-title">Join Existing Room</span>
                </div>

                <div class="lobby-field-row" style="margin-top: 10px;">
                  <div class="lobby-label-group">
                    <label class="lobby-label" for="lobby-join-input">Enter Room Code or Link</label>
                    <span class="lobby-hint">Paste full link or room code</span>
                  </div>
                  <div class="lobby-input-wrap">
                    <span class="lobby-input-prefix">#</span>
                    <input 
                      type="text" 
                      id="lobby-join-input" 
                      class="lobby-text-input with-prefix" 
                      value="${window.location.hash.replace(/^#/, '').trim() || ''}" 
                      placeholder="e.g. studio-haven-42" 
                      spellcheck="false"
                    />
                  </div>
                </div>

                <!-- Password Input for Joiners -->
                <div class="lobby-field-row" style="margin-top: 8px;">
                  <div class="lobby-label-group">
                    <label class="lobby-label" for="lobby-join-password">Password (if set by host)</label>
                    <span class="lobby-hint">Required for protected rooms</span>
                  </div>
                  <div class="lobby-input-wrap">
                    <input 
                      type="password" 
                      id="lobby-join-password" 
                      class="lobby-text-input" 
                      placeholder="Enter room password" 
                      autocomplete="current-password"
                    />
                  </div>
                  <span class="lobby-error-text" id="lobby-join-error" style="display: none;"></span>
                </div>

                <!-- Quick Suggested Lobbies -->
                <div class="lobby-quick-rooms">
                  <span class="lobby-quick-label">Suggested Lobbies:</span>
                  <div class="lobby-quick-pills">
                    <button type="button" class="lobby-quick-pill" data-room="sketch-lounge">#sketch-lounge</button>
                    <button type="button" class="lobby-quick-pill" data-room="atelier-open">#atelier-open</button>
                    <button type="button" class="lobby-quick-pill" data-room="ink-party">#ink-party</button>
                  </div>
                </div>

                <button type="button" id="lobby-btn-submit-join" class="lobby-launch-cta">
                  <span>Join Room</span>
                  <span class="cta-trailing-circle">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/>
                      <polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </span>
                </button>
              </div>

            </div>
          </div>

          <!-- Right Column: Clean Static Artwork Showcase Panel (No hover, no placeholder artifacts, no footer tags) -->
          <div class="lobby-right-panel">
            <div class="lobby-landscape-showcase" id="lobby-vector-clipart">
              <img src="/images/lobby-art.jpg" alt="Inkwell collaborative art">
            </div>
          </div>

        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.overlay = overlay;

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    this.attachEvents();
  }

  private setView(view: LobbyView): void {
    this.currentView = view;
    if (!this.overlay) return;

    const views = this.overlay.querySelectorAll('.lobby-step-view');
    views.forEach((v) => v.classList.remove('active'));

    const target = this.overlay.querySelector(`#view-${view}`);
    target?.classList.add('active');

    if (view === 'create') {
      const input = this.overlay.querySelector('#lobby-create-input') as HTMLInputElement;
      input?.focus();
      input?.select();
    } else if (view === 'join') {
      const input = this.overlay.querySelector('#lobby-join-input') as HTMLInputElement;
      input?.focus();
      input?.select();
    }
  }

  private attachEvents(): void {
    if (!this.overlay) return;

    // 1. Name Dice Randomizer
    const diceBtn = this.overlay.querySelector('#lobby-btn-dice');
    diceBtn?.addEventListener('click', () => {
      const nameInput = this.overlay?.querySelector('#lobby-player-name') as HTMLInputElement;
      if (nameInput) {
        this.currentName = LobbyModal.getRandomItem(LobbyModal.ARTIST_NAMES);
        nameInput.value = this.currentName;
      }
      diceBtn.classList.add('rotating');
      setTimeout(() => diceBtn.classList.remove('rotating'), 350);
    });

    // 2. Color Swatches
    const swatches = this.overlay.querySelectorAll('.lobby-swatch-btn');
    swatches.forEach((swatch) => {
      swatch.addEventListener('click', (e) => {
        const btn = e.currentTarget as HTMLElement;
        const color = btn.dataset.color;
        if (!color) return;
        this.selectedColor = color;
        swatches.forEach((s) => {
          s.classList.remove('active');
          s.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-checked', 'true');
      });
    });

    // 3. Navigation: From Main View to Create or Join View
    this.overlay.querySelector('#btn-goto-create')?.addEventListener('click', () => {
      this.setView('create');
    });

    this.overlay.querySelector('#btn-goto-join')?.addEventListener('click', () => {
      this.setView('join');
    });

    // 4. Back Buttons
    this.overlay.querySelector('#btn-back-from-create')?.addEventListener('click', () => {
      this.setView('main');
    });

    this.overlay.querySelector('#btn-back-from-join')?.addEventListener('click', () => {
      this.setView('main');
    });

    // 5. Room Slug Shuffle
    this.overlay.querySelector('#lobby-btn-shuffle-room')?.addEventListener('click', () => {
      const createInput = this.overlay?.querySelector('#lobby-create-input') as HTMLInputElement;
      if (createInput) {
        this.createRoomSlug = this.generateRoomSlug();
        createInput.value = this.createRoomSlug;
      }
    });

    // 6. Quick Lobby Pills in Join View
    this.overlay.querySelectorAll('.lobby-quick-pill').forEach((pill) => {
      pill.addEventListener('click', (e) => {
        const target = (e.currentTarget as HTMLElement).dataset.room;
        const joinInput = this.overlay?.querySelector('#lobby-join-input') as HTMLInputElement;
        if (target && joinInput) {
          joinInput.value = target;
          this.submitJoin();
        }
      });
    });

    // 7. Submit Actions
    this.overlay.querySelector('#lobby-btn-submit-create')?.addEventListener('click', () => {
      this.submitCreate();
    });

    this.overlay.querySelector('#lobby-btn-submit-join')?.addEventListener('click', () => {
      this.submitJoin();
    });

    this.overlay.querySelector('#lobby-btn-solo')?.addEventListener('click', () => {
      this.submitSolo();
    });

    // Clear join error on input
    const clearError = () => {
      const errorEl = this.overlay?.querySelector('#lobby-join-error') as HTMLElement;
      if (errorEl) errorEl.style.display = 'none';
      const pwdInput = this.overlay?.querySelector('#lobby-join-password') as HTMLElement;
      pwdInput?.classList.remove('error');
    };
    this.overlay.querySelector('#lobby-join-input')?.addEventListener('input', clearError);
    this.overlay.querySelector('#lobby-join-password')?.addEventListener('input', clearError);

    // 8. Keyboard Navigation
    this.overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.currentView !== 'main') {
          e.preventDefault();
          this.setView('main');
        }
      } else if (e.key === 'Enter') {
        const target = e.target as HTMLElement;
        if (this.currentView === 'create' || target.id === 'lobby-create-input' || target.id === 'lobby-create-password') {
          this.submitCreate();
        } else if (this.currentView === 'join' || target.id === 'lobby-join-input' || target.id === 'lobby-join-password') {
          this.submitJoin();
        }
      }
    });
  }

  private static getRoomPasswordKey(roomId: string): string {
    return `inkwell_pwd_${roomId.toLowerCase()}`;
  }

  private cleanRoomSlug(raw: string): string {
    let slug = raw.trim();
    if (slug.includes('#')) {
      slug = slug.split('#')[1] || '';
    } else if (slug.includes('/')) {
      slug = slug.split('/').pop() || '';
    }
    slug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return slug || this.generateRoomSlug();
  }

  private submitCreate(): void {
    const nameInput = this.overlay?.querySelector('#lobby-player-name') as HTMLInputElement;
    const roomInput = this.overlay?.querySelector('#lobby-create-input') as HTMLInputElement;
    const pwdInput = this.overlay?.querySelector('#lobby-create-password') as HTMLInputElement;

    const name = nameInput?.value.trim() || this.currentName;
    const room = this.cleanRoomSlug(roomInput?.value || this.createRoomSlug);
    const password = pwdInput?.value.trim() || '';

    if (password) {
      try {
        localStorage.setItem(LobbyModal.getRoomPasswordKey(room), password);
      } catch {}
    }

    this.finalizeAndClose(room, name, this.selectedColor, password);
  }

  private submitJoin(): void {
    const nameInput = this.overlay?.querySelector('#lobby-player-name') as HTMLInputElement;
    const joinInput = this.overlay?.querySelector('#lobby-join-input') as HTMLInputElement;
    const pwdInput = this.overlay?.querySelector('#lobby-join-password') as HTMLInputElement;
    const errorEl = this.overlay?.querySelector('#lobby-join-error') as HTMLElement;

    const name = nameInput?.value.trim() || this.currentName;
    const room = this.cleanRoomSlug(joinInput?.value || 'studio-lounge');
    const enteredPassword = pwdInput?.value.trim() || '';

    // Check if room requires password
    let storedPassword: string | null = null;
    try {
      storedPassword = localStorage.getItem(LobbyModal.getRoomPasswordKey(room));
    } catch {}

    if (storedPassword && storedPassword !== enteredPassword) {
      if (errorEl) {
        errorEl.textContent = enteredPassword 
          ? 'Incorrect room password. Please try again.' 
          : 'This room is password protected. Please enter the password.';
        errorEl.style.display = 'block';
      }
      pwdInput?.classList.add('error');
      pwdInput?.focus();
      return;
    }

    if (errorEl) errorEl.style.display = 'none';
    pwdInput?.classList.remove('error');

    if (enteredPassword) {
      try {
        localStorage.setItem(LobbyModal.getRoomPasswordKey(room), enteredPassword);
      } catch {}
    }

    this.finalizeAndClose(room, name, this.selectedColor, enteredPassword);
  }

  private submitSolo(): void {
    const nameInput = this.overlay?.querySelector('#lobby-player-name') as HTMLInputElement;
    const name = nameInput?.value.trim() || this.currentName;
    const soloRoom = `solo-${Math.random().toString(36).substring(2, 7)}`;

    this.finalizeAndClose(soloRoom, name, this.selectedColor);
  }

  private finalizeAndClose(roomId: string, name: string, color: string, password?: string): void {
    this.engine.clientName = name;
    this.engine.clientColor = color;
    this.engine.setRoom(roomId, password);

    if (this.canvasEngine) {
      this.canvasEngine.setStrokeColor(color);
      this.canvasEngine.requestRender();
    }

    window.location.hash = roomId;

    if (this.onEnterCallback) {
      this.onEnterCallback(roomId, name, color);
    }

    if (this.overlay) {
      this.overlay.classList.remove('visible');
      setTimeout(() => {
        this.close();
      }, 240);
    }
  }

  public close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    LobbyModal.instance = null;
  }
}
