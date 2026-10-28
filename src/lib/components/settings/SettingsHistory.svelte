<script lang="ts">
  import { historyStats, pruneHistory } from "../../db/history";
  import { prefs } from "../../prefs.svelte";
  import { toasts } from "../../toasts.svelte";
  import SettingRow from "./SettingRow.svelte";

  const OPTIONS: { days: number; label: string }[] = [
    { days: 0, label: "Forever" },
    { days: 365, label: "1 year" },
    { days: 90, label: "90 days" },
    { days: 30, label: "30 days" },
    { days: 7, label: "7 days" },
  ];

  let stats = $state<{ count: number; oldest: number | null } | null>(null);
  $effect(() => {
    void historyStats().then((s) => (stats = s));
  });

  async function change(days: number) {
    prefs.set("historyDays", days);
    if (!days) return;
    const removed = await pruneHistory(days);
    if (removed) toasts.show(`Removed ${removed.toLocaleString()} old messages`);
    stats = await historyStats();
  }
</script>

<h2>Chat History</h2>
<p class="sub">Messages saved on this PC for user cards and the redemption history.</p>

<div class="card">
  <SettingRow
    title="Keep Messages For"
    description={stats
      ? `${stats.count.toLocaleString()} messages saved${stats.oldest ? `, since ${new Date(stats.oldest).toLocaleDateString()}` : ""}`
      : "History is only saved in the desktop app"}
  >
    <select value={prefs.value.historyDays} onchange={(e) => void change(Number(e.currentTarget.value))}>
      {#each OPTIONS as opt (opt.days)}
        <option value={opt.days}>{opt.label}</option>
      {/each}
    </select>
  </SettingRow>
  <p class="hint">
    Older messages are removed at startup and every few hours. First-seen dates, message counts, your notes, and the
    first-message-ever record are always kept.
  </p>
</div>
