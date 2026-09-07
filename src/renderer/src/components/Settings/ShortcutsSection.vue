<script setup lang="ts">
/** Settings → Shortcuts: the keyboard table, generated from src/renderer/src/shortcuts.ts. */
import { SHORTCUTS } from '@renderer/shortcuts';
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="m-0 text-sm text-muted">
      Everything on the timeline can be done from the keyboard. Shortcuts pause when you type in a
      text field.
    </p>
    <div v-for="g in SHORTCUTS" :key="g.title" class="card">
      <h4 class="label-caps m-0 mb-2">{{ g.title }}</h4>
      <dl class="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
        <template v-for="s in g.items" :key="s.label">
          <dt class="flex gap-1">
            <kbd
              v-for="k in s.keys"
              :key="k"
              class="num rounded-md border border-line bg-s3 px-1.5 py-0.5 font-sans text-xs text-fg"
              >{{ k }}</kbd
            >
          </dt>
          <dd class="m-0 text-muted">{{ s.label }}</dd>
        </template>
      </dl>
    </div>
  </div>
</template>
