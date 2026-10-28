<script lang="ts">
  // Small color swatch that opens the system color picker.
  let { value, onchange, label }: { value: string; onchange: (v: string) => void; label: string } = $props();
</script>

<label class="swatch" style:--c={value} title={label}>
  <input type="color" {value} aria-label={label} onchange={(e) => onchange(e.currentTarget.value)} />
</label>

<style>
  .swatch {
    position: relative;
    display: inline-block;
    width: 52px;
    height: 24px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-input);
    cursor: pointer;
  }

  .swatch::before {
    content: "";
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--c);
  }

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }
</style>
