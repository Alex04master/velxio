import { createRoot } from 'react-dom/client';
import { loader } from '@monaco-editor/react';
import './index.css';
// Side-effect import: initialises i18next BEFORE any component renders so
// useTranslation() always resolves against a live instance. Must come
// before App.
import './i18n';
// Side-effect-free on the DOM (index.html already painted the theme) —
// this only subscribes to the OS preference and to sibling velxio.dev tabs.
import { initTheme } from './lib/theme';
import { markProExamplesSettled } from './data/examples';
import { markProRoutesSettled } from './lib/proRoutes';
// works-core bridge: снимок проекта для кнопки импорта схемы в СДО.
import { buildVlxPayload } from './utils/vlxFile';
import { flushChipFileSync } from './services/chipFiles';
import { workspaceHasWork } from './utils/workspaceDraft';
import { useSimulatorStore } from './store/useSimulatorStore';
import type { BoardInstance } from './types/board';

/** The overlay import has settled (either way): registries are final. */
const markProOverlaySettled = (): void => {
  markProExamplesSettled();
  markProRoutesSettled();
};
import './components/velxio-components/IC74HC595';
import './components/velxio-components/LogicGateElements';
import './components/velxio-components/TransistorElements';
import './components/velxio-components/OpAmpElements';
import './components/velxio-components/PowerElements';
import './components/velxio-components/DiodeElements';
import './components/velxio-components/RelayElements';
import './components/velxio-components/LogicICElements';
import './components/velxio-components/MotorDriverElements';
import './components/velxio-components/FlipFlopElements';
import './components/velxio-components/RaspberryPi3Element';
import './components/velxio-components/Bmp280Element';
import './components/velxio-components/Ds3231Element';
import './components/velxio-components/GpsNeo6mElement';
import './components/velxio-components/EPaperElement';
import App from './App.tsx';

// Configure monaco-editor for offline use via local static assets
const monacoVsPath = `${import.meta.env.BASE_URL}monaco/vs`;
loader.config({ paths: { vs: monacoVsPath } });

// Adopt the stored light/dark preference and start listening for it changing
// elsewhere (the OS, another tab, the docs portal). index.html already put the
// right theme on <html> before the first paint; this keeps it there.
initTheme();

// Every deploy renames the hashed chunks and the old ones are gone from the
// image. A tab opened before the deploy fails its next lazy import with
// "Failed to fetch dynamically imported module" (seen on the flash dialog's
// Rp2WebFlasher chunk right after a deploy). Vite raises this event first;
// reloading once picks up the new index and its chunk names. The timestamp
// guard keeps a genuinely missing chunk from reloading forever.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'velxio-chunk-reload-at';
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(key) || 0);
  } catch {
    /* storage blocked: reload without the guard */
  }
  if (Date.now() - last < 60_000) return; // let the error surface the second time
  try {
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* ignore */
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(<App />);

// Tear down the Tauri-only splash now that React has mounted. Wait
// two animation frames so React's first paint commits before we
// touch the splash — otherwise users see a black flash between the
// splash fading and the editor first appearing. Fade via CSS
// transition for a smoother handoff, then remove the node entirely
// once the transition finishes.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    const splash = document.getElementById('velxio-splash');
    if (!splash) return;
    splash.style.transition = 'opacity 250ms ease-out';
    splash.style.opacity = '0';
    splash.style.pointerEvents = 'none';
    window.setTimeout(() => splash.remove(), 320);
  });
});

// Optional pro overlay. The `@pro` import resolves to a no-op stub in the
// open-source build (see vite.config.ts) and to the real overlay only when
// VITE_PRO_BUILD=true at build time. The dynamic import keeps the pro chunk
// out of the OSS bundle entirely (Vite tree-shakes the never-taken branch).
//
// Two desktop modes since v0.4.0:
//   - VITE_PRO_BUILD + VITE_DESKTOP → slim pro entry (@pro/desktop_index)
//     that ONLY mounts the AI agent + DiagnoseCompileButton, no analytics
//     / sessions / billing / admin / save overrides (those talk to
//     velxio.dev with cookies the desktop doesn't have).
//   - VITE_PRO_BUILD only (web) → full mountPro with every surface.
// VITE_DESKTOP alone (no pro) stays a pure-OSS desktop build.
if (import.meta.env.VITE_PRO_BUILD) {
  if (import.meta.env.VITE_DESKTOP) {
    import('@pro/desktop_index')
      .then((m) => m.mountProDesktop?.())
      .catch((err) => console.warn('[pro-desktop] failed to load slim overlay:', err))
      .finally(markProOverlaySettled);
  } else {
    import('@pro/index')
      .then((m) => m.mountPro?.())
      .catch((err) => console.warn('[pro] failed to load overlay:', err))
      .finally(markProOverlaySettled);
  }
} else {
  // No overlay is coming: what the registries have now is all there will be.
  markProOverlaySettled();
}

