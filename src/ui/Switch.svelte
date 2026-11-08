<script lang="ts">
  // Accessible on/off switch: a real checkbox with role="switch".
  let {
    checked,
    label,
    onchange,
    disabled = false,
  }: { checked: boolean; label: string; onchange: (checked: boolean) => void; disabled?: boolean } = $props();
</script>

<label class="switch">
  <input type="checkbox" role="switch" {checked} {disabled} onchange={(e) => onchange(e.currentTarget.checked)} />
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  <span class="sr-only">{label}</span>
</label>

<style>
  .switch {
    position: relative;
    display: inline-flex;
    flex: none;
    cursor: pointer;
  }
  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: inherit;
  }
  .track {
    width: 40px;
    height: 24px;
    border-radius: 12px;
    background: var(--line);
    transition: background 150ms;
    display: flex;
    align-items: center;
    padding: 3px;
  }
  .thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
    transition: transform 150ms;
  }
  input:checked + .track {
    background: var(--teal);
  }
  input:checked + .track .thumb {
    transform: translateX(16px);
  }
  input:focus-visible + .track {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  input:disabled + .track {
    opacity: 0.5;
  }
</style>
