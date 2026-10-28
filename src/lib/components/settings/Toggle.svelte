<script lang="ts">
  // On/off switch in the style of Streamer.bot's settings.
  let { checked, onchange, label }: { checked: boolean; onchange: (v: boolean) => void; label: string } = $props();
</script>

<button class="toggle" class:on={checked} role="switch" aria-checked={checked} aria-label={label} onclick={() => onchange(!checked)}>
  <span class="knob"></span>
</button>

<style>
  .toggle {
    position: relative;
    width: 34px;
    height: 18px;
    border-radius: 9px;
    background: #3a3a3a;
    flex-shrink: 0;
    transition: background 0.15s;
  }

  .toggle.on {
    background: #1a9fe0;
  }

  .knob {
    position: absolute;
    top: 3px;
    left: 3px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #1b1b1b;
    transition: transform 0.15s;
  }

  .on .knob {
    transform: translateX(16px);
  }
</style>