// Desktop-only hooks (ESP32 QEMU prompt now, welcome screen in Phase 3).
// Dynamic import so the OSS bundle never pulls this in.
if (import.meta.env.VITE_DESKTOP) {
  import('./desktop/index')
    .then((m) => m.mountDesktop?.())
    .catch((err) => console.warn('[desktop] failed to load hooks:', err));
}

// DEV-only: expose the core stores for E2E harnesses (the platform-bugs QA
// harness drives the STORE paths — property updates, group switches — the
// way the agent tools do, which raw DOM access cannot reach). Guarded by
// import.meta.env.DEV so production bundles never ship it.
if (import.meta.env.DEV) {
  Promise.all([
    import('./store/useSimulatorStore'),
    import('./store/useEditorStore'),
    import('./store/useElectricalStore'),
    import('./store/useOscilloscopeStore'),
  ]).then(([sim, ed, el, osc]) => {
    (window as unknown as Record<string, unknown>).__velxioStores = {
      useSimulatorStore: sim.useSimulatorStore,
      useEditorStore: ed.useEditorStore,
      useElectricalStore: el.useElectricalStore,
      useOscilloscopeStore: osc.useOscilloscopeStore,
      getBoardSimulator: sim.getBoardSimulator,
    };
  });
}

// ── works-core bridge ──────────────────────────────────────────────────
// СДО (works-core) встраивает редактор в <iframe> на странице задания.
// Каналы (простые JSON-сообщения, postMessage с '*'):
//   parent → here: {wc:'velxio-export', id} — снять снимок проекта для
//               кнопки «Импортировать схему в отчёт»; ответ
//               {wc:'velxio-export-data', id, payload, error};
//   here → parent: {wc:'velxio-ready'} — редактор загрузился; СДО отвечает
//               {wc:'velxio-task', task: '<id задания>'};
//   parent → here: {wc:'velxio-task', task} — привязать черновик к заданию.
// Черновик: пока редактор открыт внутри СДО, работа студента (вся .vlx-
// сериализация) пишется в localStorage с ключом по id задания и
// восстанавливается при загрузке — иначе отправка формы (перезагрузка
// страницы СДО) стирала бы всё собранное: OSS-сборка держит проект только
// в памяти. Вне iframe (открыто вкладкой) черновики не пишутся.
let wcTaskId = '';
const wcDraftKey = (): string => 'velxio_ws_draft_' + wcTaskId;

function wcSaveDraft(): void {
  if (!wcTaskId) return;
  try {
    // Файлы чипов синхронизируются с дебаунсом — сбросим перед снимком.
    flushChipFileSync();
    localStorage.setItem(wcDraftKey(), JSON.stringify(buildVlxPayload()));
  } catch {
    // переполнение/запрет хранилища — теряем черновик, но не падаем
  }
}

function wcTryRestore(): void {
  if (!wcTaskId) return;
  try {
    const raw = localStorage.getItem(wcDraftKey());
    if (!raw) return;
    const payload = JSON.parse(raw);
    useSimulatorStore.getState().loadProjectState({
      boards: payload.boards as unknown as BoardInstance[],
      fileGroups: payload.fileGroups,
      folderGroups: payload.folderGroups,
      components: payload.components,
      wires: payload.wires,
      activeBoardId: payload.activeBoardId,
    });
  } catch {
    // битый черновик — начинаем с чистого стартера
  }
}

window.addEventListener('message', (ev: MessageEvent) => {
  const data = ev.data as
    | { wc?: string; id?: string | number; task?: string | number }
    | null;
  if (!data || typeof data.wc !== 'string') return;
  if (data.wc === 'velxio-export') {
    let payload: unknown = null;
    let error = '';
    try {
      flushChipFileSync();
      payload = buildVlxPayload();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const reply = { wc: 'velxio-export-data', id: data.id ?? '', payload, error };
    (window.parent !== window ? window.parent : window).postMessage(reply, '*');
    return;
  }
  if (data.wc === 'velxio-task' && data.task) {
    wcTaskId = String(data.task);
    // Стартер/пример грузится асинхронно и перезаписал бы черновик —
    // поэтому восстановление с повторами: как только в рабочей области
    // появляется «работа» (восстановленный черновик или правки студента),
    // цикл прекращается (workspaceHasWork).
    for (const delay of [1500, 3000, 5000, 8000]) {
      window.setTimeout(() => {
        if (wcTaskId !== String(data.task)) return;
        if (workspaceHasWork()) return;
        wcTryRestore();
      }, delay);
    }
  }
});

// Сообщаем родителю, что мост жив — СДО ответит id задания для черновика.
try {
  if (window.parent !== window) {
    window.parent.postMessage({ wc: 'velxio-ready' }, '*');
  }
} catch {
  /* не в iframe */
}
window.addEventListener('pagehide', () => wcSaveDraft());
window.setInterval(() => wcSaveDraft(), 3000);
