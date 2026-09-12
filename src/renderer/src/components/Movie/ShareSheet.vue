<script setup lang="ts">
/**
 * "Send to my phone": the QR code to point a camera at, the address to type instead, and how long
 * it stays up. Nothing is uploaded — the movie is served by this computer to whoever is on the same
 * network and has the address.
 */
import { ref } from 'vue';
import { PhCopy, PhX } from '@phosphor-icons/vue';
import type { Share } from '@renderer/composables/useShare';
import { useDismiss } from '@renderer/composables/useDismiss';
import { toast } from '@renderer/components/Base/ToastHost.vue';

const props = defineProps<{ share: Share }>();
const emit = defineEmits<{ close: [] }>();
const panel = ref<HTMLElement | null>(null);
useDismiss(panel, () => emit('close'));

async function copy(): Promise<void> {
  const url = props.share.state.value?.url;
  if (!url) return;
  await navigator.clipboard.writeText(url);
  toast('Link copied');
}
async function stop(): Promise<void> {
  await props.share.stop();
  emit('close');
}
</script>

<template>
  <div
    class="fixed inset-0 z-[53] grid place-items-center bg-black/55 p-6"
    role="dialog"
    aria-modal="true"
    aria-label="Send to my phone"
  >
    <div
      ref="panel"
      class="popover relative flex w-[420px] max-w-full flex-col gap-3 p-5 break-normal"
    >
      <button
        class="btn btn-ghost btn-icon absolute top-3 right-3"
        title="Close (Esc)"
        aria-label="Close"
        @click="emit('close')"
      >
        <PhX :size="15" weight="bold" />
      </button>
      <div>
        <div class="text-base font-semibold text-fg">Send to my phone</div>
        <div class="text-[13px] text-fg2">
          Point your camera at this. Your phone has to be on the same Wi-Fi.
        </div>
      </div>
      <img
        v-if="share.qr.value"
        :src="share.qr.value"
        alt="QR code with the link to your movie"
        class="size-[240px] self-center rounded-ctl border border-line bg-white p-2"
      />
      <div v-else class="grid h-[240px] place-items-center text-xs text-fg3">
        {{ share.busy.value ? 'Starting…' : 'Nothing is being shared.' }}
      </div>
      <div v-if="share.state.value" class="flex items-center gap-2">
        <code class="num flex-1 truncate rounded-ctl bg-bg2 px-2 py-1.5 text-xs text-fg2">
          {{ share.state.value.url }}
        </code>
        <button class="btn btn-mini" title="Copy the link" @click="copy">
          <PhCopy :size="13" /> Copy
        </button>
      </div>
      <p class="text-xs text-fg3">
        The movie stays on this computer; nothing is uploaded. Anyone on your Wi-Fi who has the link
        can watch and save it while this is open — it stops on its own in
        {{ share.minutesLeft.value }} min.
      </p>
      <div class="flex items-center gap-2">
        <button class="btn" @click="stop">Stop sharing</button>
        <button class="btn btn-pri ml-auto" autofocus @click="emit('close')">Done</button>
      </div>
    </div>
  </div>
</template>
