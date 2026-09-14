import { WebSocketClient } from './engine/WebSocketClient.ts';
import { StateEngine } from './engine/StateEngine.ts';
import { CanvasEngine } from './canvas/CanvasEngine.ts';
import { StudioHeader } from './ui/StudioHeader.ts';
import { ToolRail } from './ui/ToolRail.ts';
import { PropertyBar } from './ui/PropertyBar.ts';
import { StudioFooter } from './ui/StudioFooter.ts';
import { ChaosConsole } from './ui/ChaosConsole.ts';
import { LayerPanel } from './ui/LayerPanel.ts';
import { LobbyModal } from './ui/LobbyModal.ts';

const MONIKERS = [
  'Sunny Otter',
  'Curious Fox',
  'Creative Robin',
  'Playful Panda',
  'Artful Finch',
  'Happy Koala',
  'Gentle Badger',
  'Bright Sparrow',
  'Doodle Beaver',
  'Kind Dolphin'
];

const PALETTE = ['#EA580C', '#4F46E5', '#10B981', '#F43F5E', '#F59E0B', '#0284C7', '#8B5CF6'];

function getRandomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getInitialRoomId(): string {
  const hash = window.location.hash.replace(/^#/, '').trim();
  return hash || 'studio-lounge';
}

function bootstrap(): void {
  // Grab DOM mounts
  const canvas = document.getElementById('canvas-viewport') as HTMLCanvasElement;
  const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
  const headerContainer = document.getElementById('studio-header') as HTMLElement;
  const subbarContainer = document.getElementById('studio-subbar') as HTMLElement;
  const leftRailContainer = document.getElementById('studio-left-rail') as HTMLElement;
  const footerContainer = document.getElementById('studio-footer') as HTMLElement;
  const chaosContainer = document.getElementById('chaos-drawer-container') as HTMLElement;
  const layersContainer = document.getElementById('studio-layers-drawer') as HTMLElement;

  if (
    !canvas ||
    !headerContainer ||
    !subbarContainer ||
    !leftRailContainer ||
    !footerContainer ||
    !chaosContainer ||
    !layersContainer
  ) {
    console.error('Missing root mounting elements in Studio DOM');
    return;
  }

  // 1. Initialize Network Layer
  const wsClient = new WebSocketClient();

  // 2. Initialize State Reconciliation Engine
  const stateEngine = new StateEngine(wsClient);
  stateEngine.roomId = getInitialRoomId();
  stateEngine.clientName = getRandomItem(MONIKERS);
  stateEngine.clientColor = getRandomItem(PALETTE);

  // 3. Initialize High-Frequency Canvas Engine
  const canvasEngine = new CanvasEngine(canvas, stateEngine);
  if (minimapCanvas) {
    canvasEngine.setMinimap(minimapCanvas);
  }

  // 4. Initialize Studio UI Components (Lucidchart / Canva Architecture)
  const chaosConsole = new ChaosConsole(chaosContainer, stateEngine, canvasEngine);
  const layerPanel = new LayerPanel(layersContainer, stateEngine, canvasEngine);

  const toggleLayers = () => layerPanel.toggle();

  new StudioHeader(
    headerContainer,
    stateEngine,
    canvasEngine,
    () => chaosConsole.toggle(),
    toggleLayers
  );

  const canvasLayersBtn = document.getElementById('canvas-layers-btn');
  canvasLayersBtn?.addEventListener('click', () => {
    toggleLayers();
  });

  const updateCanvasLayersBadge = () => {
    const badge = document.getElementById('canvas-layers-count');
    if (badge) badge.textContent = String(stateEngine.layers.size);
  };
  stateEngine.onLayersChange(updateCanvasLayersBadge);
  updateCanvasLayersBadge();

  layerPanel.onVisibilityChange = (isOpen) => {
    canvasLayersBtn?.classList.toggle('active', isOpen);
  };

  new PropertyBar(subbarContainer, canvasEngine);
  new ToolRail(leftRailContainer, canvasEngine);
  new StudioFooter(footerContainer, stateEngine, canvasEngine);

  // Global keyboard shortcut 'L' for layers panel (when not focused on text input)
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
    if (!e.ctrlKey && !e.metaKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault();
      toggleLayers();
    }
  });

  // Listen for hash change for multi-room switching
  window.addEventListener('hashchange', () => {
    const newRoom = getInitialRoomId();
    stateEngine.setRoom(newRoom);
  });

  // 5. Connect WebSocket
  wsClient.connect();

  // 6. Show Co-op Room & Artist Setup Lobby Modal on first arrival
  LobbyModal.show(stateEngine, canvasEngine, (roomId, name) => {
    console.log(`[Inkwell] Ready for artist ${name} in room #${roomId}`);
  });

  console.log(`[Inkwell] Booted for ${stateEngine.clientName} in ${stateEngine.roomId}`);
}

window.addEventListener('DOMContentLoaded', bootstrap);
