// Small pop-up confirmations ("Timed out X for 10m", "Couldn't ban: …").

export interface Toast {
  id: number;
  text: string;
  kind: "ok" | "error";
}

class Toasts {
  list = $state<Toast[]>([]);
  #id = 0;

  show(text: string, kind: Toast["kind"] = "ok", ms = kind === "error" ? 6000 : 2500): void {
    const id = ++this.#id;
    this.list = [...this.list.slice(-3), { id, text, kind }];
    setTimeout(() => this.dismiss(id), ms);
  }

  dismiss(id: number): void {
    this.list = this.list.filter((t) => t.id !== id);
  }
}

export const toasts = new Toasts();
