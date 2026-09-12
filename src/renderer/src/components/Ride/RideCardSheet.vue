<script setup lang="ts">
/**
 * What "Make ride card" made: the picture itself, where it was saved, and the way on — open the
 * folder, or close. Same shape as the export result, because it is the same kind of moment.
 */
import { ref } from 'vue';
import { api } from '@renderer/api';
import { PhFolderOpen, PhX } from '@phosphor-icons/vue';
import { useDismiss } from '@renderer/composables/useDismiss';
import { useRideCard } from '@renderer/composables/useRideCard';

const rideCard = useRideCard();
const panel = ref<HTMLElement | null>(null);
// click outside the card or Escape closes it, like every other floating thing
useDismiss(panel, () => rideCard.result.value && rideCard.close());
const openFolder = (): void => {
  if (rideCard.result.value) api.shell.openFolder(rideCard.result.value.file);
};
</script>

<template>
  <div
    v-if="rideCard.result.value"
    class="fixed inset-0 z-[53] grid place-items-center bg-black/55 p-6"
    role="dialog"
    aria-modal="true"
    aria-label="Your ride card"
  >
    <div ref="panel" class="popover relative flex max-h-full flex-col gap-3 p-5">
      <button
        class="btn btn-ghost btn-icon absolute top-3 right-3"
        title="Close (Esc)"
        aria-label="Close"
        @click="rideCard.close()"
      >
        <PhX :size="15" weight="bold" />
      </button>
      <div>
        <div class="text-base font-semibold text-fg">Your ride card is ready</div>
        <div class="text-[13px] text-fg2">
          It is on your clipboard — paste it straight into a chat or a post.
        </div>
      </div>
      <img
        :src="rideCard.result.value.preview"
        alt="Ride card"
        class="max-h-[52vh] min-h-0 w-auto self-center rounded-ctl border border-line object-contain"
      />
      <div class="num max-w-[520px] truncate text-xs text-fg2" :title="rideCard.result.value.file">
        {{ rideCard.result.value.file }}
      </div>
      <div class="flex items-center gap-2">
        <button class="btn" @click="openFolder"><PhFolderOpen :size="14" /> Open folder</button>
        <span class="text-xs text-fg3">A wide version for link previews is saved next to it.</span>
        <button class="btn btn-pri ml-auto" autofocus @click="rideCard.close()">Done</button>
      </div>
    </div>
  </div>
</template>
