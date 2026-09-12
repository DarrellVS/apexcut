/**
 * Handing the finished movie to a phone: ask main to serve it on the local network, keep the
 * address (and the QR code for it) while it runs, and stop it again. One movie at a time, and the
 * share closes itself after half an hour — the sheet counts that down.
 */
import { computed, onUnmounted, ref, type ComputedRef, type Ref } from 'vue';
import QRCode from 'qrcode';
import { api } from '@renderer/api';
import type { ShareState } from '@shared/ipc';
import { toast } from '@renderer/components/Base/ToastHost.vue';
import { friendlyError } from '@renderer/utils/errors';

export interface Share {
  /** what is being shared right now, null when nothing is */
  state: Ref<ShareState | null>;
  /** the address as a QR code (a data URL), for pointing a camera at */
  qr: Ref<string>;
  /** minutes left before it closes itself */
  minutesLeft: ComputedRef<number>;
  busy: Ref<boolean>;
  start: (file: string) => Promise<void>;
  stop: () => Promise<void>;
}

export function useShare(): Share {
  const state = ref<ShareState | null>(null);
  const qr = ref('');
  const busy = ref(false);
  const now = ref(Date.now());
  const tick = setInterval(() => {
    now.value = Date.now();
    if (state.value && now.value > state.value.until) {
      state.value = null;
      qr.value = '';
    }
  }, 1000);
  onUnmounted(() => clearInterval(tick));

  const minutesLeft = computed(() =>
    state.value ? Math.max(0, Math.round((state.value.until - now.value) / 60_000)) : 0,
  );

  async function start(file: string): Promise<void> {
    busy.value = true;
    try {
      state.value = await api.share.start(file);
      qr.value = await QRCode.toDataURL(state.value.url, {
        margin: 1,
        width: 320,
        color: { dark: '#000000ff', light: '#ffffffff' },
      });
    } catch (e) {
      toast(friendlyError((e as Error).message).title);
      state.value = null;
      qr.value = '';
    } finally {
      busy.value = false;
    }
  }

  async function stop(): Promise<void> {
    state.value = null;
    qr.value = '';
    await api.share.stop();
  }

  return { state, qr, minutesLeft, busy, start, stop };
}
